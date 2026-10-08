const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";

  // Matchings to delete (Variant 1 REST style path)
  const toDelete = [
    { invId: "25116224200704", txId: "24020126031872", name: "CACF_RLV from VW June tx" },
    { invId: "25116224200704", txId: "24020122394624", name: "CACF_RLV from VW May tx" },
    { invId: "25116224200704", txId: "24020116279296", name: "CACF_RLV from VW April tx" }
  ];

  console.log("🔥 Starting Pennylane unmatched correction...");

  for (const item of toDelete) {
    console.log(`\nUnmatching ${item.name} (Invoice ${item.invId} from Tx ${item.txId})...`);
    
    try {
      const url = `${BASE_URL}/supplier_invoices/${item.invId}/matched_transactions/${item.txId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        }
      });

      if (res.status === 204 || res.ok) {
        console.log(`✅ Successfully unmatched ${item.name}!`);
      } else {
        const text = await res.text();
        console.error(`❌ Failed to unmatch (status ${res.status}): ${text}`);
      }
    } catch (e) {
      console.error(`💥 Error:`, e.message);
    }
  }
}

main();
