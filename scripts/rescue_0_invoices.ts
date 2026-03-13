import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const IMAP_CONFIG = {
    imap: {
        user: 'guillaumephilippe@me.com',
        password: 'ezux-gvqf-htzt-xxpi',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function getAiExtraction(text: string, subject: string, sender: string) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Tu es un expert comptable spécialisé dans la lecture de reçus et factures. Tu dois extraire le montant total TTC final payé, ainsi que le nom du fournisseur exact (ex: Apple, PayPal, SumUp, Chargemap, Freebox, Doctolib, etc). Réponds uniquement en validant le schéma JSON demandé."
                },
                {
                    role: "user",
                    content: `Voici une facture.\nObjet: ${subject}\nExpéditeur: ${sender}\n\nTexte:\n---\n${text.substring(0, 4000)}\n---`
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "invoice_extraction",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            provider_name: { type: "string" },
                            total_amount_ttc: { type: ["number", "null"] }
                        },
                        required: ["provider_name", "total_amount_ttc"],
                        additionalProperties: false
                    }
                }
            },
            temperature: 0,
        });

        const raw = response.choices[0].message.content;
        if (!raw) return { provider: 'Inconnu', amount: null };
        const data = JSON.parse(raw);
        return {
            provider: data.provider_name || 'Inconnu',
            amount: typeof data.total_amount_ttc === 'number' ? data.total_amount_ttc : null
        };
    } catch (e) {
        console.error('AI Error:', e);
        return { provider: 'Inconnu', amount: null };
    }
}

async function processEmail(message: any, connection: imaps.ImapSimple) {
    const parts = imaps.getParts(message.attributes.struct);

    // Download the full email
    const all = await connection.getPartData(message, parts[0]);
    const mail = await simpleParser(all);

    const subject = mail.subject || "";
    const from = mail.from?.text || "";
    const date = mail.date || new Date();

    // Ignore doctolib emails that are just normal appointments
    if (from.toLowerCase().includes('doctolib') && !subject.toLowerCase().includes('facture') && !subject.toLowerCase().includes('honoraires')) {
        return;
    }

    // Look for PDF attachment
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
        // Fallback to HTML
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
        console.log(`Skipping - No parseable content for: ${subject}`);
        return;
    }

    // Use AI to extract amount and provider
    const aiData = await getAiExtraction(textToParse, subject, from);
    if (aiData.amount === null || aiData.amount === 0) {
        console.log(`Skipping - 0€ detected off: ${subject}`);
        return;
    }

    // Check if an invoice with THIS amount and a very close date exists already in DB to avoid duplicates
    // Since Zapier ran and generated correct amounts for many, we ONLY want to insert if no such invoice exists!
    const existing = await prisma.invoice.findFirst({
        where: {
            provider: aiData.provider,
            amount: aiData.amount,
            date: {
                gte: new Date(date.getTime() - 24 * 60 * 60 * 1000 * 3), // -3 days
                lte: new Date(date.getTime() + 24 * 60 * 60 * 1000 * 3)  // +3 days
            }
        }
    });

    if (existing) {
        console.log(`Skipping - Already exists in DB: ${aiData.provider} ${aiData.amount}€ (${date.toISOString().split('T')[0]})`);
        return;
    }

    console.log(`=> Found new/missing: ${aiData.provider} - ${aiData.amount}€ - ${subject}`);

    // Upload to Supabase using new ID format
    const cleanProvider = aiData.provider.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `historic/${cleanProvider}_${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, fileBuffer, {
        contentType,
        upsert: true
    });

    if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);
        return;
    }

    const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
    const fileUrl = publicUrlData.publicUrl;

    // Insert!
    await prisma.invoice.create({
        data: {
            provider: aiData.provider,
            amount: aiData.amount,
            currency: 'EUR',
            date: date,
            fileUrl: fileUrl,
            status: 'COMPLETED'
        }
    });
    console.log(`✅ Saved invoice to DB!`);
}

async function main() {
    console.log("Cleaning up broken 0€ or null invoices from database...");
    const deleted = await prisma.invoice.deleteMany({
        where: {
            OR: [{ amount: null }, { amount: 0 }]
        }
    });
    console.log(`Deleted ${deleted.count} broken invoice entries.`);

    console.log("Connecting to iCloud IMAP...");
    const connection = await imaps.connect(IMAP_CONFIG);

    const boxes = ['INBOX', 'Archive'];
    // We only target common failed providers in the Zapier pipeline that had 0€ or missing PDFs
    const searchTerms = ['apple', 'paypal', 'sumup', 'chargemap', 'freebox', 'doctolib'];

    for (const box of boxes) {
        await connection.openBox(box);

        for (const term of searchTerms) {
            console.log(`Scanning [${box}] for ${term} since 01-Jan-2026...`);
            const searchCriteria = [
                ['SINCE', '01-Jan-2026'],
                ['OR', ['SUBJECT', term], ['FROM', term]]
            ];
            const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };

            const messages = await connection.search(searchCriteria, fetchOptions);

            for (const msg of messages) {
                await processEmail(msg, connection);
            }
        }
    }

    connection.end();
    console.log("DONE! iCloud scan and rescue complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
