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

async function testFreeMobileMatching(txDate: Date, expectedTotal: number) {
    console.log(`\nTesting Free Mobile for Tx Date: ${txDate.toISOString().split('T')[0]} | Expected: ${expectedTotal} €`);
    const connection = await imaps.connect(ICLOUD_CONFIG);
    await connection.openBox('INBOX');

    const searchQueries = [
        [['HEADER', 'FROM', 'free'], ['SINCE', '01-Jul-2026']],
        [['HEADER', 'SUBJECT', 'free'], ['SINCE', '01-Jul-2026']]
    ];

    const seenMsgIds = new Set<string>();
    const candidates: { date: Date; amount: number; phone: string }[] = [];

    for (const q of searchQueries) {
        const msgs = await connection.search(q, { bodies: [''], struct: true });
        for (const m of msgs) {
            const allPart = m.parts.find((p: any) => p.which === '');
            if (!allPart) continue;
            const parsed = await simpleParser(allPart.body);
            const msgId = parsed.messageId || `${parsed.date?.toISOString()}_${parsed.subject}`;
            if (seenMsgIds.has(msgId)) continue;
            seenMsgIds.add(msgId);

            const msgDate = new Date(parsed.date || '');
            const timeDiffDays = Math.abs(msgDate.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
            if (timeDiffDays > 7) continue;

            const text = (parsed.text || '').replace(/[\u2018\u2019]/g, "'");
            const isMobile = (parsed.subject || '').toLowerCase().includes('mobile') || text.toLowerCase().includes('mobile');
            if (!isMobile) continue;

            const amountMatch = text.match(/montant\s+(?:de|est\s+de)\s*([0-9.,]+)\s*€/i);
            const phoneMatch = text.match(/0[67][0-9]{8}/);

            if (amountMatch) {
                const amt = parseFloat(amountMatch[1].replace(',', '.'));
                const phone = phoneMatch ? phoneMatch[0] : 'Inconnu';
                candidates.push({ date: msgDate, amount: amt, phone });
                console.log(`  Found candidate: ${phone} - ${amt} € on ${msgDate.toISOString().split('T')[0]}`);
            }
        }
    }

    const total = candidates.reduce((acc, c) => acc + c.amount, 0);
    console.log(`  Total candidates: ${candidates.length}, Sum: ${total.toFixed(2)} €, Expected: ${expectedTotal} €`);
    if (Math.abs(total - expectedTotal) < 0.05) {
        console.log(`  ✅ SUCCESS: Match confirmed!`);
    } else {
        console.log(`  ❌ MISMATCH!`);
    }

    connection.end();
}

async function main() {
    await testFreeMobileMatching(new Date("2026-08-21"), 42.46);
    await testFreeMobileMatching(new Date("2026-07-22"), 29.98);
}

main().catch(console.error);
