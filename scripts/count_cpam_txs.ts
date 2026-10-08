import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-01-01" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 15; page++) {
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

    const cpamMgenTxs = allTxs.filter(t => {
        const amt = parseFloat(t.amount || "0");
        const lbl = (t.label || '').toLowerCase();
        return amt > 0 && (lbl.includes('cpam') || lbl.includes('c.p.a.m.') || lbl.includes('mgen') || lbl.includes('assurance maladie'));
    });

    console.log(`Total CPAM & MGEN credit transactions in Pennylane for 2026: ${cpamMgenTxs.length}`);
    
    // Group by month
    const byMonth: Record<string, typeof cpamMgenTxs> = {};
    cpamMgenTxs.forEach(t => {
        const m = t.date.substring(0, 7);
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(t);
    });

    for (const [m, txs] of Object.entries(byMonth).sort()) {
        const total = txs.reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);
        console.log(`Month ${m}: ${txs.length} transactions, Total: ${total.toFixed(2)} €`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
