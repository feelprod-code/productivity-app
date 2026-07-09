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

  console.log("🔍 Récupération de toutes les factures fournisseurs de Pennylane pour vérification...");
  const invoices = await fetchAllSupplierInvoices();
  console.log(`📊 Total de factures fournisseurs trouvées sur Pennylane : ${invoices.length}`);

  const sumupInvoices = invoices.filter((inv: any) => 
    JSON.stringify(inv).toUpperCase().includes("SUMUP")
  );

  const cpamInvoices = invoices.filter((inv: any) => 
    JSON.stringify(inv).toUpperCase().includes("AMELI") || 
    JSON.stringify(inv).toUpperCase().includes("CPAM")
  );

  console.log("\nRésultats de la vérification :");
  console.log(`- Factures fournisseurs SUMUP restantes : ${sumupInvoices.length}`);
  if (sumupInvoices.length > 0) {
    console.log("⚠️ Détail des factures SUMUP restantes :");
    sumupInvoices.forEach(inv => {
      console.log(`  • ID: ${inv.id} | Date: ${inv.date} | Montant: ${inv.amount} € | Label: "${inv.label || ''}"`);
    });
  }

  console.log(`- Factures fournisseurs CPAM/AMELI restantes : ${cpamInvoices.length}`);
  if (cpamInvoices.length > 0) {
    console.log("⚠️ Détail des factures CPAM/AMELI restantes :");
    cpamInvoices.forEach(inv => {
      console.log(`  • ID: ${inv.id} | Date: ${inv.date} | Montant: ${inv.amount} € | Label: "${inv.label || ''}"`);
    });
  }

  if (sumupInvoices.length === 0 && cpamInvoices.length === 0) {
    console.log("✅ Confirmation : Tous les relevés SUMUP et CPAM ont été supprimés des factures fournisseurs sur Pennylane !");
  } else {
    console.log("❌ Il reste des factures à supprimer.");
  }
}

main().catch(console.error);
