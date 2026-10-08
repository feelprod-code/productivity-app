import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    console.log("Checking Pennylane Supplier Invoices...");
    const invRes = await fetch(`${BASE_URL}/supplier_invoices?limit=20`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    if (invRes.ok) {
        const invData = await invRes.json();
        console.log(`Supplier invoices found in Pennylane: ${invData.items?.length || invData.supplier_invoices?.length || 0} (total count: ${invData.total_count || invData.meta?.total_count || 'unknown'})`);
        const sample = (invData.items || invData.supplier_invoices || []).slice(0, 5);
        sample.forEach((s: any) => console.log(`   - [${s.date}] ${s.supplier?.name || s.supplier_id} : ${s.currency_amount || s.amount} € (Status: ${s.status || s.payment_status})`));
    } else {
        console.error("Failed to fetch supplier invoices:", invRes.status, await invRes.text());
    }

    console.log("\nChecking Pennylane Customer Invoices (Sales/Recettes)...");
    const custRes = await fetch(`${BASE_URL}/customer_invoices?limit=10`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    if (custRes.ok) {
        const custData = await custRes.json();
        console.log(`Customer invoices in Pennylane: ${custData.items?.length || custData.customer_invoices?.length || 0}`);
    }
}

main();
