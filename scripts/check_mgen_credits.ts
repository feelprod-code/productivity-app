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

    const creditTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0);
    console.log(`Total credit transactions 2026: ${creditTxs.length}`);

    const mgenKeywords = ['mgen', 'm.g.e.n', 'mutuelle generale'];
    const mgenTxs = creditTxs.filter(t => mgenKeywords.some(k => (t.label || '').toLowerCase().includes(k)));
    console.log(`Found ${mgenTxs.length} credit transactions with MGEN in label:`);
    mgenTxs.forEach(t => console.log(`[${t.date}] ${t.amount} € | ${t.label} (ID: ${t.id})`));

    // Also check for specific amounts: 96.48, 117.92, 164.69, 46.41, 57.19, 53.70, 32.25, 89.23, 312.94, 133.69
    const targetAmounts = [96.48, 117.92, 164.69, 46.41, 57.19, 53.70, 32.25, 89.23, 312.94, 133.69];
    console.log("\nSearching for exact target amounts among all credit txs:");
    for (const amt of targetAmounts) {
        const matches = creditTxs.filter(t => Math.abs(parseFloat(t.amount || "0") - amt) < 0.05);
        if (matches.length > 0) {
            console.log(`Target ${amt} € FOUND:`);
            matches.forEach(m => console.log(`   -> [${m.date}] ${m.amount} € | ${m.label} (ID: ${m.id})`));
        } else {
            console.log(`Target ${amt} € NOT FOUND directly.`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
