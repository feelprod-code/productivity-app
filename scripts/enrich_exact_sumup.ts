import { PrismaClient } from '@prisma/client';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

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

const targets = [
    { id: "24191595999232", amount: 404.72, date: "2026-06-26", days: ["20260625", "20260626"] },
    { id: "24020129136640", amount: 236.91, date: "2026-06-17", days: ["20260616", "20260617"] },
    { id: "24020123783168", amount: 246.78, date: "2026-05-08", days: ["20260507", "20260508"] }
];

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
    console.log("Connecting to iCloud...");
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '01-May-2026'],
        ['BEFORE', '01-Jul-2026'],
        ['FROM', 'sumup']
    ];

    const messages = await connection.search(searchCriteria, { bodies: ['HEADER', ''], struct: true });
    console.log(`Processing ${messages.length} messages...`);

    for (const msg of messages) {
        const rawPart = msg.parts.find((p: any) => p.which === '');
        if (!rawPart) continue;
        const mail = await simpleParser(rawPart.body);
        
        for (const att of mail.attachments || []) {
            if (att.filename && att.filename.endsWith('daily-payments-report.pdf')) {
                const parsed = await pdfParse(att.content);
                const text = parsed.text || "";
                
                for (const t of targets) {
                    const matchDay = t.days.some(d => att.filename.includes(d));
                    if (matchDay) {
                        const patients = parsePatients(text);
                        console.log(`\nFound matching report: ${att.filename} for target ${t.id} (${t.amount} €)!`);
                        console.log(`Extracted ${patients.length} patients:`, patients);
                        
                        if (patients.length > 0) {
                            const desc = `SUMUP_JSON:${JSON.stringify(patients)}`;
                            await prisma.$executeRawUnsafe(
                                'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                                t.id,
                                desc
                            );
                            console.log(`✅ Saved to TransactionDetail for ${t.id}!`);
                        }
                    }
                }
            }
        }
    }

    connection.end();
}

main().catch(console.error).finally(() => prisma.$disconnect());
