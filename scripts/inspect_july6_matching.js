const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  // Check transaction 25374666620928 (Free 23.99)
  const txRes = await fetch(`${BASE_URL}/transactions/25374666620928`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  console.log("Tx 25374666620928:", await txRes.json());

  // Check invoice 30282152873984 (Free 23.99 created for July 6)
  const invRes = await fetch(`${BASE_URL}/supplier_invoices/30282152873984`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  console.log("Inv 30282152873984:", await invRes.json());
}

main().catch(console.error);
