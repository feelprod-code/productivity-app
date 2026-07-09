import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const INPUT_DIR = "/Users/guillaumephilippe/Desktop/factures_a_traiter";
const OUTPUT_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";
const isDryRun = !process.argv.includes('--run');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MONTH_MAP: Record<string, string> = {
  '01': '01 - Janvier',
  '02': '02 - Février',
  '03': '03 - Mars',
  '04': '04 - Avril',
  '05': '05 - Mai',
  '06': '06 - Juin',
  '07': '07 - Juillet',
  '08': '08 - Août',
  '09': '09 - Septembre',
  '10': '10 - Octobre',
  '11': '11 - Novembre',
  '12': '12 - Décembre'
};

const TECH_SUPPLIERS = [
  "GOOGLE", "VERCEL", "SUPABASE", "CLOUDFLARE", "OPENAI", "OPENROUTER", "GITHUB", 
  "STRIPE", "CANVA", "SUNO", "HEADLINER", "KROTOS", "PADDLE", "ADOBE", "FREE", "GANDI"
];

const TRAVEL_SUPPLIERS = [
  "HALLES", "RESTAURANT", "BISTRO", "CAFE", "BRASSERIE", "PEAGE", "INDIGO", 
  "TOTAL", "SEBASTOPOL", "SNCF", "UBER", "NAVIGO", "PARKING"
];

const TIERS_NAMES = ["sabrina", "kanouche", "anita", "kacha"];

async function analyzeInvoiceWithGemini(fileBuffer: Buffer, filename: string): Promise<any> {
  let attempts = 0;
  while (attempts < 5) {
    try {
      console.log(`🧠 [Gemini] Analyse du document ${filename} (${fileBuffer.length} octets)...`);
      const base64Data = fileBuffer.toString('base64');
      const prompt = `Tu es un expert comptable AI. Analyse ce document de facture.
Extrais les informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: AMAZON, APPLE, CANVA, UBER, GANDI, CARPIMKO, URSSAF, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 121.00),
  "recipient_name": "Le nom du destinataire facturé (ex: Guillaume Philippe, Sabrina Kanouche, Anita, Kacha, Philippe Guillaume)",
  "description": "Une description très courte et précise du produit acheté en 2-4 mots en français (ex: Coque MacBook Air, Cordon USB-C, Support Micro, Pantalon Snowboard, etc.)"
}`;

      let mimeType = "application/pdf";
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') mimeType = "image/jpeg";
      else if (ext === '.png') mimeType = "image/png";
      else if (ext === '.html') mimeType = "text/html";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType
            }
          },
          { text: prompt }
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

      let rawText = "{}";
      try {
        rawText = response.text || "{}";
      } catch (err: any) {
        const candidate = response.candidates?.[0];
        const partText = candidate?.content?.parts?.[0]?.text;
        if (partText) {
          rawText = partText;
        } else {
          return null;
        }
      }

      const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(cleanedText);
    } catch (e: any) {
      const errStr = e.message || "";
      if (errStr.includes('429') || errStr.includes('Quota') || e.status === 429) {
        attempts++;
        const delay = Math.pow(2, attempts) * 2000;
        console.warn(`⚠️ Rate limit (429) de l'API Gemini pour ${filename}. Réessai dans ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error(`❌ Erreur Gemini pour ${filename} :`, e.message);
      return null;
    }
  }
  return null;
}

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlever les accents
    .replace(/[^a-zA-Z0-9 ]/g, '') // Enlever caractères spéciaux
    .replace(/\s+/g, '_') // Remplacer espaces par underscores
    .trim()
    .toUpperCase();
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file.startsWith('.')) continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(await getFilesRecursively(filePath));
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.html') {
        results.push(filePath);
      }
    }
  }
  return results;
}

async function main() {
  console.log(`🚀 Démarrage du script de renommage IA des factures transitoires...`);
  console.log(`📂 Dossier source (Bureau) : ${INPUT_DIR}`);
  console.log(`📂 Dossier destination (Compta) : ${OUTPUT_DIR}`);
  console.log(`ℹ️ Mode : ${isDryRun ? 'DRY-RUN (Simulation, aucun fichier modifié)' : 'RÉEL (Fichiers déplacés sur le disque, utilisez --run)'}`);

  if (!fs.existsSync(INPUT_DIR)) {
    console.log(`ℹ️ Création du dossier transitoire sur le Bureau : ${INPUT_DIR}`);
    fs.mkdirSync(INPUT_DIR, { recursive: true });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Clé d'API GEMINI_API_KEY manquante dans le fichier .env");
    return;
  }

  const files = await getFilesRecursively(INPUT_DIR);
  console.log(`🔍 ${files.length} fichiers trouvés dans le dossier transitoire.`);
  if (files.length === 0) {
    console.log("🏁 Aucun fichier à traiter. Fin du script.");
    return;
  }

  let processedCount = 0;
  let renamedCount = 0;
  let rejectedCount = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);
    console.log(`\n📝 Traitement : ${filename}`);
    processedCount++;

    try {
      const buffer = fs.readFileSync(filePath);
      const info = await analyzeInvoiceWithGemini(buffer, filename);
      if (!info) {
        console.log(`❌ Impossible d'extraire les données pour ${filename}`);
        continue;
      }

      const rawDesc = info.description || "";
      const description = sanitizeName(rawDesc);

      let rawSupplier = info.supplier_name || "INCONNU";
      // Si le fournisseur est Amazon Digital France mais qu'il ne s'agit pas de vidéo, on le ramène à AMAZON
      if (rawSupplier.toUpperCase().includes("AMAZON DIGITAL") && 
          !description.includes("VIDEO") && !description.includes("ADN") && !description.includes("STREAMING")) {
        rawSupplier = "AMAZON";
      }
      const supplier = sanitizeName(rawSupplier);
      
      const rawDate = info.invoice_date || "";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "1970-01-01";
      const [year, month] = date.split('-');

      const amount = typeof info.amount === 'number' ? info.amount : 0.00;
      const recipient = (info.recipient_name || "").toLowerCase();
      


      // Validation destinataire pro
      const isProRecipient = recipient.includes("guillaume philippe") || 
                             recipient.includes("philippe guillaume");
                             
      const isTiers = TIERS_NAMES.some(name => recipient.includes(name));

      let isException = false;
      if (!isProRecipient && !isTiers) {
        const matchesTech = TECH_SUPPLIERS.some(sup => supplier.includes(sup));
        const matchesTravel = TRAVEL_SUPPLIERS.some(sup => supplier.includes(sup));
        
        if (matchesTech) {
          isException = true;
        } else if (matchesTravel && amount < 150) {
          isException = true;
        }
      }

      const isPro = (isProRecipient || isException) && !isTiers;

      let targetSubDir = "";
      let newFilename = "";
      const ext = path.extname(filename).toLowerCase();

      // Bloc central SUPPLIER_DESCRIPTION
      let middleBlock = supplier;
      if (description && description !== "ACHAT" && description !== "FACTURE") {
        middleBlock = `${supplier}_${description}`;
      }

      if (isPro && date !== "1970-01-01" && (year === '2025' || year === '2026')) {
        const monthFolder = MONTH_MAP[month] || month;
        // Normaliser NFC pour le chemin de destination
        const nfcMonthFolder = monthFolder.normalize('NFC');
        targetSubDir = path.join(OUTPUT_DIR, `Factures ${year}`, nfcMonthFolder);
        newFilename = `${date} - ${middleBlock} - ${amount.toFixed(2)}€${ext}`;
      } else {
        targetSubDir = path.join(OUTPUT_DIR, 'REJETE');
        let rejectReason = "REJETE_TIERS";
        if (date === "1970-01-01" || (year !== '2025' && year !== '2026')) {
          rejectReason = "ERREUR_DATE";
        }
        const cleanRecipient = sanitizeName(info.recipient_name || "TIERS");
        newFilename = `${rejectReason} - ${cleanRecipient} - ${date} - ${middleBlock} - ${amount.toFixed(2)}€${ext}`;
        rejectedCount++;
      }

      const newFilePath = path.join(targetSubDir, newFilename);
      console.log(`✨ Proposition : "${filename}" -> "${newFilename}" (dans ${path.relative(OUTPUT_DIR, targetSubDir)})`);

      if (!isDryRun) {
        if (!fs.existsSync(targetSubDir)) {
          fs.mkdirSync(targetSubDir, { recursive: true });
        }
        
        let finalPath = newFilePath;
        let counter = 1;
        const baseName = newFilename.replace(new RegExp(`${ext}$`), '');
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(targetSubDir, `${baseName}_(${counter})${ext}`);
          counter++;
        }

        // Déplacer le fichier d'origine
        fs.renameSync(filePath, finalPath);
        console.log(`💾 Fichier traité et déplacé avec succès !`);
      } else {
        console.log(`🧪 [DRY-RUN] Le fichier serait déplacé et renommé en : ${path.relative(OUTPUT_DIR, newFilePath)}`);
      }
      renamedCount++;
    } catch (err: any) {
      console.error(`❌ Erreur traitement ${filename} :`, err.message);
    }
  }

  console.log(`\n🏁 Traitement terminé !`);
  console.log(`📊 Bilan :`);
  console.log(`- Factures traitées : ${processedCount}`);
  console.log(`- Factures renommées et classées dans Compta : ${isDryRun ? 0 : renamedCount - rejectedCount}`);
  console.log(`- Factures rejetées (déplacées dans REJETE) : ${isDryRun ? 0 : rejectedCount}`);
}

main().catch(console.error);
