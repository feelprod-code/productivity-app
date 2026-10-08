import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  console.log("Fetching transactions from Pennylane to find the VW transaction (-428.98)...");

  try {
    let cursor = null;
    for (let page = 1; page <= 10; page++) {
      const url: string = `${BASE_URL}/transactions?limit=100` + (cursor ? `&cursor=${cursor}` : '');
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        console.error(`Failed to fetch page ${page}: ${res.status}`);
        break;
      }
      const data: any = await res.json();
      const items = data.transactions || data.items || [];
      if (items.length === 0) break;

      const matched = items.filter((tx: any) => {
        const amt = parseFloat(tx.amount || '0');
        return Math.abs(amt + 428.98) < 0.01;
      });

      if (matched.length > 0) {
        console.log(`\n🎉 Found matches on page ${page}:`);
        matched.forEach((tx: any) => {
          console.log(` - ID: ${tx.id}`);
          console.log(`   Label: ${tx.label}`);
          console.log(`   Date: ${tx.date}`);
          console.log(`   Amount: ${tx.amount}`);
          console.log(`   Account ID: ${tx.bank_account_id}`);
          console.log(`   Supplier Invoice ID: ${tx.matched_supplier_invoice_id || tx.supplier_invoice_id || 'none'}`);
        });
      }

      cursor = data.next_cursor || data.meta?.next_cursor;
      if (!cursor) break;
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
