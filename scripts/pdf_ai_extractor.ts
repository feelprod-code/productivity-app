import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const prisma = new PrismaClient();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function extractInfoWithAI(text: string, currentProvider: string): Promise<{ provider: string, amount: number | null }> {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Tu es un expert comptable spécialisé dans la lecture de reçus et factures. Tu dois extraire le montant total TTC final payé, ainsi que corriger le nom du fournisseur si nécessaire. Réponds uniquement en validant le schéma JSON demandé."
                },
                {
                    role: "user",
                    content: `Voici le texte brut extrait d'une facture. \nFournisseur actuel deviné : "${currentProvider}".\n\nTexte de la facture :\n---\n${text.substring(0, 4000)}\n---`
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
                            provider_name: {
                                type: "string",
                                description: "Le nom propre et exact de l'entreprise (ex: Apple, Gandi, Freebox, Doctolib, Google, PayPal...)"
                            },
                            total_amount_ttc: {
                                type: ["number", "null"],
                                description: "Le montant total TTC final facturé. Null si introuvable."
                            }
                        },
                        required: ["provider_name", "total_amount_ttc"],
                        additionalProperties: false
                    }
                }
            },
            temperature: 0,
        });

        const raw = response.choices[0].message.content;
        if (!raw) return { provider: currentProvider, amount: null };
        const data = JSON.parse(raw);
        return {
            provider: data.provider_name || currentProvider,
            amount: typeof data.total_amount_ttc === 'number' ? data.total_amount_ttc : null
        };
    } catch (e) {
        console.error('AI Extraction Error:', e);
        return { provider: currentProvider, amount: null };
    }
}

async function main() {
    console.log("Starting DB scan for 0€ or null invoices...");

    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { amount: null },
                { amount: 0 }
            ],
            fileUrl: {
                not: ""
            }
        }
    });

    console.log(`Found ${invoices.length} invoices to process.`);

    let updatedCount = 0;
    let failedCount = 0;

    for (const inv of invoices) {
        console.log(`\n---------------------------`);
        console.log(`Processing invoice ID: ${inv.id}`);
        console.log(`Current logic - Provider: ${inv.provider}, Date: ${inv.date.toISOString().split('T')[0]}, URL: ${inv.fileUrl}`);

        try {
            // 1. Download file
            const res = await fetch(inv.fileUrl);
            if (!res.ok) {
                console.error(`Failed to download PDF: ${res.statusText}`);
                failedCount++;
                continue;
            }

            const buffer = await res.arrayBuffer();
            const nodeBuffer = Buffer.from(buffer);

            // 2. Parse PDF or try to handle as HTML
            let textContent = "";
            const isPdf = inv.fileUrl.toLowerCase().includes('.pdf');
            if (isPdf || nodeBuffer.slice(0, 4).toString() === "%PDF") {
                console.log("File is PDF, parsing text...");
                try {
                    const parsed = await pdfParse(nodeBuffer);
                    textContent = parsed.text;
                    if (!textContent || textContent.trim().length < 10) {
                        console.log("PDF parsed but almost empty text. Falling back.");
                        textContent = nodeBuffer.toString('utf-8').replace(/<[^>]*>?/gm, ' ');
                    }
                } catch (err) {
                    console.log("PDF parsing failed (Invalid PDF/HTML masked as PDF), falling back to raw buffer:", String(err).substring(0, 50));
                    textContent = nodeBuffer.toString('utf-8').replace(/<[^>]*>?/gm, ' ');
                }
            } else {
                // Might be HTML injected by our python script mapping Zapier HTML bodies
                console.log("File is not PDF, parsing as plain text/HTML fallback...");
                textContent = nodeBuffer.toString('utf-8').replace(/<[^>]*>?/gm, ' ');
            }

            if (!textContent || textContent.trim().length === 0) {
                console.error("Could not extract any text from the file.");
                failedCount++;
                continue;
            }

            // 3. AI Extraction
            console.log("Requesting AI extraction...");
            const aiData = await extractInfoWithAI(textContent, inv.provider);
            console.log(`=> AI output: Provider = "${aiData.provider}", Amount = ${aiData.amount}€`);

            // 4. Update DB
            if (aiData.amount !== null && aiData.amount > 0) {
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: {
                        amount: aiData.amount,
                        provider: aiData.provider,
                        updatedAt: new Date()
                    }
                });
                console.log("✅ Database updated successfully.");
                updatedCount++;
            } else {
                console.log("❌ AI could not confidently detect a valid amount > 0. Skipping update.");
                // If it was "Inconnu (à classer)" and AI found a name but 0 amount, we could update the name at least...
                if (inv.provider === 'Inconnu (à classer)' && aiData.provider !== 'Inconnu (à classer)') {
                    await prisma.invoice.update({
                        where: { id: inv.id },
                        data: { provider: aiData.provider }
                    });
                    console.log(`-> Partially updated: set provider to ${aiData.provider}`);
                }
                failedCount++;
            }

        } catch (e) {
            console.error("Exception processing invoice:", e);
            failedCount++;
        }
    }

    console.log(`\n=============================`);
    console.log(`Extraction Complete.`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Failed/No clear prices: ${failedCount}`);
    console.log(`=============================`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
