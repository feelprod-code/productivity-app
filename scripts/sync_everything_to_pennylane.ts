import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadPdfAndImportInvoice(pdfPath: string, supplierName: string, amount: number, dateStr: string, label: string): Promise<string | null> {
    try {
        if (!fs.existsSync(pdfPath)) {
            console.warn(`File not found: ${pdfPath}`);
            return null;
        }

        const pdfBuffer = fs.readFileSync(pdfPath);
        const fileName = path.basename(pdfPath);
        console.log(`📤 Uploading "${fileName}" to Pennylane...`);

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
        formData.append('file', blob, fileName);

        const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: formData
        });

        if (!uploadRes.ok) {
            console.error(`Upload failed: ${uploadRes.status}`, await uploadRes.text());
            return null;
        }

        const uploadData: any = await uploadRes.json();
        const fileAttachmentId = uploadData.id;

        // Get or create supplier
        const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        let supplierId: number | null = null;
        if (suppliersRes.ok) {
            const data: any = await suppliersRes.json();
            const list = data.items || data.suppliers || [];
            const found = list.find((s: any) => (s.name || '').toUpperCase().includes(supplierName.toUpperCase()));
            if (found) supplierId = found.id;
        }

        if (!supplierId) {
            const createRes = await fetch(`${BASE_URL}/suppliers`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Use-2026-API-Changes': 'true'
                },
                body: JSON.stringify({ name: supplierName })
            });
            if (createRes.ok) {
                const cData: any = await createRes.json();
                supplierId = cData.supplier?.id || cData.id;
            }
        }

        if (!supplierId) {
            console.error(`Could not resolve supplier ID for ${supplierName}`);
            return null;
        }

        // Import invoice
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
                    label
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

        if (!importRes.ok) {
            console.error(`Import failed: ${importRes.status}`, await importRes.text());
            return null;
        }

        const importData: any = await importRes.json();
        const invoiceId = String(importData.id || importData.supplier_invoice?.id);
        console.log(`✅ Imported invoice ${invoiceId} for ${supplierName} (${amount} €)`);
        return invoiceId;
    } catch (e: any) {
        console.error(`Error in uploadAndImportInvoice: ${e.message}`);
        return null;
    }
}

async function matchInvoiceToTransaction(invoiceId: string, transactionId: string): Promise<boolean> {
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
        return res.status === 204 || res.ok;
    } catch (e: any) {
        return false;
    }
}

async function main() {
    console.log("=== 1. FETCH TRANSACTIONS & INVOICES FROM PENNYLANE ===");
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-01-01" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 15; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (!res.ok) break;
        const data: any = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);
        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) txCursor = nextCursor;
        else break;
    }
    console.log(`Loaded ${allTxs.length} transactions.`);

    let invoices: any[] = [];
    let cursor = '';
    for (let page = 1; page <= 10; page++) {
        await sleep(150);
        const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (!res.ok) break;
        const data: any = await res.json();
        const items = data.items || data.supplier_invoices || [];
        invoices.push(...items);
        cursor = data.next_cursor || data.meta?.next_cursor || '';
        if (!cursor) break;
    }
    const invs2026 = invoices.filter(i => (i.date || '').startsWith('2026'));
    console.log(`Loaded ${invs2026.length} supplier invoices for 2026.`);

    // --- PHASE 1: Auto-reconcile existing matchable invoices in Pennylane ---
    console.log("\n=== PHASE 1: RECONCILING EXISTING PENNYLANE INVOICES ===");
    const debitTxs = allTxs.filter(t => parseFloat(t.amount || "0") < 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const usedTxIds = new Set<string>();
    let matchedPennylaneCount = 0;

    for (const inv of invs2026) {
        const invAmt = Math.abs(parseFloat(inv.currency_amount || inv.amount || "0"));
        if (invAmt <= 0) continue;
        const invDate = new Date(inv.date).getTime();

        const candidate = debitTxs.find(tx => {
            if (usedTxIds.has(String(tx.id))) return false;
            const txAmt = Math.abs(parseFloat(tx.amount || "0"));
            const amtDiff = Math.abs(txAmt - invAmt);
            const txDate = new Date(tx.date).getTime();
            const daysDiff = Math.abs(txDate - invDate) / dayMs;
            return amtDiff < 0.05 && daysDiff <= 12;
        });

        if (candidate) {
            usedTxIds.add(String(candidate.id));
            const ok = await matchInvoiceToTransaction(String(inv.id), String(candidate.id));
            if (ok) {
                matchedPennylaneCount++;
                console.log(`🔗 Matched in Pennylane: Inv ${inv.id} (${invAmt} €) <-> Tx ${candidate.id} on ${candidate.date} (${candidate.label.substring(0, 40)}...)`);
            }
            await sleep(250);
        }
    }
    console.log(`✅ Phase 1 complete: ${matchedPennylaneCount} invoices reconciled in Pennylane!`);

    // --- PHASE 2: Import official docs and match ---
    console.log("\n=== PHASE 2: IMPORTING OFFICIAL DOCUMENTS TO PENNYLANE ===");
    const OFFICIAL_DOCS = [
        {
            pdfPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/URSSAF 2026.pdf",
            supplierName: "URSSAF",
            amount: 2088.00,
            dateStr: "2026-07-04",
            label: "URSSAF Régularisation cotisations 2025 et échéancier 2026",
            txAmount: 2088.00
        },
        {
            pdfPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/06 - Juin/2026-06-12 - CARPIMKO_APPEL_DE_COTISATIONS - 5434.00€.pdf",
            supplierName: "CARPIMKO",
            amount: 5434.00,
            dateStr: "2026-06-12",
            label: "CARPIMKO Appel de cotisations 2026",
            txAmount: 5434.00
        },
        {
            pdfPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/08 - Aout/2026-08-06 - LCL LEASING - 568.83EUR.pdf",
            supplierName: "LCL LEASING (LIXXBAIL)",
            amount: 568.83,
            dateStr: "2026-08-06",
            label: "LCL LEASING Premier loyer majoré matériel informatique",
            txAmount: 568.83
        }
    ];

    for (const doc of OFFICIAL_DOCS) {
        console.log(`\nProcessing official doc: ${doc.label}...`);
        const invoiceId = await uploadPdfAndImportInvoice(doc.pdfPath, doc.supplierName, doc.amount, doc.dateStr, doc.label);
        if (invoiceId) {
            // Find corresponding transaction
            const matchedTx = allTxs.find(tx => {
                const amt = Math.abs(parseFloat(tx.amount || "0"));
                return Math.abs(amt - doc.txAmount) < 0.05 && tx.date.startsWith("2026");
            });
            if (matchedTx) {
                const matched = await matchInvoiceToTransaction(invoiceId, String(matchedTx.id));
                if (matched) {
                    console.log(`🎉 MATCHED ${doc.label} to Tx ${matchedTx.id} on ${matchedTx.date}!`);
                }
            }
        }
        await sleep(400);
    }
}

main().catch(console.error);
