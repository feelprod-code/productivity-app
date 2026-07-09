import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type || "application/pdf";
        const filename = file.name || "document.pdf";

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "GEMINI_API_KEY manquante" }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `Tu es un expert comptable AI. Analyse ce document de facture ou reçu.
Extrais les informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: AMAZON, APPLE, CANVA, UBER, GANDI, CARPIMKO, URSSAF, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 121.00),
  "recipient_name": "Le nom du destinataire facturé (ex: Guillaume Philippe, Sabrina Kanouche, Anita, Kacha)",
  "description": "Une description très courte et précise de l'achat en 2-4 mots en français (ex: Abonnement Canva Pro, Cotisation Kine, Deplacement Bolt, etc.)"
}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    inlineData: {
                        data: buffer.toString("base64"),
                        mimeType: mimeType
                    }
                },
                {
                    text: prompt
                }
            ],
            config: {
                safetySettings: [
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ] as any
            }
        });

        let rawText = response.text || "";
        if (!rawText && response.candidates?.[0]?.content?.parts?.[0]?.text) {
            rawText = response.candidates[0].content.parts[0].text;
        }

        const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const extractedData = JSON.parse(cleanedText);

        return NextResponse.json({
            success: true,
            filename,
            data: extractedData
        });

    } catch (error: any) {
        console.error("❌ [API Analyze Document] Erreur :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
