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
    
    for (let i = 0; i < Math.min(3, messages.length); i++) {
        const msg = messages[i];
        const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
        const textPart = msg.parts.find((p: any) => p.which === 'TEXT');
        console.log(`\n================ MESSAGE ${i+1} ================`);
        console.log("TO:", headerPart?.body?.to?.[0]);
        console.log("SUBJECT:", headerPart?.body?.subject?.[0]);
        console.log("BODY:");
        console.log(textPart?.body);
    }
    
    connection.end();
}

main().catch(console.error);
