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

  const targets = allTxs.filter(t => {
    const l = (t.label || '').toLowerCase();
    return l.includes('free') || l.includes('bouygues') || l.includes('btelec') || l.includes('amazon') || l.includes('amzn');
  });

  console.log(`Found ${targets.length} target transactions (Free, Bouygues, Amazon) between July and September 2026:`);
  for (const t of targets) {
    const isUnreconciled = parseFloat(t.outstanding_balance || '0') !== 0;
    console.log(`[${t.date}] "${t.label}" | Amount: ${t.amount} € | Outstanding: ${t.outstanding_balance} | Status: ${isUnreconciled ? '❌ UNRECONCILED' : '✅ RECONCILED'} | ID: ${t.id}`);
  }
}

main().catch(console.error);
