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

    try {
        console.log("📥 Fetching recent supplier invoices from Pennylane...");
        const res = await fetch(`${BASE_URL}/supplier_invoices?limit=10`, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }
        });

        if (!res.ok) {
            console.error(`❌ Failed: ${res.status} ${await res.text()}`);
            return;
        }

        const data = await res.json();
        const invoices = data.items || data.supplier_invoices || [];
        console.log(`Found ${invoices.length} invoices.`);
        if (invoices.length > 0) {
            console.log("Sample invoice structure:", JSON.stringify(invoices[0], null, 2));
        }
    } catch (e) {
        console.error("❌ Error:", e.message);
    }
}

main();
