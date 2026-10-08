import * as dotenv from 'dotenv';
import * as path from 'path';
import { extractKeywords, searchEmailAccount } from '../src/app/api/transactions/reconcile-auto/route';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testEmailReconciliation() {
  const GMAIL_CONFIG = {
    user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
    password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    authTimeout: 20000,
    tlsOptions: { rejectUnauthorized: false }
  };

  const ICLOUD_CONFIG = {
    user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
    password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
    host: 'imap.mail.me.com',
    port: 993,
    tls: true,
    authTimeout: 20000,
    tlsOptions: { rejectUnauthorized: false }
  };

  const targets = [
    { label: "PRELVT SEPA Free Telecom", amount: 23.99, date: new Date("2026-09-04") },
    { label: "PRELVT SEPA Bouygues Telecom", amount: 44.99, date: new Date("2026-09-04") },
    { label: "PRELVT SEPA Bouygues Telecom", amount: 6.99, date: new Date("2026-09-04") },
    { label: "PRELVT SEPA FREE MOBILE", amount: 42.46, date: new Date("2026-08-21") },
    { label: "PRELVT SEPA FREE MOBILE", amount: 29.98, date: new Date("2026-07-22") },
  ];

  console.log("=== Testing Target Email Matches ===");
  for (const t of targets) {
    const kw = extractKeywords(t.label);
    console.log(`\nTesting: "${t.label}" | ${t.amount} € | Date: ${t.date.toISOString().split('T')[0]}`);
    console.log(`Keywords:`, kw);

    // Search Gmail first
    let match = await searchEmailAccount(GMAIL_CONFIG, kw, t.amount, t.date);
    let accountUsed = "Gmail";

    // Search iCloud if not found
    if (!match) {
      match = await searchEmailAccount(ICLOUD_CONFIG, kw, t.amount, t.date);
      accountUsed = "iCloud";
    }

    if (match) {
      console.log(`✅ MATCH FOUND via ${accountUsed}! Filename: ${match.filename} (Size: ${match.buffer.length} bytes)`);
    } else {
      console.log(`❌ NO MATCH FOUND for "${t.label}" (${t.amount} €)`);
    }
  }
}

testEmailReconciliation().catch(console.error);
