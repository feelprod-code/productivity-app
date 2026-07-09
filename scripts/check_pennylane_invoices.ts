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

  console.log("🔍 Récupération des factures depuis Pennylane...");
  
  let invoices: any[] = [];
  let cursor = '';
  
  while (true) {
    const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Échec Pennylane API : ${res.status} - ${errText}`);
      break;
    }

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

  console.log(`\n📊 Bilan Pennylane API :`);
  console.log(`- Nombre de factures trouvées sur Pennylane : ${invoices.length}`);
  
  if (invoices.length > 0) {
    console.log(`\n📋 Échantillon des 5 dernières factures :`);
    invoices.slice(0, 5).forEach(inv => {
      console.log(`  - Date: ${inv.date} | Fournisseur: ${inv.label} | Montant: ${inv.amount} € | Statut: ${inv.matching_status}`);
    });
  }
}

main().catch(console.error);
