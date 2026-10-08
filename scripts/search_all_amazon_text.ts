import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ICLOUD_CONFIG = {
    imap: {
        user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
        password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 20000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

const GMAIL_CONFIG = {
    imap: {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 20000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function searchAllAmazon(name: string, config: any) {
    console.log(`=== SEARCHING ALL AMAZON IN ${name} ===`);
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '01-Jul-2026'],
        ['TEXT', 'amazon']
    ];
    const messages = await connection.search(searchCriteria, { bodies: ['HEADER'], struct: true });
    console.log(`Found ${messages.length} messages containing 'amazon' in ${name}:`);

    for (const msg of messages) {
        const header = msg.parts.find((p: any) => p.which === 'HEADER');
        const subj = header?.body?.subject?.[0] || 'No Subject';
        const date = header?.body?.date?.[0] || 'No Date';
        const from = header?.body?.from?.[0] || 'No From';
        console.log(`- [${date}] From: ${from} | Subj: ${subj}`);
    }

    connection.end();
}

async function main() {
    await searchAllAmazon('Gmail', GMAIL_CONFIG);
    await searchAllAmazon('iCloud', ICLOUD_CONFIG);
}

main().catch(console.error);
