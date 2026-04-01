import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const expenses = await prisma.expense.findMany();
    const invoices = await prisma.invoice.findMany();

    console.log("=== TOUTES LES DÉPENSES QUI ONT 168 OU VERCEL DEDANS (Expense) ===");
    for (const exp of expenses) {
        const txt = JSON.stringify(exp).toLowerCase();
        if (txt.includes('vercel') || txt.includes('168')) {
            console.log(exp);
        }
    }

    console.log("=== TOUTES LES FACTURES QUI ONT 168 OU VERCEL DEDANS (Invoice) ===");
    for (const inv of invoices) {
        const txt = JSON.stringify(inv).toLowerCase();
        if (txt.includes('vercel') || txt.includes('168')) {
            if (!inv.provider?.toLowerCase().includes('doctolib')) {
                console.log(inv);
            }
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
