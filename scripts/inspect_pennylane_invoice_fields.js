const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const res = await fetch(`${BASE_URL}/supplier_invoices?limit=5`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  const items = data.items || data.supplier_invoices || [];
  if (items.length > 0) {
    console.log("Sample Invoice keys:", Object.keys(items[0]));
    console.log("Sample Invoice:", JSON.stringify(items[0], null, 2));
  }
}

main().catch(console.error);
