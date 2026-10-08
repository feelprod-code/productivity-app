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
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-05-01" }, { field: "date", operator: "lteq", value: "2026-06-30" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 8; page++) {
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

    const cpamTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0 && ((t.label || '').toLowerCase().includes('cpam') || (t.label || '').toLowerCase().includes('sepa')));
    console.log(`Found ${cpamTxs.length} credit transactions in May-June:`);
    cpamTxs.forEach(t => console.log(`[${t.date}] ${t.amount} € | ${t.label} (ID: ${t.id})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
