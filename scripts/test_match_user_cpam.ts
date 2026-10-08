import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

interface CpamGroup {
    dateStr: string; // DD/MM/YYYY
    monthStr: string;
    organism: string;
    totalAmount: number;
    patients: Record<string, number>;
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
    const groups: CpamGroup[] = [];
    let currentPatients: { name: string; amount: number; dateStr: string; organism: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.includes("JUILLET 2026")) currentMonth = "2026-07";
        else if (line.includes("JUIN 2026")) currentMonth = "2026-06";
        else if (line.includes("MAI 2026")) currentMonth = "2026-05";
        else if (line.includes("AVRIL 2026")) currentMonth = "2026-04";
        else if (line.includes("AOUT 2026")) currentMonth = "2026-08";

        // Check for Total réglé line
        const totalMatch = line.match(/Total r[eé]gl[eé] le (\d{2}\/\d{2}\/\d{4}) par (.*?);+([0-9.,\-]+)/i);
        if (totalMatch) {
            const dateStr = totalMatch[1];
            const organism = totalMatch[2].trim();
            const totalAmount = parseFloat(totalMatch[3].replace(',', '.'));

            const patientsMap: Record<string, number> = {};
            for (const p of currentPatients) {
                patientsMap[p.name] = (patientsMap[p.name] || 0) + p.amount;
            }

            groups.push({
                dateStr,
                monthStr: currentMonth,
                organism,
                totalAmount,
                patients: patientsMap
            });

            currentPatients = [];
            continue;
        }

        // Check for individual item line
        // Format: Date de paiement; N° de lot; N°de facture; Organisme; Nom du bénéficiaire; N° Sécu; Nature de l'acte; Date de l'acte...; Montant
        const parts = line.split(';');
        if (parts.length >= 8 && parts[0].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const dateStr = parts[0].trim();
            const organism = parts[3]?.trim() || "";
            const rawName = parts[4]?.trim() || "";
            const rawAmount = parts[parts.length - 1]?.trim().replace(',', '.');
            const amount = parseFloat(rawAmount);

            if (rawName && !isNaN(amount)) {
                const formattedName = formatPatientName(rawName);
                currentPatients.push({
                    name: formattedName,
                    amount,
                    dateStr,
                    organism
                });
            }
        }
    }

    console.log(`Parsed ${groups.length} CPAM payment groups from user data.`);

    // Fetch all Pennylane credit transactions for 2026
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [{ field: "date", operator: "gteq", value: "2026-01-01" }];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 15; page++) {
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
    console.log(`Loaded ${creditTxs.length} credit transactions from Pennylane.`);

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const g of groups) {
        const [d, m, y] = g.dateStr.split('/');
        const groupDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const dayMs = 24 * 60 * 60 * 1000;

        // Find matching transaction
        const matched = creditTxs.filter(tx => {
            const txAmt = parseFloat(tx.amount || "0");
            const amtDiff = Math.abs(txAmt - g.totalAmount);
            const txTime = new Date(tx.date).getTime();
            const dateDiffDays = Math.abs(txTime - groupDate.getTime()) / dayMs;
            return amtDiff < 0.05 && dateDiffDays <= 5;
        });

        const pCount = Object.keys(g.patients).length;
        const pNames = Object.keys(g.patients).join(', ');

        if (matched.length > 0) {
            matchedCount++;
            console.log(`✅ MATCH [${g.dateStr}] ${g.totalAmount} € (${g.organism}) -> Tx ${matched[0].id} on ${matched[0].date} (${matched[0].label}) | ${pCount} patients: ${pNames}`);
        } else {
            unmatchedCount++;
            console.log(`❌ NO MATCH [${g.dateStr}] ${g.totalAmount} € (${g.organism}) | ${pCount} patients: ${pNames}`);
        }
    }

    console.log(`\nResults: ${matchedCount} matched, ${unmatchedCount} unmatched.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
