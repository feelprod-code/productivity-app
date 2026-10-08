const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const filterObj = [
    { field: "date", operator: "gteq", value: "2026-08-01" },
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

  const amountsToSearch = [125.99, 36.40, 26.40, 22.90];
  console.log(`Checking ${allTxs.length} txs for amounts:`, amountsToSearch);
  for (const t of allTxs) {
    const amt = Math.abs(parseFloat(t.amount || '0'));
    const matchesAmount = amountsToSearch.some(a => Math.abs(a - amt) < 0.05);
    const label = (t.label || '').toLowerCase();
    if (matchesAmount || label.includes('amazon') || label.includes('amzn')) {
      console.log(`[${t.date}] "${t.label}" | Amount: ${t.amount} € | ID: ${t.id} | Outstanding: ${t.outstanding_balance}`);
    }
  }
}

main().catch(console.error);
