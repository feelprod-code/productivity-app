import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const invs = await prisma.invoice.findMany({
    where: {
      OR: [
        { provider: { contains: 'KANOUCHE', mode: 'insensitive' } },
        { provider: { contains: 'KHANOUCHE', mode: 'insensitive' } }
      ]
    }
  });
  console.log('Invoices found:', JSON.stringify(invs, null, 2));
  await prisma.$disconnect();
}

run().catch(console.error);
