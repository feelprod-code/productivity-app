import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const updated = await prisma.invoice.update({
    where: { id: "d3c791cc-3fb3-4c75-8885-d04dccb90062" },
    data: {
      provider: "SABRINA KHANOUCHE - Cession MacBook Air 13",
      fileUrl: "/factures/2026-09-14 - SABRINA KHANOUCHE - 500.00EUR.pdf"
    }
  });
  console.log("Successfully updated Compta Prisma invoice:", updated);
  await prisma.$disconnect();
}

run().catch(console.error);
