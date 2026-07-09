import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  const res = await fetch(`${BASE_URL}/supplier_invoices?limit=5`, {
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    }
  });

  if (!res.ok) {
    console.error(`❌ Status: ${res.status}`);
    return;
  }

  const data: any = await res.json();
  const items = data.items || data.supplier_invoices || [];
  
  console.log("Checking file URLs for recent invoices:");
  for (const inv of items) {
    console.log(`\n🧾 ID: ${inv.id} | Date: ${inv.date} | Amount: ${inv.amount} €`);
    console.log(`   - file_url: "${inv.file_url}"`);
    console.log(`   - public_file_url: "${inv.public_file_url}"`);
    console.log(`   - file_attachment:`, inv.file_attachment);
  }
}

main().catch(console.error);
