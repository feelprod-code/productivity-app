const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const badInvoices = await prisma.invoice.findMany({
    where: {
      provider: {
        startsWith: "AMAZON - "
      }
    }
  });

  console.log(`Found ${badInvoices.length} invoices with provider starting with 'AMAZON - '`);
  const suspicious = badInvoices.filter(inv => {
    const p = inv.provider.toLowerCase();
    return !p.includes('amazon') && !p.includes('amzn');
  });
  console.log(`Found ${suspicious.length} suspicious invoices that are not Amazon:`);
  for (const s of suspicious.slice(0, 20)) {
    console.log(`  ID: ${s.id} | Date: ${s.date?.toISOString().substring(0,10)} | Provider: "${s.provider}" | Amount: ${s.amount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
