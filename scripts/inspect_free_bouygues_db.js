const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const invs = await prisma.invoice.findMany({
    where: {
      OR: [
        { provider: { contains: 'free', mode: 'insensitive' } },
        { provider: { contains: 'bouygues', mode: 'insensitive' } }
      ]
    },
    orderBy: { date: 'desc' },
    take: 15
  });

  console.log("=== RECENT FREE & BOUYGUES INVOICES IN DB ===");
  invs.forEach(i => {
    console.log({
      id: i.id,
      date: i.date,
      provider: i.provider,
      amount: i.amount,
      status: i.status,
      fileUrl: i.fileUrl
    });
  });

  await prisma.$disconnect();
}

main().catch(console.error);
