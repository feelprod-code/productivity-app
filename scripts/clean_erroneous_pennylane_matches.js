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
      { field: "date", operator: "gteq", value: "2025-01-01" }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));
    
    console.log("📥 Fetching transactions from Pennylane since 2025-01-01...");
    let cursor = null;
    const txs = [];
    for (let page = 1; page <= 30; page++) {
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

    console.log(`Total transactions loaded: ${txs.length}`);

    // Filter transactions that are matched (outstanding_balance is 0)
    const matchedTxs = txs.filter(t => parseFloat(t.outstanding_balance || '0') === 0 && parseFloat(t.amount) < 0);
    console.log(`Matched Outflow transactions: ${matchedTxs.length}`);

    let unmatchCount = 0;

    for (const tx of matchedTxs) {
      if (tx.matched_invoices && tx.matched_invoices.url) {
        const res = await fetch(tx.matched_invoices.url, {
          headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          const invoices = data.supplier_invoices || data.customer_invoices || data.items || [];
          
          for (const inv of invoices) {
            const labelLower = (tx.label || '').toLowerCase();
            const invLabelLower = (inv.label || '').toLowerCase();
            const invFileLower = (inv.filename || '').toLowerCase();
            const txAmount = Math.abs(parseFloat(tx.amount));
            const invAmount = parseFloat(inv.amount);
            const amountDiff = Math.abs(invAmount - txAmount);

            let isErroneous = false;
            let reason = "";

            // 1. Check amount mismatch
            const isAmazon = labelLower.includes('amazon') || invLabelLower.includes('amazon') || invFileLower.includes('amazon');
            if (amountDiff > 0.05 && !isAmazon) {
              isErroneous = true;
              reason = `Amount Mismatch: Tx is ${txAmount} EUR, Invoice is ${invAmount} EUR`;
            }

            // 2. Check name mismatch (guardrails)
            if (!isErroneous) {
              const txClean = labelLower
                .replace(/(virement|prlv|sepa|carte|cb|facture|achat|payments|digital|sarl|gmbh|inc|sas|eu)/gi, '')
                .replace(/[^a-z0-9]/gi, ' ')
                .trim();
              const txWords = txClean.split(/\s+/).filter(w => w.length >= 3);

              const invClean = invLabelLower
                .replace(/(facture|label généré)/gi, '')
                .replace(/[^a-z0-9]/gi, ' ')
                .trim();

              let hasNameMatch = false;
              if (isAmazon && (invLabelLower.includes('amazon') || invFileLower.includes('amazon'))) {
                hasNameMatch = true;
              } else {
                hasNameMatch = txWords.some(w => invLabelLower.includes(w) || invFileLower.includes(w) || invClean.includes(w));
              }

              // Exception: "COMMISSION" or very generic words
              if (txWords.length === 1 && txWords[0] === 'commission') {
                // If invoice is black magic design or something else that is not labeled COMMISSION
                if (!invLabelLower.includes('commission')) {
                  isErroneous = true;
                  reason = `Generic word 'commission' matched non-commission invoice: "${inv.label}"`;
                }
              }

              if (!hasNameMatch && !isErroneous) {
                isErroneous = true;
                reason = `Name Mismatch: Tx "${tx.label}" does not match Invoice "${inv.label}" (file: ${inv.filename || 'N/A'})`;
              }
            }

            // 3. Perform unmatching if erroneous
            if (isErroneous) {
              console.log(`\n🚨 ERRONEUS MATCH DETECTED:`);
              console.log(`   TX:  [${tx.date}] "${tx.label}" | ${tx.amount} EUR (ID: ${tx.id})`);
              console.log(`   INV: [${inv.date}] "${inv.label}" | ${inv.amount} EUR | File: "${inv.filename}" (ID: ${inv.id})`);
              console.log(`   REASON: ${reason}`);
              console.log(`   Unmatching via API...`);

              const deleteUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${tx.id}`;
              const delRes = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${pennylaneKey}`,
                  'Accept': 'application/json',
                  'X-Use-2026-API-Changes': 'true'
                }
              });

              if (delRes.status === 204 || delRes.ok) {
                console.log(`   ✅ Successfully unmatched!`);
                unmatchCount++;
              } else {
                const errText = await delRes.text();
                console.error(`   ❌ Failed to unmatch (status ${delRes.status}): ${errText}`);
              }
            }
          }
        }
      }
    }

    console.log(`\n🧹 Cleaned up ${unmatchCount} erroneous Pennylane matches.`);

  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
