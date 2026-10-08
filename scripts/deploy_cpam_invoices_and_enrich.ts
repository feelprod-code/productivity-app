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
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const DOCS_METADATA = [
    {
        id: "cpam-releve-avril-2026",
        fileName: "2026-04-30_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_AVRIL_-_4563.32EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Avril 2026 (4 563.32 €)",
        amount: 4563.32,
        date: "2026-04-30"
    },
    {
        id: "cpam-releve-mai-2026",
        fileName: "2026-05-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_MAI_-_6056.03EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Mai 2026 (6 336.15 €)",
        amount: 6336.15,
        date: "2026-05-31"
    },
    {
        id: "cpam-releve-juin-2026",
        fileName: "2026-06-30_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_JUIN_-_5468.60EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Juin 2026 (5 468.60 €)",
        amount: 5468.60,
        date: "2026-06-30"
    },
    {
        id: "cpam-releve-juillet-2026",
        fileName: "2026-07-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_JUILLET_-_4643.40EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Juillet 2026 (4 643.40 €)",
        amount: 4643.40,
        date: "2026-07-31"
    },
    {
        id: "cpam-releve-aout-2026",
        fileName: "2026-08-31_-_AMELI_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_AOUT_-_4319.23EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Août 2026 (4 319.23 €)",
        amount: 4319.23,
        date: "2026-08-31"
    }
];

interface CpamGroup {
    dateStr: string;
    monthStr: string;
    organism: string;
    totalAmount: number;
    rawTotalAmount: number;
    indus: number;
    patients: { name: string; amount: number }[];
    docId: string;
}

function formatPatientName(rawName: string): string {
    const words = rawName.trim().split(/\s+/);
    return words.map((w, idx) => {
        if (idx === 0) return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
}

async function uploadAndRegisterInvoices() {
    console.log("=== 1. UPLOADING CPAM STATEMENTS TO SUPABASE & PRISMA ===");
    for (const doc of DOCS_METADATA) {
        const localPath = path.resolve(process.cwd(), "generated_pdfs", doc.fileName);
        if (!fs.existsSync(localPath)) {
            console.error(`File not found: ${localPath}`);
            continue;
        }

        const buffer = fs.readFileSync(localPath);
        console.log(`📤 Uploading "${doc.fileName}"...`);
        const { error: uploadError } = await supabase.storage.from('invoices').upload(doc.fileName, buffer, {
            contentType: 'application/pdf',
            upsert: true
        });

        if (uploadError) {
            console.error(`❌ Upload error: ${uploadError.message}`);
            continue;
        }

        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(doc.fileName);
        const publicUrl = urlData.publicUrl;
        console.log(`   Public URL: ${publicUrl}`);

        await prisma.invoice.upsert({
            where: { id: doc.id },
            create: {
                id: doc.id,
                provider: doc.provider,
                amount: doc.amount,
                currency: "EUR",
                date: new Date(doc.date),
                fileUrl: publicUrl,
                status: "PAID",
                type: "PRO"
            },
            update: {
                provider: doc.provider,
                amount: doc.amount,
                date: new Date(doc.date),
                fileUrl: publicUrl,
                status: "PAID"
            }
        });
        console.log(`   ✅ Registered in Invoice table: [${doc.id}]`);
    }
}

async function matchAndEnrichTransactions() {
    console.log("\n=== 2. PARSING STATEMENTS & MATCHING TRANSACTIONS ===");
    const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/raw_cpam_statements_2026.txt'), 'utf-8');
    const lines = content.split('\n');

    let currentMonth = "2026-07";
    let currentDocId = "cpam-releve-juillet-2026";
    let isIndusSection = false;

    const groups: CpamGroup[] = [];
    let currentPatients: { name: string; amount: number }[] = [];
    const indusMap: Record<string, number> = {
        "04/08/2026": 12.58,
        "19/08/2026": 63.79 + 52.82,
        "05/06/2026": 151.99 + 48.09,
        "12/06/2026": 104.51,
        "15/06/2026": 63.25 + 15.35,
        "16/06/2026": 23.28,
        "22/06/2026": 35.32 + 41.94 + 41.31 + 87.49,
        "18/05/2026": 83.88,
        "19/05/2026": 125.82 + 146.79,
        "21/05/2026": 50.32,
        "22/05/2026": 77.09 + 13.47
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.includes("JUILLET 2026")) {
            currentMonth = "2026-07";
            currentDocId = "cpam-releve-juillet-2026";
            isIndusSection = false;
        } else if (line.includes("JUIN 2026")) {
            currentMonth = "2026-06";
            currentDocId = "cpam-releve-juin-2026";
            isIndusSection = false;
        } else if (line.includes("MAI 2026")) {
            currentMonth = "2026-05";
            currentDocId = "cpam-releve-mai-2026";
            isIndusSection = false;
        } else if (line.includes("AVRIL 2026")) {
            currentMonth = "2026-04";
            currentDocId = "cpam-releve-avril-2026";
            isIndusSection = false;
        } else if (line.includes("AOUT 2026")) {
            currentMonth = "2026-08";
            currentDocId = "cpam-releve-aout-2026";
            isIndusSection = false;
        }

        if (line.includes("Autres paiements") || line.includes("RECUPERATION D'INDU")) {
            isIndusSection = true;
        }
        if (line.includes("Vos paiements tiers-payant")) {
            isIndusSection = false;
        }

        const totalMatch = line.match(/Total r[eé]gl[eé] le (\d{2}\/\d{2}\/\d{4}) par (.*?);+([0-9.,\-]+)/i);
        if (totalMatch) {
            const dateStr = totalMatch[1];
            const organism = totalMatch[2].trim();
            const rawAmount = parseFloat(totalMatch[3].replace(',', '.'));

            const patientsAgg: Record<string, number> = {};
            for (const p of currentPatients) {
                patientsAgg[p.name] = (patientsAgg[p.name] || 0) + p.amount;
            }
            const patientsList = Object.entries(patientsAgg).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));
            const indu = indusMap[dateStr] || 0;

            groups.push({
                dateStr,
                monthStr: currentMonth,
                organism,
                totalAmount: rawAmount,
                rawTotalAmount: rawAmount,
                indus: indu,
                patients: patientsList,
                docId: currentDocId
            });

            currentPatients = [];
            continue;
        }

        const parts = line.split(';');
        if (parts.length >= 8 && parts[0].match(/^\d{2}\/\d{2}\/\d{4}$/) && !parts[0].startsWith("Total")) {
            const rawName = parts[4]?.trim() || "";
            const rawAmount = parts[parts.length - 1]?.trim().replace(',', '.');
            const amount = parseFloat(rawAmount);
            if (rawName && !isNaN(amount) && amount > 0) {
                currentPatients.push({
                    name: formatPatientName(rawName),
                    amount
                });
            }
        }
    }

    // Fetch credit transactions from Pennylane
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-04-01" }, { field: "date", operator: "lteq", value: "2026-09-05" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 12; page++) {
        const fetchUrl = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) break;
        const data: any = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);
        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) txCursor = nextCursor;
        else break;
    }

    const creditTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0);
    const usedTxIds = new Set<string>();
    let totalEnriched = 0;

    for (const g of groups) {
        if (g.patients.length === 0) continue;

        const [d, m, y] = g.dateStr.split('/');
        const groupDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const dayMs = 24 * 60 * 60 * 1000;

        const candidateAmounts = [g.rawTotalAmount];
        if (g.indus > 0) {
            candidateAmounts.push(Math.round((g.rawTotalAmount - g.indus) * 100) / 100);
        }

        let bestTx: any = null;
        let matchedAmt = 0;

        for (const targetAmt of candidateAmounts) {
            const matches = creditTxs.filter(tx => {
                if (usedTxIds.has(String(tx.id))) return false;
                const txAmt = parseFloat(tx.amount || "0");
                const amtDiff = Math.abs(txAmt - targetAmt);
                const txTime = new Date(tx.date).getTime();
                const daysDiff = (txTime - groupDate.getTime()) / dayMs;
                return amtDiff < 0.05 && daysDiff >= -1 && daysDiff <= 7;
            });

            if (matches.length > 0) {
                bestTx = matches[0];
                matchedAmt = targetAmt;
                break;
            }
        }

        if (bestTx) {
            usedTxIds.add(String(bestTx.id));
            const txId = String(bestTx.id);
            const descriptionValue = `CPAM_MATCH:${g.docId}|${JSON.stringify(g.patients)}`;

            await prisma.$executeRawUnsafe(
                'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                txId,
                descriptionValue
            );

            console.log(`✨ [${bestTx.date}] Tx ${txId} (${bestTx.amount} €) -> ${g.patients.length} patients: ${g.patients.map(p => p.name).join(', ')} (Doc: ${g.docId})`);
            totalEnriched++;
        }
    }

    console.log(`\n🎉 ENRICHMENT COMPLETE: ${totalEnriched} CPAM & MGEN transactions successfully enriched!`);
}

async function main() {
    await uploadAndRegisterInvoices();
    await matchAndEnrichTransactions();
}

main().catch(console.error).finally(() => prisma.$disconnect());
