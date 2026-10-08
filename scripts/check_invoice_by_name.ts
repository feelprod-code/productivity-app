import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log("Searching Invoice table for ME29KD3V...");
  try {
    const invs = await prisma.invoice.findMany({
      where: {
        fileUrl: {
          contains: "ME29KD3V"
        }
      }
    });
    
    console.log(`Found ${invs.length} invoice(s):`);
    invs.forEach(inv => {
      console.log(` - ID: ${inv.id}`);
      console.log(`   Provider: ${inv.provider}`);
      console.log(`   Amount: ${inv.amount}`);
      console.log(`   Date: ${inv.date}`);
      console.log(`   FileUrl: ${inv.fileUrl}`);
    });
  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
