import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  const invs = await prisma.invoice.findMany({
    where: {
      provider: {
        contains: "AIRTAG"
      }
    }
  });

  console.log(`Checking Apple AirTag invoice in database:`);
  for (const inv of invs) {
    console.log(`ID: ${inv.id}`);
    console.log(`Provider: "${inv.provider}"`);
    console.log(`Amount: ${inv.amount}`);
    console.log(`Date: ${inv.date}`);
    console.log(`fileUrl: "${inv.fileUrl}"`);
  }
}

main().catch(console.error);
