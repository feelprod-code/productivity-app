import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const pending = await prisma.invoice.findMany({ where: { status: 'PENDING' } });
    console.log('Pending count:', pending.length);
    fs.writeFileSync('pending_invoices_debug.json', JSON.stringify(pending.map(i => ({
        id: i.id,
        provider: i.provider,
        amount: i.amount,
        date: i.date.toISOString().split('T')[0],
        fileUrl: i.fileUrl
    })), null, 2));
}

main().finally(() => prisma.$disconnect());
