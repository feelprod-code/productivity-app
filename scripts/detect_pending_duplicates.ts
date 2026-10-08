import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("📥 Chargement des factures PENDING depuis Prisma...");
    const pendingInvoices = await prisma.invoice.findMany({
        where: { status: 'PENDING' }
    });
    console.log(`📊 Trouvé ${pendingInvoices.length} factures PENDING.`);

    console.log("📥 Chargement des transactions locales...");
    const res = await fetch('http://localhost:3000/api/transactions/releve');
    if (!res.ok) {
        throw new Error("Impossible de récupérer les transactions");
    }
    const data = await res.json();
    const transactions = data.transactions || [];
    console.log(`📊 Trouvé ${transactions.length} transactions au total.`);

    let duplicateCount = 0;
    const toDeleteIds: string[] = [];
    const duplicateDetails: any[] = [];

    for (const inv of pendingInvoices) {
        const invDate = new Date(inv.date);
        const invAmount = inv.amount || 0;
        
        const getCleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const invProviderClean = getCleanStr(inv.provider);

        // Find matching transaction
        const matches = transactions.filter((t: any) => {
            if (t.amount > 0) return false; // Only expenses
            if (Math.abs(t.amount) !== invAmount) return false;

            const tDate = new Date(t.date);
            const diffTime = Math.abs(tDate.getTime() - invDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 35) return false; // Allow up to 35 days (like Pennylane sync)

            const tLabelClean = getCleanStr(t.label);
            return tLabelClean.includes(invProviderClean) || invProviderClean.includes(tLabelClean) || 
                   // specific exceptions
                   (invProviderClean.includes('amazon') && tLabelClean.includes('amazon')) ||
                   (invProviderClean.includes('apple') && tLabelClean.includes('apple')) ||
                   (invProviderClean.includes('adobe') && tLabelClean.includes('adobe'));
        });

        if (matches.length > 0) {
            // Check if ALL matching transactions are ALREADY reconciled
            const allMatched = matches.every((t: any) => t.matchedInvoice || t.isReconciled || t.pennylaneReconciled);
            
            if (allMatched) {
                duplicateCount++;
                toDeleteIds.push(inv.id);
                duplicateDetails.push({
                    invoice: `${inv.provider} - ${invAmount}€ - ${inv.date.toISOString().split('T')[0]}`,
                    matchedTo: matches.map((t: any) => `${t.label} (${t.date.split('T')[0]}) -> Already has invoice: ${t.matchedInvoice?.filename || 'Yes'}`)
                });
            }
        }
    }

    console.log(`\n🔍 Analyse terminée : ${duplicateCount} factures PENDING sont des doublons (la transaction correspondante est déjà rapprochée).`);
    
    // Print first 20 for verification
    duplicateDetails.slice(0, 20).forEach((d, i) => {
        console.log(`\n${i + 1}. INVOICE: ${d.invoice}`);
        d.matchedTo.forEach((m: string) => console.log(`   TRANSACTION: ${m}`));
    });

    console.log(`\nSi vous souhaitez les passer à COMPLETED, nous pouvons exécuter la mise à jour sur ces ${toDeleteIds.length} IDs.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
