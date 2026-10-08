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

async function testAmazonSearch() {
    const connection = await imaps.connect(GMAIL_CONFIG);
    await connection.openBox('INBOX');

    // 1. Search SUBJECT 'amazon'
    const resSubject = await connection.search([['SINCE', '01-Jul-2026'], ['HEADER', 'SUBJECT', 'amazon']]);
    console.log(`Results with SUBJECT 'amazon': ${resSubject.length}`);

    // 2. Search FROM 'amazon'
    const resFrom = await connection.search([['SINCE', '01-Jul-2026'], ['HEADER', 'FROM', 'amazon']]);
    console.log(`Results with FROM 'amazon': ${resFrom.length}`);

    connection.end();
}

testAmazonSearch().catch(console.error);
