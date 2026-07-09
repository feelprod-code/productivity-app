import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log("🧹 1. Purge des tables de la base de données SQL (Invoice et Expense)...");
  const deleteInvoices = await prisma.invoice.deleteMany();
  console.log(`✅ ${deleteInvoices.count} factures supprimées de la table Invoice.`);
  
  const deleteExpenses = await prisma.expense.deleteMany();
  console.log(`✅ ${deleteExpenses.count} dépenses supprimées de la table Expense.`);

  console.log("🧹 2. Purge complète de Supabase Storage (bucket 'invoices')...");
  
  const { data: fileList, error: listError } = await supabase.storage
    .from('invoices')
    .list('', { limit: 10000 });

  if (listError) {
    console.error("❌ Échec de la récupération des fichiers sur Supabase Storage :", listError.message);
  } else if (fileList && fileList.length > 0) {
    const fileNames = fileList.map(f => f.name);
    console.log(`🗑️ Suppression de ${fileNames.length} fichiers sur Supabase Storage...`);
    
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

  await prisma.$disconnect();
  console.log("\n🏁 Purge de l'application compta terminée avec succès !");
}

main().catch(console.error);
