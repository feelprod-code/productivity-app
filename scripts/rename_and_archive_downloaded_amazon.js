const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenRouter / Gemini
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/philippeguillaume/gravityclaw',
    'X-Title': 'Gravity Claw',
  },
});

const DESKTOP_DIR = "/Users/guillaumephilippe/Desktop/Factures Amazon Rapatriees";
const COMPTA_BASE_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

async function main() {
  if (!fs.existsSync(DESKTOP_DIR)) {
    console.log(`📂 Folder ${DESKTOP_DIR} does not exist. Nothing to process.`);
    return;
  }

  const files = fs.readdirSync(DESKTOP_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`📂 Found ${files.length} Amazon PDF files on Desktop.`);

  for (const file of files) {
    const filePath = path.join(DESKTOP_DIR, file);
    
    // Parse temporary name: Amazon_YYYY-MM-DD_Amount.pdf
    const match = file.match(/^Amazon_(\d{4}-\d{2}-\d{2})_([\d.]+)\.pdf$/);
    if (!match) {
      console.log(`⚠️ Skipping non-matching file format: ${file}`);
      continue;
    }
    
    const dateStr = match[1];
    const amount = parseFloat(match[2]);
    const year = dateStr.split('-')[0];
    
    console.log(`\n📄 Processing file: ${file} (Date: ${dateStr}, Amount: ${amount} €)`);
    
    try {
      const buffer = fs.readFileSync(filePath);
      
      // Parse PDF Text
      const parsedPdf = await pdfParse(buffer);
      const text = parsedPdf.text || '';
      
      // Call Gemini to get product name / short description
      console.log(`🤖 Calling Gemini to extract product description...`);
      const response = await openai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: "Tu es un expert comptable spécialisé dans la lecture de reçus et factures. Tu dois extraire le nom ou la description très courte (2 à 5 mots en français) du ou des principaux produits achetés et retourne-le sous la forme 'Amazon - [Nom du Produit]' (ou 'Amazon Business - [Nom du Produit]') dans provider_name (ex: 'Amazon - Draps d\\'Examen'). Réponds uniquement au format JSON avec la propriété: provider_name (string)."
          },
          {
            role: 'user',
            content: `Texte de la facture :\n---\n${text.substring(0, 4000)}\n---`
          }
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      });
      
      const raw = response.choices[0]?.message?.content || '{}';
      const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const data = JSON.parse(cleaned);
      
      const providerAndDesc = data.provider_name || 'Amazon';
      
      // Build standard filename: DATE - PROVIDER_DESCRIPTION - AMOUNT€.pdf
      // Note: We replace slashes or characters that could break file systems
      const sanitizedProviderDesc = providerAndDesc.replace(/[\/\\:*?"<>|]/g, '-').trim();
      const finalFilename = `${dateStr} - ${sanitizedProviderDesc} - ${amount.toFixed(2).replace('.', ',')}€.pdf`;
      
      // 1. Upload to Supabase Storage bucket 'invoices'
      const supabasePath = `invoices/${year}/${finalFilename}`;
      console.log(`📤 Uploading to Supabase Storage: ${supabasePath}...`);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(supabasePath, buffer, {
          contentType: 'application/pdf',
          upsert: true
        });
        
      if (uploadError) {
        throw new Error(`Supabase upload failed: ${uploadError.message}`);
      }
      
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(supabasePath);
      const publicUrl = publicUrlData.publicUrl;
      console.log(`🔗 Supabase URL: ${publicUrl}`);
      
      // 2. Insert into Prisma DB as COMPLETED
      const invDate = new Date(`${dateStr}T12:00:00Z`);
      
      // Check if already in DB
      const existing = await prisma.invoice.findFirst({
        where: {
          date: invDate,
          amount: amount,
          provider: { contains: 'Amazon', mode: 'insensitive' }
        }
      });
      
      if (existing) {
        console.log(`📝 Local invoice already exists in DB (ID: ${existing.id}), updating URL...`);
        await prisma.invoice.update({
          where: { id: existing.id },
          data: {
            fileUrl: publicUrl,
            status: 'COMPLETED'
          }
        });
      } else {
        console.log(`📝 Inserting new invoice in local DB...`);
        await prisma.invoice.create({
          data: {
            provider: sanitizedProviderDesc,
            amount: amount,
            currency: 'EUR',
            date: invDate,
            fileUrl: publicUrl,
            status: 'COMPLETED',
            type: 'PRO'
          }
        });
      }
      
      // 3. Move/Copy to permanant local archive
      const yearDir = path.join(COMPTA_BASE_DIR, `Factures ${year}`);
      if (!fs.existsSync(yearDir)) {
        fs.mkdirSync(yearDir, { recursive: true });
      }
      
      const finalDestPath = path.join(yearDir, finalFilename);
      fs.writeFileSync(finalDestPath, buffer);
      console.log(`💾 Saved to permanent compta archive: ${finalDestPath}`);
      
      // Remove temporary file from Desktop
      fs.unlinkSync(filePath);
      console.log(`🗑️ Removed temp file from Desktop.`);
      
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err.message);
    }
  }
  
  console.log(`\n🎉 Renaming and archiving complete!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
