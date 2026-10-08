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

async function inspectEmails() {
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    // Search for Freebox
    console.log("=== INSPECTING FREE INVOICE EMAIL ===");
    let searchCriteria = [
        ['SINCE', '01-Jul-2026'],
        ['SUBJECT', 'facture Freebox']
    ];
    let messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    if (messages.length > 0) {
        const allPart = messages[messages.length - 1].parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log("Subject:", parsed.subject);
        console.log("Date:", parsed.date);
        console.log("Attachments count:", parsed.attachments.length);
        parsed.attachments.forEach(a => console.log(" - Attachment:", a.filename, a.contentType, a.size));
        console.log("Text snippet:", parsed.text?.substring(0, 300));
    }

    // Search for Bouygues
    console.log("\n=== INSPECTING BOUYGUES INVOICE EMAIL ===");
    searchCriteria = [
        ['SINCE', '01-Jul-2026'],
        ['SUBJECT', 'facture Bouygues']
    ];
    messages = await connection.search(searchCriteria, { bodies: [''], struct: true });
    if (messages.length > 0) {
        const allPart = messages[messages.length - 1].parts.find((p: any) => p.which === '');
        const parsed = await simpleParser(allPart.body);
        console.log("Subject:", parsed.subject);
        console.log("Date:", parsed.date);
        console.log("Attachments count:", parsed.attachments.length);
        parsed.attachments.forEach(a => console.log(" - Attachment:", a.filename, a.contentType, a.size));
        console.log("Text snippet:", parsed.text?.substring(0, 300));
    }

    connection.end();
}

inspectEmails().catch(console.error);
