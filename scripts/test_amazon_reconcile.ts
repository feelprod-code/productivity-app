import * as dotenv from 'dotenv';
import * as path from 'path';
import { extractKeywords, searchEmailAccount } from '../src/app/api/transactions/reconcile-auto/route';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testAmazonReconciliation() {
  const GMAIL_CONFIG = {
    user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
    password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 20000,
    tlsOptions: { rejectUnauthorized: false }
  };

  const amazonTargets = [
    { label: "AMAZON PAYMENTS", amount: 125.99, date: new Date("2026-08-21") },
    { label: "AMAZON PAYMENTS", amount: 36.40, date: new Date("2026-08-30") },
    { label: "AMAZON PAYMENTS", amount: 26.40, date: new Date("2026-08-31") },
    { label: "AMAZON PAYMENTS", amount: 22.90, date: new Date("2026-09-08") }
  ];

  console.log("=== Testing Amazon Gmail Reconciliation ===");
  for (const t of amazonTargets) {
    const kw = extractKeywords(t.label);
    console.log(`\nTesting: "${t.label}" | ${t.amount} € | Date: ${t.date.toISOString().split('T')[0]}`);
    const match = await searchEmailAccount(GMAIL_CONFIG, kw, t.amount, t.date);
    if (match) {
      console.log(`✅ MATCH FOUND in Gmail! Filename: ${match.filename} (Size: ${match.buffer.length} bytes)`);
    } else {
      console.log(`❌ NO MATCH FOUND for "${t.label}" (${t.amount} €)`);
    }
  }
}

testAmazonReconciliation().catch(console.error);
