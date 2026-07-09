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

    const testId = 25304410255360; // recent invoice id
    console.log(`📝 Attempting to UPDATE supplier invoice ${testId} with label only...`);

    try {
        const res = await fetch(`${BASE_URL}/supplier_invoices/${testId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify({
                label: "TEST UPDATE LABEL SUCCESS"
            })
        });

        console.log(`Status: ${res.status}`);
        const data = await res.json();
        console.log(`Response:`, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

main();
