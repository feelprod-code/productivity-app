import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function fetchTransactions(): Promise<any[]> {
  let transactions: any[] = [];
  let cursor = '';
  for (let page = 1; page <= 5; page++) {
    const url = `${BASE_URL}/transactions?limit=100` + (cursor ? `&cursor=${cursor}` : '');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    if (!res.ok) throw new Error("Failed");
    const data: any = await res.json();
    const items = data.items || data.transactions || [];
    transactions.push(...items);
    const nextCursor = data.next_cursor || data.meta?.next_cursor;
    if (nextCursor) cursor = nextCursor;
    else break;
  }
  return transactions;
}

async function main() {
  const dbInvs = await prisma.invoice.findMany();
  console.log(`📦 ${dbInvs.length} invoices found in Supabase DB.`);

  const txs = await fetchTransactions();
  console.log(`📊 ${txs.length} transactions fetched from Pennylane.`);

  // Let's run the exact matching logic to see if any transaction matches SPORTANO
  const sportanoInv = dbInvs.find(inv => inv.provider.toUpperCase().includes("SPORTANO"));
  if (!sportanoInv) {
    console.log("❌ No SPORTANO invoice in DB.");
    return;
  }

  console.log(`\n🎯 Sportano Invoice in DB: ID ${sportanoInv.id} | Amount: ${sportanoInv.amount} | Date: ${sportanoInv.date} | Provider: "${sportanoInv.provider}"`);

  // Let's mimic the matching logic for all transactions
  for (const tx of txs) {
    const txAmount = parseFloat(tx.amount || "0");
    const absAmount = Math.abs(txAmount);
    const labelLower = (tx.label || '').toLowerCase();
    const txTime = new Date(tx.date).getTime();
    
    // Check if Sportano matches this transaction
    const invTime = new Date(sportanoInv.date).getTime();
    const invAmount = Number(sportanoInv.amount || 0);
    const cleanInv = (sportanoInv.provider || '').split(' - ')[0].toLowerCase().trim();

    // Check isAmazon
    const isAmazon = cleanInv.includes('amazon') || cleanInv.includes('sportano') || cleanInv.includes('regatta') || cleanInv.includes('erima');
    let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
    
    if (!amountMatch && isAmazon) {
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

    if (!amountMatch) continue;

    const maxDaysMs = isAmazon ? 90 * 24 * 60 * 60 * 1000 : 15 * 24 * 60 * 60 * 1000;
    const closeDate = Math.abs(txTime - invTime) <= maxDaysMs;
    if (!closeDate) continue;

    const isTxAmazon = labelLower.includes('amazon');
    const isInvAmazon = cleanInv.includes('amazon');
    if (isTxAmazon !== isInvAmazon) {
      // unless marketplace match
    }

    const cleanTx = labelLower
      .replace(/(virement|prlv|sepa|carte|cb|facture|achat|payments|digital|sarl|gmbh|inc|sas|eu)/gi, '')
      .toLowerCase()
      .trim();
    const txWords = cleanTx.split(/[^a-z0-9]/).filter((w: string) => w.length >= 3);

    let providerMatch = false;
    if (txWords.length > 0) {
      providerMatch = txWords.some((word: string) => cleanInv.includes(word) || word.includes(cleanInv));
    } else {
      providerMatch = cleanInv.includes(cleanTx) || cleanTx.includes(cleanInv);
    }

    if (providerMatch) {
      console.log(`🔥 MATCH FOUND!`);
      console.log(`   Transaction ID: ${tx.id} | Date: ${tx.date} | Amount: ${tx.amount} € | Label: "${tx.label}"`);
      console.log(`   txWords:`, txWords);
      console.log(`   cleanInv: "${cleanInv}"`);
    }
  }
}

main().catch(console.error);
