import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const result = await prisma.invoice.deleteMany({
        where: {
            provider: 'Inconnu (à classer)',
            amount: null
        }
    });

    const result2 = await prisma.invoice.deleteMany({
        where: {
            provider: 'Inconnu (à classer)',
            amount: 0
        }
    });

    console.log(`Deleted ${result.count + result2.count} bad invoices.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
