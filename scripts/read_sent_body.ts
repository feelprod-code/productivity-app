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
    const connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox('[Gmail]/Messages envoyés');
    
    const searchCriteria = [
        ['SUBJECT', 'Nouvelle adresse']
    ];
    const fetchOptions = {
        bodies: ['HEADER', 'TEXT'],
        struct: true
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Trouvé ${messages.length} messages.`);
    
    if (messages.length > 0) {
        const msg = messages[0];
        const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
        console.log("=== CONTENU DU MESSAGE ENVOYÉ AUX CLIENTS ===");
        console.log(textPart?.body || 'Vide');
    }
    
    connection.end();
}

main().catch(console.error);
