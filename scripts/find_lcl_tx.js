const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";

  try {
    const filterObj = [
      { field: "date", operator: "gteq", value: "2026-01-01" },
      { field: "date", operator: "lteq", value: "2026-12-31" }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));
    
    console.log("📥 Fetching 2026 transactions from Pennylane...");
    let cursor = null;
    const txs = [];
    for (let page = 1; page <= 10; page++) {
      const url = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
      });
      if (!res.ok) break;
      const data = await res.json();
      const items = data.transactions || data.items || [];
      if (items.length === 0) break;
      txs.push(...items);
      cursor = data.next_cursor || data.meta?.next_cursor;
      if (!cursor) break;
    }

    console.log(`Total 2026 transactions: ${txs.length}`);

    console.log("\n=== TRANSACTIONS FOR 811.00 EUR ===");
    txs.forEach(t => {
      const amt = Math.abs(parseFloat(t.amount));
      if (Math.abs(amt - 811.00) < 5) {
        console.log(`ID: ${t.id} | Date: ${t.date} | Label: "${t.label}" | Amount: ${t.amount} EUR | Matched Invoice ID: ${t.matched_supplier_invoice_id || t.supplier_invoice_id || 'NONE'}`);
      }
    });

    console.log("\n=== TRANSACTIONS FOR 23.99 EUR ===");
    txs.forEach(t => {
      const amt = Math.abs(parseFloat(t.amount));
      if (Math.abs(amt - 23.99) < 1) {
        console.log(`ID: ${t.id} | Date: ${t.date} | Label: "${t.label}" | Amount: ${t.amount} EUR | Matched Invoice ID: ${t.matched_supplier_invoice_id || t.supplier_invoice_id || 'NONE'}`);
      }
    });

    console.log("\n=== TRANSACTIONS FOR 428.98 EUR ===");
    txs.forEach(t => {
      const amt = Math.abs(parseFloat(t.amount));
      if (Math.abs(amt - 428.98) < 1) {
        console.log(`ID: ${t.id} | Date: ${t.date} | Label: "${t.label}" | Amount: ${t.amount} EUR | Matched Invoice ID: ${t.matched_supplier_invoice_id || t.supplier_invoice_id || 'NONE'}`);
      }
    });

  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
