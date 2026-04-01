import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Recherche des factures Vercel...");
    const vercelExpenses = await prisma.expense.findMany({
        where: {
            OR: [
                { provider: { contains: 'vercel', mode: 'insensitive' } },
                { provider: { contains: 'google', mode: 'insensitive' } },
                { provider: { contains: 'one', mode: 'insensitive' } },
                { provider: { contains: '168', mode: 'insensitive' } },
                { amount: { equals: 168 } }
            ]
        }
    });

    console.log("Vercel / Google Expenses trouvées :", vercelExpenses.length);
    for (const exp of vercelExpenses) {
        console.log(`- ${exp.date.toISOString().split('T')[0]} | ${exp.amount} ${exp.currency} | Provider: ${exp.provider}`);
    }

    // On va aussi chercher les "Invoice" scannées :
    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { provider: { contains: 'vercel', mode: 'insensitive' } },
                { provider: { contains: 'google', mode: 'insensitive' } },
                { amount: { equals: 168 } },
            ]
        }
    });

    console.log("\nInvoices trouvées :", invoices.length);
    for (const inv of invoices) {
        console.log(`- ${inv.date?.toISOString().split('T')[0]} | ${inv.amount} EUR | ${inv.provider}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
