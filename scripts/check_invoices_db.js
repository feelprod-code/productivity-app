const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoices = await prisma.invoice.findMany();
    console.log(`Total local invoices: ${invoices.length}`);
    
    console.log("\n=== LOCAL INVOICES FOR 2026 ===");
    invoices.forEach(inv => {
      const dateStr = inv.date ? (inv.date instanceof Date ? inv.date.toISOString().split('T')[0] : String(inv.date)) : '';
      if (dateStr.startsWith('2026')) {
        console.log(`ID: ${inv.id} | Date: ${dateStr} | Provider: "${inv.provider}" | Amount: ${inv.amount} EUR | File: "${inv.fileUrl || 'N/A'}"`);
      }
    });

    console.log("\n=== ALL CARPIMKO LOCAL INVOICES ===");
    invoices.forEach(inv => {
      if ((inv.provider || '').toLowerCase().includes('carpimko')) {
        console.log(`ID: ${inv.id} | Date: ${inv.date} | Provider: "${inv.provider}" | Amount: ${inv.amount} EUR | File: "${inv.fileUrl || 'N/A'}"`);
      }
    });

    console.log("\n=== ALL VOLKSWAGEN LOCAL INVOICES ===");
    invoices.forEach(inv => {
      if ((inv.provider || '').toLowerCase().includes('volkswagen') || (inv.provider || '').toLowerCase().includes('vw')) {
        console.log(`ID: ${inv.id} | Date: ${inv.date} | Provider: "${inv.provider}" | Amount: ${inv.amount} EUR | File: "${inv.fileUrl || 'N/A'}"`);
      }
    });

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
