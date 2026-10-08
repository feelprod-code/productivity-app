const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const filterObj = [
    { field: "date", operator: "gteq", value: "2026-07-01" },
    { field: "date", operator: "lteq", value: "2026-09-23" }
  ];
  const filterStr = encodeURIComponent(JSON.stringify(filterObj));
  let cursor = null;
  const allTxs = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = data.transactions || data.items || [];
    if (items.length === 0) break;
    allTxs.push(...items);
    cursor = data.next_cursor || data.meta?.next_cursor;
    if (!cursor) break;
  }

  console.log(`Loaded ${allTxs.length} transactions between 2026-07-01 and 2026-09-23.`);
  
  const debitTxs = allTxs.filter(t => parseFloat(t.amount || '0') < 0);
  console.log(`Total debit transactions: ${debitTxs.length}`);
  
  console.log("\n--- UNRECONCILED TRANSACTIONS (outstanding != 0) ---");
  const unreconciled = debitTxs.filter(t => parseFloat(t.outstanding_balance || '0') !== 0);
  console.log(`Total unreconciled debits: ${unreconciled.length}`);
  for (const t of unreconciled) {
    console.log(`[${t.date}] "${t.label}" | ${t.amount} € | outstanding: ${t.outstanding_balance} | ID: ${t.id}`);
  }
}

main().catch(console.error);
