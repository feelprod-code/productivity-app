import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const dateLimit = new Date('2026-01-01T00:00:00Z');

    const expenses = await prisma.expense.findMany({
        where: { date: { gte: dateLimit } },
    });

    const invoices = await prisma.invoice.findMany({
        where: { date: { gte: dateLimit } },
    });

    const all = [...expenses, ...invoices];

    const grouped: Record<string, { count: number, total: number, name: string }> = {};

    for (const item of all) {
        let p = item.provider.trim();
        // basic normalization to group correctly
        let pKey = p.toLowerCase();

        if (!grouped[pKey]) {
            grouped[pKey] = { count: 0, total: 0, name: p };
        }
        grouped[pKey].count++;
        grouped[pKey].total += item.amount || 0;
    }

    const sorted = Object.values(grouped)
        .sort((a, b) => b.count - a.count || b.total - a.total);

    let md = "# Top Dépenses Récurrentes (6 derniers mois)\n\n| Rang | Fournisseur | Nombre de fois | Total estimé |\n|---|---|---|---|\n";
    let i = 1;

    // We want the top 50
    for (const item of sorted.slice(0, 50)) {
        if (item.count > 1) {
            md += `| ${i} | **${item.name}** | ${item.count} | ${item.total.toFixed(2)} € |\n`;
            i++;
        }
    }

    console.log("----START_MD----");
    console.log(md);
    console.log("----END_MD----");
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
