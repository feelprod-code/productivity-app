import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    console.log("🔍 Fetching SumUp transactions from Pennylane...");
    
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
        {
            field: "date",
            operator: "gteq",
            value: "2026-01-01"
        }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 12; page++) {
        const fetchUrl: string = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            console.error(`Failed to fetch transactions on page ${page}: ${res.status}`);
            break;
        }
        const data: any = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);

        const nextCursor: string | null = data.next_cursor || data.meta?.next_cursor || null;
        if (nextCursor) {
            txCursor = nextCursor;
        } else {
            break;
        }
    }

    const sumupTxs = allTxs.filter((tx: any) => {
        const labelLower = (tx.label || "").toLowerCase();
        return labelLower.includes("sumup") || labelLower.includes("sum up");
    });

    console.log(`\n📊 Found ${sumupTxs.length} SumUp transactions in Pennylane:`);
    sumupTxs.forEach((tx: any) => {
        console.log(`- ID: ${tx.id}, Date: ${tx.date}, Label: ${tx.label}, Amount: ${tx.amount} €`);
    });
}

main().catch(console.error);
