import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";
const EXTRACTION_DIR = "/Users/guillaumephilippe/Desktop/pennylane extraction";
const TRIEE_DIR = "/Users/guillaumephilippe/Desktop/pennylane triee";

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

// Build cache maps from the already triee files
interface CachedFileInfo {
  targetFilename: string;
  year: string;
  month: string;
  isPro: boolean;
}

const sizeCacheMap = new Map<number, CachedFileInfo>();

function scanTrieeFolder(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanTrieeFolder(fullPath);
    } else if (entry.toLowerCase().endsWith('.pdf') || entry.toLowerCase().endsWith('.jpg') || entry.toLowerCase().endsWith('.html') || entry.toLowerCase().endsWith('.png') || entry.toLowerCase().endsWith('.jpeg')) {
      // Parse file name to extract info
      // Check if it is a pro invoice
      const isPro = !entry.startsWith('REJETE_TIERS') && !entry.startsWith('ERREUR_DATE');
      let year = '';
      let month = '';
      let targetFilename = entry;

      if (isPro) {
        // Filename format: YYYY-MM-DD - SUPPLIER_DESC - AMOUNT€.pdf
        const match = entry.match(/^(\d{4})-(\d{2})-\d{2}/);
        if (match) {
          year = match[1];
          month = match[2];
        }
      } else {
        // Rejete format: REJETE_TIERS - RECIPIENT - YYYY-MM-DD - SUPPLIER - AMOUNT€.pdf
        const match = entry.match(/(?:REJETE_TIERS|ERREUR_DATE) - [^-]+ - (\d{4})-(\d{2})-\d{2}/);
        if (match) {
          year = match[1];
          month = match[2];
        }
      }

      if (year && month) {
        sizeCacheMap.set(stat.size, {
          targetFilename,
          year,
          month,
          isPro
        });
      }
    }
  }
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

      // Set mimetype based on extension
      let mimeType = "application/pdf";
      if (filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg')) {
        mimeType = "image/jpeg";
      } else if (filename.toLowerCase().endsWith('.png')) {
        mimeType = "image/png";
      } else if (filename.toLowerCase().endsWith('.html')) {
        mimeType = "text/html";
      }

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

async function main() {
  console.log("🧹 1. Suppression des répertoires Factures 2023 et 2024...");
  const foldersToDelete = [
    path.join(COMPTA_DIR, "Factures 2023"),
    path.join(COMPTA_DIR, "Factures 2024"),
    path.join(COMPTA_DIR, "2023"),
    path.join(COMPTA_DIR, "2024")
  ];
  for (const f of foldersToDelete) {
    if (fs.existsSync(f)) {
      console.log(`❌ Suppression du dossier : ${f}`);
      fs.rmSync(f, { recursive: true, force: true });
    }
  }

  console.log("🧹 2. Purge des dossiers Factures 2025 et 2026...");
  const foldersToPurge = [
    path.join(COMPTA_DIR, "Factures 2025"),
    path.join(COMPTA_DIR, "Factures 2026")
  ];
  for (const f of foldersToPurge) {
    if (fs.existsSync(f)) {
      console.log(`❌ Purge du dossier : ${f}`);
      fs.rmSync(f, { recursive: true, force: true });
    }
    fs.mkdirSync(f, { recursive: true });
  }

  console.log("📦 3. Indexation de la base triée pour le cache de renommage...");
  scanTrieeFolder(TRIEE_DIR);
  console.log(`✅ ${sizeCacheMap.size} fichiers indexés dans le cache.`);

  if (!fs.existsSync(EXTRACTION_DIR)) {
    console.error(`❌ Le dossier d'extraction n'existe pas : ${EXTRACTION_DIR}`);
    return;
  }

  const rawFiles = fs.readdirSync(EXTRACTION_DIR).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.html';
  });

  console.log(`🔍 ${rawFiles.length} fichiers bruts trouvés dans le dossier d'extraction.`);

  const monthlyCounts: Record<string, Record<string, number>> = {
    '2025': {},
    '2026': {}
  };

  // Initialize monthly counts
  for (const year of ['2025', '2026']) {
    for (const monthKey of Object.keys(MONTH_MAP)) {
      const folderName = MONTH_MAP[monthKey];
      monthlyCounts[year][folderName] = 0;
    }
  }

  let copiedCount = 0;
  let ocrCalls = 0;

  for (const file of rawFiles) {
    const filePath = path.join(EXTRACTION_DIR, file);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    let info: CachedFileInfo | null = null;

    // Check size cache
    if (sizeCacheMap.has(fileSize)) {
      info = sizeCacheMap.get(fileSize)!;
    } else {
      // Call Gemini OCR if not in cache
      try {
        const buffer = fs.readFileSync(filePath);
        const ocrData = await analyzeInvoiceWithGemini(buffer, file);
        if (ocrData) {
          ocrCalls++;
          const rawSupplier = ocrData.supplier_name || "INCONNU";
          const supplier = sanitizeName(rawSupplier);
          
          const rawDate = ocrData.invoice_date || "";
          const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "1970-01-01";
          const [year, month] = date.split('-');

          const amount = typeof ocrData.amount === 'number' ? ocrData.amount : 0.00;
          const recipient = (ocrData.recipient_name || "").toLowerCase();
          
          const rawDesc = ocrData.description || "";
          const description = sanitizeName(rawDesc);

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

          let targetFilename = "";
          let middleBlock = supplier;
          if (description && description !== "ACHAT" && description !== "FACTURE") {
            middleBlock = `${supplier}_${description}`;
          }

          if (isPro && date !== "1970-01-01" && (year === '2025' || year === '2026')) {
            targetFilename = `${date} - ${middleBlock} - ${amount.toFixed(2)}€${path.extname(file).toLowerCase()}`;
          } else {
            // Rejet
            targetFilename = `REJETE - ${date} - ${middleBlock} - ${amount.toFixed(2)}€${path.extname(file).toLowerCase()}`;
          }

          info = {
            targetFilename,
            year,
            month,
            isPro
          };
        }
      } catch (err: any) {
        console.error(`❌ Erreur OCR pour ${file}:`, err.message);
      }
    }

    if (info && info.isPro && (info.year === '2025' || info.year === '2026')) {
      const monthFolder = MONTH_MAP[info.month];
      if (monthFolder) {
        // Enforce NFC normalization for folder path
        const nfcMonthFolder = monthFolder.normalize('NFC');
        const targetDir = path.join(COMPTA_DIR, `Factures ${info.year}`, nfcMonthFolder);
        
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, info.targetFilename);
        
        // Copy the file
        fs.copyFileSync(filePath, targetPath);
        copiedCount++;

        // Track count
        monthlyCounts[info.year][monthFolder] = (monthlyCounts[info.year][monthFolder] || 0) + 1;
      }
    }
  }

  console.log(`\n🎉 Reorganisation terminee !`);
  console.log(`📊 Statistiques :`);
  console.log(`- Fichiers copies vers 4-Compta : ${copiedCount}`);
  console.log(`- Appels Gemini OCR effectues : ${ocrCalls}`);
  console.log(`\n📅 Repartition par annee et par mois :`);

  for (const year of ['2025', '2026']) {
    let yearTotal = 0;
    console.log(`\n📁 Factures ${year} :`);
    console.log(`-----------------------------------`);
    const sortedMonths = Object.keys(monthlyCounts[year]).sort();
    for (const month of sortedMonths) {
      const count = monthlyCounts[year][month];
      yearTotal += count;
      if (count > 0) {
        console.log(`   ${month} : ${count} factures`);
      }
    }
    console.log(`-----------------------------------`);
    console.log(`   👉 TOTAL ${year} : ${yearTotal} factures`);
  }
}

main().catch(console.error);
