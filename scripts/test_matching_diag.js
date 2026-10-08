const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
    // 1. Fetch 2026 transactions from Pennylane
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

    // 2. Fetch all local invoices
    const allInvs = await prisma.invoice.findMany();
    const sortedInvs = [...allInvs].sort((a, b) => {
      const aLower = (a.provider || '').toLowerCase();
      const bLower = (b.provider || '').toLowerCase();
      const aIsSummary = aLower.includes('récapitulatif') || aLower.includes('articles divers');
      const bIsSummary = bLower.includes('récapitulatif') || bLower.includes('articles divers');
      if (aIsSummary && !bIsSummary) return 1;
      if (!aIsSummary && bIsSummary) return -1;
      return 0;
    });

    console.log(`Analyzing local matching for ${txs.length} transactions and ${allInvs.length} invoices...`);

    const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
    const usedInvoiceIds = new Set();

    txs.forEach((tx) => {
      const amount = parseFloat(tx.amount || '0');
      const isOutflow = amount < 0;
      const absAmount = Math.abs(amount);
      const labelLower = (tx.label || '').toLowerCase();
      const txTime = new Date(tx.date).getTime();

      let matchedInvoice = null;

      if (isOutflow) {
        // Etape 2 (Repli standard)
        matchedInvoice = sortedInvs.find((inv) => {
          if (usedInvoiceIds.has(inv.id)) return false;
          if (!inv.date) return false;
          const invTime = new Date(inv.date).getTime();
          const invAmount = inv.amount || 0;
          
          const cleanInv = (inv.provider || '')
            .split(' - ')[0]
            .toLowerCase()
            .trim();

          const isTxAmazon = labelLower.includes('amazon');
          const isInvAmazon = cleanInv.includes('amazon') || (inv.fileUrl && inv.fileUrl.toLowerCase().includes('amazon'));

          let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
          
          if (!amountMatch && !cleanInv.includes('amazon')) {
            const ratio = absAmount / invAmount;
            if (ratio >= 0.80 && ratio <= 1.15) {
              amountMatch = true;
            } else {
              const invRatio = invAmount / absAmount;
              if (invRatio >= 0.80 && invRatio <= 1.15) {
                amountMatch = true;
              }
            }
          }
          if (!amountMatch) return false;

          const isAmazon = cleanInv.includes('amazon');
          const maxDaysMs = isAmazon ? 90 * 24 * 60 * 60 * 1000 : thirtyFiveDaysMs;
          const closeDate = (txTime >= invTime - 5 * 24 * 60 * 60 * 1000) && (txTime - invTime <= maxDaysMs);
          if (!closeDate) return false;

          if (isTxAmazon !== isInvAmazon) return false;

          const cleanTx = labelLower
            .replace(/(virement|prlv|sepa|carte|cb|facture|achat|payments|digital|sarl|gmbh|inc|sas|eu)/gi, '')
            .toLowerCase()
            .trim();
          const txWords = cleanTx.split(/[^a-z0-9]/).filter((w) => w.length >= 3);

          let providerMatch = false;
          if (!cleanInv || cleanInv.length < 2) {
            providerMatch = false;
          } else if (txWords.length > 0) {
            providerMatch = txWords.some((word) => cleanInv.includes(word) || word.includes(cleanInv));
          } else {
            providerMatch = cleanInv.includes(cleanTx) || cleanTx.includes(cleanInv);
          }

          return providerMatch;
        }) || null;

        if (matchedInvoice) {
          usedInvoiceIds.add(matchedInvoice.id);
          console.log(`[MATCH] Transaction: [${tx.date}] "${tx.label}" | ${tx.amount} EUR`);
          console.log(`      -> Invoice: [${matchedInvoice.date.toISOString().split('T')[0]}] "${matchedInvoice.provider}" | ${matchedInvoice.amount} EUR (ID: ${matchedInvoice.id})`);
        }
      }
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
