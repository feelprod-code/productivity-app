import imaps from 'imap-simple';
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
    const boxes = ['INBOX', 'Archive'];
    
    for (const box of boxes) {
        console.log(`📂 Lecture de la boîte : ${box}...`);
        await connection.openBox(box);
        
        const searchCriteria = [
            ['SINCE', '01-Jan-2026'],
            ['OR', 
                ['SUBJECT', 'remboursement'],
                ['OR',
                    ['SUBJECT', 'cpam'],
                    ['SUBJECT', 'assurance']
                ]
            ]
        ];
        
        const fetchOptions = {
            bodies: ['HEADER'],
            struct: true
        };
        
        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`   Trouvé ${messages.length} e-mails correspondant dans ${box}.`);
        
        for (const msg of messages) {
            const header = msg.parts.find((p: any) => p.which === 'HEADER');
            const subject = header?.body?.subject?.[0] || 'No Subject';
            const from = header?.body?.from?.[0] || 'No Sender';
            const date = header?.body?.date?.[0] || 'No Date';
            console.log(`   - Date: ${date} | From: ${from} | Subject: ${subject}`);
        }
    }
    
    connection.end();
}

main().catch(console.error);
