import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  console.log("=== STARTING GLOBAL COMPTA AUTOPILOT (2025 & 2026) ===");

  try {
    // 1. Fetch Bank Accounts to determine which ones are Pro
    const accountsRes = await fetch(`${BASE_URL}/bank_accounts`, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });
    if (!accountsRes.ok) {
      throw new Error(`Failed to fetch bank accounts: ${accountsRes.status}`);
    }
    const accountsData: any = await accountsRes.json();
    const accounts = accountsData.bank_accounts || accountsData.items || [];
    const proAccountIds = new Set<number>();
    
    accounts.forEach((acc: any) => {
      const nameLower = (acc.name || '').toLowerCase();
      // Pro accounts are Gold Business card or LCL Pro (ID: 13829443584)
      const isPro = nameLower.includes('business') || acc.id === 13829443584;
      if (isPro) {
        proAccountIds.add(acc.id);
        console.log(`💼 Account detected as PRO: ${acc.name} (ID: ${acc.id})`);
      }
    });

    // 2. Fetch Transaction Overrides from local database
    const overrides = await prisma.transactionOverride.findMany();
    const overrideMap = new Map<string, boolean>();
    overrides.forEach(ov => {
      overrideMap.set(ov.id, ov.isPro);
    });

    // 3. Fetch all Pennylane transactions since Jan 1st 2025
    let cursor = null;
    const allTxs: any[] = [];
    const filterObj = [
      {
        field: "date",
        operator: "gteq",
        value: "2025-01-01"
      }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    console.log("📥 Fetching all transactions from Pennylane since 2025-01-01...");
    for (let page = 1; page <= 25; page++) {
      const url: string = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        console.error(`Failed to fetch transactions page ${page}: ${res.status}`);
        break;
      }
      const data: any = await res.json();
      const items = data.transactions || data.items || [];
      if (items.length === 0) break;
      allTxs.push(...items);

      cursor = data.next_cursor || data.meta?.next_cursor;
      if (!cursor) break;
    }

    console.log(`Total transactions fetched: ${allTxs.length}`);

    // 4. Filter pro unmatched outflow transactions
    const proUnmatchedOutflows = allTxs.filter((tx: any) => {
      const amount = parseFloat(tx.amount || '0');
      // Must be a payment outflow (negative)
      if (amount >= 0) return false;

      // Must be a Pro transaction (account check or override check)
      const hasOverride = overrideMap.has(String(tx.id));
      const isPro = hasOverride ? overrideMap.get(String(tx.id))! : proAccountIds.has(tx.bank_account_id);
      if (!isPro) return false;

      // Must be unmatched (outstanding_balance is not 0)
      const isMatched = parseFloat(tx.outstanding_balance || '0') === 0;
      return !isMatched;
    });

    console.log(`\nFound ${proUnmatchedOutflows.length} PRO unmatched outflow transaction(s) to process.`);

    let successCount = 0;
    let failCount = 0;

    // 5. Execute sequential Autopilot requests
    for (let i = 0; i < proUnmatchedOutflows.length; i++) {
      const tx = proUnmatchedOutflows[i];
      console.log(`\n[${i + 1}/${proUnmatchedOutflows.length}] Processing "${tx.label}" (${tx.amount} €) from ${tx.date} (ID: ${tx.id})...`);

      try {
        const res = await fetch('http://localhost:3000/api/transactions/reconcile-auto', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transactionId: String(tx.id),
            label: tx.label,
            amount: parseFloat(tx.amount),
            date: tx.date
          })
        });

        const data: any = await res.json();
        if (res.ok && data.success) {
          successCount++;
          console.log(`✅ MATCHED successfully with: "${data.matchedFile}"`);
        } else {
          failCount++;
          console.log(`❌ NOT MATCHED: ${data.error || 'No matching file found'}`);
        }
      } catch (err: any) {
        failCount++;
        console.error(`💥 Request Error: ${err.message}`);
      }

      // Small delay of 300ms to avoid burst rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n=== GLOBAL COMPTA AUTOPILOT COMPLETED ===`);
    console.log(`Successfully Reconciled: ${successCount}`);
    console.log(`No match / Unresolved: ${failCount}`);

  } catch (err: any) {
    console.error("Global process error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
