import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Fetching all 2026 transactions from Pennylane...");
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

    console.log("Fetching all 2026 supplier invoices from Pennylane...");
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

    // Match candidate debits
    const debitTxs = allTxs.filter(t => parseFloat(t.amount || "0") < 0);
    const dayMs = 24 * 60 * 60 * 1000;
    let matchableCount = 0;

    for (const inv of invs2026) {
        const invAmt = Math.abs(parseFloat(inv.currency_amount || inv.amount || "0"));
        if (invAmt <= 0) continue;
        const invDate = new Date(inv.date).getTime();

        const candidate = debitTxs.find(tx => {
            const txAmt = Math.abs(parseFloat(tx.amount || "0"));
            const amtDiff = Math.abs(txAmt - invAmt);
            const txDate = new Date(tx.date).getTime();
            const daysDiff = Math.abs(txDate - invDate) / dayMs;
            return amtDiff < 0.05 && daysDiff <= 15;
        });

        if (candidate) {
            matchableCount++;
            if (matchableCount <= 10) {
                console.log(`Matchable: Inv ${inv.id} (${invAmt} €, ${inv.date}, ${inv.supplier?.name || 'unknown'}) <-> Tx ${candidate.id} (${candidate.amount} €, ${candidate.date}, "${candidate.label}")`);
            }
        }
    }

    console.log(`\nTotal matchable supplier invoices right now: ${matchableCount} / ${invs2026.length}`);
}

main();
