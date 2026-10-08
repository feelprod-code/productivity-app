import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    console.log("=== 1. CHECK TRANSACTION DETAILS IN DB ===");
    const details = await prisma.$queryRawUnsafe('SELECT id, description FROM "TransactionDetail"') as any[];
    console.log(`Total TransactionDetail rows: ${details.length}`);
    let cpamCount = 0;
    let sumupCount = 0;
    for (const d of details) {
        if (d.description.startsWith('CPAM_')) cpamCount++;
        if (d.description.startsWith('SUMUP_')) sumupCount++;
    }
    console.log(`CPAM details: ${cpamCount}, SumUp details: ${sumupCount}`);
    for (const d of details.filter(x => x.description.startsWith('CPAM_')).slice(0, 5)) {
        console.log(`Sample CPAM: tx ${d.id} -> ${d.description.substring(0, 80)}...`);
    }
    for (const d of details.filter(x => x.description.startsWith('SUMUP_')).slice(0, 5)) {
        console.log(`Sample SumUp: tx ${d.id} -> ${d.description.substring(0, 80)}...`);
    }

    console.log("\n=== 2. CHECK INVOICES IN DB (URSSAF, CARPIMKO, CREDITS, ASSURANCES) ===");
    const relevantInvs = await prisma.invoice.findMany({
        where: {
            OR: [
                { provider: { contains: 'urssaf', mode: 'insensitive' } },
                { provider: { contains: 'carpimko', mode: 'insensitive' } },
                { provider: { contains: 'credit', mode: 'insensitive' } },
                { provider: { contains: 'pret', mode: 'insensitive' } },
                { provider: { contains: 'prêt', mode: 'insensitive' } },
                { provider: { contains: 'lixxbail', mode: 'insensitive' } },
                { provider: { contains: 'leasing', mode: 'insensitive' } },
                { provider: { contains: 'sofinco', mode: 'insensitive' } },
                { provider: { contains: 'adoha', mode: 'insensitive' } },
                { provider: { contains: 'gpm', mode: 'insensitive' } },
                { provider: { contains: 'cpam', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Found ${relevantInvs.length} relevant invoice(s) in DB:`);
    for (const inv of relevantInvs) {
        console.log(`- [${inv.id}] date: ${inv.date.toISOString().split('T')[0]}, provider: "${inv.provider}", amount: ${inv.amount} €, fileUrl: ${inv.fileUrl}`);
    }

    console.log("\n=== 3. FETCH 2026 TRANSACTIONS FROM PENNYLANE ===");
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
    console.log(`Fetched ${allTxs.length} transactions from Pennylane for 2026.`);

    // Find CPAM
    const cpamTxs = allTxs.filter(t => (t.label || '').toLowerCase().includes('cpam') || (t.label || '').toLowerCase().includes('c.p.a.m.'));
    console.log(`\nCPAM transactions (${cpamTxs.length}):`);
    for (const t of cpamTxs) {
        const detail = details.find(d => String(d.id) === String(t.id));
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}" | detail: ${detail ? detail.description.substring(0, 40) + '...' : 'NONE'}`);
    }

    // Find SumUp
    const sumupTxs = allTxs.filter(t => (t.label || '').toLowerCase().includes('sumup') && parseFloat(t.amount || '0') > 0);
    console.log(`\nSumUp credit transactions (${sumupTxs.length}):`);
    let sumupEnriched = 0;
    for (const t of sumupTxs) {
        const detail = details.find(d => String(d.id) === String(t.id));
        if (detail) sumupEnriched++;
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | detail: ${detail ? 'ENRICHED' : 'NONE'}`);
    }
    console.log(`SumUp enriched: ${sumupEnriched} / ${sumupTxs.length}`);

    // Find URSSAF
    const urssafTxs = allTxs.filter(t => (t.label || '').toLowerCase().includes('urssaf'));
    console.log(`\nURSSAF transactions (${urssafTxs.length}):`);
    for (const t of urssafTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}"`);
    }

    // Find CARPIMKO
    const carpimkoTxs = allTxs.filter(t => (t.label || '').toLowerCase().includes('carpimko'));
    console.log(`\nCARPIMKO transactions (${carpimkoTxs.length}):`);
    for (const t of carpimkoTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}"`);
    }

    // Find PRÊTS & CRÉDITS & LIXXBAIL & ADOHA / GPM
    const loanTxs = allTxs.filter(t => {
        const l = (t.label || '').toLowerCase();
        return l.includes('pret') || l.includes('prêt') || l.includes('echeance') || l.includes('échéance') ||
               l.includes('lixx') || l.includes('leasing') || l.includes('sofinco') || l.includes('adoha') || l.includes('gpm');
    });
    console.log(`\nLoan/Leasing/Insurance transactions (${loanTxs.length}):`);
    for (const t of loanTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | label: "${t.label}"`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
