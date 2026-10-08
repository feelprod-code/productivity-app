import { PrismaClient } from '@prisma/client';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();

const targets = [
    { id: "24191595999232", amount: 404.72, date: "2026-06-26", pid: "1729820" },
    { id: "24020129136640", amount: 236.91, date: "2026-06-17", pid: "1720225" },
    { id: "24020123783168", amount: 246.78, date: "2026-05-08", pid: "1678540" }
];

const GMAIL_CONFIG = {
    imap: {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

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

function parseSumUpPdf(text: string): { name: string, amount: number }[] {
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

async function searchAccountForTargets(name: string, config: any) {
    console.log(`\nConnecting to ${name}...`);
    try {
        const connection = await imaps.connect(config);
        const box = name === 'Gmail' ? '[Gmail]/Tous les messages' : 'INBOX';
        await connection.openBox(box);

        for (const t of targets) {
            console.log(`Searching for payout ${t.date} (${t.amount} € - PID ${t.pid})...`);
            const d = new Date(t.date);
            const sinceDate = new Date(d);
            sinceDate.setDate(d.getDate() - 3);
            const beforeDate = new Date(d);
            beforeDate.setDate(d.getDate() + 3);

            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const sinceStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;
            const beforeStr = `${beforeDate.getDate()}-${months[beforeDate.getMonth()]}-${beforeDate.getFullYear()}`;

            const searchCriteria = [
                ['SINCE', sinceStr],
                ['BEFORE', beforeStr],
                ['FROM', 'sumup']
            ];

            const fetchOptions = {
                bodies: ['HEADER', ''],
                struct: true
            };

            const messages = await connection.search(searchCriteria, fetchOptions);
            console.log(`  Found ${messages.length} messages around ${t.date}`);

            for (const msg of messages) {
                const rawPart = msg.parts.find((p: any) => p.which === '');
                if (!rawPart) continue;
                const mail = await simpleParser(rawPart.body);
                
                // Check attachments
                for (const att of mail.attachments || []) {
                    if (att.filename && att.filename.toLowerCase().endsWith('.pdf')) {
                        const parsed = await pdfParse(att.content);
                        const text = parsed.text || "";
                        if (text.includes(t.amount.toFixed(2).replace('.', ',')) || text.includes(t.amount.toFixed(2)) || text.includes(t.pid)) {
                            const patients = parseSumUpPdf(text);
                            if (patients.length > 0) {
                                console.log(`  ✨ MATCH FOUND for ${t.id} (${t.amount} €)! Patients:`, patients);
                                const descriptionValue = `SUMUP_JSON:${JSON.stringify(patients)}`;
                                await prisma.$executeRawUnsafe(
                                    'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                                    t.id,
                                    descriptionValue
                                );
                            }
                        }
                    }
                }
            }
        }
        connection.end();
    } catch (e: any) {
        console.error(`Error in ${name}:`, e.message);
    }
}

async function main() {
    await searchAccountForTargets('Gmail', GMAIL_CONFIG);
    await searchAccountForTargets('iCloud', ICLOUD_CONFIG);
}

main().catch(console.error).finally(() => prisma.$disconnect());
