import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const localPath = "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/08 - Aout/2026-08-06 - LCL LEASING - 568.83EUR.pdf";
    const storageName = "2026-08-06_-_LCL_LEASING_FACTURE_PREMIER_LOYER_MAJORE_-_568.83EUR.pdf";
    const fileBuffer = fs.readFileSync(localPath);
    const { error } = await supabase.storage.from('invoices').upload(storageName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
    });
    if (error) {
        console.error("Upload error:", error.message);
        return;
    }
    const { data } = supabase.storage.from('invoices').getPublicUrl(storageName);
    await prisma.invoice.upsert({
        where: { id: "lcl-leasing-premier-loyer" },
        create: {
            id: "lcl-leasing-premier-loyer",
            provider: "LCL LEASING - Premier loyer majoré matériel informatique (568.83 €)",
            amount: 568.83,
            currency: "EUR",
            date: new Date("2026-08-06"),
            fileUrl: data.publicUrl,
            status: "PAID",
            type: "PRO"
        },
        update: {
            fileUrl: data.publicUrl,
            status: "PAID"
        }
    });
    console.log("✅ LCL Leasing premier loyer uploaded and registered:", data.publicUrl);
}

main().catch(console.error).finally(() => prisma.$disconnect());
