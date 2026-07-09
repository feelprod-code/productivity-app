import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

function cleanStorageKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9.\-_]/g, "_") // replace spaces, € and special chars with underscore
    .replace(/_+/g, '_') // combine multiple underscores into one
    .trim();
}

async function main() {
  console.log("🧹 1. Purge complète de la base SQL (tables Invoice et Expense)...");
  const deleteInvoices = await prisma.invoice.deleteMany();
  console.log(`✅ ${deleteInvoices.count} factures supprimées de la table Invoice.`);
  
  const deleteExpenses = await prisma.expense.deleteMany();
  console.log(`✅ ${deleteExpenses.count} dépenses supprimées de la table Expense.`);

  console.log("🧹 2. Purge complète de Supabase Storage (bucket 'invoices')...");
  
  // List files in bucket
  const { data: fileList, error: listError } = await supabase.storage
    .from('invoices')
    .list('', { limit: 10000 });

  if (listError) {
    console.error("❌ Échec de la récupération des fichiers sur Supabase Storage :", listError.message);
  } else if (fileList && fileList.length > 0) {
    const fileNames = fileList.map(f => f.name);
    console.log(`🗑️ Suppression de ${fileNames.length} fichiers sur Supabase Storage...`);
    
    // Split into chunks of 100 for deletion
    for (let i = 0; i < fileNames.length; i += 100) {
      const chunk = fileNames.slice(i, i + 100);
      const { error: removeError } = await supabase.storage
        .from('invoices')
        .remove(chunk);
      
      if (removeError) {
        console.error("⚠️ Erreur lors de la suppression d'un lot :", removeError.message);
      }
    }
    console.log("✅ Supabase Storage purgé avec succès.");
  } else {
    console.log("ℹ️ Aucun fichier trouvé dans Supabase Storage.");
  }

  console.log("📦 3. Lecture des factures locales dans 4-Compta...");
  const localFiles: string[] = [];

  function scanFolder(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanFolder(fullPath);
      } else if (entry.toLowerCase().endsWith('.pdf') || entry.toLowerCase().endsWith('.jpg') || entry.toLowerCase().endsWith('.html') || entry.toLowerCase().endsWith('.png') || entry.toLowerCase().endsWith('.jpeg')) {
        localFiles.push(fullPath);
      }
    }
  }

  scanFolder(path.join(COMPTA_DIR, "Factures 2025"));
  scanFolder(path.join(COMPTA_DIR, "Factures 2026"));

  console.log(`🔍 ${localFiles.length} factures locales trouvées. Début de la réinjection...`);

  let successCount = 0;
  
  // We process files sequentially or in small chunks to avoid overloading Supabase
  for (const filePath of localFiles) {
    const filename = path.basename(filePath);
    const safeKey = cleanStorageKey(filename);
    
    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/pdf';
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.html') contentType = 'text/html';

      // 1. Upload to Supabase Storage (using sanitized key)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(safeKey, buffer, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        console.error(`❌ Échec upload de ${filename} (clé: ${safeKey}) sur Supabase Storage :`, uploadError.message);
        continue;
      }

      // 2. Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(safeKey);
      
      const fileUrl = publicUrlData.publicUrl;

      // 3. Parse Metadata from Filename
      // Format: YYYY-MM-DD - SUPPLIER_DESC - AMOUNT€.pdf
      const match = filename.match(/^(\d{4})-(\d{2})-(\d{2}) - ([^-]+) - ([\d.]+)€/);
      
      let date = new Date();
      let provider = "INCONNU";
      let amount = 0.00;

      if (match) {
        date = new Date(`${match[1]}-${match[2]}-${match[3]}`);
        provider = match[4].replace(/_/g, ' ').trim();
        amount = parseFloat(match[5]);
      } else {
        // Fallback parsing for other formats if any
        const parts = filename.split(' - ');
        if (parts.length >= 3) {
          date = new Date(parts[0]);
          provider = parts[1].replace(/_/g, ' ').trim();
          amount = parseFloat(parts[2].replace(/[^\d.]/g, ''));
        }
      }

      // 4. Create row in SQL Database via Prisma
      await prisma.invoice.create({
        data: {
          provider,
          amount,
          currency: "EUR",
          date,
          fileUrl,
          status: "COMPLETED",
          type: "PRO"
        }
      });

      successCount++;
      if (successCount % 50 === 0) {
        console.log(`🚀 Réinjecté : ${successCount}/${localFiles.length} factures...`);
      }
    } catch (err: any) {
      console.error(`❌ Erreur lors du traitement de ${filename} :`, err.message);
    }
  }

  console.log(`\n🏁 Réinjection terminée !`);
  console.log(`📊 Bilan : ${successCount} sur ${localFiles.length} factures réinjectées avec succès sur Supabase.`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
