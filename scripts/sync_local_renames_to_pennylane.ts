import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const BASE_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

if (!pennylaneKey) {
    console.error("❌ Missing PENNYLANE_API_KEY in .env");
    process.exit(1);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        } else if (file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg') || file.toLowerCase().endsWith('.png')) {
            results.push(filePath);
        }
    }
    return results;
}

function extractKeywords(label: string): string[] {
    const cleaned = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
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

async function fetchWithRetry(url: string, options: any, maxRetries = 5): Promise<Response> {
    let attempts = 0;
    while (attempts < maxRetries) {
        const response = await fetch(url, options);
        if (response.status === 429) {
            attempts++;
            const backoff = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
            console.warn(`⚠️ Rate limit (429) sur Pennylane. Retrying in ${backoff.toFixed(0)}ms...`);
            await sleep(backoff);
            continue;
        }
        return response;
    }
    throw new Error(`Échec de la requête après ${maxRetries} tentatives à cause des limites de taux.`);
}

async function main() {
    console.log("🚀 Synchronisation des renommages et rejets locaux vers Pennylane (Correction v2.2)...");

    // 1. Charger toutes les factures de Pennylane pour l'apparier en mémoire
    console.log("📥 Récupération de l'index des factures de Pennylane...");
    const allInvoices: any[] = [];
    let cursor = '';
    while (true) {
        const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
        const res = await fetchWithRetry(url, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (!res.ok) {
            console.error(`❌ Échec du chargement des factures depuis Pennylane.`);
            break;
        }
        const data: any = await res.json();
        const items = data.items || data.supplier_invoices || [];
        if (items.length === 0) break;
        allInvoices.push(...items);
        cursor = data.next_cursor || data.meta?.next_cursor;
        if (!cursor) break;
        await sleep(100);
    }
    console.log(`✅ ${allInvoices.length} factures chargées depuis Pennylane.`);

    // 2. Trouver tous les fichiers locaux renommés ou rejetés dans 2025 et 2026
    const folders = [
        path.join(BASE_DIR, "Factures 2025"),
        path.join(BASE_DIR, "Factures 2026")
    ];

    let processedCount = 0;
    let localRejectsFound = 0;
    let localProsFound = 0;
    let updatedOnPennylane = 0;

    for (const folder of folders) {
        if (!fs.existsSync(folder)) continue;
        console.log(`\n📂 Scan du dossier local : ${path.basename(folder)}...`);
        const localFiles = await getPdfFilesRecursively(folder);

        for (const filePath of localFiles) {
            const filename = path.basename(filePath);
            processedCount++;

            let isRejected = filename.startsWith("REJETE") || filename.includes("REJETE");
            let fileDateStr = "";
            let fileSupplier = "";
            let fileDesc = "";
            let fileAmount = 0;

            if (isRejected) {
                localRejectsFound++;
                // Parser un nom rejeté type : REJETE - DATE - SUPPLIER - DESC - AMOUNT.pdf
                // Exemple: REJETE - 2025-05-30 - NETFLIX - ... - 14.99EUR.pdf
                const regexRej = /REJETE\s*-\s*(\d{4}-\d{2}-\d{2})\s*-\s*([^-]+)\s*-\s*([^-]+)\s*-\s*([\d\.]+)EUR/i;
                const match = filename.match(regexRej);
                if (match) {
                    fileDateStr = match[1];
                    fileSupplier = match[2].trim().toUpperCase();
                    fileDesc = match[3].trim();
                    fileAmount = parseFloat(match[4]);
                } else {
                    // Try to guess from general parts of file name
                    const parts = filename.split('-');
                    if (parts.length >= 5) {
                        fileDateStr = parts[1].trim();
                        fileSupplier = parts[2].trim().toUpperCase();
                        fileDesc = parts[3].trim();
                        const amountStr = parts[4].replace(/[a-zA-Z]/g, '').trim();
                        fileAmount = parseFloat(amountStr) || 0;
                    }
                }
            } else {
                // Parser un nom pro type : DATE - SUPPLIER - DESC - AMOUNT.pdf
                // Exemple: 2025-05-30 - AMAZON - Protection ecran - 19.99EUR.pdf
                const regexPro = /^(\d{4}-\d{2}-\d{2})\s*-\s*([^-]+)\s*-\s*([^-]+)\s*-\s*([\d\.]+)EUR/i;
                const match = filename.match(regexPro);
                if (match) {
                    fileDateStr = match[1];
                    fileSupplier = match[2].trim().toUpperCase();
                    fileDesc = match[3].trim();
                    fileAmount = parseFloat(match[4]);
                    localProsFound++;
                }
            }

            if (!fileDateStr || !fileSupplier || fileAmount <= 0) {
                continue;
            }

            const fileDate = new Date(fileDateStr);

            // 3. Chercher l'équivalent sur Pennylane avec comparaison correcte de casse et tolérance de date (+/- 31 jours)
            const matchedPennylaneInv = allInvoices.find(inv => {
                const invAmount = Math.abs(parseFloat(inv.amount || '0'));
                const amountDiff = Math.abs(invAmount - fileAmount);
                if (amountDiff > 0.01) return false;

                // Match date +/- 31 jours
                const invDate = new Date(inv.date);
                const diffTime = Math.abs(invDate.getTime() - fileDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 31) return false;

                // Match fournisseur keywords en minuscules
                const invLabelLower = (inv.label || '').toLowerCase();
                const invFilenameLower = (inv.filename || '').toLowerCase();
                const keywords = extractKeywords(fileSupplier);
                
                return keywords.some(kw => invLabelLower.includes(kw) || invFilenameLower.includes(kw));
            });

            if (!matchedPennylaneInv) {
                continue;
            }

            const currentLabel = matchedPennylaneInv.label || "";
            const currentLabelLower = currentLabel.toLowerCase();

            if (isRejected) {
                // S'assurer que le libellé Pennylane reflète bien le rejet
                if (!currentLabelLower.includes("rejete") && !currentLabelLower.includes("a supprimer")) {
                    const cleanLabel = `A SUPPRIMER - REJETE - PERSO - ${fileSupplier} - ${fileDesc}`;
                    console.log(`🚨 Correction REJET sur Pennylane : Facture ID ${matchedPennylaneInv.id} | Libellé : "${currentLabel}" -> "${cleanLabel}"`);

                    // A. Dé-rapprochement si elle est lettrée
                    if (matchedPennylaneInv.reconciled) {
                        const matchRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${matchedPennylaneInv.id}/matched_transactions`, {
                            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
                        });
                        if (matchRes.ok) {
                            const matchData: any = await matchRes.json();
                            const matchedTxs = matchData.transactions || matchData.items || [];
                            for (const tx of matchedTxs) {
                                console.log(`   ❌ Dé-rapprochement de la transaction ID ${tx.id}...`);
                                const delRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${matchedPennylaneInv.id}/matched_transactions/${tx.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Authorization': `Bearer ${pennylaneKey}`,
                                        'Accept': 'application/json',
                                        'X-Use-2026-API-Changes': 'true'
                                    }
                                });
                                if (delRes.ok || delRes.status === 204) {
                                    console.log(`   ✅ Rapprochement supprimé !`);
                                }
                            }
                        }
                    }

                    // B. Mettre à jour l'intitulé
                    const updateRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${matchedPennylaneInv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({
                            label: cleanLabel,
                            amount: fileAmount.toString()
                        })
                    });

                    if (updateRes.ok) {
                        console.log(`   ✅ Pennylane mis à jour !`);
                        updatedOnPennylane++;
                    } else {
                        console.error(`   ❌ Échec de mise à jour : ${updateRes.status}`);
                    }
                    await sleep(150);
                }
            } else {
                // Facture pro : s'assurer que le libellé sur Pennylane est bien le libellé propre
                const targetLabel = `${fileSupplier} - ${fileDesc}`;
                const isGeneric = currentLabelLower.includes("justificatif") || 
                                  currentLabelLower.includes("invoice") || 
                                  currentLabelLower.includes("facture") || 
                                  currentLabelLower.includes("recu") ||
                                  currentLabel === "" ||
                                  currentLabel === "guillaume philippe";

                if (isGeneric && currentLabel !== targetLabel) {
                    console.log(`📝 Correction PRO sur Pennylane : Facture ID ${matchedPennylaneInv.id} | Libellé : "${currentLabel}" -> "${targetLabel}"`);
                    
                    const updateRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${matchedPennylaneInv.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({
                            label: targetLabel,
                            amount: fileAmount.toString()
                        })
                    });

                    if (updateRes.ok) {
                        console.log(`   ✅ Libellé propre mis à jour !`);
                        updatedOnPennylane++;
                    } else {
                        console.error(`   ❌ Échec de mise à jour : ${updateRes.status}`);
                    }
                    await sleep(150);
                }
            }
        }
    }

    console.log(`\n🏁 Synchronisation terminée !`);
    console.log(`📊 Statistiques :`);
    console.log(`- Fichiers locaux scannés : ${processedCount}`);
    console.log(`- Fichiers pro détectés : ${localProsFound}`);
    console.log(`- Fichiers rejetés détectés : ${localRejectsFound}`);
    console.log(`- Factures corrigées ou rejetées sur Pennylane : ${updatedOnPennylane}`);
}

main();
