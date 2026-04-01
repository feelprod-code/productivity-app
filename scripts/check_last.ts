import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const recentExpenses = await prisma.expense.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log('--- 10 Dernières Dépenses (Expense) ---');
    console.log(recentExpenses);

    const recentInvoices = await prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log('--- 10 Dernières Invoices ---');
    console.log(recentInvoices);
}
main().finally(() => prisma.$disconnect());
