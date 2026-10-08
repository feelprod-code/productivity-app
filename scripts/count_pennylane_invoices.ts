import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    let invoices: any[] = [];
    let cursor = '';
    for (let page = 1; page <= 10; page++) {
        const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) break;
        const data: any = await res.json();
        const items = data.items || data.supplier_invoices || [];
        invoices.push(...items);
        cursor = data.next_cursor || data.meta?.next_cursor || '';
        if (!cursor) break;
    }
    console.log(`Total supplier invoices in Pennylane: ${invoices.length}`);
    const with2026 = invoices.filter(i => (i.date || '').startsWith('2026'));
    console.log(`Supplier invoices in 2026: ${with2026.length}`);
    with2026.slice(0, 10).forEach(i => {
        console.log(`   - [${i.date}] ${i.supplier?.name || i.supplier_id} : ${i.currency_amount} € | Matched tx: ${i.matched_transactions?.length || 0}`);
    });
}

main();
