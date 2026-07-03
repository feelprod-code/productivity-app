import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || "",
    defaultHeaders: {
        'HTTP-Referer': 'https://github.com/philippeguillaume/gravityclaw',
        'X-Title': 'Gravity Claw',
    },
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const invoiceId = formData.get("invoiceId") as string;
        const file = formData.get("file") as File;

        if (!invoiceId) {
            return NextResponse.json({ error: "L'identifiant de la facture (invoiceId) est requis." }, { status: 400 });
        }

        if (!file) {
            return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
        }

        // Vérifier que la facture existe dans la base de données
        const existingInvoice = await prisma.invoice.findUnique({
            where: { id: invoiceId }
        });

        if (!existingInvoice) {
            return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
        }

        // Conversion du fichier en Base64 / ArrayBuffer pour l'envoi à Supabase
        const buffer = await file.arrayBuffer();
        const array = new Uint8Array(buffer);
        const mimeType = file.type;

        // Préparation du nom de fichier propre sur Supabase
        const safeProvider = (existingInvoice.provider || "Inconnu").replace(/[^a-zA-Z0-9]/g, '_');
        const fileExt = file.name.split('.').pop() || 'pdf';
        const fileName = `${safeProvider}_repl_${randomUUID()}.${fileExt}`;

        // Upload du fichier sur Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: false
            });

        if (uploadError) {
            console.error('Supabase Storage upload error:', uploadError);
            return NextResponse.json({ error: "Erreur lors du téléversement du fichier sur le stockage Supabase." }, { status: 500 });
        }

        let fileUrl = "";
        if (uploadData) {
            const { data: publicUrlData } = supabase.storage
                .from('invoices')
                .getPublicUrl(uploadData.path);
            fileUrl = publicUrlData.publicUrl;
        }

        if (!fileUrl) {
            return NextResponse.json({ error: "Erreur lors de la génération de l'URL publique du fichier." }, { status: 500 });
        }

        // Extraction par IA pour mettre à jour le montant, la date, la devise et le fournisseur
        let extractedData: any = null;

        // 1. Tenter d'utiliser OpenRouter (plus robuste car la clé Gemini native est expirée)
        if (process.env.OPENROUTER_API_KEY) {
            try {
                console.log(`Calling OpenRouter (Gemini 2.5 Flash) to parse replaced invoice...`);
                let promptContent: any = "";

                if (mimeType === "application/pdf") {
                    try {
                        const parsedPdf = await pdfParse(Buffer.from(array));
                        const extractedText = parsedPdf.text || "";
                        console.log(`Extracted text from PDF (${extractedText.length} chars)`);
                        promptContent = `Texte extrait du document:\n---\n${extractedText.substring(0, 8000)}\n---`;
                    } catch (pdfErr) {
                        console.warn("Failed to parse PDF text, falling back to base64 image query:", pdfErr);
                    }
                }

                // Si ce n'est pas un PDF ou si l'extraction de texte a échoué/est vide, on envoie comme document visuel (si image)
                if (!promptContent) {
                    const base64Data = Buffer.from(array).toString("base64");
                    if (mimeType.startsWith("image/")) {
                        promptContent = [
                            {
                                type: "text",
                                text: "Voici l'image de la facture."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Data}`
                                }
                            }
                        ];
                    } else {
                        // fallback message if it's a PDF we couldn't parse text of
                        promptContent = `Fichier binaire reçu. Nom: ${file.name}, Type: ${mimeType}. Veuillez essayer d'en deviner le contenu à partir des métadonnées existantes.`;
                    }
                }

                const response = await openai.chat.completions.create({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                        {
                            role: 'system',
                            content: "Tu es un expert comptable AI (FinOps). Lis attentivement ce document (facture ou reçu) et extrais UNIQUEMENT les 4 informations suivantes au format JSON strict (sans ```json ni markdown). Si le fournisseur est Amazon (Amazon Business, Amazon.fr, AWS, etc.), extrais également le nom ou la description courte du ou des principaux produits achetés et retourne-le sous la forme 'Amazon - [Nom du Produit]' (ou 'Amazon Business - [Nom du Produit]') dans le champ provider."
                        },
                        {
                            role: 'user',
                            content: typeof promptContent === "string" 
                                ? `${promptContent}\n\nExtrais les informations sous ce format JSON :\n{\n  \"provider\": \"Le nom exact du fournisseur (ex: Vercel, Cloudflare, OpenRouter, Google, OpenAI, Modal, etc., ou Amazon - [Nom du Produit])\",\n  \"amount\": le montant numérique exact total,\n  \"currency\": \"EUR\" ou \"USD\",\n  \"date\": \"La date de la facture au format YYYY-MM-DD\"\n}`
                                : [
                                    ...promptContent,
                                    {
                                        type: "text",
                                        text: "Extrais les informations sous ce format JSON :\n{\n  \"provider\": \"Le nom exact du fournisseur (ex: Vercel, Cloudflare, OpenRouter, Google, OpenAI, Modal, etc., ou Amazon - [Nom du Produit])\",\n  \"amount\": le montant numérique exact total,\n  \"currency\": \"EUR\" ou \"USD\",\n  \"date\": \"La date de la facture au format YYYY-MM-DD\"\n}"
                                    }
                                ]
                        }
                    ],
                    temperature: 0,
                    response_format: { type: "json_object" }
                });

                const rawText = response.choices[0]?.message?.content || "{}";
                const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
                extractedData = JSON.parse(cleanedText);
                console.log(`Extracted metadata via OpenRouter:`, extractedData);
            } catch (openRouterError: any) {
                console.error("OpenRouter parsing error, falling back to native Gemini:", openRouterError.message);
            }
        }

        // 2. Fallback sur l'API native de Gemini (au cas où la clé native fonctionne ou a été mise à jour)
        if (!extractedData && process.env.GEMINI_API_KEY) {
            try {
                const base64Data = Buffer.from(array).toString("base64");
                console.log(`Calling native Gemini 1.5 Pro to parse replaced invoice...`);
                const response = await ai.models.generateContent({
                    model: "gemini-1.5-pro",
                    contents: [
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType,
                            },
                        },
                        {
                            text: `Tu es un expert comptable AI (FinOps). 
                            Lis attentivement ce document (facture ou reçu) et extrais UNIQUEMENT les 4 informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
                            {
                                "provider": "Le nom exact du fournisseur (ex: Vercel, Cloudflare, OpenRouter, Google, OpenAI, Modal, etc., ou Amazon - [Nom du Produit] si le document vient d'Amazon)",
                                "amount": le montant numérique exact total (ex: 20.00),
                                "currency": "La devise (EUR ou USD)",
                                "date": "La date de la facture au format YYYY-MM-DD"
                            }
                            Si le fournisseur est Amazon (Amazon Business, Amazon.fr, AWS, etc.), extrais également le nom ou la description courte du ou des principaux produits achetés et retourne-le sous la forme 'Amazon - [Nom du Produit]' (ou 'Amazon Business - [Nom du Produit]') dans le champ provider.
                            Si tu ne trouves pas l'info exacte, devine-la logiquement ou mets la date du jour.`
                        }
                    ],
                });

                const rawText = response.text || "{}";
                const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
                extractedData = JSON.parse(cleanedText);
                console.log(`Extracted metadata via Native Gemini:`, extractedData);
            } catch (nativeAiError: any) {
                console.error("Native Gemini parsing error, proceeding without metadata update:", nativeAiError.message);
            }
        }

        // Construction des données de mise à jour
        const updateData: any = {
            fileUrl: fileUrl,
            status: "PAID", // La facture est maintenant validée et payée
        };

        if (extractedData) {
            if (extractedData.amount !== undefined && extractedData.amount !== null) {
                const parsedAmount = parseFloat(extractedData.amount);
                if (!isNaN(parsedAmount)) {
                    updateData.amount = parsedAmount;
                }
            }
            if (extractedData.currency) {
                updateData.currency = extractedData.currency === "USD" ? "USD" : "EUR";
            }
            if (extractedData.date) {
                const parsedDate = new Date(extractedData.date);
                if (!isNaN(parsedDate.getTime())) {
                    updateData.date = parsedDate;
                }
            }
            // Mettre à jour le fournisseur si l'ancien fournisseur est inconnu ou à classer, ou si Gemini en trouve un valide
            const currentProvider = existingInvoice.provider || "";
            const isUnknownProvider = currentProvider.toLowerCase().includes("inconnu") || currentProvider === "";
            if (extractedData.provider && (isUnknownProvider || extractedData.provider.toLowerCase() !== "inconnu")) {
                updateData.provider = extractedData.provider;
            }
        }

        // Mise à jour de la facture en base de données
        const updatedInvoice = await prisma.invoice.update({
            where: { id: invoiceId },
            data: updateData
        });

        console.log(`Facture ${invoiceId} mise à jour avec succès : nouveau PDF (${fileUrl}), statut PAID, metadata:`, updateData);

        return NextResponse.json({ success: true, data: updatedInvoice });

    } catch (error) {
        console.error("Replace Invoice API Error:", error);
        return NextResponse.json({ error: "Erreur interne du serveur lors de la mise à jour." }, { status: 500 });
    }
}
