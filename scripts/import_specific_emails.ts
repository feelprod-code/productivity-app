import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/philippeguillaume/ANTIGRAVITY/.env', override: true });
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: true });

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const IMAP_CONFIG = {
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

async function getAiExtraction(text: string, subject: string, sender: string) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: "Tu es un expert comptable spécialisé dans la lecture de reçus et factures. Tu dois extraire le montant total TTC final payé, ainsi que le nom du fournisseur exact (ex: Blackmagic Design, Digixo, Xfield, Google, Viasana, Nike, etc). Réponds uniquement avec un objet JSON contenant: provider_name (string), total_amount_ttc (number ou null), is_invoice (boolean)."
                },
                {
                    role: 'user',
                    content: `Voici une facture.\nObjet: ${subject}\nExpéditeur: ${sender}\n\nTexte:\n---\n${text.substring(0, 4000)}\n---`
                }
            ],
            response_format: { type: "json_object" }
        });

        const raw = response.choices[0].message.content;
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data.is_invoice || typeof data.total_amount_ttc !== 'number' || data.total_amount_ttc === 0) {
            return null; // Not a valid invoice
        }
        return {
            provider: data.provider_name || 'Inconnu',
            amount: data.total_amount_ttc
        };
    } catch (e) {
        console.error('OpenAI Error:', e);
        return null;
    }
}

async function processEmail(message: any) {
    const rawBodyPart = message.parts.find((p: any) => p.which === '');
    if (!rawBodyPart) {
        console.error("Message missing raw body part");
        return;
    }
    const all = rawBodyPart.body;
    const mail = await simpleParser(all);

    const subject = mail.subject || "";
    const from = mail.from?.text || "";
    const date = mail.date || new Date();

    let pdfAttachment = mail.attachments.find(a => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'));
    let textToParse = "";
    let fileBuffer: Buffer | null = null;
    let fileExt = "";
    let contentType = "";

    if (pdfAttachment) {
        fileBuffer = pdfAttachment.content;
        fileExt = "pdf";
        contentType = "application/pdf";
        try {
            const parsed = await pdfParse(fileBuffer);
            textToParse = parsed.text;
        } catch {
            textToParse = mail.text || (typeof mail.html === 'string' ? mail.html.replace(/<[^>]*>?/gm, ' ') : "");
        }
    } else {
        textToParse = mail.text || (typeof mail.html === 'string' ? mail.html.replace(/<[^>]*>?/gm, ' ') : "");
        if (mail.html) {
            fileBuffer = Buffer.from(mail.html, 'utf-8');
            fileExt = "html";
            contentType = "text/html";
        } else if (mail.text) {
            fileBuffer = Buffer.from(mail.text, 'utf-8');
            fileExt = "txt";
            contentType = "text/plain";
        }
    }

    if (!textToParse || !fileBuffer) {
        return;
    }

    const aiData = await getAiExtraction(textToParse, subject, from);
    if (!aiData || aiData.amount === null) {
        return;
    }

    const existing = await prisma.invoice.findFirst({
        where: {
            provider: aiData.provider,
            amount: aiData.amount,
            date: {
                gte: new Date(date.getTime() - 24 * 60 * 60 * 1000 * 3),
                lte: new Date(date.getTime() + 24 * 60 * 60 * 1000 * 3)
            }
        }
    });

    if (existing) {
        console.log(`[SKIP] Already exists: ${aiData.provider} ${aiData.amount}€ (${date.toISOString().split('T')[0]})`);
        return;
    }

    console.log(`[NEW] ${aiData.provider} - ${aiData.amount}€ - ${date.toISOString().split('T')[0]} - ${subject}`);

    const cleanProvider = aiData.provider.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `historic/${cleanProvider}_${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, fileBuffer, { contentType, upsert: true });

    if (uploadError) {
        console.error(`[ERROR] Supabase Upload: ${uploadError.message}`);
        return;
    }

    const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);

    await prisma.invoice.create({
        data: {
            provider: aiData.provider,
            amount: aiData.amount,
            currency: 'EUR',
            date: date,
            fileUrl: publicUrlData.publicUrl,
            status: 'COMPLETED'
        }
    });
}

async function main() {
    console.log("Connecting to iCloud IMAP for specific invoice ingestion...");
    const connection = await imaps.connect(IMAP_CONFIG);

    const boxes = ['INBOX', 'Archive'];
    const searchTerms = ['blackmagic', 'black magic', 'digixo', 'xfield', 'viasana', 'nike', 'google'];
    const processedUids = new Set<string>();

    for (const box of boxes) {
        await connection.openBox(box);

        for (const term of searchTerms) {
            console.log(`Scanning iCloud [${box}] for "${term}" since 01-Sep-2025...`);

            // Search in Subject
            let messages = await connection.search([['SINCE', '01-Sep-2025'], ['SUBJECT', term]], { bodies: ['HEADER', 'TEXT', ''], struct: true });

            // Search in From
            let messagesFrom = await connection.search([['SINCE', '01-Sep-2025'], ['FROM', term]], { bodies: ['HEADER', 'TEXT', ''], struct: true });

            // Search in Text Body (iCloud IMAP search for BODY is fully supported)
            let messagesBody = await connection.search([['SINCE', '01-Sep-2025'], ['BODY', term]], { bodies: ['HEADER', 'TEXT', ''], struct: true });

            const allMessages = [...messages, ...messagesFrom, ...messagesBody];
            console.log(`- Found ${allMessages.length} message(s) containing "${term}" in [${box}]`);

            for (const msg of allMessages) {
                const uid = `${box}-${msg.attributes.uid}`;
                if (processedUids.has(uid)) continue;
                processedUids.add(uid);

                try {
                    await processEmail(msg);
                } catch (e) {
                    console.error("Error processing email", e);
                }
            }
        }
    }

    connection.end();
    console.log("DONE! iCloud specific search complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
