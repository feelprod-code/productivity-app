import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const invoices = await prisma.invoice.findMany({
        where: {
            createdAt: {
                gte: today,
            }
        },
        orderBy: { date: 'asc' },
    });

    console.log(`Ingested today: ${invoices.length}`);
    for (const inv of invoices) {
        console.log(`- [DB Date: ${inv.date.toISOString().split('T')[0]}] ${inv.provider}: ${inv.amount}€ (Added on: ${inv.createdAt.toISOString()})`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
