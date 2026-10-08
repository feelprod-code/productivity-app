import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    const res = await fetch(`${BASE_URL}/transactions/28890877427712`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    const data: any = await res.json();
    console.log("Transaction 28890877427712 after matching:");
    console.log("Matched:", data.matched);
    console.log("Matched Invoices:", data.matched_invoices || data.matched_supplier_invoices);
}

main();
