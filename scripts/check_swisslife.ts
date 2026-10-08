import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

async function run() {
  console.log("Searching Invoice table for 425.00 amount...");
  try {
    const invs = await prisma.invoice.findMany({
      where: {
        amount: 425.00
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
