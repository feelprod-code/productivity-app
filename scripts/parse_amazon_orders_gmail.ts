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

async function parseAmazonOrders() {
    const connection = await imaps.connect(GMAIL_CONFIG);
    await connection.openBox('INBOX');

    const searchCriteria = [
        ['SINCE', '01-Jun-2026'],
        ['FROM', 'amazon.fr']
    ];
    const messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    console.log(`Found ${messages.length} messages from amazon.fr in Gmail since 01-Jun-2026:`);

    for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;
        const parsed = await simpleParser(allPart.body);
        const subj = parsed.subject || '';
        const text = parsed.text || '';

        // Extract order number
        const orderMatch = text.match(/(?:commande|order)\s*(?:n°|#)?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
        // Extract total
        const totalMatches = [...text.matchAll(/(?:total|montant total|montant de la commande|montant)\s*(?:ttc)?\s*[:\s]\s*([0-9]+[.,][0-9]{2})\s*€/gi)];
        const total = totalMatches.length > 0 ? totalMatches[totalMatches.length - 1][1] : null;

        console.log(`\n[${parsed.date?.toISOString().split('T')[0]}] Subj: "${subj}"`);
        if (orderMatch) console.log(`  Order: ${orderMatch[1]}`);
        if (total) console.log(`  Total: ${total} €`);
    }

    connection.end();
}

parseAmazonOrders().catch(console.error);
