import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { randomUUID } from "crypto";

// Initialisation du client Gemini de la même façon que dans Thérapeute App
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
        }

        // Conversion du fichier en Base64 pour l'envoi à l'API Gemini
        const buffer = await file.arrayBuffer();
        const array = new Uint8Array(buffer);
        const base64Data = Buffer.from(array).toString("base64");
        const mimeType = file.type;

        // Appel à Gemini 1.5 Pro pour analyser l'image/le PDF
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
                        "provider": "Le nom exact du fournisseur (ex: Vercel, Cloudflare, OpenRouter, Google, OpenAI, Modal, etc.)",
                        "amount": le montant numérique exact total (ex: 20.00),
                        "currency": "La devise (EUR ou USD)",
                        "date": "La date de la facture au format YYYY-MM-DD"
                    }
                    Si tu ne trouves pas l'info exacte, devine-la logiquement ou mets la date du jour.`
                }
            ],
        });

        const rawText = response.text || "{}";
        // Sécurité pour nettoyer les éventuels balises markdown que l'IA pourrait renvoyer malgré la consigne
        let extractedData;
        try {
            const cleanedText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            extractedData = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Erreur de parsing JSON de Gemini :", rawText);
            return NextResponse.json({ error: "Erreur lors de la lecture des données de la facture." }, { status: 500 });
        }

        // Upload du fichier sur Supabase Storage
        const safeProvider = (extractedData.provider || "Inconnu").replace(/[^a-zA-Z0-9]/g, '_');
        const fileExt = file.name.split('.').pop() || 'pdf';
        const fileName = `${safeProvider}_${randomUUID()}.${fileExt}`;
        let fileUrl = file.name;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: false
            });

        if (!uploadError && uploadData) {
            const { data: publicUrlData } = supabase.storage
                .from('invoices')
                .getPublicUrl(uploadData.path);
            fileUrl = publicUrlData.publicUrl;
        } else {
            console.error('Supabase Storage upload error:', uploadError);
        }

        // Création de la facture en BDD via Prisma
        const newInvoice = await prisma.invoice.create({
            data: {
                provider: extractedData.provider || "Inconnu",
                amount: parseFloat(extractedData.amount) || 0,
                currency: extractedData.currency === "USD" ? "USD" : "EUR",
                date: new Date(extractedData.date || new Date()),
                fileUrl: fileUrl,
                status: "PAID",
            }
        });

        return NextResponse.json({ success: true, data: newInvoice });

    } catch (error) {
        console.error("Parse Invoice Error:", error);
        return NextResponse.json({ error: "Erreur interne du serveur lors de l'analyse." }, { status: 500 });
    }
}
