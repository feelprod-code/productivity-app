import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findAnomalies() {
    const invoices = await prisma.invoice.findMany();

    const anomalies = invoices.filter(i =>
        i.amount === 0 ||
        i.amount === 1797 ||
        i.provider.toLowerCase().includes('test') ||
        i.provider.toLowerCase().includes('stock') ||
        i.provider.toLowerCase().includes('apple')
    );

    console.log(JSON.stringify(anomalies, null, 2));
}
findAnomalies()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
