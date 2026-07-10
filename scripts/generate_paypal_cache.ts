import { PrismaClient } from '@prisma/client';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/guillaumephilippe/ANTIGRAVITY/compta/.env', override: true });
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: true });

const prisma = new PrismaClient();

const GMAIL_CONFIG = {
    imap: {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'ridi mpgu rfbl deqp',
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

const CACHE_PATH = path.join(__dirname, '../src/app/api/transactions/releve/paypal_cache.json');

function cleanMerchantName(subject: string, text: string): string | null {
    let candidate: string | null = null;

    // Post-process cleaning function
    const sanitize = (name: string): string => {
        return name
            .replace(/^(?:votre paiement (?:à|de|pour)|your payment (?:to|for)|votre règlement (?:à|de|pour)|votre virement (?:à|de|pour))\s+/i, '')
            .replace(/^(?:le transfert (?:de|à|pour)|transfer (?:to|from))\s+/i, '')
            .trim();
    };

    // 1. Try subject with specific patterns first
    const specificMatch = subject.match(/(?:paiement à|payment to|payment for|paiement pour|facture de)\s+([^,.(]+)/i);
    if (specificMatch && specificMatch[1]) {
        candidate = specificMatch[1].trim();
    } else {
        // Fallback to more generic patterns
        const genericMatch = subject.match(/(?:à|to|pour|for)\s+([^,.(]+)/i);
        if (genericMatch && genericMatch[1]) {
            candidate = genericMatch[1].trim();
        }
    }

    if (candidate) {
        candidate = sanitize(candidate);
        const lower = candidate.toLowerCase();
        if (
            lower !== 'paypal' && 
            candidate.length > 2 && 
            !lower.includes('traite votre commande') &&
            !lower.includes('votre commande') &&
            !lower.includes('facture') &&
            !lower.includes('paiement')
        ) {
            return candidate;
        }
    }

    // 2. Try to extract from email body text
    const bodyMatch = text.match(/(?:marchand|merchant|compte du marchand|paiement envoyé à)\s*:\s*([^<\r\n]+)/i);
    if (bodyMatch && bodyMatch[1]) {
        candidate = sanitize(bodyMatch[1].trim());
        const lower = candidate.toLowerCase();
        if (
            lower !== 'paypal' && 
            candidate.length > 2 &&
            !lower.includes('traite votre commande') &&
            !lower.includes('votre commande') &&
            !lower.includes('facture') &&
            !lower.includes('paiement')
        ) {
            return candidate;
        }
    }

    return null;
}

async function scanAccount(config: any, accountName: string, cache: Record<string, string>) {
    console.log(`✉️ Connecting to ${accountName} IMAP...`);
    let connection;
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(sixtyDaysAgo.getDate()).padStart(2, '0');
        const month = months[sixtyDaysAgo.getMonth()];
        const year = sixtyDaysAgo.getFullYear();
        const sinceStr = `${day}-${month}-${year}`;

        console.log(`🔍 Scanning ${accountName} for PayPal emails since ${sinceStr}...`);
        
        const searchCriteria = [
            ['SINCE', sinceStr],
            ['HEADER', 'FROM', 'paypal']
        ];
        
        const fetchOptions = { bodies: ['HEADER'], struct: true };
        const searchResults = await connection.search(searchCriteria, fetchOptions);
        
        console.log(`📊 Found ${searchResults.length} potential PayPal emails in ${accountName}.`);

        let newMatches = 0;

        for (const msg of searchResults) {
            try {
                // Fetch the full message individually by UID to avoid throttling/timeout on iCloud
                const uid = msg.attributes.uid;
                const fullMsgResults = await connection.search([['UID', uid]], { bodies: [''], struct: true });
                if (!fullMsgResults || fullMsgResults.length === 0) continue;
                
                const fullMsg = fullMsgResults[0];
                const allPart = fullMsg.parts.find((p: any) => p.which === '');
                if (!allPart) continue;

                const parsed = await simpleParser(allPart.body);
                const subject = parsed.subject || '';
                const text = parsed.text || '';
                const date = parsed.date || new Date();

                // Extract amount from subject or text
                // Search for currency amounts like "15,99 EUR" or "15.99 €"
                const amountMatch = subject.match(/(\d+[\.,]\d{2})\s*(?:EUR|USD|€)/i) || 
                                    text.match(/(\d+[\.,]\d{2})\s*(?:EUR|USD|€)/i);

                if (!amountMatch) continue;

                const amountVal = parseFloat(amountMatch[1].replace(',', '.'));
                const dateStr = date.toISOString().split('T')[0];
                const cacheKey = `${dateStr}_${amountVal.toFixed(2)}`;

                // If already cached, skip
                if (cache[cacheKey]) continue;

                const merchant = cleanMerchantName(subject, text);
                if (merchant) {
                    cache[cacheKey] = merchant;
                    console.log(`🎯 Found PayPal Merchant: ${cacheKey} => "${merchant}"`);
                    newMatches++;
                    
                    // Also populate the adjacent days (+/- 1-2 days) because the bank transaction date
                    // might be slightly different from the email date
                    for (let dayOffset = -2; dayOffset <= 2; dayOffset++) {
                        if (dayOffset === 0) continue;
                        const offsetDate = new Date(date);
                        offsetDate.setDate(date.getDate() + dayOffset);
                        const offsetDateStr = offsetDate.toISOString().split('T')[0];
                        const offsetKey = `${offsetDateStr}_${amountVal.toFixed(2)}`;
                        if (!cache[offsetKey]) {
                            cache[offsetKey] = merchant;
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Error parsing message:`, err.message);
            }
        }

        console.log(`✅ ${accountName} scan finished. Added ${newMatches} new mappings.`);
    } catch (err: any) {
        console.error(`❌ IMAP Error for ${accountName}:`, err.message);
    } finally {
        if (connection) {
            connection.end();
        }
    }
}

async function main() {
    console.log("🚀 Starting PayPal Merchant Cache Generator...");

    // Load existing cache
    let cache: Record<string, string> = {};
    if (fs.existsSync(CACHE_PATH)) {
        try {
            cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            console.log(`📊 Loaded existing cache with ${Object.keys(cache).length} entries.`);
        } catch (e) {
            console.warn("⚠️ Failed to parse existing cache, starting fresh.");
        }
    } else {
        console.log("📁 Creating new PayPal cache file.");
        const dir = path.dirname(CACHE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Scan Gmail and iCloud
    await scanAccount(GMAIL_CONFIG, "Gmail", cache);
    await scanAccount(ICLOUD_CONFIG, "iCloud", cache);

    // Save cache back to file
    try {
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
        console.log(`\n🎉 PayPal cache updated and saved successfully!`);
        console.log(`📈 Total cache entries: ${Object.keys(cache).length}`);
        
        // Also copy it to productivity-app if it exists
        const prodCachePath = '/Users/guillaumephilippe/ANTIGRAVITY/productivity-app/src/app/api/transactions/releve/paypal_cache.json';
        if (fs.existsSync(path.dirname(prodCachePath))) {
            fs.writeFileSync(prodCachePath, JSON.stringify(cache, null, 2), 'utf8');
            console.log(`💾 Copied cache to productivity-app.`);
        }
    } catch (err: any) {
        console.error("❌ Failed to save PayPal cache:", err.message);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
