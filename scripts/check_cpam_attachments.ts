import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as dotenv from 'dotenv';
import * as path from 'path';

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
    
    console.log("📂 Ouverture de INBOX...");
    await connection.openBox('INBOX');
    
    const searchCriteria = [
        ['SINCE', '01-May-2026'],
        ['OR', 
            ['SUBJECT', 'rejets'],
            ['OR',
                ['FROM', 'assurance-maladie.fr'],
                ['SUBJECT', 'cpam']
            ]
        ]
    ];
    
    const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        struct: true
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`   Trouvé ${messages.length} e-mails correspondant dans INBOX.`);
    
    for (const msg of messages) {
        const rawBodyPart = msg.parts.find((p: any) => p.which === '');
        if (!rawBodyPart) continue;
        
        const mail = await simpleParser(rawBodyPart.body);
        const subject = mail.subject || 'No Subject';
        const date = mail.date || new Date();
        const attachments = mail.attachments || [];
        
        console.log(`   - Date: ${date.toISOString().split('T')[0]} | Subject: ${subject} | Attachments: ${attachments.length}`);
        for (const att of attachments) {
            console.log(`     * Filename: ${att.filename} | ContentType: ${att.contentType}`);
        }
    }
    
    connection.end();
}

main().catch(console.error);
