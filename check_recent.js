const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log("Most recent invoices:");
  invoices.forEach(i => console.log(`- ${i.date.toISOString()} | ${i.provider} | ${i.amount} | ${i.fileName}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
