const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function link(invId, txId, name) {
  console.log(`Linking ${name} (Inv ${invId} -> Tx ${txId})...`);
  const res = await fetch(`${BASE_URL}/supplier_invoices/${invId}/matched_transactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ transaction_id: String(txId) })
  });
  console.log(`Status: ${res.status}`);
  if (!res.ok) console.log(await res.text());
}

async function main() {
  await link("30282152873984", "25374666620928", "Free July 6 (23.99 €)");
  await link("30282106740736", "25374666665984", "Bouygues July 6 (6.99 €)");
}

main().catch(console.error);
