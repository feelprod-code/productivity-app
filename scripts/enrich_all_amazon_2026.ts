import { PrismaClient } from '@prisma/client';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const openrouterKey = process.env.OPENROUTER_API_KEY;
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

if (!openrouterKey || !pennylaneKey) {
    console.error("❌ ERREUR: Clés OPENROUTER_API_KEY ou PENNYLANE_API_KEY manquantes dans .env");
    process.exit(1);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function extractProductDescription(pdfText: string, label: string): Promise<string | null> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openrouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "user",
                        content: `Tu es un expert comptable. Analyse le texte extrait de cette facture d'achat Amazon et décris succinctement le ou les principaux produits achetés (nom de l'objet, marque éventuelle, max 10 mots).

Le format de retour doit être un JSON strict comme suit :
{
  "product_description": "Description courte (ex: Objectif Sony FE 24-70mm, Ballon Mikasa V360 SL)"
}

Voici le libellé de l'opération : ${label}

Texte de la facture :
---
${pdfText.substring(0, 8000)}
---`
                    }
                ]
            })
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`OpenRouter HTTP ${response.status} : ${errTxt}`);
        }

        const data = await response.json();
        const contentText = data.choices?.[0]?.message?.content;
        if (!contentText) return null;

        const parsed = JSON.parse(contentText);
        return parsed.product_description || null;
    } catch (e) {
        console.error(`❌ Erreur d'analyse IA pour "${label}" :`, e);
        return null;
    }
}

async function main() {
    console.log("🔍 Recherche de toutes les transactions Amazon de 2026...");

    // 1. Charger toutes les transactions de 2026 depuis Pennylane
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
        {
            field: "date",
            operator: "gteq",
            value: "2026-01-01"
        }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 12; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) break;
        const data = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);

        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
            txCursor = nextCursor;
        } else {
            break;
        }
    }

    // Filtrer pour ne garder que les transactions Amazon
    const amazonTxs = allTxs.filter((tx: any) => {
        const labelLower = (tx.label || "").toLowerCase();
        return labelLower.includes("amazon") || labelLower.includes("amz ");
    });

    console.log(`✅ ${amazonTxs.length} transaction(s) Amazon trouvée(s) pour 2026.`);

    // 2. Charger toutes les factures d'achat pour rapprochement
    console.log("📥 Récupération des factures d'achat de Pennylane...");
    let invCursor: string | null = null;
    const allInvs: any[] = [];
    for (let page = 1; page <= 10; page++) {
        const fetchUrl = `${BASE_URL}/supplier_invoices?limit=100` + (invCursor ? `&cursor=${invCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }
        });
        if (!res.ok) break;
        const data = await res.json();
        const items = data.supplier_invoices || data.items || [];
        if (items.length === 0) break;
        allInvs.push(...items);

        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
            invCursor = nextCursor;
        } else {
            break;
        }
    }

    // 3. Charger le cache existant des détails
    const existingDetails: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "TransactionDetail"');
    const existingSet = new Set(existingDetails.map(d => String(d.id)));

    let enrichedCount = 0;

    // 4. Parcourir les transactions Amazon de façon séquentielle
    for (const tx of amazonTxs) {
        const txId = String(tx.id);
        if (existingSet.has(txId)) {
            console.log(`⏭️ Transaction Amazon ${txId} (${tx.label} - ${tx.amount} €) déjà enrichie en cache local.`);
            continue;
        }

        const absAmount = Math.abs(parseFloat(tx.amount || '0'));
        const txTime = new Date(tx.date).getTime();
        const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
        const label = tx.label || "";
        const labelLower = label.toLowerCase();

        // Rapprochement avec la logique tolérante de devises
        const matchedInvoice = allInvs.find((inv: any) => {
            if (!inv.date) return false;
            const invTime = new Date(inv.date).getTime();
            const invAmount = parseFloat(inv.amount || '0');
            
            let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
            
            // Logique de conversion de devise tolérante
            if (!amountMatch) {
                const ratio = absAmount / invAmount;
                if (ratio >= 0.80 && ratio <= 1.15) {
                    amountMatch = true;
                } else {
                    const invRatio = invAmount / absAmount;
                    if (invRatio >= 0.80 && invRatio <= 1.15) {
                        amountMatch = true;
                    }
                }
            }
            
            const closeDate = (txTime >= invTime - 2 * 24 * 60 * 60 * 1000) && (txTime - invTime <= thirtyFiveDaysMs);
            
            const invLabelLower = (inv.label || '').toLowerCase();
            const invFileLower = (inv.filename || '').toLowerCase();
            const providerMatch = invLabelLower.includes('amazon') || invFileLower.includes('amazon') || invLabelLower.includes('amz ') || invFileLower.includes('amz ');

            return amountMatch && closeDate && providerMatch;
        });

        if (matchedInvoice && matchedInvoice.public_file_url) {
            console.log(`\n📦 Rapprochement trouvé pour "${label}" (${absAmount} €)`);
            console.log(`   Téléchargement du justificatif : ${matchedInvoice.public_file_url}`);

            try {
                // Pause de 1,5 seconde pour éviter le rate limit Pennylane
                await sleep(1500);

                const fileRes = await fetch(matchedInvoice.public_file_url);
                if (!fileRes.ok) {
                    console.error(`   ❌ Impossible de télécharger le fichier PDF : HTTP ${fileRes.status}`);
                    continue;
                }

                const arrayBuffer = await fileRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // Parser le PDF
                const parsedPdf = await pdfParse(buffer);
                const text = parsedPdf.text || "";

                if (!text.trim()) {
                    console.log(`   ⏭️ PDF vide ou illisible.`);
                    continue;
                }

                // Extraire le produit avec Gemini
                const productDescription = await extractProductDescription(text, label);

                if (productDescription) {
                    console.log(`   ✨ Produit extrait : "${productDescription}"`);
                    
                    // Enregistrer en base
                    await prisma.$executeRawUnsafe(
                        'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                        txId,
                        productDescription
                    );
                    console.log(`   ✅ Enregistré en base locale !`);
                    enrichedCount++;
                }

            } catch (err) {
                console.error(`   ❌ Erreur lors de l'extraction de la transaction ${txId} :`, err);
            }
        } else {
            console.log(`⏭️ Aucun justificatif matché sur Pennylane pour "${label}" (${tx.amount} €).`);
        }
    }

    console.log(`\n🏁 Traitement terminé ! ${enrichedCount} transaction(s) Amazon de 2026 enrichie(s) avec succès.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
