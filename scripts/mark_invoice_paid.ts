import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const updated = await prisma.invoice.updateMany({
      where: {
        provider: { contains: 'SABRINA KANOUCHE' }
      },
      data: {
        status: 'PAID'
      }
    });
    console.log('Invoice marked as PAID in database:', updated.count);
  } catch (e) {
    console.error('Error updating DB:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
