import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Suppression Facture "Test Bot"...');
    const d1 = await prisma.invoice.deleteMany({
        where: {
            provider: 'Test Bot',
        }
    });
    console.log(`Supprimé Test Bot: ${d1.count} record(s)`);

    console.log('Suppression Facture "Inconnu (à classer)"...');
    const d2 = await prisma.invoice.deleteMany({
        where: {
            provider: 'Inconnu (à classer)',
        }
    });
    console.log(`Supprimé Inconnu: ${d2.count} record(s)`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
