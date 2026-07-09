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

  // 1. Fetch one invoice containing SUMUP
  console.log("🔍 Recherche d'une facture SUMUP sur Pennylane...");
  const listRes = await fetch(`${BASE_URL}/supplier_invoices?limit=100`, {
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    }
  });

  if (!listRes.ok) {
    console.error(`❌ Échec recherche : ${listRes.status}`);
    return;
  }

  const data: any = await listRes.json();
  const items = data.items || data.supplier_invoices || [];
  const sumupInvoice = items.find((inv: any) => 
    JSON.stringify(inv).toUpperCase().includes("SUMUP")
  );

  if (!sumupInvoice) {
    console.log("ℹ️ Aucune facture SUMUP récente trouvée pour le test.");
    return;
  }

  console.log(`🎯 Facture test trouvée : ID ${sumupInvoice.id} | Date: ${sumupInvoice.date} | Montant: ${sumupInvoice.amount} €`);

  // 2. Test updating with archived: true
  console.log("🧪 Test 1 : Essai d'archivage avec { archived: true }...");
  const updateRes1 = await fetch(`${BASE_URL}/supplier_invoices/${sumupInvoice.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ archived: true })
  });

  console.log(`   Status Code : ${updateRes1.status}`);
  console.log(`   Réponse :`, await updateRes1.text());

  // 3. Test updating with archived_at: current date
  console.log("\n🧪 Test 2 : Essai d'archivage avec { archived_at: current_date }...");
  const updateRes2 = await fetch(`${BASE_URL}/supplier_invoices/${sumupInvoice.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ archived_at: new Date().toISOString() })
  });

  console.log(`   Status Code : ${updateRes2.status}`);
  console.log(`   Réponse :`, await updateRes2.text());
}

main().catch(console.error);
