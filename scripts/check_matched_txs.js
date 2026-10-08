const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const res = await fetch(`${BASE_URL}/supplier_invoices/30282152873984/matched_transactions`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  console.log("Matched transactions for invoice 30282152873984:", await res.json());

  const res2 = await fetch(`${BASE_URL}/transactions/25374666620928/matched_invoices`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  console.log("Matched invoices for tx 25374666620928:", await res2.json());
}

main().catch(console.error);
