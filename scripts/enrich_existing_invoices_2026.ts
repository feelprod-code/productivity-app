import { PrismaClient } from '@prisma/client';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Charger le fichier .env local de l'application
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const openrouterKey = process.env.OPENROUTER_API_KEY;

if (!openrouterKey) {
    console.error("❌ ERREUR: OPENROUTER_API_KEY n'est pas défini dans .env");
    process.exit(1);
}

async function extractEnrichedProvider(pdfText: string, currentProvider: string): Promise<string | null> {
    try {
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
                        content: `Tu es un expert comptable. Analyse le texte extrait de cette facture et retourne le nom enrichi du fournisseur contenant la description courte du produit ou du service acheté.

Le format retourné doit être strictement un JSON comme suit :
{
  "enriched_provider": "NomFournisseur - DescriptionCourteProduit"
}

Exemples attendus :
- Pour un achat Amazon d'un objectif photo : "AMAZON - Objectif Sony 24-70mm"
- Pour un nom de domaine chez Gandi : "GANDI - feelprod.com"
- Pour un abonnement Canva : "CANVA - Abonnement Pro Mensuel"
- Pour tout autre fournisseur, fais de même en extrayant le produit ou service principal de la facture.

Voici les informations actuelles :
Fournisseur actuel : ${currentProvider}

Texte de la facture :
---
${pdfText.substring(0, 8000)}
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
        if (!contentText) return null;

        const parsed = JSON.parse(contentText);
        return parsed.enriched_provider || null;
    } catch (e) {
        console.error(`❌ Erreur d'analyse IA pour le fournisseur ${currentProvider} :`, e);
        return null;
    }
}

async function main() {
    console.log("🔍 Récupération des factures de 2026 déjà présentes en base locale...");

    // Chercher les factures de l'année 2026
    const invoices = await prisma.invoice.findMany({
        where: {
            date: {
                gte: new Date('2026-01-01T00:00:00Z'),
                lte: new Date('2026-12-31T23:59:59Z')
            }
        },
        orderBy: {
            date: 'asc'
        }
    });

    console.log(`🔍 ${invoices.length} facture(s) de 2026 trouvée(s) en base locale.`);

    let updatedCount = 0;

    for (const inv of invoices) {
        // Si le fournisseur contient déjà un tiret "-", on considère qu'il a déjà été enrichi
        if (inv.provider.includes(' - ') || inv.provider.includes(' -')) {
            console.log(`⏭️ Facture ${inv.id} (${inv.provider}) déjà enrichie. Passée.`);
            continue;
        }

        console.log(`\n📄 Traitement de la facture : ${inv.provider} (${inv.amount} €) du ${inv.date.toISOString().split('T')[0]}...`);
        console.log(`   Lien fichier : ${inv.fileUrl}`);

        try {
            // Télécharger le PDF depuis l'URL de Supabase
            const fileRes = await fetch(inv.fileUrl);
            if (!fileRes.ok) {
                console.error(`   ❌ Impossible de télécharger le fichier PDF : HTTP ${fileRes.status}`);
                continue;
            }

            const arrayBuffer = await fileRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Parser le PDF
            const parsedPdf = await pdfParse(buffer);
            const text = parsedPdf.text || "";

            if (!text.trim()) {
                console.log(`   ⏭️ PDF vide ou illisible en texte. Passé.`);
                continue;
            }

            // Extraire le fournisseur enrichi avec le produit
            const enriched = await extractEnrichedProvider(text, inv.provider);

            if (enriched && enriched !== inv.provider) {
                console.log(`   ✨ Fournisseur enrichi : "${inv.provider}" ➔ "${enriched}"`);
                
                // Mettre à jour dans la base locale Prisma
                await prisma.invoice.update({
                    where: { id: inv.id },
                    data: { provider: enriched.toUpperCase() }
                });

                console.log(`   ✅ Facture mise à jour avec succès dans la base locale.`);
                updatedCount++;
            } else {
                console.log(`   ⏭️ Aucun changement de fournisseur nécessaire.`);
            }

        } catch (err) {
            console.error(`   ❌ Erreur lors du traitement de la facture ${inv.id} :`, err);
        }
    }

    console.log(`\n🏁 Traitement terminé ! ${updatedCount} facture(s) de 2026 mise(s) à jour avec le détail des produits.`);
}

main().catch(console.error);
