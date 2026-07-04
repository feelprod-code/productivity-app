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
    console.error("❌ ERREUR: OPENROUTER_API_KEY ou PENNYLANE_API_KEY manquant dans .env");
    process.exit(1);
}

// Fonction pour extraire le texte et demander à Gemini le(s) produit(s)
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
                        content: `Tu es un expert comptable. Analyse le texte extrait de cette facture et décris succinctement le ou les principaux produits ou services achetés.

Le format retourné doit être strictement un JSON comme suit :
{
  "product_description": "Description courte (ex: Disque Dur SSD 1To, Objectif Sony FE 24-70mm, Hébergement Web feelprod.com)"
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
        console.error(`❌ Erreur d'analyse IA pour le libellé "${label}" :`, e);
        return null;
    }
}

async function main() {
    console.log("🔍 Démarrage de l'enrichissement des produits pour toutes les transactions 2026...");

    // 1. Récupérer toutes les transactions de 2026 depuis Pennylane
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

    console.log("📥 Récupération des transactions de Pennylane...");
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

    console.log(`✅ ${allTxs.length} transaction(s) récupérée(s) de Pennylane.`);

    // 2. Récupérer toutes les factures d'achat pour pouvoir matcher
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
    console.log(`✅ ${allInvs.length} facture(s) d'achat récupérée(s).`);

    // 3. Charger les détails de transaction déjà existants en cache local
    console.log("📥 Chargement des descriptions en cache local...");
    const existingDetails: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "TransactionDetail"');
    const existingSet = new Set(existingDetails.map(d => String(d.id)));

    let enrichedCount = 0;

    // 4. Parcourir les transactions pour trouver les correspondances de factures et extraire le produit
    for (const tx of allTxs) {
        const txId = String(tx.id);
        if (existingSet.has(txId)) {
            continue; // Déjà traité
        }

        const absAmount = Math.abs(parseFloat(tx.amount || '0'));
        const txTime = new Date(tx.date).getTime();
        const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
        const label = tx.label || "";
        const labelLower = label.toLowerCase();

        // Chercher la facture correspondante (même logique que l'API de relevés)
        const matchedInvoice = allInvs.find((inv: any) => {
            if (!inv.date) return false;
            const invTime = new Date(inv.date).getTime();
            const invAmount = parseFloat(inv.amount || '0');
            
            let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
            const closeDate = (txTime >= invTime - 2 * 24 * 60 * 60 * 1000) && (txTime - invTime <= thirtyFiveDaysMs);
            
            let providerMatch = true;
            // Si la transaction ou facture est liée aux technos
            const isAmazon = labelLower.includes('amazon');
            if (isAmazon) {
                const invLabelLower = (inv.label || '').toLowerCase();
                const invFileLower = (inv.filename || '').toLowerCase();
                providerMatch = invLabelLower.includes('amazon') || invFileLower.includes('amazon');
            }

            return amountMatch && closeDate && providerMatch;
        });

        // S'il y a une facture et qu'on a le lien du PDF
        if (matchedInvoice && matchedInvoice.public_file_url) {
            console.log(`\n📦 Rapprochement trouvé pour "${label}" (${absAmount} €)`);
            console.log(`   Lien justificatif : ${matchedInvoice.public_file_url}`);

            try {
                // Télécharger le PDF
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
                    console.log(`   ⏭️ PDF vide ou illisible en texte.`);
                    continue;
                }

                // Extraire la description
                const productDescription = await extractProductDescription(text, label);

                if (productDescription) {
                    console.log(`   ✨ Produit extrait : "${productDescription}"`);
                    
                    // Insérer dans la table locale TransactionDetail
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
        }
    }

    console.log(`\n🏁 Terminé ! ${enrichedCount} transaction(s) enrichie(s) avec la description des produits.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
