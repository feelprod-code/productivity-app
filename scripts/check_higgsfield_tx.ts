import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("=== Checking Expenses ===");
  const expenses = await prisma.expense.findMany({
    where: {
      provider: { contains: 'higgsfield', mode: 'insensitive' }
    }
  });
  console.log("Expenses:", expenses);

  console.log("=== Checking SupplierCredentials ===");
  const creds = await prisma.supplierCredential.findMany({
    where: {
      name: { contains: 'higgsfield', mode: 'insensitive' }
    }
  });
  console.log("SupplierCredentials:", creds);
}

main().catch(console.error).finally(() => prisma.$disconnect());
