import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        orderBy: { date: 'asc' },
    });

    console.log(`Total invoices: ${invoices.length}`);
    for (const inv of invoices) {
        console.log(`- [${inv.date.toISOString().split('T')[0]}] ${inv.provider}: ${inv.amount}€ (fileUrl: ${inv.fileUrl})`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
