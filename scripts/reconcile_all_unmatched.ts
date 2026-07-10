import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '/Users/guillaumephilippe/ANTIGRAVITY/compta/.env', override: true });

async function main() {
    console.log("🚀 Start batch auto-reconciliation for unmatched 2025/2026 transactions...");

    try {
        const res = await fetch('http://127.0.0.1:3000/api/transactions/releve', {
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            console.error("❌ Failed to fetch transactions from local API");
            return;
        }

        const data = await res.json();
        const txs = data.transactions || [];

        // Filter unmatched pro outflows from 2025 and 2026
        const unmatched = txs.filter((t: any) => {
            const date = new Date(t.date);
            const year = date.getFullYear();
            const isTargetYear = year === 2025 || year === 2026;
            const isPro = t.isPro;
            const isUnmatched = !t.matchedInvoice;
            const isOutflow = t.amount < 0;
            const needsJustificatif = !t.noJustificatif;

            return isTargetYear && isPro && isUnmatched && isOutflow && needsJustificatif;
        });

        console.log(`📊 Found ${unmatched.length} unmatched pro expenses for 2025/2026.`);

        if (unmatched.length === 0) {
            console.log("✅ Nothing to reconcile !");
            return;
        }

        // Process them sequentially to avoid Gmail and Pennylane rate limits
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < unmatched.length; i++) {
            const tx = unmatched[i];
            console.log(`\n🔄 [${i+1}/${unmatched.length}] Reconciling: ${tx.label} | ${tx.amount} EUR | Date: ${tx.date}...`);

            try {
                const recRes = await fetch('http://127.0.0.1:3000/api/transactions/reconcile-auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transactionId: String(tx.id),
                        label: tx.label,
                        amount: tx.amount,
                        date: tx.date
                    })
                });

                const result = await recRes.json();
                if (recRes.ok && result.success) {
                    console.log(`✅ SUCCESS! Matched with invoice file: ${result.matchedFile}`);
                    successCount++;
                } else {
                    console.log(`❌ FAILED: ${result.error || 'Unknown error'}`);
                    failCount++;
                }
            } catch (err: any) {
                console.error(`💥 Request Error for transaction ${tx.id}:`, err.message);
                failCount++;
            }

            // Small delay between requests to preserve connection stability
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`\n🎉 Batch Reconciled Finished!`);
        console.log(`📈 Success: ${successCount} | Failed/Not Found: ${failCount}`);

    } catch (err: any) {
        console.error("❌ Batch processing crashed:", err.message);
    }
}

main();
