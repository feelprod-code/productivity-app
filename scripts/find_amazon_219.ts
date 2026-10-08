import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  console.log("Searching transactions for amount -219.99 around 2025-12-30...");

  try {
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

    for (let page = 1; page <= 25; page++) {
      const url: string = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) break;
      const data: any = await res.json();
      const items = data.transactions || data.items || [];
      if (items.length === 0) break;
      allTxs.push(...items);

      cursor = data.next_cursor || data.meta?.next_cursor;
      if (!cursor) break;
    }

    console.log(`Found ${allTxs.length} transaction(s) in date range.`);
    const matched = allTxs.filter(t => {
      const amt = parseFloat(t.amount || '0');
      return Math.abs(amt + 219.99) < 0.01;
    });

    console.log(`Matches for -219.99: ${matched.length}`);
    matched.forEach(tx => {
      console.log(` - ID: ${tx.id}`);
      console.log(`   Label: ${tx.label}`);
      console.log(`   Date: ${tx.date}`);
      console.log(`   Amount: ${tx.amount}`);
      console.log(`   Matched Invoice ID: ${tx.matched_supplier_invoice_id || tx.supplier_invoice_id || 'none'}`);
    });

  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
