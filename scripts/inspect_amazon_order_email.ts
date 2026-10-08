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

async function inspectAmazonOrderEmail() {
    const connection = await imaps.connect(GMAIL_CONFIG);
    await connection.openBox('INBOX');

    // Search for Insta360 order
    const searchCriteria = [
        ['SINCE', '20-Aug-2026'],
        ['SUBJECT', 'Commandé']
    ];
    const messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    console.log(`Found ${messages.length} Commandé messages.`);

    for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;
        const parsed = await simpleParser(allPart.body);
        console.log(`\n========================================`);
        console.log(`Date: ${parsed.date}`);
        console.log(`Subject: ${parsed.subject}`);
        const text = parsed.text || '';
        const itemsMatch = text.match(/\*\s*([^\n]+)/);
        const totalMatch = text.match(/(?:Total|TOTAL)\s*\n\s*([0-9.,]+)\s*EUR/i);
        const orderMatch = text.match(/N° de commande\s*\n\s*([0-9-]{19})/i);
        console.log(`  Order: ${orderMatch ? orderMatch[1] : 'N/A'}`);
        console.log(`  Item: ${itemsMatch ? itemsMatch[1].trim() : 'N/A'}`);
        console.log(`  Total: ${totalMatch ? totalMatch[1] : 'N/A'} EUR`);
    }

    connection.end();
}

inspectAmazonOrderEmail().catch(console.error);
