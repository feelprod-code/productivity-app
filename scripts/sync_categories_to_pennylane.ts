import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

if (!pennylaneKey) {
    console.error("❌ Missing PENNYLANE_API_KEY in .env");
    process.exit(1);
}

const prisma = new PrismaClient();

const CATEGORY_PREFIXES: Record<string, string> = {
    LOGICIELS_IA: "[IA & LOGICIELS]",
    RESTAURANT: "[RESTAURANT]",
    FOURNITURES: "[FOURNITURES]",
    DEPLACEMENTS: "[DEPLACEMENTS]",
    CABINET: "[CABINET]",
    COTISATIONS: "[COTISATIONS]"
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: RequestInit = {}, maxAttempts = 5): Promise<Response> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            attempts++;
            const delay = Math.pow(2, attempts) * 1000;
            console.warn(`   ⚠️ Rate limit (429) détecté sur Pennylane. Nouvel essai dans ${delay}ms...`);
            await sleep(delay);
            continue;
        }
        return res;
    }
    throw new Error(`Max fetch attempts reached for URL: ${url}`);
}

async function main() {
    console.log("🔄 Démarrage du script de synchronisation des catégories analytiques Compta -> Pennylane...");

    try {
        console.log("📥 Chargement des catégories depuis la base de données locale...");
        const overrides = await prisma.transactionOverride.findMany({
            where: {
                category: {
                    not: null
                }
            }
        });

        console.log(`✅ ${overrides.length} surcharges de catégories chargées depuis la base.`);

        for (const override of overrides) {
            const txId = override.id;
            const category = override.category || "";
            console.log(`\n--------------------------------------------------`);
            console.log(`📝 Synchro Transaction ID: ${txId} | Catégorie choisie: ${category}`);

            // Delay between requests to avoid hitting rate limit
            await sleep(150);

            const matchUrl = `${BASE_URL}/transactions/${txId}/matched_invoices`;
            const matchRes = await fetchWithRetry(matchUrl, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json'
                }
            });

            if (!matchRes.ok) {
                console.error(`❌ Échec de la récupération des factures liées (Status ${matchRes.status})`);
                continue;
            }

            const matchData: any = await matchRes.json();
            const matchedInvoices = matchData.supplier_invoices || matchData.items || [];
            
            if (matchedInvoices.length === 0) {
                console.log(`ℹ️ Aucune facture liée pour la transaction ${txId}.`);
                continue;
            }

            for (const invShort of matchedInvoices) {
                await sleep(100);
                const invUrl = `${BASE_URL}/supplier_invoices/${invShort.id}`;
                const invRes = await fetchWithRetry(invUrl, {
                    headers: {
                        'Authorization': `Bearer ${pennylaneKey}`,
                        'Accept': 'application/json',
                        'X-Use-2026-API-Changes': 'true'
                    }
                });

                if (!invRes.ok) {
                    console.error(`   ❌ Échec de la récupération des détails de la facture ID ${invShort.id} (Status ${invRes.status})`);
                    continue;
                }

                const invData: any = await invRes.json();
                const inv = invData.supplier_invoice || invData.item || invData;

                console.log(`   📄 Facture liée ID: ${inv.id} | Libellé actuel: "${inv.label}"`);

                if (category === "PERSO") {
                    console.log(`   🚨 Dépense personnelle détectée ! Dé-rapprochement de la transaction ID ${txId}...`);
                    const deleteUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${txId}`;
                    const delRes = await fetchWithRetry(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        }
                    });

                    if (delRes.ok || delRes.status === 204) {
                        console.log(`   ✅ Liaison supprimée avec succès !`);
                    } else {
                        console.error(`   ❌ Échec du dé-rapprochement : ${delRes.status}`);
                    }

                    let cleanLabel = inv.label || "Facture";
                    cleanLabel = cleanLabel.replace(/^A SUPPRIMER - REJETE - /gi, '');
                    const newLabel = `A SUPPRIMER - REJETE - PERSO - ${cleanLabel}`;
                    
                    console.log(`   💾 Renommade de la facture Pennylane en : "${newLabel}"`);
                    const updateRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({ label: newLabel })
                    });

                    if (updateRes.ok) {
                        console.log(`   ✅ Libellé de rejet enregistré sur Pennylane.`);
                    } else {
                        console.error(`   ❌ Échec de la mise à jour : ${updateRes.status}`);
                    }
                } else {
                    const prefix = CATEGORY_PREFIXES[category];
                    if (!prefix) {
                        console.warn(`   ⚠️ Préfixe inconnu pour la catégorie "${category}". Ignoré.`);
                        continue;
                    }

                    let cleanLabel = (inv.label || "").replace(/^\[.*?\]\s*/i, "").trim();
                    const newLabel = `${prefix} ${cleanLabel}`;

                    if (inv.label === newLabel) {
                        console.log(`   ✨ Libellé déjà correctement formaté : "${newLabel}"`);
                        continue;
                    }

                    console.log(`   💾 Mise à jour du libellé Pennylane : "${newLabel}"`);
                    const updateRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${inv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({ label: newLabel })
                    });

                    if (updateRes.ok) {
                        console.log(`   ✅ Libellé mis à jour avec succès sur Pennylane !`);
                    } else {
                        console.error(`   ❌ Échec de la mise à jour Pennylane (Status ${updateRes.status})`);
                    }
                }
            }
        }

        console.log("\n🏁 Synchronisation terminée !");

    } catch (e: any) {
        console.error("❌ Erreur générale lors de la synchronisation :", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
