import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-06-04" }, { field: "date", operator: "lteq", value: "2026-06-10" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));
    const res = await fetch(`${BASE_URL}/transactions?filter=${filterStr}&limit=50`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    const data: any = await res.json();
    const items = data.transactions || [];
    console.log("Transactions 04-10 June 2026:");
    items.forEach((t: any) => console.log(`[${t.date}] ${t.amount} € | ${t.label}`));
}

main();
