import * as dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });
dotenv.config({ path: '/Users/guillaumephilippe/ANTIGRAVITY/compta/.env' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ GEMINI_API_KEY manquante.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const comptaBaseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';

const MONTH_MAP: { [key: string]: string } = {
  '01': '01 - Janvier',
  '02': '02 - Fe\u0301vrier', // Février (NFD)
  '03': '03 - Mars',
  '04': '04 - Avril',
  '05': '05 - Mai',
  '06': '06 - Juin',
  '07': '07 - Juillet',
  '08': '08 - Aou\u0302t', // Août (NFD)
  '09': '09 - Septembre',
  '10': '10 - Octobre',
  '11': '11 - Novembre',
  '12': '12 - De\u0301cembre' // Décembre (NFD)
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Clean merchant names
function getCleanMerchant(label: string): string {
    let clean = label.toUpperCase();
    
    if (clean.includes('LCL') || 
        clean.includes('CONVENTION_PROFESSIONNEL') || 
        clean.includes('CONVENTION PROFESSIONNEL') || 
        clean.includes('ZEN_PRO') || 
        clean.includes('ZEN PRO') || 
        clean.includes('FORMULE ZEN') || 
        clean.includes('FORMULE_ZEN') ||
        clean.startsWith('ABON ')) {
        return 'LCL';
    }

    clean = clean.replace(/^CARTE \d+ CB /, '');
    clean = clean.replace(/^PRELVT SEPA RECU D\/O CONFRERE PRLV SEPA /, '');
    clean = clean.replace(/^PRELVT SEPA RECU D\/O LCL PRLV SEPA /, '');
    clean = clean.replace(/^PRLV SEPA /, '');
    clean = clean.replace(/^VIREMENT SEPA RECU /, '');
    clean = clean.replace(/^VIREMENT INSTANTANE /, '');
    clean = clean.replace(/ CBLM PHILIPPE GUILLAUME$/, '');
    clean = clean.replace(/ PHILIPPE GUILLAUME$/, '');
    clean = clean.replace(/ GUILLAUME PHILIPPE$/, '');
    clean = clean.replace(/\s+\d{2}\/\d{2}\/\d{2}.*$/, '');
    clean = clean.replace(/\s+\d{2}\/\d{2}\/\d{4}.*$/, '');
    
    if (clean.includes('AMAZON') || clean.includes('AMZN')) return 'AMAZON';
    if (clean.includes('OPENAI')) return 'OPENAI';
    if (clean.includes('GOOGLE')) return 'GOOGLE';
    if (clean.includes('APPLE')) return 'APPLE';
    if (clean.includes('ADOBE')) return 'ADOBE';
    if (clean.includes('URSSAF')) return 'URSSAF';
    if (clean.includes('VW BANK') || clean.includes('VOLKSWAGEN')) return 'VOLKSWAGEN BANK';
    if (clean.includes('BOUYGUES')) return 'BOUYGUES TELECOM';
    if (clean.includes('FREE MOBILE') || clean.includes('FREE TELECOM')) return 'FREE';
    if (clean.includes('NAVIGO') || clean.includes('IDF MOBILITES') || clean.includes('ILE-DE-FRANCE')) return 'SERVICE NAVIGO';
    if (clean.includes('CARPIMKO')) return 'CARPIMKO';
    if (clean.includes('CPAM') || clean.includes('MALADIE DE PARIS')) return 'CPAM';
    if (clean.includes('SUMUP')) return 'SUMUP';
    if (clean.includes('CANVA')) return 'CANVA';
    if (clean.includes('VERCEL')) return 'VERCEL';
    if (clean.includes('SUPABASE')) return 'SUPABASE';
    if (clean.includes('WETRANSFER')) return 'WETRANSFER';
    if (clean.includes('AIR FRANCE')) return 'AIR FRANCE';
    if (clean.includes('SNCF')) return 'SNCF';
    if (clean.includes('AGIOS')) return 'AGIOS';
    if (clean.includes('COMMISSION')) return 'COMMISSION';
    if (clean.includes('INTER_GAVIOTER') || clean.includes('GAVIOTER')) return 'INTER GAVIOTER';
    if (clean.includes('LE_PARIS_HALLES') || clean.includes('LE PARIS HALLES') || clean.includes('PARIS HALLES')) return 'LE PARIS HALLES';
    if (clean.includes('MAGD_SEBASTOPOL') || clean.includes('MAGD SEBASTOPOL') || clean.includes('MAGD')) return 'MAGD SEBASTOPOL';
    if (clean.includes('TABAC_CHATELET') || clean.includes('TABAC CHATELET') || clean.includes('TABAC')) return 'TABAC DU CHATELET';
    if (clean.includes('TENUE_DE_COMPTE') || clean.includes('TENUE DE COMPTE')) return 'TENUE DE COMPTE';
    if (clean.includes('DOCTOLIB')) return 'DOCTOLIB';
    if (clean.includes('MACSF')) return 'MACSF';
    if (clean.includes('PERMANENT COMPTABILITE') || clean.includes('RAFENNE')) return 'PERMANENT COMPTABILITE';
    if (clean.includes('PAYPAL')) return 'PAYPAL';
    
    const words = clean.trim().split(/[^A-Z0-9]/).filter(w => w.length >= 2);
    const noise = ['SEPA', 'PRLV', 'VIREMENT', 'INSTANTANE', 'CARTE', 'CB', 'FACT', 'FAC', 'INV', 'EUR', 'USD', 'SDR', 'RUM', 'ICS', 'TP'];
    const filtered = words.filter(w => !noise.includes(w));
    if (filtered.length > 0) return filtered.slice(0, 3).join(' ');
    
    return clean.trim();
}

async function analyzeFileWithGemini(filePath: string): Promise<any> {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.html') {
        const htmlText = buffer.toString('utf-8');
        const prompt = `Tu es un expert comptable AI. Analyse ce reçu au format HTML :
${htmlText}

Extrais les informations suivantes au format JSON strict (sans \`\`\`json ni markdown) :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: LE PARIS HALLES, LCL, AMAZON, APPLE, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 13.05)
}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
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
        return JSON.parse(cleanedText);
    }

    const mimeType = ext === '.pdf' ? 'application/pdf' : 
                     ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                     ext === '.png' ? 'image/png' : 'application/octet-stream';

    const prompt = `Tu es un expert comptable AI. Analyse ce document de reçu/facture.
Extrais les informations suivantes au format JSON strict :
{
  "supplier_name": "Le nom propre et exact du marchand/fournisseur en majuscules (ex: LE PARIS HALLES, LCL, AMAZON, APPLE, etc.)",
  "invoice_date": "La date d'émission de la facture au format YYYY-MM-DD",
  "amount": le montant total TTC numérique (ex: 13.05)
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
    return JSON.parse(cleanedText);
}

async function processInconnuFiles() {
    console.log("🔍 Recherche des fichiers INCONNU...");
    const inconnuFiles: { filePath: string; fileName: string; dirPath: string }[] = [];

    for (const year of ['2025', '2026']) {
        const yearDir = path.join(comptaBaseDir, `Factures ${year}`);
        if (!fs.existsSync(yearDir)) continue;
        const months = fs.readdirSync(yearDir);
        for (const month of months) {
            const monthDir = path.join(yearDir, month);
            if (!fs.statSync(monthDir).isDirectory()) continue;
            const files = fs.readdirSync(monthDir);
            for (const file of files) {
                if (file.toLowerCase().includes('inconnu')) {
                    inconnuFiles.push({
                        filePath: path.join(monthDir, file),
                        fileName: file,
                        dirPath: monthDir
                    });
                }
            }
        }
    }

    console.log(`🎯 Trouvé ${inconnuFiles.length} fichiers INCONNU à analyser.`);

    for (const item of inconnuFiles) {
        console.log(`\n📝 Analyse de : "${item.fileName}"...`);
        try {
            const result = await analyzeFileWithGemini(item.filePath);
            console.log("   Résultat Gemini :", JSON.stringify(result));
            
            if (result.supplier_name && result.amount) {
                const dateStr = result.invoice_date || item.fileName.split(' - ')[0];
                const cleanMerchant = getCleanMerchant(result.supplier_name);
                const amountStr = Number(result.amount).toFixed(2);
                const ext = path.extname(item.filePath).toLowerCase();
                const newFileName = `${dateStr} - ${cleanMerchant} - ${amountStr}€${ext}`;
                const newFilePath = path.join(item.dirPath, newFileName);
                
                // Si le fichier existe déjà sous le nouveau nom, on le supprime d'abord
                if (fs.existsSync(newFilePath)) {
                    fs.unlinkSync(newFilePath);
                }
                
                fs.renameSync(item.filePath, newFilePath);
                console.log(`   ✅ Renommé en : "${newFileName}"`);
            } else {
                console.warn(`   ⚠️ Extraction incomplète pour ${item.fileName}`);
            }
        } catch (e: any) {
            console.error(`   ❌ Échec pour ${item.fileName} :`, e.message);
        }
        await sleep(1000); // Respect rate limit
    }
}

processInconnuFiles().then(() => {
    console.log("\n🎉 Analyse et renommage des fichiers INCONNU terminés !");
}).catch(err => console.error(err));
