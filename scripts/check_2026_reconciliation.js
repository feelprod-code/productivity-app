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

  // List of target invoice IDs on Pennylane
  const targetInvoiceIds = [
    // Volkswagen
    "25139974045696", // VW.pdf (2026-07-01)
    "25116224200704", // CACF_RLV (2026-05-04)
    "25112045297664", // ADOBE-428.pdf (2026-07-01)
    // CARPIMKO
    "24716518359040", // CARPIMKO_2026_06_10.pdf (2026-06-10)
    "24716517122048", // CARPIMKO_2026_05_11.pdf (2026-05-11)
    "24716516966400", // CARPIMKO_2026_04_10.pdf (2026-04-10)
    // Adobe
    "24615730515968", // Adobe 2026-06-28
    "24615723253760", // Adobe 2026-05-29
    "24615719424000", // Adobe 2026-04-28
    "24615715422208"  // Adobe 2026-03-29
  ];

  console.log("🔍 Checking matches on Pennylane for each target invoice...");
  for (const invId of targetInvoiceIds) {
    try {
      // 1. Fetch details of invoice
      const invRes = await fetch(`${BASE_URL}/supplier_invoices/${invId}`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      if (!invRes.ok) {
        console.error(`Failed to fetch details for invoice ${invId}: ${invRes.status}`);
        continue;
      }
      const inv = await invRes.json();

      // 2. Fetch matched transactions
      let matchedTxs = [];
      if (inv.matched_transactions && inv.matched_transactions.url) {
        const matchRes = await fetch(inv.matched_transactions.url, {
          headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (matchRes.ok) {
          const matchData = await matchRes.json();
          matchedTxs = matchData.transactions || matchData.items || [];
        }
      }
      
      console.log(`--------------------------------------------------`);
      console.log(`INVOICE ID: ${inv.id} | Date: ${inv.date}`);
      console.log(`Label: "${inv.label}" | Amount: ${inv.amount} EUR | Filename: "${inv.filename || 'N/A'}"`);
      console.log(`Reconciled status on Pennylane: ${inv.reconciled ? 'YES' : 'NO'}`);
      console.log(`Matched Transactions Count: ${matchedTxs.length}`);
      matchedTxs.forEach(t => {
        console.log(`  - TX ID: ${t.id} | Date: ${t.date} | Label: "${t.label}" | Amount: ${t.amount} EUR`);
      });
    } catch (e) {
      console.error(`Error processing invoice ${invId}:`, e.message);
    }
  }
}

main();
