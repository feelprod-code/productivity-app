import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pdfParse from 'pdf-parse';

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Détermine s'il faut exécuter en mode Dry-Run (simulation)
const isDryRun = process.argv.includes('--dry-run');

interface LocalInvoice {
    filename: string;
    filePath: string;
    date: Date;
    description: string;
    amount: number;
    year: string;
}

// Trouver l'ID du fournisseur Amazon sur Pennylane ou le créer
async function getOrCreateAmazonSupplierId(): Promise<number | null> {
    if (!pennylaneKey) return null;
    
    try {
        console.log("🔍 Recherche du fournisseur AMAZON sur Pennylane...");
        const res = await fetch(`${BASE_URL}/suppliers?limit=100`, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }
        });
        
        if (!res.ok) {
            console.error(`❌ Impossible de récupérer la liste des fournisseurs Pennylane : ${res.status}`);
            return null;
        }
        
        const data = await res.json();
        const suppliers = data.items || data.suppliers || [];
        const matched = suppliers.find((s: any) => (s.name || "").toLowerCase().includes("amazon"));
        
        if (matched) {
            console.log(`✅ Fournisseur AMAZON trouvé sur Pennylane (ID: ${matched.id})`);
            return matched.id;
        }
        
        // Création du fournisseur s'il n'existe pas
        console.log("➕ Fournisseur AMAZON non trouvé. Création sur Pennylane...");
        const createRes = await fetch(`${BASE_URL}/suppliers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify({ name: "AMAZON" })
        });
        
        if (createRes.ok) {
            const createData = await createRes.json();
            const id = createData.supplier?.id || createData.id;
            console.log(`✅ Fournisseur AMAZON créé avec succès sur Pennylane (ID: ${id})`);
            return id;
        } else {
            const errTxt = await createRes.text();
            console.error(`❌ Échec de la création du fournisseur AMAZON : ${errTxt}`);
            return null;
        }
    } catch (e) {
        console.error("❌ Erreur getOrCreateAmazonSupplierId :", e);
        return null;
    }
}

// Uploader le justificatif d'une facture locale sur Pennylane
async function uploadFileToPennylane(filePath: string, filename: string): Promise<string | null> {
    if (isDryRun) {
        return "SIMULATED_ATTACHMENT_ID";
    }
    
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, filename);
        
        const res = await fetch(`${BASE_URL}/file_attachments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: formData
        });
        
        if (!res.ok) {
            const err = await res.text();
            console.error(`❌ Échec du téléversement Pennylane pour ${filename} : ${err}`);
            return null;
        }
        
        const data = await res.json();
        return data.id || null;
    } catch (e) {
        console.error(`❌ Erreur d'upload Pennylane pour ${filename} :`, e);
        return null;
    }
}

// Créer l'invoice fournisseur sur Pennylane
async function createSupplierInvoicePennylane(fileAttachmentId: string, supplierId: number, date: Date, amount: number, label: string): Promise<string | null> {
    if (isDryRun) {
        return "SIMULATED_INVOICE_ID";
    }
    
    try {
        const dateStr = date.toISOString().split('T')[0];
        const payload = {
            file_attachment_id: fileAttachmentId,
            supplier_id: supplierId,
            date: dateStr,
            deadline: dateStr,
            currency_amount: amount.toFixed(2),
            currency_amount_before_tax: amount.toFixed(2),
            currency_tax: '0.00',
            currency: 'EUR',
            invoice_lines: [
                {
                    currency_amount: amount.toFixed(2),
                    currency_tax: '0.00',
                    vat_rate: 'exempt',
                    label: label
                }
            ]
        };
        
        const res = await fetch(`${BASE_URL}/supplier_invoices/import`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const err = await res.text();
            if (res.status === 409) {
                const match = err.match(/ID (\d+) already exists/i);
                if (match && match[1]) {
                    console.log(`   ℹ️ Facture existante détectée sur Pennylane (ID: ${match[1]}). Rapprochement...`);
                    return match[1];
                }
            }
            console.error(`❌ Échec de la création de la facture Pennylane : ${err}`);
            return null;
        }
        
        const data = await res.json();
        return data.id || data.supplier_invoice?.id || null;
    } catch (e) {
        console.error("❌ Erreur de création de facture Pennylane :", e);
        return null;
    }
}

// Associer la facture à la transaction sur Pennylane
async function matchTransactionPennylane(invoiceId: string, transactionId: string): Promise<boolean> {
    if (isDryRun) {
        console.log(`[DRY-RUN] Simuler l'association Invoice ${invoiceId} ➔ Transaction ${transactionId}`);
        return true;
    }
    
    try {
        const res = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify({ transaction_id: String(transactionId) })
        });
        
        if (!res.ok) {
            const err = await res.text();
            console.error(`❌ Échec du matching de la transaction Pennylane ${transactionId} avec la facture ${invoiceId} : ${err}`);
            return false;
        }
        
        return true;
    } catch (e) {
        console.error(`❌ Erreur lors du matching de transaction Pennylane :`, e);
        return false;
    }
}

async function main() {
    if (!pennylaneKey) {
        console.error("❌ ERREUR: PENNYLANE_API_KEY manquante dans le .env");
        process.exit(1);
    }
    
    console.log(`🚀 Démarrage de l'importateur Amazon (Mode: ${isDryRun ? 'DRY-RUN / Simulation' : 'RÉEL / Écriture'})`);
    
    const years = ['2025', '2026'];
    const localInvoices: LocalInvoice[] = [];
    
    // --- 1. SCANNER LES DOSSIERS LOCAUX ---
    for (const year of years) {
        const dirPath = path.join(os.homedir(), 'Documents', '1-PAPIERS', '1-PAPIERS PHIL', '4-Compta', `Factures ${year}`);
        if (!fs.existsSync(dirPath)) {
            console.log(`⚠️ Dossier non trouvé : ${dirPath}`);
            continue;
        }
        
        const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.pdf'));
        console.log(`📂 Dossier ${year} : ${files.length} factures PDF trouvées.`);
        
        for (const file of files) {
            // Parser le nom de fichier : AAAA-MM-JJ - Description - Montant€.pdf
            // Exemple : 2025-01-05 - Beyblade X, Starter Pack... - 14,99€.pdf
            const regex = /^(\d{4}-\d{2}-\d{2})\s+-\s+(.+?)\s+-\s+([\d\s]+[.,]\d{2})€\.pdf$/;
            const match = file.match(regex);
            
            if (!match) {
                console.log(`⚠️ Fichier non standard ignoré : ${file}`);
                continue;
            }
            
            const dateStr = match[1];
            const description = match[2].trim();
            const amountStr = match[3].replace(/\s/g, '').replace(',', '.');
            const amount = parseFloat(amountStr);
            const date = new Date(`${dateStr}T12:00:00Z`);
            const filePath = path.join(dirPath, file);

            // Vérification du contenu du PDF de la facture Amazon
            try {
                const buffer = fs.readFileSync(filePath);
                const parsedPdf = await pdfParse(buffer);
                const text = (parsedPdf.text || '').toLowerCase();

                const hasRecipient = text.includes("guillaume philippe") || text.includes("philippe guillaume");
                if (!hasRecipient) {
                    console.log(`❌ Facture Amazon locale ${file} ignorée : non adressée à Guillaume Philippe.`);
                    continue;
                }

                const hasPayPal = text.includes("paypal") || text.includes("pay pal");
                const hasProCard = text.includes("1397") || text.includes("6150");
                if (!hasPayPal && !hasProCard) {
                    console.log(`❌ Facture Amazon locale ${file} ignorée : mode de paiement non autorisé (ni pro 1397/6150, ni PayPal).`);
                    continue;
                }
            } catch (err: any) {
                console.warn(`⚠️ Impossible de parser le PDF ${file} pour vérification, inclusion par défaut : ${err.message}`);
            }
            
            localInvoices.push({
                filename: file,
                filePath,
                date,
                description,
                amount,
                year
            });
        }
    }
    
    console.log(`\n📋 Total de factures locales prêtes pour le traitement : ${localInvoices.length}`);
    
    // --- 2. RÉCUPÉRATION DES TRANSACTIONS PENNYLANE POUR 2025 & 2026 ---
    console.log("\n📥 Récupération des transactions Amazon de 2025 et 2026 depuis Pennylane...");
    const allPennylaneTxs: any[] = [];
    
    // Filtre sur 2025-01-01 à 2026-12-31
    const filterObj = [
        { field: "date", operator: "gteq", value: "2025-01-01" },
        { field: "date", operator: "lteq", value: "2026-12-31" }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));
    
    let cursor: string | null = null;
    for (let page = 1; page <= 50; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        
        if (!res.ok) {
            console.error(`❌ Échec de la récupération des transactions page ${page}`);
            break;
        }
        
        const data = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        
        allPennylaneTxs.push(...items);
        
        cursor = data.next_cursor || data.meta?.next_cursor;
        if (!cursor) break;
    }
    
    // Filtrer pour ne garder que les transactions Amazon / AMZ
    const amazonTxs = allPennylaneTxs.filter((tx: any) => {
        const labelLower = (tx.label || "").toLowerCase();
        return labelLower.includes("amazon") || labelLower.includes("amz ");
    });
    
    console.log(`✅ ${amazonTxs.length} transaction(s) Amazon identifiée(s) sur Pennylane.`);
    
    // Récupérer aussi les factures fournisseurs de Pennylane pour voir celles déjà rapprochées
    console.log("📥 Récupération des justificatifs d'achats existants sur Pennylane...");
    const existingPennylaneInvoices: any[] = [];
    let invCursor: string | null = null;
    for (let page = 1; page <= 50; page++) {
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
        
        existingPennylaneInvoices.push(...items);
        invCursor = data.next_cursor || data.meta?.next_cursor;
        if (!invCursor) break;
    }
    
    // Mettre en cache les IDs de transactions déjà rapprochées sur Pennylane (outstanding_balance === 0)
    const matchedTxIds = new Set<string>();
    amazonTxs.forEach((tx: any) => {
        if (parseFloat(tx.outstanding_balance || '0') === 0) {
            matchedTxIds.add(String(tx.id));
        }
    });
    
    console.log(`ℹ️ ${matchedTxIds.size} transaction(s) ont déjà un justificatif lié sur Pennylane.`);
    
    // Récupérer le fournisseur Amazon
    const amazonSupplierId = await getOrCreateAmazonSupplierId();
    if (!amazonSupplierId) {
        console.error("❌ Impossible de continuer sans ID de fournisseur Amazon sur Pennylane.");
        process.exit(1);
    }
    
    // --- 3. TRAITEMENT ET RAPPROCHEMENT ---
    let localInsertedCount = 0;
    let localSkippedCount = 0;
    let pennylaneMatchedCount = 0;
    
    for (const localInv of localInvoices) {
        const formattedProvider = `AMAZON - ${localInv.description.toUpperCase()}`;
        const fileUrl = `/invoices/Factures ${localInv.year}/${localInv.filename}`;
        
        // A. Vérification et insertion en base de données locale
        const dateMin = new Date(localInv.date.getTime() - 24 * 60 * 60 * 1000 * 2);
        const dateMax = new Date(localInv.date.getTime() + 24 * 60 * 60 * 1000 * 2);
        
        const existingLocal = await prisma.invoice.findFirst({
            where: {
                provider: {
                    startsWith: "AMAZON"
                },
                amount: localInv.amount,
                date: {
                    gte: dateMin,
                    lte: dateMax
                }
            }
        });
        
        if (!existingLocal) {
            if (!isDryRun) {
                await prisma.invoice.create({
                    data: {
                        provider: formattedProvider,
                        amount: localInv.amount,
                        currency: 'EUR',
                        date: localInv.date,
                        fileUrl: fileUrl,
                        status: 'COMPLETED',
                        type: 'PRO'
                    }
                });
            }
            console.log(`➕ [LOCAL] Ajoutée en base locale: [${localInv.date.toISOString().substring(0,10)}] ${formattedProvider} (${localInv.amount} €)`);
            localInsertedCount++;
        } else {
            localSkippedCount++;
        }
        
        // B. Rapprochement avec Pennylane
        const absAmount = localInv.amount;
        const invoiceTime = localInv.date.getTime();
        
        // Trouver la meilleure transaction correspondante sur Pennylane
        const matchedTx = amazonTxs.find((tx: any) => {
            const txId = String(tx.id);
            if (matchedTxIds.has(txId)) return false; // Déjà associée
            
            const txAmount = Math.abs(parseFloat(tx.amount || '0'));
            const txTime = new Date(tx.date).getTime();
            
            // Logique de matching : montant identique et date transaction >= date facture - 2 jours et date transaction - date facture <= 90 jours
            const amountMatch = Math.abs(txAmount - absAmount) < 0.01;
            const dateMatch = (txTime >= invoiceTime - 2 * 24 * 60 * 60 * 1000) && (txTime - invoiceTime <= 90 * 24 * 60 * 60 * 1000);
            
            return amountMatch && dateMatch;
        });
        
        if (matchedTx) {
            const txId = String(matchedTx.id);
            console.log(`✨ [MATCH] Facture locale [${localInv.date.toISOString().substring(0,10)}] (${localInv.amount} €) matchée avec transaction Pennylane [${matchedTx.date}] ${matchedTx.label} (${matchedTx.amount} €)`);
            
            // 1. Upload sur Pennylane
            const fileAttachmentId = await uploadFileToPennylane(localInv.filePath, localInv.filename);
            
            if (fileAttachmentId) {
                // Pause pour rate-limit
                await sleep(1500);
                
                // 2. Création de la facture sur Pennylane
                const pennylaneInvoiceId = await createSupplierInvoicePennylane(
                    fileAttachmentId,
                    amazonSupplierId,
                    localInv.date,
                    localInv.amount,
                    `Achat Amazon : ${localInv.description}`
                );
                
                if (pennylaneInvoiceId) {
                    await sleep(1500);
                    
                    // 3. Liaison de la transaction
                    const successMatch = await matchTransactionPennylane(pennylaneInvoiceId, txId);
                    
                    if (successMatch) {
                        console.log(`   🔗 Rapprochement effectué sur Pennylane pour la transaction ${txId} !`);
                        matchedTxIds.add(txId); // Éviter de la ré-associer
                        pennylaneMatchedCount++;
                        
                        // 4. Enrichissement en base locale dans TransactionDetail
                        if (!isDryRun) {
                            await prisma.$executeRawUnsafe(
                                'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                                txId,
                                localInv.description
                            );
                        }
                    }
                }
            }
        }
    }
    
    console.log(`\n🏁 Traitement terminé !`);
    console.log(`📊 Bilan Local : ${localInsertedCount} factures insérées en base, ${localSkippedCount} déjà existantes.`);
    console.log(`📊 Bilan Pennylane : ${pennylaneMatchedCount} factures téléversées et associées aux transactions.`);
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
