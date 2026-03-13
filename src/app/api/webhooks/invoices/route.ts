export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import * as cheerio from 'cheerio';

// Helper function to extract data from raw email text for Amazon
function extractInvoiceDataFromText(htmlText: string, currentProvider: string, currentAmount: number | null) {
    let provider = currentProvider;
    let amount = currentAmount;

    if (!htmlText) return { provider, amount };

    const textStr = typeof htmlText === 'string' ? htmlText.replace(/<[^>]*>?/gm, ' ') : JSON.stringify(htmlText);

    // Detect Amazon
    if (textStr.toLowerCase().includes('amazon') || provider.toLowerCase().includes('amazon')) {
        provider = 'Amazon Business';

        // Match standard Amazon EU amounts like "Montant total : 45,00 €" or "EUR 45.00"
        const amountRegex = /(?:Montant\s*total\s*[:\s]*|Total\s*[:\s]*|Total\D*)(?:EUR|€|)?\s*(\d+[.,]\d{2})/i;
        const fallbackRegex = /(?:EUR|€)\s*(\d+[.,]\d{2})/;

        let match = textStr.match(amountRegex);
        if (!match) match = textStr.match(fallbackRegex);

        if (match && match[1]) {
            const parsed = parseFloat(match[1].replace(',', '.'));
            if (!isNaN(parsed) && (!amount || amount === 0)) {
                amount = parsed;
            }
        }
    }

    return { provider, amount };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        console.log('Received payload from Zapier:', body);
        require('fs').writeFileSync('/tmp/zapier_last_payload.json', JSON.stringify(body, null, 2));

        // Expected payload fields from Zapier (with editor fallbacks):
        let invoiceDateRaw = body.date || body.dd_1;
        let provider = body.provider || body.ppp || 'Inconnu (à classer)';
        let subject = body.subject || body.ss_1 || '';

        const rawBodyText = body.body_plain || body.body_html || JSON.stringify(body);
        const lowerSubject = subject.toLowerCase();
        const lowerBody = rawBodyText.toLowerCase();

        // 1. FILTRE ANTI-SPAM APPLE (Abonnements, pubs)
        if (provider.toLowerCase().includes('apple') || lowerBody.includes('apple')) {
            const isInvoiceOrReceipt = lowerSubject.includes('facture') || lowerSubject.includes('reçu') || lowerBody.includes('facture') || lowerBody.includes('reçu');
            const isSpam = lowerSubject.includes('abonnement') || lowerSubject.includes('renouvellement') || lowerSubject.includes('découvrez');

            if (!isInvoiceOrReceipt || isSpam) {
                console.log('Facture ignorée : Détection d\'une fausse facture Apple ou d\'un abonnement pub.');
                return NextResponse.json({ success: true, message: 'Bypassed: Not a real invoice', id: 'bypassed' });
            }
        }

        // CHECK FOR FWD ICLOUD METADATA
        const fwdDateMatch = rawBodyText.match(/Original-Date:\s*([^\n]+)/i);
        if (fwdDateMatch && fwdDateMatch[1]) {
            invoiceDateRaw = fwdDateMatch[1].trim();
        }

        const fwdFromMatch = rawBodyText.match(/Original-From:\s*([^\n]+)/i);
        if (fwdFromMatch && fwdFromMatch[1]) {
            let fromStr = fwdFromMatch[1].trim().toLowerCase();
            // Try to map raw from string string to standard providers
            if (fromStr.includes('apple')) provider = 'Apple';
            else if (fromStr.includes('paypal')) provider = 'PayPal';
            else if (fromStr.includes('sumup')) provider = 'SumUp';
            else if (fromStr.includes('amazon')) provider = 'Amazon';
            else if (fromStr.includes('pennylane')) provider = 'Pennylane';
            else if (fromStr.includes('soundcloud')) provider = 'Soundcloud';
            else if (fromStr.includes('doctolib')) provider = 'Doctolib';
            else if (fromStr.includes('viasana')) provider = 'Via Sana';
            else if (fromStr.includes('canva')) provider = 'Canva';
            else if (fromStr.includes('bouygues')) provider = 'Bouygues Telecom';
            else if (fromStr.includes('free')) provider = 'Freebox';
            else if (fromStr.includes('gandi')) provider = 'Gandi';
            else if (fromStr.includes('volkswagen') || fromStr.includes('vwfs')) provider = 'Volkswagen FS';
            else if (fromStr.includes('ausha')) provider = 'Ausha';
            else if (fromStr.includes('indigo')) provider = 'Indigo Neo';
            else if (fromStr.includes('chargemap')) provider = 'Chargemap';
        }

        let invoiceAmountRaw = body.amount ?? body.aa_3;
        let invoiceAmount = invoiceAmountRaw ? parseFloat(invoiceAmountRaw) : null;

        let fileUrl = body.fileUrl || body.fif_2 || '';

        // Advanced Extraction from raw email body provided by Zapier
        const extracted = extractInvoiceDataFromText(rawBodyText, provider, invoiceAmount);
        provider = extracted.provider;
        invoiceAmount = extracted.amount;

        // 2. Safely try to fetch and upload the file to Supabase if Zapier sent a URL
        if (fileUrl) {
            try {
                // If Zapier sends multiple attachments comma-separated, take the first one
                const firstUrl = fileUrl.split(',')[0].trim();

                console.log(`Downloading attachment from Zapier: ${firstUrl}`);
                const response = await fetch(firstUrl);

                if (response.ok) {
                    const blob = await response.blob();
                    // Basic check to guess extension (default to pdf)
                    const fileExt = firstUrl.split('.').pop()?.split('?')[0] || 'pdf';
                    const safeExt = fileExt.length > 5 ? 'pdf' : fileExt; // prevent weird query params

                    const safeProvider = provider.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileName = `${safeProvider}_${randomUUID()}.${safeExt}`;

                    console.log(`Uploading ${fileName} to Supabase Storage (invoices bucket)...`);
                    const { data, error } = await supabase.storage
                        .from('invoices')
                        .upload(fileName, blob, {
                            contentType: response.headers.get('content-type') || 'application/pdf',
                            upsert: false
                        });

                    if (error) {
                        console.error('Supabase Storage upload error:', error);
                    } else if (data) {
                        // Generate the public URL to store in the database
                        const { data: publicUrlData } = supabase.storage
                            .from('invoices')
                            .getPublicUrl(data.path);

                        fileUrl = publicUrlData.publicUrl;
                        console.log(`File successfully uploaded and stored: ${fileUrl}`);
                    }
                } else {
                    console.error(`Failed to fetch attachment. Status: ${response.status}`);
                }
            } catch (err) {
                console.error('Error during file fetch/upload process:', err);
            }
        }
        // 3. GENERATION D'UNE FACTURE HTML (Pour PayPal, ou s'il manque une PJ mais qu'on a le HTML)
        else if (body.body_html && provider !== 'Bouygues Telecom') {
            try {
                console.log(`No attachment found. Generating HTML invoice for ${provider}...`);
                const safeProvider = provider.replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `${safeProvider}_${randomUUID()}.html`;

                const blob = new Blob([body.body_html], { type: 'text/html' });

                const { data, error } = await supabase.storage
                    .from('invoices')
                    .upload(fileName, blob, {
                        contentType: 'text/html',
                        upsert: false
                    });

                if (error) {
                    console.error('Supabase Storage upload HTML error:', error);
                } else if (data) {
                    const { data: publicUrlData } = supabase.storage
                        .from('invoices')
                        .getPublicUrl(data.path);

                    fileUrl = publicUrlData.publicUrl;
                    console.log(`HTML File successfully uploaded and stored: ${fileUrl}`);
                }
            } catch (err) {
                console.error('Error during HTML generation process:', err);
            }
        }

        // Parse Date safely
        let invoiceDate = new Date(); // Initialize with current date as fallback
        if (invoiceDateRaw) {
            const parsedDate = new Date(invoiceDateRaw);
            if (!isNaN(parsedDate.getTime())) {
                invoiceDate = parsedDate;
            }
        }

        // Insert into Database
        const invoice = await prisma.invoice.create({
            data: {
                provider,
                amount: invoiceAmount,
                date: invoiceDate,
                fileUrl,
                status: 'PENDING',
            },
        });

        console.log('Successfully created invoice:', invoice.id);

        return NextResponse.json({
            success: true,
            message: 'Invoice received and stored successfully',
            id: invoice.id
        });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
