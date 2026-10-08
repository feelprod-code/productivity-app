import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    // 1. All invoices in DB
    const allInvs = await prisma.invoice.findMany();
    console.log(`=== TOTAL INVOICES IN DB: ${allInvs.length} ===`);
    const cpamInvs = allInvs.filter(i => (i.provider || '').toLowerCase().includes('cpam') || (i.provider || '').toLowerCase().includes('assurance'));
    console.log(`CPAM Invoices in DB (${cpamInvs.length}):`);
    for (const i of cpamInvs) {
        console.log(`- ${i.id} | date: ${i.date.toISOString().split('T')[0]} | amount: ${i.amount} | provider: "${i.provider}" | url: ${i.fileUrl}`);
    }

    // 2. Fetch all Pennylane transactions
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-01-01" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 12; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
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
        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) txCursor = nextCursor;
        else break;
    }

    // Check CPAM transactions
    const details = await prisma.$queryRawUnsafe('SELECT id, description FROM "TransactionDetail"') as any[];
    const detailsMap: Record<string, string> = {};
    for (const d of details) detailsMap[String(d.id)] = d.description;

    const cpamTxs = allTxs.filter(t => {
        const l = (t.label || '').toLowerCase();
        return l.includes('cpam') || l.includes('c.p.a.m.') || l.includes('assurance maladie');
    });

    console.log(`\n=== ALL CPAM TRANSACTIONS (${cpamTxs.length}) ===`);
    for (const t of cpamTxs) {
        const d = detailsMap[String(t.id)];
        console.log(`Date: ${t.date} | ID: ${t.id} | Amount: ${t.amount} € | Enriched: ${!!d}`);
        if (d) console.log(`   Detail: ${d.substring(0, 100)}...`);
    }

    // Check for CARPIMKO in all transactions (maybe different spelling?)
    console.log("\n=== SEARCHING FOR CARPIMKO / RETRAITE / COTISATIONS ===");
    const possibleCarp = allTxs.filter(t => {
        const l = (t.label || '').toLowerCase();
        return l.includes('carp') || l.includes('retraite') || l.includes('cotis') || l.includes('secu') || l.includes('sécu') || l.includes('prev');
    });
    console.log(`Found ${possibleCarp.length} matches:`);
    for (const t of possibleCarp) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}"`);
    }

    // Check the 3 unmatched SumUp transactions
    console.log("\n=== 3 UNMATCHED SUMUP TRANSACTIONS ===");
    const sumupUnmatched = allTxs.filter(t => {
        const l = (t.label || '').toLowerCase();
        return l.includes('sumup') && parseFloat(t.amount || '0') > 0 && !detailsMap[String(t.id)];
    });
    for (const t of sumupUnmatched) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}"`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
