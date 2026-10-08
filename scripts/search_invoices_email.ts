import imaps from 'imap-simple';
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

async function searchAccount(name: string, config: any, queries: string[]) {
    console.log(`\n=== SEARCHING ${name} (${config.imap.user}) ===`);
    let connection;
    try {
        connection = await imaps.connect(config);
        console.log(`✅ Connected to ${name}`);
        await connection.openBox('INBOX');

        for (const query of queries) {
            console.log(`\n🔍 Query: "${query}" since 01-Jun-2026...`);
            const searchCriteria = [
                ['SINCE', '01-Jun-2026'],
                ['SUBJECT', query]
            ];
            const fetchOptions = {
                bodies: ['HEADER'],
                struct: true
            };
            const messages = await connection.search(searchCriteria, fetchOptions);
            console.log(`   Found ${messages.length} messages.`);
            for (const msg of messages.slice(0, 8)) {
                const header = msg.parts.find((p: any) => p.which === 'HEADER');
                const subject = header?.body?.subject?.[0] || 'No Subject';
                const date = header?.body?.date?.[0] || 'No Date';
                const from = header?.body?.from?.[0] || 'No From';
                console.log(`   - [${date}] From: ${from} | Subj: ${subject}`);
            }
        }
    } catch (err: any) {
        console.error(`❌ Error searching ${name}:`, err.message);
    } finally {
        if (connection) {
            try { connection.end(); } catch (e) {}
        }
    }
}

async function main() {
    const queries = ['Free', 'Bouygues', 'Amazon'];
    await searchAccount('Gmail', GMAIL_CONFIG, queries);
    await searchAccount('iCloud', ICLOUD_CONFIG, queries);
}

main().catch(console.error);
