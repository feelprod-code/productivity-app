import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    // Test matching 5 high-confidence invoices:
    // E.g. ViaSana / GoCardless 1848 € on 02/09/2026, 04/08/2026, Bouygues Telecom 44.99 € and 6.99 €
    const testPairs = [
        { invId: "30327942471680", txId: "28890877427712", name: "GoCardless 1848€ (02/09/2026)" },
        { invId: "30327936217088", txId: "27381269762048", name: "GoCardless 1848€ (04/08/2026)" },
        { invId: "30282106740736", txId: "25374666665984", name: "Bouygues 6.99€ (06/07/2026)" },
        { invId: "30281515626496", txId: "25374666670080", name: "Bouygues 44.99€ (06/07/2026)" },
        { invId: "30281484824576", txId: "26353476276224", name: "Free Mobile 29.98€ (22/07/2026)" }
    ];

    for (const pair of testPairs) {
        console.log(`\nMatching ${pair.name} (Invoice ${pair.invId} <-> Tx ${pair.txId})...`);
        const res = await fetch(`${BASE_URL}/supplier_invoices/${pair.invId}/matched_transactions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify({ transaction_id: String(pair.txId) })
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`✅ MATCH SUCCESS for ${pair.name}!`, data);
        } else {
            console.error(`❌ FAILED (Status ${res.status}):`, await res.text());
        }
        await sleep(300);
    }
}

main();
