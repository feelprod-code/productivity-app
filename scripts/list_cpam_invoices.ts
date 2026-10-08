import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

async function main() {
    const cpamInvs = await prisma.invoice.findMany({
        where: {
            OR: [
                { provider: { contains: 'cpam', mode: 'insensitive' } },
                { provider: { contains: 'assurance', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Found ${cpamInvs.length} CPAM invoices:`);
    for (const inv of cpamInvs) {
        console.log(`ID: ${inv.id} | Date: ${inv.date.toISOString().split('T')[0]} | Amount: ${inv.amount} | Provider: ${inv.provider} | URL: ${inv.fileUrl}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
