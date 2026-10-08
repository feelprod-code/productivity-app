import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

async function main() {
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '01-May-2026'],
        ['BEFORE', '01-Jul-2026'],
        ['FROM', 'sumup']
    ];

    const fetchOptions = {
        bodies: ['HEADER', ''],
        struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} SumUp emails between May and July 2026.`);

    for (const msg of messages) {
        const rawPart = msg.parts.find((p: any) => p.which === '');
        if (!rawPart) continue;
        const mail = await simpleParser(rawPart.body);
        const subject = mail.subject || '';
        const date = mail.date?.toISOString().split('T')[0] || '';
        console.log(`\nEmail: [${date}] Subject: "${subject}" | Attachments: ${mail.attachments?.length || 0}`);
        for (const att of mail.attachments || []) {
            console.log(`  Attachment: ${att.filename} (${att.size} bytes)`);
        }
        // Check if body mentions 404, 236 or 246
        const text = mail.text || mail.html || '';
        if (text.includes('404') || text.includes('236') || text.includes('246') || text.includes('1729820') || text.includes('1720225') || text.includes('1678540')) {
            console.log(`  🎯 MENTIONS TARGET! Snippet:\n${text.substring(0, 500)}`);
        }
    }
    connection.end();
}

main().catch(console.error);
