import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
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

    const matchedInPennylane = allTxs.filter(t => t.matched);
    const unmatchedInPennylane = allTxs.filter(t => !t.matched);

    console.log(`Pennylane 2026 Transactions Total: ${allTxs.length}`);
    console.log(`   - Matched in Pennylane: ${matchedInPennylane.length} (${((matchedInPennylane.length/allTxs.length)*100).toFixed(1)}%)`);
    console.log(`   - Unmatched in Pennylane: ${unmatchedInPennylane.length} (${((unmatchedInPennylane.length/allTxs.length)*100).toFixed(1)}%)`);
}

main();
