import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { amount: 'desc' },
    take: 10
  });
  console.log("Top 10 highest INVOICES:");
  console.log(invoices.map(i => `${i.id} | ${i.provider} | ${i.amount}`).join('\n'));

  const expenses = await prisma.expense.findMany({
    orderBy: { amount: 'desc' },
    take: 10
  });
  console.log("\nTop 10 highest EXPENSES:");
  console.log(expenses.map(e => `${e.id} | ${e.provider} | ${e.amount}`).join('\n'));
}

main().finally(() => prisma.$disconnect());
