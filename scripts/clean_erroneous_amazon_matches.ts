import * as dotenv from 'dotenv';
import * as path from 'path';
import pdfParse from 'pdf-parse';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    if (!pennylaneKey) {
        console.error("❌ Missing PENNYLANE_API_KEY in .env");
        return;
    }

    console.log("🧹 Démarrage du nettoyeur de rapprochements Amazon erronés...");

    try {
        const filterObj = [
            { field: "date", operator: "gteq", value: "2025-01-01" },
            { field: "date", operator: "lteq", value: "2026-12-31" }
        ];
        const filterStr = encodeURIComponent(JSON.stringify(filterObj));

        console.log("📥 Récupération de toutes les transactions de 2025 & 2026 depuis Pennylane...");
        let cursor = null;
        const txs: any[] = [];
        for (let page = 1; page <= 50; page++) {
            const url = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
            });
            if (!res.ok) {
                console.error(`❌ Échec du chargement page ${page} : ${res.status}`);
                break;
            }
            const data: any = await res.json();
            const items = data.transactions || data.items || [];
            if (items.length === 0) break;
            txs.push(...items);
            cursor = data.next_cursor || data.meta?.next_cursor;
            if (!cursor) break;
        }

        console.log(`✅ ${txs.length} transaction(s) chargées au total.`);

        // Filtrer uniquement les transactions Amazon sortantes (débits) rapprochées
        const amazonTxs = txs.filter((tx: any) => {
            const labelLower = (tx.label || '').toLowerCase();
            const isAmazon = labelLower.includes('amazon') || labelLower.includes('amz ');
            const isOutflow = parseFloat(tx.amount || '0') < 0;
            const isMatched = parseFloat(tx.outstanding_balance || '0') === 0;
            return isAmazon && isOutflow && isMatched;
        });

        console.log(`🔍 ${amazonTxs.length} transaction(s) Amazon rapprochée(s) à analyser.`);

        let unmatchedCount = 0;

        for (const tx of amazonTxs) {
            if (!tx.matched_invoices || !tx.matched_invoices.url) continue;

            console.log(`\n--------------------------------------------------`);
            console.log(`⚡ Analyse transaction : [${tx.date}] "${tx.label}" | ${tx.amount} EUR (ID: ${tx.id})`);

            // Récupérer les factures liées à cette transaction
            const invRes = await fetch(tx.matched_invoices.url, {
                headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
            });
            if (!invRes.ok) {
                console.error(`   ❌ Impossible de charger les factures liées : ${invRes.status}`);
                continue;
            }

            const invData: any = await invRes.json();
            const invoices = invData.supplier_invoices || invData.items || [];

            for (const inv of invoices) {
                console.log(`   📄 Facture liée : [${inv.date}] "${inv.label}" | ${inv.amount} EUR | File: "${inv.filename}" (ID: ${inv.id})`);

                let isErroneous = false;
                let reason = "";

                // 1. Vérification stricte du montant (exact à 0.01 € près)
                const txAmount = Math.abs(parseFloat(tx.amount || '0'));
                const invAmount = parseFloat(inv.amount || '0');
                const amountDiff = Math.abs(invAmount - txAmount);

                if (amountDiff > 0.01) {
                    isErroneous = true;
                    reason = `Montant non exact : Transaction = ${txAmount} €, Facture = ${invAmount} € (Diff = ${amountDiff.toFixed(2)} €)`;
                }

                // 2. Vérification du destinataire et du mode de paiement en lisant le PDF
                if (!isErroneous) {
                    const fileUrl = inv.public_file_url || inv.file_url;
                    if (!fileUrl) {
                        console.log("   ⚠️ Pas de fichier PDF attaché sur Pennylane pour vérifier le destinataire / paiement.");
                    } else {
                        try {
                            console.log(`   📥 Téléchargement de la facture PDF...`);
                            const fileRes = await fetch(fileUrl, {
                                headers: { 'Authorization': `Bearer ${pennylaneKey}` }
                            });
                            if (!fileRes.ok) {
                                throw new Error(`Status ${fileRes.status}`);
                            }
                            const arrayBuffer = await fileRes.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);

                            if (buffer.slice(0, 4).toString() === '%PDF') {
                                const parsedPdf = await pdfParse(buffer);
                                const text = (parsedPdf.text || '').toLowerCase();

                                // A. Vérification de Guillaume Philippe
                                const hasRecipient = text.includes("guillaume philippe") || text.includes("philippe guillaume");
                                if (!hasRecipient) {
                                    isErroneous = true;
                                    reason = "La facture Amazon n'est pas adressée à Guillaume Philippe.";
                                }

                                // B. Vérification du mode de paiement (pro card 1397/6150 ou PayPal)
                                if (!isErroneous) {
                                    const hasPayPal = text.includes("paypal") || text.includes("pay pal");
                                    const hasProCard = text.includes("1397") || text.includes("6150");
                                    if (!hasPayPal && !hasProCard) {
                                        isErroneous = true;
                                        reason = "Mode de paiement non autorisé (ni la carte pro 1397, ni la 6150, ni PayPal).";
                                    }
                                }
                            } else {
                                console.warn("   ⚠️ Le fichier attaché n'est pas un PDF valide.");
                            }
                        } catch (err: any) {
                            console.error(`   ⚠️ Erreur lors du scan du PDF : ${err.message}`);
                        }
                    }
                }

                // 3. Dé-rapprochement si erroné
                if (isErroneous) {
                    console.log(`   🚨 Rapprochement incorrect détecté ! Raison : ${reason}`);
                    console.log(`   ❌ Suppression du rapprochement sur Pennylane...`);

                    const deleteUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${tx.id}`;
                    const delRes = await fetch(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        }
                    });

                    if (delRes.status === 204 || delRes.ok) {
                        console.log(`   ✅ Rapprochement supprimé avec succès !`);
                        unmatchedCount++;
                    } else {
                        const errText = await delRes.text();
                        console.error(`   ❌ Échec du dé-rapprochement (Status ${delRes.status}) : ${errText}`);
                    }
                } else {
                    console.log("   ✅ Rapprochement valide (Destinataire & Mode de paiement OK).");
                }

                // Petit délai pour respecter le rate-limiting
                await sleep(500);
            }
        }

        console.log(`\n🏁 Nettoyage terminé ! ${unmatchedCount} rapprochements Amazon erronés ont été supprimés sur Pennylane.`);

    } catch (err: any) {
        console.error("❌ Une erreur est survenue :", err.message);
    }
}

main();
