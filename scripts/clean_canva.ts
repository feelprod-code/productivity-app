import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const deleted = await prisma.invoice.deleteMany({
        where: {
            amount: { gte: 10000000 }
        }
    });
    console.log(`Deleted ${deleted.count} invoices with absurd amounts (>= 10M).`);
}

main().finally(() => prisma.$disconnect());
