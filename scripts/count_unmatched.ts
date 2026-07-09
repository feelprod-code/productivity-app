import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // Count unmatched pro outflows
    const txs = await prisma.transaction.findMany();
    const unmatched = txs.filter((t: any) => {
        const date = new Date(t.date);
        const year = date.getFullYear();
        const isTargetYear = year === 2025 || year === 2026;
        const isPro = t.isPro;
        const isUnmatched = !t.matchedInvoice;
        const isOutflow = t.amount < 0;
        const needsJustificatif = !t.noJustificatif;

        return isTargetYear && isPro && isUnmatched && isOutflow && needsJustificatif;
    });

    console.log(`Total transactions in database: ${txs.length}`);
    console.log(`Unmatched pro outflows (2025/2026) needing justification: ${unmatched.length}`);
    
    // Group by keywords/label to see unique ones
    const labels = unmatched.map(t => t.label);
    const uniqueLabels = [...new Set(labels)];
    console.log(`Unique merchants/labels: ${uniqueLabels.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
