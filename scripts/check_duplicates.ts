import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allInvoices = await prisma.invoice.findMany();
  
  const pendingInvoices = allInvoices.filter(i => i.status === 'PENDING');
  const completedInvoices = allInvoices.filter(i => i.status === 'COMPLETED');
  
  console.log(`Total invoices: ${allInvoices.length}`);
  console.log(`Pending: ${pendingInvoices.length}`);
  console.log(`Completed: ${completedInvoices.length}`);
  
  let exactDuplicatesByFile = 0;
  let exactDuplicatesByData = 0;
  
  const toDelete = [];
  
  for (const pending of pendingInvoices) {
    // Extract base filename to ignore paths
    const getBaseName = (url) => {
        if (!url) return '';
        const parts = url.split('/');
        return parts[parts.length - 1].toLowerCase().trim();
    };
    
    const pendingFile = getBaseName(pending.fileUrl);
    
    // Check if there is a COMPLETED invoice with the same filename
    const sameFileCompleted = completedInvoices.find(c => getBaseName(c.fileUrl) === pendingFile);
    
    if (sameFileCompleted) {
        exactDuplicatesByFile++;
        toDelete.push(pending.id);
        continue;
    }
    
    // Check if there is a COMPLETED invoice with the same date, amount and provider
    // Date can be slightly off sometimes, but let's check exact date string first, or within 1-2 days
    const pendingDate = pending.date.toISOString().split('T')[0];
    
    const sameDataCompleted = completedInvoices.find(c => {
        const cDate = c.date.toISOString().split('T')[0];
        // Allow fuzzy matching on provider name
        const p1 = pending.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
        const p2 = c.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        return cDate === pendingDate && 
               c.amount === pending.amount && 
               (p1.includes(p2) || p2.includes(p1));
    });
    
    if (sameDataCompleted) {
        exactDuplicatesByData++;
        toDelete.push(pending.id);
    }
  }
  
  console.log(`Duplicates found by filename: ${exactDuplicatesByFile}`);
  console.log(`Duplicates found by data (date, amount, provider): ${exactDuplicatesByData}`);
  console.log(`Total potential duplicates to delete/mark: ${toDelete.length}`);
  
  // Also check duplicates within PENDING itself (imported twice)
  let pendingSelfDuplicates = 0;
  const seenPendingFiles = new Set();
  const pendingSelfToDelete = [];
  
  for (const pending of pendingInvoices) {
      if (toDelete.includes(pending.id)) continue;
      
      const getBaseName = (url) => {
        if (!url) return '';
        const parts = url.split('/');
        return parts[parts.length - 1].toLowerCase().trim();
      };
      
      const pendingFile = getBaseName(pending.fileUrl);
      if (seenPendingFiles.has(pendingFile)) {
          pendingSelfDuplicates++;
          pendingSelfToDelete.push(pending.id);
      } else {
          seenPendingFiles.add(pendingFile);
      }
  }
  
  console.log(`Duplicates within PENDING itself: ${pendingSelfDuplicates}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
