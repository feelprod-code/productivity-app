import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    console.log("=== CHECK PENNYLANE FOR ALL CPAM / AMELI INVOICES ===");
    // Check supplier invoices
    for (const endpoint of ['supplier_invoices', 'customer_invoices']) {
        console.log(`\nFetching ${endpoint}...`);
        let page = 1;
        let cursor: string | null = null;
        while (page <= 5) {
            const url = `${BASE_URL}/${endpoint}?limit=100` + (cursor ? `&cursor=${cursor}` : '');
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) {
                console.log(`Error ${res.status}: ${await res.text()}`);
                break;
            }
            const data: any = await res.json();
            const items = data.supplier_invoices || data.customer_invoices || data.invoices || [];
            if (items.length === 0) break;
            for (const item of items) {
                const label = (item.label || item.recipient?.name || item.supplier?.name || '').toLowerCase();
                if (label.includes('cpam') || label.includes('ameli') || label.includes('assurance maladie')) {
                    console.log(`- [${endpoint}] ID: ${item.id} | Date: ${item.date} | Amount: ${item.currency_amount || item.amount} | Name: ${label} | File: ${item.file_url || item.pdf_url || item.public_url}`);
                }
            }
            cursor = data.next_cursor || data.meta?.next_cursor;
            if (!cursor) break;
            page++;
        }
    }
}

main().catch(console.error);
