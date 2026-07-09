import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTransactions(): Promise<any[]> {
  let transactions: any[] = [];
  let cursor = '';
  for (let page = 1; page <= 5; page++) {
    await sleep(200);
    const url = `${BASE_URL}/transactions?limit=100` + (cursor ? `&cursor=${cursor}` : '');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to fetch transactions: ${res.status} - ${txt}`);
    }
    const data: any = await res.json();
    const items = data.items || data.transactions || [];
    transactions.push(...items);
    
    const nextCursor = data.next_cursor || data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
  }
  return transactions;
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  console.log("🔍 Récupération des transactions bancaires récentes sur Pennylane...");
  const transactions = await fetchTransactions();
  console.log(`📊 ${transactions.length} transactions récupérées.`);

  // Filter transactions in July 2026
  console.log("\n🔎 Inspection des transactions de Juillet 2026 :");
  const july2026Tx = transactions.filter((tx: any) => tx.date && tx.date.startsWith("2026-07"));
  
  for (const tx of july2026Tx) {
    console.log(`\n💸 Transaction ID: ${tx.id} | Date: ${tx.date} | Montant: ${tx.amount} € | Libellé: "${tx.label}"`);
    
    // Check matched invoices
    const matchedInvoices = tx.matched_invoices || tx.matched_supplier_invoices || [];
    if (matchedInvoices.length > 0) {
      console.log(`   🔗 Factures rapprochées sur Pennylane (${matchedInvoices.length}) :`);
      for (const match of matchedInvoices) {
        console.log(`     • Invoice ID: ${match.id} | Type: ${match.type || 'Supplier'}`);
        // Fetch invoice details
        await sleep(200);
        const invRes = await fetch(`${BASE_URL}/supplier_invoices/${match.id}`, {
          headers: {
            'Authorization': `Bearer ${pennylaneKey}`,
            'Accept': 'application/json',
            'X-Use-2026-API-Changes': 'true'
          }
        });
        if (invRes.ok) {
          const inv: any = await invRes.json();
          console.log(`       Label: "${inv.label}" | Fournisseur ID: ${inv.supplier?.id} | Nom: "${inv.supplier?.name || ''}" | Fichier: "${inv.filename}"`);
        } else {
          console.log(`       ❌ Impossible de charger les détails de la facture (ou ce n'est pas une facture fournisseur)`);
        }
      }
    } else {
      console.log(`   ❌ Aucun rapprochement sur Pennylane.`);
    }
  }
}

main().catch(console.error);
