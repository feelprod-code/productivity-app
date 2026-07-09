import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const IMAP_CONFIG = {
    imap: {
        user: 'guillaumephilippe@me.com',
        password: 'ezux-gvqf-htzt-xxpi',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function main() {
    console.log("🔌 Connexion au serveur IMAP iCloud...");
    const connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox('INBOX');
    
    // Rechercher un email CPAM de rejet
    const searchCriteria = [
        ['SINCE', '01-May-2026'],
        ['SUBJECT', 'rejets de la CPAM']
    ];
    
    const messages = await connection.search(searchCriteria, { bodies: ['HEADER', 'TEXT', ''], struct: true });
    console.log(`   Trouvé ${messages.length} e-mails.`);
    
    if (messages.length > 0) {
        const msg = messages[0];
        const rawBodyPart = msg.parts.find((p: any) => p.which === '');
        if (rawBodyPart) {
            const mail = await simpleParser(rawBodyPart.body);
            const cpamPdf = mail.attachments.find(a => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'));
            if (cpamPdf) {
                console.log(`📄 Attachment found: ${cpamPdf.filename}`);
                const parsed = await pdfParse(cpamPdf.content);
                const text = parsed.text;
                
                console.log("\n--- PDF TEXT START ---");
                console.log(text.substring(0, 3000));
                console.log("--- PDF TEXT END ---");
                
                // Tester le regex
                const detailRegex = /(\d{2}\/\d{2}\/\d{4})\d{9}CPAM\s*n°\s*(\d{3})([A-Z\s\-]{3,})(\d{13,15})[A-Z]{3}\d{2}\/\d{2}\/\d{4}(?:\s*au\s*\d{2}\/\d{2}\/\d{4})?([0-9.,]+)\s*€/;
                const lines = text.split('\n');
                let matchCount = 0;
                for (const line of lines) {
                    const match = line.match(detailRegex);
                    if (match) {
                        matchCount++;
                        console.log(`MATCH line: "${line}" -> Name: ${match[3]}, Amount: ${match[5]}`);
                    }
                }
                console.log(`\nTotal matches: ${matchCount}`);
            } else {
                console.log("❌ No PDF attachment found in the first message.");
            }
        }
    }
    
    connection.end();
}

main().catch(console.error);
