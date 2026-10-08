import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

interface CpamItem {
    dateStr: string;
    organism: string;
    patientName: string;
    amount: number;
    acte?: string;
}

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

async function main() {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'scripts/raw_cpam_statements_2026.txt'), 'utf-8');
    const lines = content.split('\n');

    let currentMonth = "2026-07";
    let currentDocId = "cpam-releve-juillet-2026";
    let isMgen = false;
    let isIndusSection = false;

    const groups: CpamGroup[] = [];
    let currentPatients: { name: string; amount: number }[] = [];
    const indusMap: Record<string, number> = {
        // Août
        "04/08/2026": 12.58,
        "19/08/2026": 63.79 + 52.82,
        // Juin
        "05/06/2026": 151.99 + 48.09,
        "12/06/2026": 104.51,
        "15/06/2026": 63.25 + 15.35,
        "16/06/2026": 23.28,
        "22/06/2026": 35.32 + 41.94 + 41.31 + 87.49,
        // Mai
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
            isMgen = false;
            isIndusSection = false;
        } else if (line.includes("JUIN 2026")) {
            currentMonth = "2026-06";
            currentDocId = line.includes("M.G.E.N.") ? "mgen-releve-juin-2026" : "cpam-releve-juin-2026";
            isMgen = line.includes("M.G.E.N.");
            isIndusSection = false;
        } else if (line.includes("MAI 2026")) {
            currentMonth = "2026-05";
            currentDocId = line.includes("M.G.E.N.") ? "mgen-releve-mai-2026" : "cpam-releve-mai-2026";
            isMgen = line.includes("M.G.E.N.");
            isIndusSection = false;
        } else if (line.includes("AVRIL 2026")) {
            currentMonth = "2026-04";
            currentDocId = line.includes("M.G.E.N.") ? "mgen-releve-avril-2026" : "cpam-releve-avril-2026";
            isMgen = line.includes("M.G.E.N.");
            isIndusSection = false;
        } else if (line.includes("AOUT 2026")) {
            currentMonth = "2026-08";
            currentDocId = "cpam-releve-aout-2026";
            isMgen = false;
            isIndusSection = false;
        }

        if (line.includes("Autres paiements") || line.includes("RECUPERATION D'INDU")) {
            isIndusSection = true;
        }
        if (line.includes("Vos paiements tiers-payant")) {
            isIndusSection = false;
        }

        // Total réglé line
        const totalMatch = line.match(/Total r[eé]gl[eé] le (\d{2}\/\d{2}\/\d{4}) par (.*?);+([0-9.,\-]+)/i);
        if (totalMatch) {
            const dateStr = totalMatch[1];
            const organism = totalMatch[2].trim();
            const rawAmount = parseFloat(totalMatch[3].replace(',', '.'));

            // Patients aggregation
            const patientsAgg: Record<string, number> = {};
            for (const p of currentPatients) {
                patientsAgg[p.name] = (patientsAgg[p.name] || 0) + p.amount;
            }
            const patientsList = Object.entries(patientsAgg).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));

            const indu = indusMap[dateStr] || 0;
            const netAmount = Math.round((rawAmount - (isIndusSection ? 0 : 0)) * 100) / 100;

            groups.push({
                dateStr,
                monthStr: currentMonth,
                organism,
                totalAmount: netAmount,
                rawTotalAmount: rawAmount,
                indus: indu,
                patients: patientsList,
                docId: currentDocId
            });

            currentPatients = [];
            continue;
        }

        // Line item
        const parts = line.split(';');
        if (parts.length >= 8 && parts[0].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
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

    console.log(`Extracted ${groups.length} payment groups.`);

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

    let matchCount = 0;
    const matchedPairs: { group: CpamGroup; tx: any; effectiveAmount: number }[] = [];

    for (const g of groups) {
        const [d, m, y] = g.dateStr.split('/');
        const groupDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const dayMs = 24 * 60 * 60 * 1000;

        // Candidate amounts: raw amount OR raw amount minus indus
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
                // Bank transaction is usually on the same day or 1 to 6 days AFTER payment date
                return amtDiff < 0.05 && daysDiff >= -1 && daysDiff <= 7;
            });

            if (matches.length > 0) {
                bestTx = matches[0];
                matchedAmt = targetAmt;
                break;
            }
        }

        if (!bestTx) {
            console.log(`❌ UNMATCHED [${g.dateStr}] gross: ${g.rawTotalAmount} €, indus: ${g.indus} €, net: ${g.totalAmount} € par ${g.organism} | ${g.patients.length} patients (${g.patients.map(p => p.name).join(', ')})`);
        }
    }

    console.log(`\nTOTAL MATCHED: ${matchCount} / ${groups.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
