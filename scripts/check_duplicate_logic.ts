import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const all = await prisma.invoice.findMany();
    const pending = all.filter(i => i.status === 'PENDING');
    const completed = all.filter(i => i.status === 'COMPLETED');
    
    let duplicatesCount = 0;
    const toUpdate: string[] = [];
    
    const getClean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const p of pending) {
        const pDate = new Date(p.date);
        const pClean = getClean(p.provider);
        
        // Find if there is a completed invoice for the same provider within 45 days
        const isDupe = completed.some(c => {
            const cDate = new Date(c.date);
            const diffDays = Math.abs(cDate.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
            
            if (diffDays > 45) return false;
            
            const cClean = getClean(c.provider);
            
            // If it's a known recurring subscription or same name
            if (pClean.includes(cClean) || cClean.includes(pClean) || 
                (pClean.includes('apple') && cClean.includes('apple')) ||
                (pClean.includes('amazon') && cClean.includes('amazon')) ||
                (pClean.includes('adobe') && cClean.includes('adobe')) ||
                (pClean.includes('cloudflare') && cClean.includes('cloudflare'))
            ) {
                // Also check if amount is same OR if it's a subscription, we might just assume it's a duplicate of the month
                // Let's check amount just in case, but relax it a bit for subscriptions?
                // Actually, if it's the exact same amount, it's definitely a duplicate.
                if (Math.abs((p.amount || 0) - (c.amount || 0)) < 1) {
                    return true;
                }
            }
            return false;
        });
        
        if (isDupe) {
            duplicatesCount++;
            toUpdate.push(p.id);
        }
    }
    
    console.log(`Found ${duplicatesCount} pending invoices that are duplicates of existing COMPLETED invoices.`);
    console.log(toUpdate.length > 0 ? "You can update these to COMPLETED or delete them." : "");
}

main().finally(() => prisma.$disconnect());
