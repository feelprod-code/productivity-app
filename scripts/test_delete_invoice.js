const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    if (!pennylaneKey) {
        console.error("❌ Missing PENNYLANE_API_KEY");
        return;
    }

    const testId = 25304410255360; // recent invoice id from inspect
    console.log(`🧹 Attempting to DELETE supplier invoice ${testId}...`);

    try {
        const res = await fetch(`${BASE_URL}/supplier_invoices/${testId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response: ${text}`);
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

main();
