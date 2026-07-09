import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllSupplierInvoices(): Promise<any[]> {
  let invoices: any[] = [];
  let cursor = '';
  while (true) {
    await sleep(200);
    const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch invoices: ${res.statusText}`);
    const data: any = await res.json();
    const items = data.items || data.supplier_invoices || [];
    invoices.push(...items);
    
    const nextCursor = data.next_cursor || data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
  }
  return invoices;
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  console.log("🔍 Récupération de toutes les factures fournisseurs de Pennylane...");
  const invoices = await fetchAllSupplierInvoices();
  console.log(`📊 ${invoices.length} factures fournisseurs trouvées.`);

  // Filter invoices with dates in July 2026
  const julyInvoices = invoices.filter((inv: any) => 
    inv.date && inv.date.startsWith("2026-07")
  );

  console.log(`\n🔎 Liste des factures de Juillet 2026 sur Pennylane (${julyInvoices.length}) :`);
  for (const inv of julyInvoices) {
    console.log(`\n🧾 Facture ID: ${inv.id} | Date: ${inv.date} | Montant: ${inv.amount} € | Fournisseur: "${inv.supplier?.name || ''}" | Fichier: "${inv.filename}"`);
    if (inv.matched_transactions && inv.matched_transactions.length > 0) {
      console.log(`   🔗 Transactions rapprochées :`);
      for (const tx of inv.matched_transactions) {
        console.log(`     • Transaction ID: ${tx.id} | Montant: ${tx.amount} € | Libellé: "${tx.label || ''}" | Date: "${tx.date || ''}"`);
      }
    } else {
      console.log(`   ❌ Non rapprochée.`);
    }
  }
}

main().catch(console.error);
