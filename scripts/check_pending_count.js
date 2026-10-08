const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const pendingInvs = await prisma.invoice.findMany({
    where: { status: 'PENDING' }
  });
  console.log(`Total PENDING invoices in Prisma: ${pendingInvs.length}`);
  console.log(pendingInvs.slice(0, 10).map(i => ({
    id: i.id,
    date: i.date,
    provider: i.provider,
    amount: i.amount
  })));

  const completedInvs = await prisma.invoice.count({
    where: { status: 'COMPLETED' }
  });
  console.log(`Total COMPLETED invoices in Prisma: ${completedInvs}`);

  await prisma.$disconnect();
}

main().catch(console.error);
