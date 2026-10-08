const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const freeTxId = "25374666620928";
  const freeInvId = "30282152873984";

  console.log("Cleaning up Free Telecom July 6 matchings...");

  // 1. Get all matched invoices for freeTxId
  const resInvs = await fetch(`${BASE_URL}/transactions/${freeTxId}/matched_invoices`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const invData = await resInvs.json();
  const matchedInvs = invData.items || [];
  console.log(`Found ${matchedInvs.length} invoices linked to Tx ${freeTxId}`);

  for (const inv of matchedInvs) {
    if (String(inv.id) !== freeInvId) {
      console.log(`Unlinking obsolete invoice ${inv.id} from Tx ${freeTxId}...`);
      const delUrl = `${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${freeTxId}`;
      const delRes = await fetch(delUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      console.log(`Status: ${delRes.status}`);
      await sleep(1000);
    }
  }

  // 2. Get all matched transactions for freeInvId
  const resTxs = await fetch(`${BASE_URL}/supplier_invoices/${freeInvId}/matched_transactions`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const txData = await resTxs.json();
  const matchedTxs = txData.items || [];
  console.log(`Found ${matchedTxs.length} transactions linked to Invoice ${freeInvId}`);

  for (const tx of matchedTxs) {
    if (String(tx.id) !== freeTxId) {
      console.log(`Unlinking unrelated Tx ${tx.id} (${tx.label}) from Invoice ${freeInvId}...`);
      const delUrl = `${BASE_URL}/supplier_invoices/${freeInvId}/matched_transactions/${tx.id}`;
      const delRes = await fetch(delUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      console.log(`Status: ${delRes.status}`);
      await sleep(1000);
    }
  }

  // Same for Bouygues 6.99 (Tx 25374666665984 & Invoice 30282106740736)
  const btlTxId = "25374666665984";
  const btlInvId = "30282106740736";

  const resBtlInvs = await fetch(`${BASE_URL}/transactions/${btlTxId}/matched_invoices`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const btlInvData = await resBtlInvs.json();
  for (const inv of btlInvData.items || []) {
    if (String(inv.id) !== btlInvId) {
      console.log(`Unlinking obsolete invoice ${inv.id} from Bouygues Tx ${btlTxId}...`);
      await fetch(`${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${btlTxId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      await sleep(1000);
    }
  }

  const resBtlTxs = await fetch(`${BASE_URL}/supplier_invoices/${btlInvId}/matched_transactions`, {
    headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
  });
  const btlTxData = await resBtlTxs.json();
  for (const tx of btlTxData.items || []) {
    if (String(tx.id) !== btlTxId) {
      console.log(`Unlinking unrelated Tx ${tx.id} from Bouygues Invoice ${btlInvId}...`);
      await fetch(`${BASE_URL}/supplier_invoices/${btlInvId}/matched_transactions/${tx.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      await sleep(1000);
    }
  }

  console.log("Cleanup completed!");
}

main().catch(console.error);
