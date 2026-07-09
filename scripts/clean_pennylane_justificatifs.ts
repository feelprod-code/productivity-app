import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

if (!pennylaneKey) {
    console.error("❌ Missing PENNYLANE_API_KEY in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function analyzeFileWithGemini(fileBuffer: Buffer, filename: string, mimeType: string): Promise<any> {
    try {
        console.log(`🧠 [Gemini] Analyse du document ${filename} (${fileBuffer.length} octets)...`);
        const base64Data = fileBuffer.toString('base64');
        const prompt = `Tu es un expert comptable AI. Analyse ce document de facture ou reçu.
Extrais les informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: AMAZON, APPLE, CANVA, UBER, GANDI, CARPIMKO, URSSAF, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 121.00),
  "recipient_name": "Le nom du destinataire facturé (ex: Guillaume Philippe, Sabrina Kanouche, Anita, Kacha)",
  "description": "Une description très courte et précise de l'achat en 2-4 mots en français (ex: Abonnement Canva Pro, Cotisation Kine, Deplacement Bolt, etc.)"
}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                },
                {
                    text: prompt
                }
            ],
            config: {
                safetySettings: [
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ] as any
            }
        });

        let rawText = "{}";
        try {
            rawText = response.text || "{}";
        } catch (err: any) {
            console.warn(`⚠️ Erreur d'accès à response.text : ${err.message}`);
            const candidate = response.candidates?.[0];
            const partText = candidate?.content?.parts?.[0]?.text;
            if (partText) {
                rawText = partText;
            } else {
                return null;
            }
        }

        const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedText);
    } catch (e: any) {
        console.error(`❌ Erreur Gemini pour ${filename} :`, e.message);
        return null;
    }
}

async function main() {
    console.log("🧹 Démarrage de l'analyseur & nettoyeur de factures Pennylane...");

    try {
        // 1. Charger toutes les factures fournisseurs de 2025 & 2026
        console.log("📥 Récupération des factures fournisseurs depuis Pennylane...");
        const allInvoices: any[] = [];
        let cursor = '';
        while (true) {
            const fetchUrl = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
            const res = await fetch(fetchUrl, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json',
                    'X-Use-2026-API-Changes': 'true'
                }
            });
            if (!res.ok) {
                console.error(`❌ Échec de la récupération des factures (Status ${res.status})`);
                break;
            }
            const data: any = await res.json();
            const items = data.items || data.supplier_invoices || [];
            allInvoices.push(...items);
            const nextCursor = data.next_cursor || data.meta?.next_cursor;
            if (nextCursor) {
                cursor = nextCursor;
            } else {
                break;
            }
        }

        console.log(`✅ ${allInvoices.length} factures chargées au total.`);

        // 2. Filtrer les factures avec intitulé générique ou nom de l'utilisateur
        const genericInvoices = allInvoices.filter(inv => {
            const labelLower = (inv.label || '').toLowerCase().trim();
            const filenameLower = (inv.filename || '').toLowerCase().trim();
            
            // Si la facture a déjà été marquée pour suppression ou rejetée, on l'ignore
            if (labelLower.includes('a supprimer') || labelLower.includes('rejete')) {
                return false;
            }

            const isGenericLabel = labelLower.includes('justificatif') || 
                                   labelLower.includes('invoice') || 
                                   labelLower.includes('facture') || 
                                   labelLower.includes('recu') ||
                                   labelLower === 'guillaume philippe' ||
                                   labelLower === 'philippe guillaume' ||
                                   labelLower === '' ||
                                   labelLower.includes('undefined') ||
                                   (labelLower.startsWith('[') && labelLower.length <= 25);

            if (!isGenericLabel) {
                return false;
            }

            if (labelLower.startsWith('[') && labelLower.length <= 25) {
                return true;
            }

            const isGenericFile = filenameLower.includes('justificatif') || 
                                  filenameLower.includes('invoice') || 
                                  filenameLower.includes('facture') || 
                                  filenameLower.includes('recu') ||
                                  filenameLower === '';

            return isGenericFile;
        });

        console.log(`🔍 ${genericInvoices.length} factures génériques identifiées.`);

        let processedCount = 0;
        let correctedCount = 0;
        let rejectedCount = 0;

        for (const inv of genericInvoices) {
            console.log(`\n--------------------------------------------------`);
            console.log(`📄 Traitement facture : Label="${inv.label}" | Montant=${inv.amount} EUR | Fichier="${inv.filename}" (ID: ${inv.id})`);
            processedCount++;

            const fileUrl = inv.public_file_url || inv.file_url;
            if (!fileUrl) {
                console.log("⚠️ Aucun fichier attaché à cette facture.");
                continue;
            }

            // A. Téléchargement du fichier
            let fileBuffer: Buffer;
            try {
                let attempts = 0;
                let fileRes: any;
                while (attempts < 3) {
                    fileRes = await fetch(fileUrl, {
                        headers: { 'Authorization': `Bearer ${pennylaneKey}` }
                    });
                    if (fileRes.status === 429) {
                        attempts++;
                        const delay = Math.pow(2, attempts) * 1000;
                        console.warn(`⚠️ Rate limit (429) lors du téléchargement. Nouvel essai dans ${delay}ms...`);
                        await sleep(delay);
                        continue;
                    }
                    break;
                }
                if (!fileRes || !fileRes.ok) throw new Error(`Status ${fileRes ? fileRes.status : 'unknown'}`);
                const arrayBuffer = await fileRes.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
            } catch (err: any) {
                console.error(`❌ Échec du téléchargement du fichier : ${err.message}`);
                continue;
            }

            // B. Détermination du Mime Type
            let mimeType = "application/pdf";
            const filename = inv.filename || "invoice.pdf";
            if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
                mimeType = "image/jpeg";
            } else if (filename.toLowerCase().endsWith('.png')) {
                mimeType = "image/png";
            }

            // C. Analyse IA du document
            const info = await analyzeFileWithGemini(fileBuffer, filename, mimeType);
            if (!info) {
                console.log("❌ Impossible d'extraire les données du document.");
                continue;
            }

            const supplier = (info.supplier_name || "INCONNU").toUpperCase().trim();
            const date = info.invoice_date || inv.date;
            const amount = typeof info.amount === 'number' ? info.amount : parseFloat(inv.amount || '0');
            const recipient = (info.recipient_name || "").toLowerCase();
            const description = info.description || "Achat";

                        const isProRecipient = recipient.includes("guillaume philippe") ||
                                   recipient.includes("philippe guillaume") ||
                                   recipient.includes("feelprod") ||
                                   ((recipient === "" || recipient === "null" || recipient === "n/a" || recipient === "feelprod") && (
                                       supplier.includes("GOOGLE") ||
                                       supplier.includes("VERCEL") ||
                                       supplier.includes("OPENROUTER") ||
                                       supplier.includes("SUPABASE") ||
                                       supplier.includes("CLOUDFLARE") ||
                                       supplier.includes("GITHUB") ||
                                       supplier.includes("STRIPE") ||
                                       supplier.includes("OPENAI") ||
                                       (amount < 150 && (
                                           supplier.includes("HALLES") || 
                                           supplier.includes("SEBASTOPOL") || 
                                           supplier.includes("RESTAURANT") || 
                                           supplier.includes("BISTRO") || 
                                           supplier.includes("CAFE") || 
                                           supplier.includes("BRASSERIE") || 
                                           supplier.includes("TRAITEUR") || 
                                           supplier.includes("SNACK") || 
                                           supplier.includes("MCDONALD") || 
                                           supplier.includes("BK ") || 
                                           supplier.includes("STARBUCKS") || 
                                           supplier.includes("SAPN") || 
                                           supplier.includes("APRR") || 
                                           supplier.includes("SANEF") || 
                                           supplier.includes("COFIROUTE") || 
                                           supplier.includes("AUTOROUTE") || 
                                           supplier.includes("PEAGE") || 
                                           supplier.includes("PÉAGE") || 
                                           supplier.includes("INDIGO") ||
                                           supplier.includes("TOTAL")
                                       ))
                                   ));
            const isTiers = recipient.includes("sabrina") || recipient.includes("kanouche") || recipient.includes("anita") || recipient.includes("kacha");

            // D. Si la facture est pro et valide
            if (isProRecipient && !isTiers) {
                const cleanLabel = `${supplier} - ${description}`;
                console.log(`✅ Facture pro valide identifiée !`);
                console.log(`   👉 Fournisseur : ${supplier}`);
                console.log(`   👉 Date : ${date}`);
                console.log(`   👉 Montant : ${amount} EUR`);
                console.log(`   👉 Nouveau Libellé : ${cleanLabel}`);

                // Mettre à jour la facture sur Pennylane
                let updateRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${pennylaneKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Use-2026-API-Changes': 'true'
                    },
                    body: JSON.stringify({
                        label: cleanLabel,
                        date: date,
                        amount: amount.toString()
                    })
                });

                // Fallback si la date est rejetée par Pennylane (ex: hors exercice fiscal, erreur 422)
                if (!updateRes.ok && updateRes.status === 422) {
                    console.warn(`⚠️ Date ${date} refusée (possiblement hors exercice fiscal). Tentative de mise à jour sans modifier la date...`);
                    updateRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({
                            label: cleanLabel,
                            amount: amount.toString()
                        })
                    });
                }

                if (updateRes.ok) {
                    console.log(`💾 Facture mise à jour avec succès sur Pennylane !`);
                    correctedCount++;
                } else {
                    console.error(`❌ Échec de la mise à jour Pennylane : ${updateRes.status} ${await updateRes.text()}`);
                }
            } else {
                // E. Facture personnelle ou tiers -> à rejeter et dé-lettrer
                const cleanRecipient = (info.recipient_name || "TIERS").toUpperCase().replace(/\s+/g, '_');
                const cleanLabel = `A SUPPRIMER - REJETE - ${cleanRecipient} - ${supplier} - ${description}`;

                console.log(`🚨 Facture personnelle/tiers détectée ! Destinataire : "${info.recipient_name}"`);
                console.log(`   👉 Nouveau Libellé proposé : ${cleanLabel}`);

                // Si la facture est rapprochée, on doit d'abord dé-lettrer toutes les liaisons
                if (inv.reconciled) {
                    console.log(`🔗 Facture rapprochée. Récupération des transactions liées...`);
                    const matchRes = await fetch(inv.matched_transactions.url, {
                        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
                    });
                    if (matchRes.ok) {
                        const matchData: any = await matchRes.json();
                        const matchedTxs = matchData.transactions || matchData.items || [];
                        for (const tx of matchedTxs) {
                            console.log(`   ❌ Dé-rapprochement de la transaction ID ${tx.id} (${tx.amount} EUR)...`);
                            const deleteUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${tx.id}`;
                            const delRes = await fetch(deleteUrl, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${pennylaneKey}`,
                                    'Accept': 'application/json',
                                    'X-Use-2026-API-Changes': 'true'
                                }
                            });
                            if (delRes.ok || delRes.status === 204) {
                                console.log(`   ✅ Liaison supprimée !`);
                            } else {
                                console.error(`   ❌ Échec du dé-rapprochement : ${delRes.status}`);
                            }
                        }
                    }
                }

                // Mettre à jour l'intitulé sur Pennylane pour indiquer qu'elle est rejetée et doit être supprimée
                let updateRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${pennylaneKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Use-2026-API-Changes': 'true'
                    },
                    body: JSON.stringify({
                        label: cleanLabel,
                        date: date,
                        amount: amount.toString()
                    })
                });

                // Fallback si la date est rejetée par Pennylane (ex: hors exercice fiscal, erreur 422)
                if (!updateRes.ok && updateRes.status === 422) {
                    console.warn(`⚠️ Date ${date} refusée (possiblement hors exercice fiscal). Tentative de mise à jour sans modifier la date...`);
                    updateRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({
                            label: cleanLabel,
                            amount: amount.toString()
                        })
                    });
                }

                if (updateRes.ok) {
                    console.log(`💾 Facture renommée en rejetée avec succès !`);
                    rejectedCount++;
                } else {
                    console.error(`❌ Échec de la mise à jour Pennylane : ${updateRes.status} ${await updateRes.text()}`);
                }
            }

            // Pause pour respecter les limites de taux
            await sleep(1500);
        }

        console.log(`\n🏁 Nettoyage Pennylane terminé !`);
        console.log(`📊 Bilan :`);
        console.log(`- Factures génériques traitées : ${processedCount}`);
        console.log(`- Factures corrigées (pro) : ${correctedCount}`);
        console.log(`- Factures rejetées (non-pro / renommées en "A SUPPRIMER") : ${rejectedCount}`);

    } catch (e: any) {
        console.error("❌ Une erreur générale est survenue :", e.message);
    }
}

main();
