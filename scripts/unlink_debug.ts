import fetch from 'node-fetch';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = 'https://web.pennylane.tech/api/v1';

async function main() {
    const invoiceId = '25383131267072'; // The incorrect invoice ID
    
    // GET matched transactions
    const url = `${BASE_URL}/supplier_invoices/${invoiceId}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${pennylaneKey}`,
            'Accept': 'application/json',
            'X-Use-2026-API-Changes': 'true'
        }
    });

    if (!res.ok) {
        console.error("GET failed:", await res.text());
        return;
    }

    const data = await res.json();
    console.log("INVOICE_DATA:", JSON.stringify(data, null, 2));
}

main();
