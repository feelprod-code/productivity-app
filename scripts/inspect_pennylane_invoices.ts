import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  console.log("🔍 Récupération des factures de Pennylane...");
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
    if (!res.ok) break;
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

  const targetInvoices = invoices.filter(inv => 
    inv.date.startsWith("2025-01") && JSON.stringify(inv).toUpperCase().includes("AMAZON")
  );

  console.log(`\n🔍 ${targetInvoices.length} factures Amazon de Janvier 2025 trouvées.`);
  
  for (const inv of targetInvoices) {
    console.log(`\n[Facture] ID: ${inv.id}`);
    console.log(`  - Label: "${inv.label}"`);
    console.log(`  - Date: "${inv.date}"`);
    console.log(`  - Amount: ${inv.amount} €`);
    console.log(`  - Supplier Object:`, JSON.stringify(inv.supplier));
    
    if (inv.supplier && inv.supplier.id) {
      const supRes = await fetch(`${BASE_URL}/suppliers/${inv.supplier.id}`, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        }
      });
      if (supRes.ok) {
        const supData: any = await supRes.json();
        console.log(`  - Supplier Name in Pennylane: "${supData.supplier?.name}"`);
      }
    }
  }
}

main().catch(console.error);
