import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const existing = await prisma.invoice.findFirst({
      where: {
        provider: { contains: 'SABRINA KHANOUCHE' }
      }
    });

    if (!existing) {
      const inv = await prisma.invoice.create({
        data: {
          provider: 'SABRINA KHANOUCHE - Cession MacBook Air 13',
          amount: 500.0,
          currency: 'EUR',
          date: new Date('2026-09-14T10:00:00Z'),
          fileUrl: '/factures/2026-09-14 - SABRINA KHANOUCHE - 500.00EUR.pdf',
          status: 'PAID',
          type: 'PRO'
        }
      });
      console.log('Successfully registered in Compta Database:', inv.id);
    } else {
      console.log('Already registered in database:', existing.id);
    }
  } catch (e: any) {
    console.log('Database registration skipped or error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
