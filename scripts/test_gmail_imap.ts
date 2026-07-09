import imaps from 'imap-simple';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const IMAP_CONFIG = {
    imap: {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'fpmc gosz zwxq lcwl',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function main() {
    console.log("🔌 Connexion au serveur IMAP Gmail...");
    const connection = await imaps.connect(IMAP_CONFIG);
    console.log("✅ Connecté !");
    
    console.log("📂 Ouverture de INBOX...");
    await connection.openBox('INBOX');
    
    console.log("🔍 Recherche des e-mails SumUp...");
    const searchCriteria = [
        ['SINCE', '01-May-2026'],
        ['SUBJECT', 'SumUp']
    ];
    
    const fetchOptions = {
        bodies: ['HEADER'],
        struct: true
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`✅ Trouvé ${messages.length} e-mails dans INBOX.`);
    
    for (const msg of messages.slice(0, 5)) {
        const header = msg.parts.find((p: any) => p.which === 'HEADER');
        const subject = header?.body?.subject?.[0] || 'No Subject';
        const date = header?.body?.date?.[0] || 'No Date';
        console.log(`- Date: ${date}, Subject: ${subject}`);
    }
    
    connection.end();
}

main().catch(console.error);
