import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const BASE_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

if (!pennylaneKey) {
    console.error("❌ Missing PENNYLANE_API_KEY in .env");
    process.exit(1);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to recursively find PDF files
async function getPdfFilesRecursively(dir: string): Promise<string[]> {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        if (file === '.' || file === '..') continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            results = results.concat(await getPdfFilesRecursively(filePath));
        } else if (file.toLowerCase().endsWith('.pdf')) {
            results.push(filePath);
        }
    }
    return results;
}

function extractKeywords(label: string): string[] {
    const cleaned = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9\s]/g, " ") // keep only alphanumeric
        .replace(/\s+/g, " ")
        .trim();

    const stopwords = new Set([
        "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
        "sepa", "recu", "prelvt", "prlv", "confrere", "facture", "fact", "inv", "invoice",
        "virement", "instantane", "transfer", "vir", "inst", "paiement", "cb", "date"
    ]);

    const words = cleaned.split(" ");
    return words.filter(word => word.length >= 2 && !stopwords.has(word) && isNaN(Number(word)));
}

async function main() {
    console.log("🚀 Démarrage du script de réimportation & rapprochement automatique...");

    try {
        // 1. Charger toutes les transactions de 2025 & 2026 depuis Pennylane
        console.log("📥 Récupération des transactions bancaires Pennylane...");
        const filterObj = [
            { field: "date", operator: "gteq", value: "2025-01-01" },
            { field: "date", operator: "lteq", value: "2026-12-31" }
        ];
        const filterStr = encodeURIComponent(JSON.stringify(filterObj));
        
        let cursor = null;
        const allTransactions: any[] = [];
        for (let page = 1; page <= 50; page++) {
            const url = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
            });
            if (!res.ok) {
                console.error(`❌ Échec du chargement des transactions page ${page}`);
                break;
            }
            const data: any = await res.json();
            const items = data.transactions || data.items || [];
            if (items.length === 0) break;
            allTransactions.push(...items);
            cursor = data.next_cursor || data.meta?.next_cursor;
            if (!cursor) break;
        }

        console.log(`✅ ${allTransactions.length} transactions chargées au total.`);

        // Filtrer uniquement les transactions de débit non rapprochées sur un compte pro
        // Les comptes pro sont identifiés par nom contenant 'business' ou ID spécifique
        const proAccountIds = new Set<number>();
        const accountsRes = await fetch(`${BASE_URL}/bank_accounts`, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (accountsRes.ok) {
            const accData = await accountsRes.json();
            const accounts = accData.bank_accounts || accData.items || [];
            accounts.forEach((acc: any) => {
                const name = (acc.name || '').trim();
                const nameLower = name.toLowerCase();
                const isPro = nameLower.includes('business') || name === 'M GUILLAUME PHILIPPE';
                if (isPro) {
                    proAccountIds.add(acc.id);
                }
            });
        }

        const unmatchedTxs = allTransactions.filter((tx: any) => {
            const isOutflow = parseFloat(tx.amount || '0') < 0;
            const isUnmatched = parseFloat(tx.outstanding_balance || '0') !== 0;
            const isPro = proAccountIds.size === 0 || (tx.bank_account && proAccountIds.has(tx.bank_account.id));
            return isOutflow && isUnmatched && isPro;
        });

        console.log(`🔍 ${unmatchedTxs.length} transactions de débit pro non rapprochées trouvées.`);

        // 2. Récupérer toutes les factures fournisseurs de Pennylane pour éviter les doublons
        console.log("📥 Récupération des factures fournisseurs existantes Pennylane...");
        const existingInvoices: any[] = [];
        let invCursor = '';
        while (true) {
            const fetchUrl = `${BASE_URL}/supplier_invoices` + (invCursor ? `?cursor=${invCursor}&limit=100` : '?limit=100');
            const res = await fetch(fetchUrl, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json',
                    'X-Use-2026-API-Changes': 'true'
                }
            });
            if (!res.ok) break;
            const data: any = await res.json();
            const items = data.items || data.supplier_invoices || [];
            existingInvoices.push(...items);
            const nextCursor = data.next_cursor || data.meta?.next_cursor;
            if (nextCursor) {
                invCursor = nextCursor;
            } else {
                break;
            }
        }
        console.log(`✅ ${existingInvoices.length} factures fournisseurs chargées depuis Pennylane.`);

        // 3. Charger tous les fournisseurs de Pennylane pour réutilisation
        const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
        });
        const suppliersData = suppliersRes.ok ? await suppliersRes.json() : { items: [] };
        const suppliersList = suppliersData.items || suppliersData.suppliers || [];

        // 4. Parcourir les fichiers locaux renommés
        const folders = [
            path.join(BASE_DIR, 'Factures 2025'),
            path.join(BASE_DIR, 'Factures 2026')
        ];

        let matchedCount = 0;

        for (const folder of folders) {
            if (!fs.existsSync(folder)) continue;
            console.log(`\n📂 Traitement des factures du dossier : ${path.basename(folder)}...`);
            const pdfFiles = await getPdfFilesRecursively(folder);
            
            for (const filePath of pdfFiles) {
                const filename = path.basename(filePath);
                
                // Exclure les fichiers rejetés
                if (filename.startsWith("REJETE") || filename.includes("REJETE")) {
                    continue;
                }

                // Parser le nom de fichier propre : YYYY-MM-DD - SUPPLIER - Description - AMOUNT.pdf
                // Exemple: 2024-08-08 - AMAZON - Protection écran iPhone - 19.99EUR.pdf
                const regex = /^(\d{4}-\d{2}-\d{2})\s*-\s*([^-]+)\s*-\s*([^-]+)\s*-\s*([\d\.]+)EUR\.pdf$/i;
                const match = filename.match(regex);
                if (!match) {
                    // console.log(`⚠️ Fichier ignoré (nom non standardisé) : ${filename}`);
                    continue;
                }

                const fileDateStr = match[1];
                const fileSupplier = match[2].trim().toUpperCase();
                const fileDesc = match[3].trim();
                const fileAmount = parseFloat(match[4]);

                console.log(`\n📝 Analyse fichier local : ${filename}`);
                console.log(`   👉 Fournisseur : ${fileSupplier} | Date : ${fileDateStr} | Montant : ${fileAmount} EUR`);

                // A. Trouver une transaction correspondante
                // Critères : Montant exact, Date proche (+/- 5 jours), Libellé contenant le fournisseur
                const fileDate = new Date(fileDateStr);
                const matchingTx = unmatchedTxs.find((tx: any) => {
                    const txAmount = Math.abs(parseFloat(tx.amount || '0'));
                    const amountDiff = Math.abs(txAmount - fileAmount);
                    if (amountDiff > 0.01) return false;

                    const txDate = new Date(tx.date);
                    const daysDiff = Math.abs(txDate.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysDiff > 5) return false;

                    const labelLower = (tx.label || '').toLowerCase();
                    const supplierKeywords = extractKeywords(fileSupplier);
                    const hasKeyword = supplierKeywords.some(kw => labelLower.includes(kw));

                    return hasKeyword;
                });

                if (!matchingTx) {
                    console.log(`   ❌ Aucune transaction bancaire non rapprochée correspondante trouvée pour cette facture.`);
                    continue;
                }

                console.log(`   🎯 Transaction correspondante trouvée ! [${matchingTx.date}] "${matchingTx.label}" | ${matchingTx.amount} EUR (ID: ${matchingTx.id})`);

                // B. Vérifier si l'invoice existe déjà sur Pennylane
                let invoiceId: number | null = null;
                const existingInv = existingInvoices.find(inv => {
                    const invAmount = parseFloat(inv.amount || '0');
                    const amountDiff = Math.abs(invAmount - fileAmount);
                    if (amountDiff > 0.01) return false;

                    const invDate = inv.date;
                    if (invDate !== fileDateStr) return false;

                    const invLabel = (inv.label || '').toUpperCase();
                    return invLabel.includes(fileSupplier);
                });

                if (existingInv) {
                    invoiceId = existingInv.id;
                    console.log(`   ℹ️ Facture déjà présente sur Pennylane (ID: ${invoiceId}).`);
                } else {
                    // C. Téléverser le fichier sur Pennylane
                    console.log(`   📥 Téléversement du PDF sur Pennylane...`);
                    const fileBuffer = fs.readFileSync(filePath);
                    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
                    const pennylaneFormData = new FormData();
                    pennylaneFormData.append('file', blob, filename);

                    const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: pennylaneFormData
                    });

                    if (!uploadRes.ok) {
                        console.error(`   ❌ Échec du téléversement du fichier : ${uploadRes.status}`);
                        continue;
                    }

                    const uploadData: any = await uploadRes.json();
                    const fileAttachmentId = uploadData.id;

                    // D. Trouver ou créer le fournisseur sur Pennylane
                    let supplierId = suppliersList.find((s: any) => 
                        s.name.toUpperCase().includes(fileSupplier) || fileSupplier.includes(s.name.toUpperCase())
                    )?.id;

                    if (!supplierId) {
                        console.log(`   ➕ Création du fournisseur "${fileSupplier}" sur Pennylane...`);
                        const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${pennylaneKey}`,
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'X-Use-2026-API-Changes': 'true'
                            },
                            body: JSON.stringify({ name: fileSupplier })
                        });
                        if (createSupplierRes.ok) {
                            const createSupplierData: any = await createSupplierRes.json();
                            supplierId = createSupplierData.supplier?.id || createSupplierData.id;
                            // Mettre à jour la liste locale des fournisseurs
                            suppliersList.push({ id: supplierId, name: fileSupplier });
                        } else {
                            console.error(`   ❌ Échec de la création du fournisseur.`);
                            continue;
                        }
                    }

                    // E. Importer la facture
                    console.log(`   🧾 Création de la facture fournisseur sur Pennylane...`);
                    const cleanLabel = `${fileSupplier} - ${fileDesc}`;
                    const payload = {
                        file_attachment_id: fileAttachmentId,
                        supplier_id: supplierId,
                        date: fileDateStr,
                        deadline: fileDateStr,
                        currency_amount: fileAmount.toFixed(2),
                        currency_amount_before_tax: fileAmount.toFixed(2),
                        currency_tax: '0.00',
                        currency: 'EUR',
                        invoice_lines: [
                            {
                                currency_amount: fileAmount.toFixed(2),
                                currency_tax: '0.00',
                                vat_rate: 'exempt',
                                label: cleanLabel
                            }
                        ]
                    };

                    const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (importRes.ok) {
                        const importData: any = await importRes.json();
                        invoiceId = importData.id || importData.supplier_invoice?.id;
                        console.log(`   ✅ Facture créée avec succès sur Pennylane (ID: ${invoiceId})`);
                        // Mettre à jour la liste locale
                        existingInvoices.push({ id: invoiceId, amount: fileAmount.toString(), date: fileDateStr, label: cleanLabel });
                    } else {
                        console.error(`   ❌ Échec de la création de la facture : ${importRes.status} ${await importRes.text()}`);
                        continue;
                    }
                }

                // F. Rapprocher la facture et la transaction
                if (invoiceId) {
                    console.log(`   🔗 Rapprochement de la facture ${invoiceId} avec la transaction ${matchingTx.id}...`);
                    const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({ transaction_id: String(matchingTx.id) })
                    });

                    if (matchRes.ok) {
                        console.log(`   🎉 Rapprochement réussi !`);
                        matchedCount++;
                        // Retirer la transaction des transactions non rapprochées
                        const index = unmatchedTxs.findIndex(tx => tx.id === matchingTx.id);
                        if (index !== -1) unmatchedTxs.splice(index, 1);
                    } else {
                        console.error(`   ❌ Échec du rapprochement : ${matchRes.status} ${await matchRes.text()}`);
                    }
                }

                // Petite pause entre chaque facture pour éviter le rate-limiting
                await sleep(1000);
            }
        }

        console.log(`\n🏁 Processus terminé ! ${matchedCount} factures locales propres ont été importées et rapprochées sur Pennylane.`);

    } catch (err: any) {
        console.error("❌ Une erreur générale est survenue :", err.message);
    }
}

main();
