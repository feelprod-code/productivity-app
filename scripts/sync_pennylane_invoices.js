const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const PENNYLANE_API_KEY = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!PENNYLANE_API_KEY) {
    console.error("❌ No Pennylane API key found!");
    return;
  }

  console.log("🔍 Loading local invoices from Prisma...");
  const localInvoices = await prisma.invoice.findMany();
  console.log(`Loaded ${localInvoices.length} local invoices.`);

  console.log("🔍 Fetching supplier invoices from Pennylane...");
  let cursor = '';
  const pennylaneInvoices = [];
  
  // Fetch up to 50 pages of invoices to cover full history
  for (let page = 1; page <= 50; page++) {
    const fetchUrl = `${BASE_URL}/supplier_invoices?limit=100` + (cursor ? `&cursor=${cursor}` : '');
    const res = await fetch(fetchUrl, {
      headers: {
        'Authorization': `Bearer ${PENNYLANE_API_KEY}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    if (!res.ok) {
      console.error(`Error page ${page}: ${res.status}`);
      break;
    }
    const data = await res.json();
    const items = data.supplier_invoices || data.items || [];
    if (items.length === 0) break;
    pennylaneInvoices.push(...items);
    
    const nextCursor = data.next_cursor || data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
    await sleep(100);
  }

  console.log(`Fetched ${pennylaneInvoices.length} invoices from Pennylane.`);

  let updatedToCompleted = 0;
  let updatedToPending = 0;

  for (const localInv of localInvoices) {
    // Try to find the invoice on Pennylane
    const localBasename = localInv.fileUrl ? path.basename(localInv.fileUrl).toLowerCase() : '';
    
    const plMatch = pennylaneInvoices.find(pl => {
      // Try filename match first
      const plFilename = (pl.filename || '').toLowerCase();
      if (localBasename && plFilename && (plFilename.includes(localBasename) || localBasename.includes(plFilename))) {
        return true;
      }
      
      // Fallback: match by amount and date (dynamic offset)
      const plAmount = parseFloat(pl.amount || '0');
      const amtDiff = Math.abs(plAmount - (localInv.amount || 0));
      if (amtDiff < 0.05) {
        const localDate = new Date(localInv.date);
        const plDate = new Date(pl.date);
        const timeDiff = Math.abs(localDate.getTime() - plDate.getTime());
        
        const localProv = localInv.provider.toLowerCase();
        const isAmazon = localProv.includes('amazon');
        const maxDaysMs = isAmazon ? 90 * 24 * 60 * 60 * 1000 : 35 * 24 * 60 * 60 * 1000;
        
        if (timeDiff <= maxDaysMs) {
          // Verify provider overlap by normalising spaces and non-alphanumeric chars
          const cleanLocal = localProv.replace(/[^a-z0-9]/g, '');
          const cleanPlLabel = (pl.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanPlProvider = (pl.supplier?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (
            cleanLocal.length > 2 && (
              cleanPlLabel.includes(cleanLocal) || 
              cleanLocal.includes(cleanPlLabel) || 
              cleanPlProvider.includes(cleanLocal) ||
              cleanLocal.includes(cleanPlProvider)
            )
          ) {
            return true;
          }
        }
      }
      return false;
    });

    if (plMatch) {
      // Pennylane matching status: reconciled is true, or paid is true
      const isReconciledOnPennylane = plMatch.reconciled === true || plMatch.payment_status === 'reconciled' || plMatch.paid === true;
      const expectedStatus = isReconciledOnPennylane ? "COMPLETED" : "PENDING";
      
      if (localInv.status !== expectedStatus) {
        console.log(`🔄 Local Invoice "${localInv.provider}" (${localInv.amount} € du ${localInv.date.toISOString().split('T')[0]}): ${localInv.status} -> ${expectedStatus} (Pennylane reconciled: ${isReconciledOnPennylane})`);
        
        await prisma.invoice.update({
          where: { id: localInv.id },
          data: { status: expectedStatus }
        });
        
        if (expectedStatus === "COMPLETED") updatedToCompleted++;
        else updatedToPending++;
      }
    } else {
      // If we can't find it on Pennylane, but it was matched locally, let's keep its local status,
      // or if it was PENDING we keep it.
    }
  }

  console.log(`\n🎉 Synchronization complete!`);
  console.log(`   - Local invoices updated to COMPLETED: ${updatedToCompleted}`);
  console.log(`   - Local invoices updated to PENDING: ${updatedToPending}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
