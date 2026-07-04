import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Charger le fichier .env local de l'application
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const openrouterKey = process.env.OPENROUTER_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!openrouterKey) {
    console.error("❌ ERREUR: OPENROUTER_API_KEY n'est pas défini dans .env");
    process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERREUR: Identifiants Supabase (URL ou Service Role Key) manquants dans .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Modèle pour l'extraction
interface InvoiceData {
    provider: string;
    invoice_number: string;
    invoice_date: string; // YYYY-MM-DD
    amount_ttc: number;
    amount_ht: number;
    amount_tva: number;
    is_2026_invoice: boolean;
}

async function extractInvoiceData(pdfText: string, filename: string): Promise<InvoiceData | null> {
    try {
        console.log(`🧠 Analyse IA du PDF via OpenRouter (Gemini) pour ${filename}...`);
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openrouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "user",
                        content: `Tu es un expert comptable. Analyse le texte extrait de cette facture et renvoie les informations financières demandées sous forme de JSON structuré.

JSON attendu :
{
  "provider": "Le nom exact du fournisseur (ex: GANDI, AMAZON, etc.)",
  "invoice_number": "Le numéro de facture",
  "invoice_date": "La date d'émission au format YYYY-MM-DD",
  "amount_ttc": 12.34 (nombre décimal, total payé TTC),
  "amount_ht": 10.00 (nombre décimal, total Hors Taxes),
  "amount_tva": 2.34 (nombre décimal, montant de la TVA),
  "is_2026_invoice": true/false (indique si l'année de facturation est bien 2026)
}

Texte de la facture :
---
${pdfText}
---`
                    }
                ]
            })
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`OpenRouter HTTP ${response.status} : ${errTxt}`);
        }

        const data = await response.json();
        const contentText = data.choices?.[0]?.message?.content;
        
        if (!contentText) {
            console.error("❌ Pas de contenu retourné par OpenRouter.");
            return null;
        }

        return JSON.parse(contentText) as InvoiceData;
    } catch (e) {
        console.error("❌ Erreur lors de l'extraction par OpenRouter :", e);
        return null;
    }
}

async function uploadFileToSupabase(filePath: string, filename: string, provider: string): Promise<string | null> {
    console.log(`📤 Téléversement de ${filename} sur Supabase Storage...`);
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const cleanProvider = provider.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const fileNameInBucket = `historic/${cleanProvider}_${crypto.randomUUID()}.pdf`;

        const { error: uploadError } = await supabase.storage.from('invoices').upload(fileNameInBucket, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

        if (uploadError) {
            throw new Error(`Supabase upload error: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileNameInBucket);
        console.log(`   ✅ Lien public : ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;
    } catch (err) {
        console.error("❌ Erreur de téléversement Supabase :", err);
        return null;
    }
}

async function checkInvoiceExistsLocally(provider: string, amount: number, date: Date): Promise<boolean> {
    try {
        // Tolérance de 2 jours sur la date
        const dateMin = new Date(date.getTime() - 24 * 60 * 60 * 1000 * 2);
        const dateMax = new Date(date.getTime() + 24 * 60 * 60 * 1000 * 2);

        const existing = await prisma.invoice.findFirst({
            where: {
                provider: {
                    equals: provider,
                    mode: 'insensitive'
                },
                amount: amount,
                date: {
                    gte: dateMin,
                    lte: dateMax
                }
            }
        });
        return !!existing;
    } catch (err) {
        console.error("⚠️ Erreur lors de la vérification locale de doublon :", err);
        return false;
    }
}

async function main() {
    const desktopPath = path.resolve('/Users/philippeguillaume/Desktop');
    console.log(`📂 Scan du Bureau : ${desktopPath}...`);

    if (!fs.existsSync(desktopPath)) {
        console.error(`❌ Le Bureau n'existe pas.`);
        process.exit(1);
    }

    const files = fs.readdirSync(desktopPath);
    // Filtrer les fichiers PDF
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`🔍 ${pdfFiles.length} fichier(s) PDF détecté(s) sur le Bureau.`);

    if (pdfFiles.length === 0) {
        console.log("👉 Place tes factures au format PDF sur ton Bureau.");
        return;
    }

    let processedCount = 0;

    for (const file of pdfFiles) {
        const filePath = path.join(desktopPath, file);
        console.log(`\n📄 Traitement du fichier : ${file}...`);

        try {
            const fileBuffer = fs.readFileSync(filePath);
            const parsedPdf = await pdfParse(fileBuffer);
            const text = parsedPdf.text || "";

            const info = await extractInvoiceData(text, file);
            if (!info) {
                console.log(`⏭️ Impossible d'extraire les données de la facture. Fichier ignoré.`);
                continue;
            }

            if (!info.is_2026_invoice) {
                console.log(`⏭️ Facture hors 2026 (${info.invoice_date}). Fichier ignoré.`);
                continue;
            }

            console.log(`   - Fournisseur   : ${info.provider}`);
            console.log(`   - Numéro        : ${info.invoice_number}`);
            console.log(`   - Date          : ${info.invoice_date}`);
            console.log(`   - Montant TTC   : ${info.amount_ttc} €`);

            const invoiceDate = new Date(info.invoice_date);

            // Vérifier si elle existe déjà dans l'application
            const exists = await checkInvoiceExistsLocally(info.provider, info.amount_ttc, invoiceDate);
            if (exists) {
                console.log(`⏭️ La facture de ${info.provider} (${info.amount_ttc} €) existe déjà dans l'application. Fichier ignoré.`);
                continue;
            }

            // Téléverser sur Supabase Storage
            const publicUrl = await uploadFileToSupabase(filePath, file, info.provider);
            if (!publicUrl) {
                console.log(`⏭️ Échec du téléversement du fichier. Fichier ignoré.`);
                continue;
            }

            // Créer l'enregistrement local Prisma
            await prisma.invoice.create({
                data: {
                    provider: info.provider.toUpperCase(),
                    amount: info.amount_ttc,
                    currency: 'EUR',
                    date: invoiceDate,
                    fileUrl: publicUrl,
                    status: 'COMPLETED',
                    type: 'PRO' // Classé par défaut en PRO, l'utilisateur changera si nécessaire
                }
            });

            console.log(`🎉 Facture de ${info.provider} (${info.amount_ttc} €) ajoutée à l'application locale !`);
            processedCount++;

        } catch (err) {
            console.error(`❌ Erreur lors du traitement de ${file} :`, err);
        }
    }

    console.log(`\n🏁 Fin du traitement ! ${processedCount} facture(s) ajoutée(s) à l'application.`);
}

main().catch(console.error);
