import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
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

interface DocToUpload {
    id: string;
    localPath: string;
    storageName: string;
    provider: string;
    amount: number;
    date: string;
    type?: string;
}

const DOCS_TO_UPLOAD: DocToUpload[] = [
    {
        id: "urssaf-echeancier-2026",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/URSSAF 2026.pdf",
        storageName: "2026-07-04_-_URSSAF_REGULARISATION_ET_ECHEANCIER_2026_-_2088.00EUR.pdf",
        provider: "URSSAF - Régularisation cotisations 2025 et échéancier 2026",
        amount: 2088.00,
        date: "2026-07-04"
    },
    {
        id: "carpimko-appel-2026",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/06 - Juin/2026-06-12 - CARPIMKO_APPEL_DE_COTISATIONS - 5434.00€.pdf",
        storageName: "2026-06-12_-_CARPIMKO_APPEL_DE_COTISATIONS_-_5434.00EUR.pdf",
        provider: "CARPIMKO - Appel de cotisations 2026 (Régime de base et complémentaire)",
        amount: 5434.00,
        date: "2026-06-12"
    },
    {
        id: "lcl-pret-18942536",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/CREDIT 2.pdf",
        storageName: "2026-01-01_-_LCL_TABLEAU_AMORTISSEMENT_PRET_18942536_-_680.04EUR.pdf",
        provider: "LCL - Échéancier Prêt équipement professionnel 18942536 (50 000 €)",
        amount: 680.04,
        date: "2026-01-01"
    },
    {
        id: "adoha-gpm-prevoyance-2026",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/6-MUTELLE_PREVOYANCE/Avis d'échéance GUILLAUME.pdf",
        storageName: "2026-01-01_-_ADOHA_GPM_AVIS_ECHEANCE_PREVOYANCE_-_901.33EUR.pdf",
        provider: "ADOHA - GPM Courtage - Prévoyance Madelin (901.33 € / mois)",
        amount: 901.33,
        date: "2026-01-01"
    },
    {
        id: "lixxbail-cession-macbook",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/MACBOOKPRO 14/Facture_Leaseback_Philippe_Guillaume.pdf",
        storageName: "2026-08-06_-_LIXXBAIL_FACTURE_CESSION_LEASEBACK_MACBOOK_-_7089.00EUR.pdf",
        provider: "LIXXBAIL - Facture cession leaseback MacBook Pro (7 089.00 €)",
        amount: 7089.00,
        date: "2026-08-06"
    },
    {
        id: "lcl-leasing-premier-loyer",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/08 - Aout/2026-08-06 - LCL LEASING - 568.83EUR.pdf",
        storageName: "2026-08-06_-_LCL_LEASING_FACTURE_PREMIER_LOYER_MAJORÉ_-_568.83EUR.pdf",
        provider: "LCL LEASING - Premier loyer majoré matériel informatique (568.83 €)",
        amount: 568.83,
        date: "2026-08-06"
    },
    {
        id: "cpam-releve-mars-2026",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/03 - Mars/2026-03-31 - GUILLAUME_PHILIPPE_RELEVE_PAIEMENTS_TIERSPAYANT - 4496.86€.pdf",
        storageName: "2026-03-31_-_CPAM_RELEVE_PAIEMENTS_TIERSPAYANT_MARS_-_4496.86EUR.pdf",
        provider: "CPAM - Relevé mensuel des paiements tiers-payant Mars 2026 (4 496.86 €)",
        amount: 4496.86,
        date: "2026-03-31"
    },
    {
        id: "cpam-releve-mai-2026",
        localPath: "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/05 - Mai/2026-05-31 - AMELI_REMBOURSEMENTS_FRAIS_MEDICAUX - 6056.03€.pdf",
        storageName: "2026-05-31_-_AMELI_REMBOURSEMENTS_FRAIS_MEDICAUX_MAI_-_6056.03EUR.pdf",
        provider: "AMELI / CPAM - Relevé mensuel des paiements tiers-payant Mai 2026 (6 056.03 €)",
        amount: 6056.03,
        date: "2026-05-31"
    }
];

function formatPatientName(rawName: string): string {
    const words = rawName.trim().split(/\s+/);
    return words.map((w, idx) => {
        if (idx === 0) return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
}

interface PaymentGroup {
    dateStr: string;
    caisse: string;
    totalAmount: number;
    patients: Record<string, number>;
}

async function parseCpamPdf(buffer: Buffer): Promise<PaymentGroup[]> {
    const parsed = await pdfParse(buffer);
    const text = parsed.text || "";
    const lines = text.split('\n');

    const groups: PaymentGroup[] = [];
    const detailRegex = /(\d{2}\/\d{2}\/\d{4})\d{9}CPAM\s*n°\s*(\d{3})([A-Z\s\-]{3,})(\d{13,15})[A-Z]{3}\d{2}\/\d{2}\/\d{4}(?:\s*au\s*\d{2}\/\d{2}\/\d{4})?([0-9.,]+)\s*€/;

    for (const line of lines) {
        const detailMatch = line.match(detailRegex);
        if (detailMatch) {
            const payDateStr = detailMatch[1];
            const caisse = detailMatch[2];
            const rawName = detailMatch[3].trim();
            const amount = parseFloat(detailMatch[5].replace(',', '.'));

            if (!isNaN(amount) && rawName) {
                const formattedName = formatPatientName(rawName);
                const key = `${payDateStr}-${caisse}`;
                let group = groups.find(g => `${g.dateStr}-${g.caisse}` === key);
                if (!group) {
                    group = {
                        dateStr: payDateStr,
                        caisse,
                        totalAmount: 0,
                        patients: {}
                    };
                    groups.push(group);
                }
                group.patients[formattedName] = (group.patients[formattedName] || 0) + amount;
                group.totalAmount += amount;
            }
        }
    }
    return groups;
}

async function main() {
    console.log("=== 1. UPLOAD & REGISTER OFFICIAL DOCUMENTS IN SUPABASE & PRISMA ===");
    for (const doc of DOCS_TO_UPLOAD) {
        if (!fs.existsSync(doc.localPath)) {
            console.warn(`⚠️ Fichier non trouvé localement : ${doc.localPath}`);
            continue;
        }

        const fileBuffer = fs.readFileSync(doc.localPath);
        console.log(`📤 Upload de "${doc.storageName}" vers Supabase Storage...`);
        const { error: uploadError } = await supabase.storage.from('invoices').upload(doc.storageName, fileBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

        if (uploadError) {
            console.error(`❌ Erreur upload Supabase : ${uploadError.message}`);
            continue;
        }

        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(doc.storageName);
        const publicUrl = publicUrlData.publicUrl;
        console.log(`   URL publique : ${publicUrl}`);

        // Upsert dans la table Invoice
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
                type: doc.type || "PRO"
            },
            update: {
                provider: doc.provider,
                amount: doc.amount,
                date: new Date(doc.date),
                fileUrl: publicUrl,
                status: "PAID"
            }
        });
        console.log(`   ✅ Enregistré en base dans Invoice : [${doc.id}] ${doc.provider}`);
    }

    console.log("\n=== 2. PARSE CPAM STATEMENTS & ENRICH ALL MATCHING TRANSACTIONS ===");
    // Récupérer toutes les transactions Pennylane de crédit 2026
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-01-01" }];
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
    console.log(`Trouvé ${creditTxs.length} transaction(s) de crédit dans Pennylane.`);

    const cpamDocs = DOCS_TO_UPLOAD.filter(d => d.id.startsWith('cpam-'));
    let totalEnriched = 0;

    for (const doc of cpamDocs) {
        const fileBuffer = fs.readFileSync(doc.localPath);
        const groups = await parseCpamPdf(fileBuffer);
        console.log(`\n📄 Parsing de "${doc.provider}": ${groups.length} groupes de paiement.`);

        for (const g of groups) {
            const [d, m, y] = g.dateStr.split('/');
            const groupDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const groupAmount = g.totalAmount;
            const patientsList = Object.entries(g.patients).map(([name, amount]) => ({ name, amount }));

            // Trouver la transaction correspondante
            const matchedTx = creditTxs.find(tx => {
                const txAmount = parseFloat(tx.amount || "0");
                const amountDiff = Math.abs(txAmount - groupAmount);
                const txTime = new Date(tx.date).getTime();
                const groupTime = groupDate.getTime();
                const dayMs = 24 * 60 * 60 * 1000;
                return amountDiff < 0.05 && Math.abs(txTime - groupTime) <= 4 * dayMs;
            });

            if (matchedTx) {
                const txId = String(matchedTx.id);
                const descriptionValue = `CPAM_MATCH:${doc.id}|${JSON.stringify(patientsList)}`;
                await prisma.$executeRawUnsafe(
                    'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                    txId,
                    descriptionValue
                );
                console.log(`   ✨ Match CPAM réussi : tx ${txId} (${matchedTx.amount} €) -> ${patientsList.length} patient(s) : ${patientsList.map(p => p.name).join(', ')}`);
                totalEnriched++;
            }
        }
    }

    console.log(`\n🎉 Total transactions CPAM enrichies : ${totalEnriched}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
