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

async function inspectFullEmailText() {
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    // Freebox
    console.log("=== FREEBOX FULL TEXT ===");
    let searchCriteria = [['SINCE', '01-Aug-2026'], ['SUBJECT', 'facture Freebox']];
    let messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    if (messages.length > 0) {
        const allPart = messages[messages.length - 1].parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log("FREEBOX TEXT:\n", parsed.text);
    }

    // Free Mobile
    console.log("\n=== FREE MOBILE FULL TEXT ===");
    searchCriteria = [['SINCE', '01-Aug-2026'], ['SUBJECT', 'facture mobile Free']];
    messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    if (messages.length > 0) {
        const allPart = messages[messages.length - 1].parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log("FREE MOBILE TEXT:\n", parsed.text);
    }

    // Bouygues
    console.log("\n=== BOUYGUES FULL TEXT ===");
    searchCriteria = [['SINCE', '01-Aug-2026'], ['SUBJECT', 'facture Bouygues']];
    messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    if (messages.length > 0) {
        const allPart = messages[messages.length - 1].parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log("BOUYGUES TEXT:\n", parsed.text);
    }

    connection.end();
}

inspectFullEmailText().catch(console.error);
