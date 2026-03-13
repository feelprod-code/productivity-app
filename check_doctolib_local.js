const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: {
      provider: {
        contains: 'doctolib',
        mode: 'insensitive'
      }
    },
    orderBy: { date: 'desc' }
  });
  console.log("Doctolib invoices found:", invoices.length);
  invoices.forEach(i => console.log(`- ${i.date.toISOString()} : ${i.amount} EUR`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
