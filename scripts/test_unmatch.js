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
  const invId = "25112045297664";
  const txId = "24849224822784";

  console.log("Testing unmatch variations...");

  // Variant 1: DELETE /supplier_invoices/<invId>/matched_transactions/<txId>
  try {
    const url = `${BASE_URL}/supplier_invoices/${invId}/matched_transactions/${txId}`;
    console.log(`Trying Variant 1: DELETE ${url}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    console.log(`Variant 1 Status: ${res.status}`);
    const text = await res.text();
    console.log(`Variant 1 Response: ${text}`);
    if (res.ok) return;
  } catch (e) {
    console.error("Variant 1 Error:", e.message);
  }

  // Variant 2: DELETE /supplier_invoices/<invId>/matched_transactions?transaction_id=<txId>
  try {
    const url = `${BASE_URL}/supplier_invoices/${invId}/matched_transactions?transaction_id=${txId}`;
    console.log(`Trying Variant 2: DELETE ${url}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    console.log(`Variant 2 Status: ${res.status}`);
    const text = await res.text();
    console.log(`Variant 2 Response: ${text}`);
    if (res.ok) return;
  } catch (e) {
    console.error("Variant 2 Error:", e.message);
  }
}

main();
