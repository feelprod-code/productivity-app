import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    const res = await fetch("http://localhost:3000/api/transactions/releve?year=2026&month=all&page=1&limit=500");
    if (!res.ok) {
        console.error("Failed to fetch releve API:", res.status, await res.text());
        return;
    }
    const data = await res.json();
    const txs: any[] = data.transactions || [];
    console.log(`Total transactions returned for 2026: ${txs.length}`);

    const unreconciled = txs.filter((t: any) => !t.isReconciled);
    const reconciled = txs.filter((t: any) => t.isReconciled);

    console.log(`Reconciled: ${reconciled.length} (${((reconciled.length / txs.length) * 100).toFixed(1)}%)`);
    console.log(`Unreconciled: ${unreconciled.length} (${((unreconciled.length / txs.length) * 100).toFixed(1)}%)`);

    // Split unreconciled into credits (entrées) and debits (sorties)
    const unreconciledCredits = unreconciled.filter(t => t.amount > 0);
    const unreconciledDebits = unreconciled.filter(t => t.amount < 0);

    console.log(`\n--- UNRECONCILED CREDITS (${unreconciledCredits.length}) ---`);
    unreconciledCredits.forEach(t => {
        console.log(`[${t.date}] +${t.amount} € | ${t.label} | isPro: ${t.isPro} | Account: ${t.isProAccount ? 'PRO' : 'PERSO'}`);
    });

    console.log(`\n--- UNRECONCILED DEBITS (${unreconciledDebits.length}) ---`);
    unreconciledDebits.forEach(t => {
        console.log(`[${t.date}] ${t.amount} € | ${t.label} | isPro: ${t.isPro} | Account: ${t.isProAccount ? 'PRO' : 'PERSO'}`);
    });
}

main();
