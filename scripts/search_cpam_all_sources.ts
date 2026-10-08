import imaps from 'imap-simple';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const GMAIL_CONFIG = {
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

const ICLOUD_CONFIG = {
    imap: {
        user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
        password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function searchAccount(name: string, config: any) {
    console.log(`\n🔌 Connexion au serveur IMAP ${name}...`);
    try {
        const connection = await imaps.connect(config);
        const boxes = name === 'Gmail' ? ['INBOX', '[Gmail]/Tous les messages'] : ['INBOX', 'Archive'];
        
        for (const box of boxes) {
            try {
                console.log(`📂 [${name}] Ouverture de : ${box}...`);
                await connection.openBox(box);
                
                // Search for ameli, cpam, tiers payant
                const queries = [
                    ['OR', ['FROM', 'ameli'], ['FROM', 'cpam']],
                    ['OR', ['SUBJECT', 'ameli'], ['SUBJECT', 'cpam']],
                    ['OR', ['SUBJECT', 'tiers payant'], ['SUBJECT', 'tiers-payant']],
                    ['OR', ['BODY', 'relevé de paiement'], ['BODY', 'tiers payant']]
                ];

                for (const criteria of queries) {
                    const searchCriteria = [
                        ['SINCE', '01-Jan-2026'],
                        criteria
                    ];
                    
                    const fetchOptions = {
                        bodies: ['HEADER'],
                        struct: true
                    };
                    
                    const messages = await connection.search(searchCriteria, fetchOptions);
                    if (messages.length > 0) {
                        console.log(`   ✨ [${box}] Trouvé ${messages.length} e-mail(s) pour critère :`, JSON.stringify(criteria));
                        for (const msg of messages.slice(0, 10)) {
                            const header = msg.parts.find((p: any) => p.which === 'HEADER');
                            const subject = header?.body?.subject?.[0] || 'No Subject';
                            const from = header?.body?.from?.[0] || 'No Sender';
                            const date = header?.body?.date?.[0] || 'No Date';
                            console.log(`      - [${date}] De: ${from} | Objet: ${subject}`);
                        }
                    }
                }
            } catch (err: any) {
                console.log(`   ⚠️ Erreur d'ouverture ${box}:`, err.message);
            }
        }
        connection.end();
    } catch (e: any) {
        console.error(`❌ Erreur connexion ${name}:`, e.message);
    }
}

async function main() {
    await searchAccount('Gmail', GMAIL_CONFIG);
    await searchAccount('iCloud', ICLOUD_CONFIG);
}

main().catch(console.error);
