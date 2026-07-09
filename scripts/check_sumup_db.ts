import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const details = await prisma.$queryRawUnsafe('SELECT id, description FROM "TransactionDetail"') as any[];
  console.log(`📊 Found ${details.length} transaction details in "TransactionDetail":`);
  details.forEach(d => {
    console.log(`- ID: ${d.id}, Description snippet: ${d.description.substring(0, 100)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
