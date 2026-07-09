import { PrismaClient } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const desktopFolder = "/Users/guillaumephilippe/Desktop/Factures Bureau";
if (!fs.existsSync(desktopFolder)) {
    fs.mkdirSync(desktopFolder, { recursive: true });
}
const manualFolder = path.join(desktopFolder, "A Telecharger Manuellement");
if (!fs.existsSync(manualFolder)) {
    fs.mkdirSync(manualFolder, { recursive: true });
}

interface PatientTx {
    name: string;
    amount: number;
}

function formatPatientName(rawName: string): string {
    return rawName
        .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function cleanProviderName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9\s\-]/g, "")
        .replace(/\s+/g, "_")
        .trim()
        .toUpperCase();
}

function cleanStorageKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")
    .replace(/_+/g, '_')
    .trim();
}

// AI Extraction helper using Gemini
async function getAiExtraction(text: string, subject: string, sender: string) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user', parts: [
                        { text: "Tu es un assistant comptable. Tu dois extraire le montant total TTC final payé (valeur numérique), ainsi que le nom du fournisseur exact (ex: Apple, PayPal, Chargemap, Freebox, Doctolib, Canva, Gandi, Vercel, Google, etc). Réponds uniquement au format JSON." },
                        { text: `Objet de l'e-mail: ${subject}\nExpéditeur: ${sender}\n\nContenu du document:\n---\n${text.substring(0, 4000)}\n---` }
                    ]
                }
            ],
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        provider_name: { type: Type.STRING },
                        total_amount_ttc: { type: Type.NUMBER, nullable: true },
                        is_invoice: { type: Type.BOOLEAN, description: "Indique s'il s'agit d'un reçu, d'une facture ou d'une confirmation de paiement." }
                    },
                    required: ["provider_name", "total_amount_ttc", "is_invoice"]
                }
            }
        });

        const raw = response.text;
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data.is_invoice || typeof data.total_amount_ttc !== 'number' || data.total_amount_ttc === 0) {
            return null;
        }
        return {
            provider: cleanProviderName(data.provider_name || 'Inconnu'),
            amount: data.total_amount_ttc
        };
    } catch (e) {
        console.error('❌ AI Extraction Error:', e);
        return null;
    }
}

function isInvoiceNotificationOnly(text: string, subject: string): boolean {
    const textLower = text.toLowerCase();
    const subjectLower = subject.toLowerCase();
    
    const notificationPhrases = [
        "facture est disponible",
        "facture est prete",
        "facture est prête",
        "retrouver votre facture",
        "télécharger votre facture",
        "telecharger votre facture",
        "consulter votre facture",
        "disponible dans votre espace",
        "disponible sur votre espace",
        "rendez-vous dans votre espace",
        "votre nouvelle facture",
        "votre facture mobile",
        "votre facture bouygues",
        "votre facture freebox"
    ];
    
    const isNotification = notificationPhrases.some(phrase => textLower.includes(phrase) || subjectLower.includes(phrase));
    
    // Si l'e-mail contient des lignes d'articles détaillées ou des totaux de paiement clairs, ce n'est pas juste une notification
    const hasDetailedReceipt = textLower.includes("total ttc") || 
                               textLower.includes("total paye") || 
                               textLower.includes("total payé") || 
                               textLower.includes("reçu de paiement") || 
                               textLower.includes("recu de paiement") ||
                               textLower.includes("facture acquittée") ||
                               textLower.includes("facture acquittee") ||
                               textLower.includes("mode de paiement");
    
    return isNotification && !hasDetailedReceipt;
}

// Core processing logic
async function processEmailAccount(name: string, config: any, sinceDate: string) {
    console.log(`\n🔌 Connexion au serveur IMAP ${name}...`);
    let connection;
    try {
        connection = await imaps.connect(config);
    } catch (err: any) {
        console.error(`❌ Échec de connexion pour ${name}:`, err.message);
        return;
    }

    const boxes = ['INBOX', 'Archive'];
    
    // Récupérer toutes les transactions de crédit pour liaison SumUp depuis Pennylane
    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    const BASE_URL = "https://app.pennylane.com/api/external/v2";
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
        {
            field: "date",
            operator: "gteq",
            value: "2025-01-01"
        }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 24; page++) {
        const fetchUrl: string = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        try {
            const res = await fetch(fetchUrl, {
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) break;
            const data: any = await res.json();
            const items = data.transactions || data.items || [];
            if (items.length === 0) break;
            allTxs.push(...items);

            const nextCursor: string | null = data.next_cursor || data.meta?.next_cursor || null;
            if (nextCursor) {
                txCursor = nextCursor;
            } else {
                break;
            }
        } catch (e) {
            console.error("❌ Échec lors de la récupération des transactions Pennylane:", e);
            break;
        }
    }
    const creditTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0);

    const searchTerms = [
        'facture', 'invoice', 'reçu', 'receipt', 'paiement', 'payment', 'commande', 'order',
        'abonnement', 'prélèvement', 'paypal', 'sumup', 'payout'
    ];

    const processedUids = new Set<string>();

    for (const box of boxes) {
        try {
            console.log(`📂 Ouverture de la boîte : ${box} sur ${name}...`);
            await connection.openBox(box);
        } catch {
            continue;
        }

        for (const term of searchTerms) {
            console.log(`   🔍 Recherche [${box}] pour le mot-clé "${term}"...`);
            let messagesSubject = [];
            let messagesFrom = [];
            try {
                messagesSubject = await connection.search([['SINCE', sinceDate], ['SUBJECT', term]], { bodies: ['HEADER'], struct: true });
                messagesFrom = await connection.search([['SINCE', sinceDate], ['FROM', term]], { bodies: ['HEADER'], struct: true });
            } catch (err: any) {
                console.error(`      ⚠️ Erreur lors de la recherche du mot-clé "${term}" dans ${box}:`, err.message);
                continue;
            }

            const allMessages = [...messagesSubject, ...messagesFrom];
            if (allMessages.length === 0) continue;

            for (const msg of allMessages) {
                const uid = `${box}-${msg.attributes.uid}`;
                if (processedUids.has(uid)) continue;
                processedUids.add(uid);

                const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
                if (!headerPart) continue;

                const subject = (headerPart.body.subject?.[0] || "").toLowerCase();
                const from = (headerPart.body.from?.[0] || "").toLowerCase();
                const dateHeader = headerPart.body.date?.[0];
                const date = dateHeader ? new Date(dateHeader) : new Date();
                const dateStr = date.toISOString().split('T')[0];

                // Détection du type de document
                const isSumUp = subject.includes('relevé quotidien de vos paiements') || subject.includes('payments-report') || subject.includes('payout');
                const isInvoice = subject.includes('facture') || subject.includes('invoice') || subject.includes('reçu') || 
                                  subject.includes('receipt') || subject.includes('paiement') || subject.includes('payment') || 
                                  subject.includes('commande') || subject.includes('order') || subject.includes('abonnement') || 
                                  subject.includes('prélèvement') || from.includes('paypal') || from.includes('assurance-maladie.fr');

                if (!isSumUp && !isInvoice) {
                    continue;
                }

                // Vérification sur le Bureau si déjà téléchargé pour cette date
                const files = fs.readdirSync(desktopFolder);
                const onDesktop = files.some(f => f.startsWith(dateStr) && (isSumUp ? f.includes('SUMUP') : true));
                
                // Pour SumUp on vérifie aussi la DB rapidement
                let existingInDb = false;
                if (isSumUp) {
                    const existing = await prisma.invoice.findFirst({
                        where: {
                            provider: "SUMUP RAPPORT DE PAIEMENTS",
                            date: {
                                gte: new Date(date.getTime() - 24 * 60 * 60 * 1000),
                                lte: new Date(date.getTime() + 24 * 60 * 60 * 1000)
                            }
                        }
                    });
                    existingInDb = !!existing;
                }

                if (onDesktop && (isSumUp ? existingInDb : true)) {
                    continue;
                }

                // Téléchargement complet du message
                console.log(`   📥 Nouveau document détecté le ${dateStr} [Sujet: "${headerPart.body.subject?.[0]}"]. Téléchargement...`);
                let fullMsgs;
                try {
                    fullMsgs = await connection.search([['UID', msg.attributes.uid]], { bodies: [''], struct: true });
                } catch (err: any) {
                    console.error(`      ⚠️ Impossible de télécharger l'e-mail ${msg.attributes.uid}:`, err.message);
                    continue;
                }

                if (!fullMsgs || fullMsgs.length === 0) continue;

                const rawBodyPart = fullMsgs[0].parts.find((p: any) => p.which === '');
                if (!rawBodyPart) continue;

                const mail = await simpleParser(rawBodyPart.body);
                
                // Rechercher des pièces jointes PDF ou HTML
                const pdfAttachment = mail.attachments.find(a => 
                    (a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')) &&
                    (isSumUp ? (a.filename?.toLowerCase().includes('payments-report') || a.filename?.toLowerCase().includes('payout')) : true)
                );

                let fileBuffer: Buffer | null = null;
                let fileExt = "";
                let contentType = "";
                let textToParse = "";

                if (pdfAttachment) {
                    fileBuffer = pdfAttachment.content;
                    fileExt = "pdf";
                    contentType = "application/pdf";
                    try {
                        const parsed = await pdfParse(fileBuffer);
                        textToParse = parsed.text;
                    } catch {
                        textToParse = mail.text || "";
                    }
                } else if (mail.html) {
                    fileBuffer = Buffer.from(mail.html, 'utf-8');
                    fileExt = "html";
                    contentType = "text/html";
                    textToParse = mail.text || mail.html.replace(/<[^>]*>?/gm, ' ');
                } else if (mail.text) {
                    fileBuffer = Buffer.from(mail.text, 'utf-8');
                    fileExt = "txt";
                    contentType = "text/plain";
                    textToParse = mail.text;
                }

                if (!fileBuffer || !textToParse) {
                    continue;
                }

                // Filtrer les simples notifications d'e-mails (facture disponible, etc.) pour accès manuel
                if ((fileExt === "html" || fileExt === "txt") && !isSumUp) {
                    if (isInvoiceNotificationOnly(textToParse, mail.subject || '')) {
                        const cleanSubject = cleanProviderName(mail.subject || 'NOTIF');
                        const notifFilename = `${dateStr} - NOTIFICATION - ${cleanSubject}.${fileExt}`;
                        fs.writeFileSync(path.join(manualFolder, notifFilename), fileBuffer);
                        console.log(`      💾 [NOTIFICATION] Enregistré dans le dossier 'A Telecharger Manuellement' : ${notifFilename}`);
                        continue;
                    }
                }

                // Extraction des données (SumUp spécifique vs Invoices génériques)
                if (isSumUp) {
                    const patients: PatientTx[] = [];
                    const mainPart = textToParse.split(/À verser|A verser/i)[0];
                    const lines = mainPart.split('\n').map(l => l.trim()).filter(Boolean);
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.includes('1 x ')) {
                            const after = line.split('1 x ')[1].trim();
                            if (after.includes('€')) {
                                const parts = after.split('€');
                                const name = formatPatientName(parts[0]);
                                const amountStr = parts[1]?.match(/[0-9.,]+/)?.[0];
                                const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                                if (name && amount > 0) {
                                    patients.push({ name, amount });
                                }
                            } else {
                                let nameParts = [after];
                                let amount = 0;
                                let j = i + 1;
                                while (j < lines.length) {
                                    const nextLine = lines[j];
                                    if (nextLine.includes('1 x ') || nextLine.includes('Totaux:') || nextLine.includes('Total:')) {
                                        break;
                                    }
                                    if (nextLine.includes('€')) {
                                        const parts = nextLine.split('€');
                                        const amountStr = parts[1]?.match(/[0-9.,]+/)?.[0];
                                        amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                                        break;
                                    }
                                    nameParts.push(nextLine);
                                    j++;
                                }
                                const name = formatPatientName(nameParts.join(' '));
                                if (name && amount > 0) {
                                    patients.push({ name, amount });
                                }
                            }
                        }
                    }

                    let netAmount = 0.0;
                    const netMatch = textToParse.match(/(?:Versement effectué|Montant du versement|La somme transférée)[^\d€]*€\s*([0-9.,]+)/i);
                    if (netMatch) netAmount = parseFloat(netMatch[1].replace(',', '.'));
                    if (isNaN(netAmount) || netAmount === 0.0) {
                        const totauxMatch = textToParse.match(/Totaux:\s*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*=\s*€\s*([0-9.,]+)/);
                        if (totauxMatch) netAmount = parseFloat(totauxMatch[1].replace(',', '.'));
                    }

                    if (netAmount > 0 && patients.length > 0) {
                        const rawFilename = `${dateStr} - SUMUP_RAPPORT_DE_PAIEMENTS - ${netAmount.toFixed(2)}€.pdf`;
                        fs.writeFileSync(path.join(desktopFolder, rawFilename), fileBuffer);
                        console.log(`      💾 [SUMUP] Enregistré sur le Bureau : ${rawFilename}`);

                        // DB & Storage sync
                        const cleanKey = cleanStorageKey(rawFilename);
                        const { error: uploadError } = await supabase.storage.from('invoices').upload(cleanKey, fileBuffer, { contentType, upsert: true });

                        if (!uploadError) {
                            const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(cleanKey);
                            const fileUrl = urlData.publicUrl;

                            if (!existingInDb) {
                                await prisma.invoice.create({
                                    data: {
                                        provider: "SUMUP RAPPORT DE PAIEMENTS",
                                        amount: netAmount,
                                        currency: "EUR",
                                        date: date,
                                        fileUrl: fileUrl,
                                        status: "COMPLETED",
                                        type: "PRO"
                                    }
                                });
                            }

                            // Reconcile with transaction
                            const matchedTx = creditTxs.find((tx: any) => {
                                const txAmount = parseFloat(tx.amount || "0");
                                const amountDiff = Math.abs(txAmount - netAmount);
                                const txTime = new Date(tx.date).getTime();
                                const mailTime = date.getTime();
                                return amountDiff < 0.05 && Math.abs(txTime - mailTime) <= 4 * 24 * 60 * 60 * 1000;
                            });

                            if (matchedTx) {
                                const txId = String(matchedTx.id);
                                const descriptionValue = `SUMUP_JSON:${JSON.stringify(patients)}`;
                                await prisma.$executeRawUnsafe(
                                    'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                                    txId,
                                    descriptionValue
                                );
                                console.log(`         ✨ Détail des patients lié à la transaction ${txId}`);
                            }
                        }
                    }
                } else {
                    // Invoices génériques & PayPal
                    const aiData = await getAiExtraction(textToParse, mail.subject || '', mail.from?.text || '');
                    if (aiData && aiData.amount > 0) {
                        const cleanProvider = cleanProviderName(aiData.provider);
                        const rawFilename = `${dateStr} - ${cleanProvider} - ${aiData.amount.toFixed(2)}€.${fileExt}`;
                        
                        fs.writeFileSync(path.join(desktopFolder, rawFilename), fileBuffer);
                        console.log(`      💾 [FACTURE] Enregistré sur le Bureau : ${rawFilename}`);

                        // DB & Storage sync
                        const cleanKey = cleanStorageKey(rawFilename);
                        const { error: uploadError } = await supabase.storage.from('invoices').upload(cleanKey, fileBuffer, { contentType, upsert: true });

                        if (!uploadError) {
                            const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(cleanKey);
                            const fileUrl = urlData.publicUrl;

                            // Vérifier si cette facture générique existe déjà en DB
                            const existingInvoice = await prisma.invoice.findFirst({
                                where: {
                                    provider: aiData.provider,
                                    amount: aiData.amount,
                                    date: {
                                        gte: new Date(date.getTime() - 2 * 24 * 60 * 60 * 1000),
                                        lte: new Date(date.getTime() + 2 * 24 * 60 * 60 * 1000)
                                    }
                                }
                            });

                            if (!existingInvoice) {
                                await prisma.invoice.create({
                                    data: {
                                        provider: aiData.provider,
                                        amount: aiData.amount,
                                        currency: "EUR",
                                        date: date,
                                        fileUrl: fileUrl,
                                        status: "COMPLETED",
                                        type: "PRO"
                                    }
                                });
                                console.log(`         ✅ Facture enregistrée en base de données.`);
                            }
                        }
                    }
                }
            }
        }
    }

    connection.end();
}

async function main() {
    console.log("🚀 Lancement de la synchronisation globale des pièces justificatives...");
    
    // Config iCloud
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

    // Config Gmail
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

    const sinceDate = '01-Jan-2025';

    // Traiter iCloud
    await processEmailAccount('iCloud', ICLOUD_CONFIG, sinceDate);

    // Traiter Gmail
    await processEmailAccount('Gmail', GMAIL_CONFIG, sinceDate);

    console.log("\n🏁 Synchronisation terminée ! Tous les fichiers sont sur votre Bureau dans 'Factures Bureau'.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
