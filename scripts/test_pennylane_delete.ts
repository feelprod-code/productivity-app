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

  const invoiceId = "25564580683776"; // L'ID de la facture test SUMUP trouvée précédemment
  console.log(`🧪 Test d'envoi de DELETE sur /supplier_invoices/${invoiceId}...`);
  
  const res = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    }
  });

  console.log(`   Status Code : ${res.status}`);
  console.log(`   Réponse :`, await res.text());
}

main().catch(console.error);
