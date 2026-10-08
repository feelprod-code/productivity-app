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

async function inspectFreeMobile() {
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    let searchCriteria = [['SINCE', '01-Jul-2026'], ['SUBJECT', 'facture mobile Free']];
    let messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    console.log(`Found ${messages.length} Free Mobile messages.`);
    for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log(`Date: ${parsed.date}, Subj: ${parsed.subject}`);
        const text = parsed.text || '';
        const lines = text.split('\n').filter(l => l.includes('€') || l.includes('montant') || l.includes('prelev') || l.includes('facture'));
        console.log("Key lines:", lines);
    }

    connection.end();
}

inspectFreeMobile().catch(console.error);
