import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

async function inspectAmazonGmail() {
    const connection = await imaps.connect(GMAIL_CONFIG);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '01-Jun-2026'],
        ['SUBJECT', 'Amazon']
    ];
    const messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    console.log(`Found ${messages.length} Amazon messages in Gmail:`);

    for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;
        const parsed = await simpleParser(allPart.body);
        console.log(`\n--------------------------------------------`);
        console.log(`Date: ${parsed.date}`);
        console.log(`From: ${parsed.from?.text}`);
        console.log(`Subject: ${parsed.subject}`);
        console.log(`Attachments: ${parsed.attachments.length}`);
        parsed.attachments.forEach(a => {
            console.log(`  - Attachment: ${a.filename} (${a.contentType}, ${a.size} bytes)`);
        });
        const text = parsed.text || '';
        // Look for order number and total amount
        const orderMatch = text.match(/(?:commande|order)\s*(?:n°|#)?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
        const totalMatch = text.match(/(?:total|montant)\s*(?:ttc)?\s*[:]\s*([0-9\s,.]+)\s*€/i);
        if (orderMatch) console.log(`  Order #: ${orderMatch[1]}`);
        if (totalMatch) console.log(`  Total: ${totalMatch[1]} €`);
    }

    connection.end();
}

inspectAmazonGmail().catch(console.error);
