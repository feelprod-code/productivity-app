import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const PENNYLANE_API_KEY = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log("📥 Loading PENDING local invoices...");
    const pendingInvoices = await prisma.invoice.findMany({ where: { status: 'PENDING' } });
    console.log(`Loaded ${pendingInvoices.length} PENDING invoices.`);

    console.log("📥 Fetching all Pennylane invoices...");
    const pennylaneInvoices: any[] = [];
    let cursor = '';
    
    for (let page = 1; page <= 50; page++) {
        const fetchUrl = `${BASE_URL}/supplier_invoices?limit=100` + (cursor ? `&cursor=${cursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${PENNYLANE_API_KEY}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }
        });
        if (!res.ok) break;
        const data = await res.json() as any;
        const items = data.supplier_invoices || data.items || [];
        if (items.length === 0) break;
        pennylaneInvoices.push(...items);
        
        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
            cursor = nextCursor;
        } else {
            break;
        }
        await sleep(100);
    }
    
    console.log(`Loaded ${pennylaneInvoices.length} Pennylane invoices.`);
    
    let matchedCount = 0;
    const toUpdate: string[] = [];
    
    for (const pending of pendingInvoices) {
        const pDate = new Date(pending.date);
        const pAmount = pending.amount || 0;
        const pClean = pending.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Find if this invoice exists in Pennylane
        const plMatch = pennylaneInvoices.find(pl => {
            const plAmount = parseFloat(pl.amount || '0');
            // Must match amount exactly (or very closely)
            if (Math.abs(plAmount - pAmount) > 0.05) return false;
            
            const plDate = new Date(pl.date);
            const diffDays = Math.abs(plDate.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
            
            // Allow up to 90 days for some invoices (Amazon, etc.), 45 days for others
            if (diffDays > 90) return false;
            
            // If amount matches and date is close, check provider name fuzzy
            const plClean = (pl.supplier?.name || pl.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (pClean.includes(plClean) || plClean.includes(pClean) ||
                (pClean.includes('apple') && plClean.includes('apple')) ||
                (pClean.includes('amazon') && plClean.includes('amazon')) ||
                (pClean.includes('adobe') && plClean.includes('adobe')) ||
                (pClean.includes('google') && plClean.includes('google')) ||
                (pClean.includes('cloudflare') && plClean.includes('cloudflare'))) {
                return true;
            }
            
            // If amount matches exactly and it's less than 15 days, we can assume it's the same if it's a weird name
            if (diffDays <= 15 && Math.abs(plAmount - pAmount) < 0.01 && pAmount > 0) {
                 return true;
            }
            
            return false;
        });
        
        if (plMatch) {
            matchedCount++;
            toUpdate.push(pending.id);
            console.log(`✅ MATCH: ${pending.provider} (${pAmount}€) -> PL: ${plMatch.supplier?.name || plMatch.label} (${plMatch.amount}€)`);
        } else {
            console.log(`❌ NO MATCH: ${pending.provider} (${pAmount}€) [${pending.date.toISOString().split('T')[0]}]`);
        }
    }
    
    console.log(`\nFound ${matchedCount} PENDING invoices that ALREADY exist in Pennylane.`);
    
    // Now also check for purely local exact duplicates (same amount, same month, same provider locally)
    let localDupeCount = 0;
    const allInvoices = await prisma.invoice.findMany({ where: { status: 'COMPLETED' } });
    
    for (const pending of pendingInvoices) {
        if (toUpdate.includes(pending.id)) continue; // already matched
        
        const pDate = new Date(pending.date);
        const pAmount = pending.amount || 0;
        const pClean = pending.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const localMatch = allInvoices.find(c => {
            if (Math.abs((c.amount || 0) - pAmount) > 0.05) return false;
            const cDate = new Date(c.date);
            const diffDays = Math.abs(cDate.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays > 45) return false;
            
            const cClean = c.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (pClean.includes(cClean) || cClean.includes(pClean) ||
                (pClean.includes('apple') && cClean.includes('apple')) ||
                (pClean.includes('amazon') && cClean.includes('amazon'))) {
                return true;
            }
            return false;
        });
        
        if (localMatch) {
            localDupeCount++;
            toUpdate.push(pending.id);
            console.log(`✅ LOCAL DUPE: ${pending.provider} (${pAmount}€) -> ${localMatch.provider} (${localMatch.amount}€)`);
        }
    }
    
    console.log(`\nFound ${localDupeCount} additional purely local duplicates.`);
    console.log(`Total to update: ${toUpdate.length} / ${pendingInvoices.length}`);
    
    // Execute the update
    if (toUpdate.length > 0) {
        console.log(`\nUpdating ${toUpdate.length} invoices to COMPLETED...`);
        await prisma.invoice.updateMany({
            where: { id: { in: toUpdate } },
            data: { status: 'COMPLETED' }
        });
        console.log("✅ Update complete!");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
