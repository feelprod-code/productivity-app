import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

const ICLOUD_CONFIG = {
    imap: {
        user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
        password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

function parsePatients(text: string): { name: string, amount: number }[] {
    const patients: { name: string, amount: number }[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.includes('1 x') && line.includes('€')) {
            const match = line.match(/1\s*x\s*([^€]+)€\s*([0-9.,]+)/);
            if (match) {
                const name = match[1].trim();
                const amountStr = match[2].replace(',', '.');
                const amount = parseFloat(amountStr);
                if (!isNaN(amount) && !patients.some(p => p.name === name && p.amount === amount)) {
                    patients.push({ name, amount });
                }
            }
        }
    }
    return patients;
}

async function main() {
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '15-Jun-2026'],
        ['BEFORE', '19-Jun-2026'],
        ['FROM', 'sumup']
    ];

    const messages = await connection.search(searchCriteria, { bodies: ['HEADER', ''], struct: true });
    console.log(`Found ${messages.length} messages around June 17.`);

    for (const msg of messages) {
        const rawPart = msg.parts.find((p: any) => p.which === '');
        if (!rawPart) continue;
        const mail = await simpleParser(rawPart.body);
        console.log(`Date: ${mail.date?.toISOString().split('T')[0]}, Subject: ${mail.subject}`);
        for (const att of mail.attachments || []) {
            console.log(`  Attachment: ${att.filename}`);
            if (att.filename && att.filename.endsWith('.pdf')) {
                const parsed = await pdfParse(att.content);
                const text = parsed.text || "";
                const patients = parsePatients(text);
                console.log(`    Patients found (${patients.length}):`, patients);
                if (text.includes('236') || patients.length > 0) {
                    const desc = `SUMUP_JSON:${JSON.stringify(patients)}`;
                    await prisma.$executeRawUnsafe(
                        'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                        "24020129136640",
                        desc
                    );
                    console.log(`    ✅ Saved to TransactionDetail for 24020129136640!`);
                }
            }
        }
    }
    connection.end();
}

main().catch(console.error).finally(() => prisma.$disconnect());
