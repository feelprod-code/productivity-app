import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Mise a jour de l'invoice mal catégorisée...");
    const updated = await prisma.invoice.update({
        where: { id: '2f474e77-7d8e-4736-b08b-d355b6f9a607' },
        data: {
            provider: 'Vercel',
            currency: 'USD'
        }
    });
    console.log("Invoice mise a jour avec succes !", updated);
}
main().catch(console.error).finally(() => prisma.$disconnect());
