import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Correction Facture Blackmagic/Amazon...');
    const updated = await prisma.invoice.updateMany({
        where: {
            provider: 'Amazon Business',
            amount: 5.00
        },
        data: {
            provider: 'Blackmagic Design Ltd',
            amount: 6.00
        }
    });
    console.log(`Corrigé : ${updated.count} record(s)`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
