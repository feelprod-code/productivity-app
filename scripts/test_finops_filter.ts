import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const expenses = await prisma.expense.findMany();
    const invoices = await prisma.invoice.findMany();

    const softwareProviders = [
        'vercel', 'supabase', 'cloudflare', 'modal', 'aws', 'google', 'azure',
        'openai', 'anthropic', 'openrouter', 'hugging', 'replicate', 'elevenlabs',
        'deepgram', 'stripe', 'twilio', 'sendgrid', 'postmark', 'zapier', 'canva', 'notion', 'hiffsfiekd', 'canvas', 'netlify', 'github', 'gitlab', 'render', 'railway'
    ];

    let allItems = [...expenses, ...invoices];

    allItems = allItems.filter(item => {
        if (!item.provider) return false;
        const prv = item.provider.toLowerCase();
        return softwareProviders.some(sp => prv.includes(sp));
    });

    console.log("Filtered items:", allItems);
}

main().catch(console.error).finally(() => prisma.$disconnect());
