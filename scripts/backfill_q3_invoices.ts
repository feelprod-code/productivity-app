import * as dotenv from 'dotenv';
import * as path from 'path';
import { POST } from '../src/app/api/transactions/reconcile-auto/route';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("🚀 Lancement du backfill automatique pour Free, Bouygues et Amazon (Q3 2026)...");

  // 1. Récupérer les transactions cibles non rapprochées depuis Pennylane
  const filterObj = [
    { field: "date", operator: "gteq", value: "2026-07-01" },
    { field: "date", operator: "lteq", value: "2026-09-23" }
  ];
  const filterStr = encodeURIComponent(JSON.stringify(filterObj));
  let cursor: string | null = null;
  const allTxs: any[] = [];

  for (let page = 1; page <= 10; page++) {
    const url = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const items = data.transactions || data.items || [];
    if (items.length === 0) break;
    allTxs.push(...items);
    cursor = data.next_cursor || data.meta?.next_cursor;
    if (!cursor) break;
  }

  const targets = allTxs.filter(t => {
    const isUnreconciled = parseFloat(t.outstanding_balance || '0') !== 0;
    if (!isUnreconciled) return false;
    const l = (t.label || '').toLowerCase();
    return l.includes('free') || l.includes('bouygues') || l.includes('btelec') || l.includes('amazon') || l.includes('amzn');
  });

  console.log(`\n📋 ${targets.length} transactions Free / Bouygues / Amazon non rapprochées à traiter :\n`);
  for (const t of targets) {
    console.log(`- [${t.date}] "${t.label}" | ${t.amount} € | ID: ${t.id}`);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const t of targets) {
    console.log(`\n============================================================`);
    console.log(`⏳ Traitement de : [${t.date}] "${t.label}" (${t.amount} €)...`);

    try {
      const payload = {
        transactionId: String(t.id),
        label: t.label,
        amount: Math.abs(parseFloat(t.amount || '0')),
        date: t.date
      };

      const req = new Request('http://localhost:3000/api/transactions/reconcile-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const res = await POST(req);
      const data = await res.json();

      if (res.ok && data.success) {
        console.log(`✅ SUCCÈS pour transaction ${t.id} !`);
        console.log(`   Justificatif : ${data.matchedFile}`);
        if (data.invoice) {
          console.log(`   Facture Pennylane ID : ${data.invoice.id}`);
        }
        successCount++;
      } else {
        console.error(`❌ Échec pour transaction ${t.id} :`, data.error || 'Erreur inconnue');
        errorCount++;
      }
    } catch (err: any) {
      console.error(`❌ Exception pour transaction ${t.id} :`, err.message);
      errorCount++;
    }

    // Pause de 2 secondes entre chaque rapprochement pour respecter les rate limits Pennylane & IMAP
    await sleep(2000);
  }

  console.log(`\n============================================================`);
  console.log(`🏁 FIN DU TRAITEMENT :`);
  console.log(`   ✅ Succès : ${successCount} transactions`);
  console.log(`   ❌ Échecs : ${errorCount} transactions`);
}

main().catch(console.error);
