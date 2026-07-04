import { PrismaClient } from '@prisma/client';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

interface PatientAmount {
    name: string;
    amount: number;
}

interface PaymentGroup {
    dateStr: string; // format "DD/MM/YYYY"
    caisse: string;
    date: Date;
    totalAmount: number;
    patients: Record<string, number>; // name -> cumulative amount
}

function formatPatientName(rawName: string): string {
    // Transformer "NABAL GIANNI JULIEN" en "NABAL Gianni Julien"
    const words = rawName.trim().split(/\s+/);
    return words.map((w, idx) => {
        if (idx === 0) return w.toUpperCase(); // Nom en majuscules
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); // Prénoms
    }).join(' ');
}

async function parseCpamPdf(pdfBuffer: Buffer): Promise<PaymentGroup[]> {
    const parsed = await pdfParse(pdfBuffer);
    const text = parsed.text || "";
    const lines = text.split('\n');

    const groups: PaymentGroup[] = [];
    
    // Regex pour détecter les lignes de détails (sans espaces obligatoires)
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
                
                // Trouver ou créer le groupe pour cette date de paiement et cette caisse
                let group = groups.find(g => `${g.dateStr}-${g.caisse}` === key);
                if (!group) {
                    const [d, m, y] = payDateStr.split('/');
                    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                    group = {
                        dateStr: payDateStr,
                        caisse,
                        date,
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
    console.log("🔍 Récupération des relevés CPAM de 2026...");
    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { provider: { contains: 'cpam', mode: 'insensitive' } },
                { provider: { contains: 'assurance', mode: 'insensitive' } },
                { provider: { contains: 'assurance maladie', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Trouvé ${invoices.length} document(s) CPAM en base.`);

    console.log("🔍 Récupération des transactions bancaires de crédit de 2026...");
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
        {
            field: "date",
            operator: "gteq",
            value: "2026-01-01"
        }
    ];
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
        const data = await res.json();
        const items = data.transactions || data.items || [];
        if (items.length === 0) break;
        allTxs.push(...items);

        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
            txCursor = nextCursor;
        } else {
            break;
        }
    }

    // Filtrer pour ne garder que les rentrées d'argent (crédits)
    const creditTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0);
    console.log(`✅ ${creditTxs.length} transaction(s) de crédit trouvée(s) au total.`);

    let enrichCount = 0;

    for (const inv of invoices) {
        if (!inv.fileUrl) continue;
        console.log(`\n📄 Analyse du relevé CPAM : "${inv.provider}" (${inv.amount} €) du ${inv.date.toISOString().split('T')[0]}`);
        
        try {
            // Télécharger le PDF
            const pdfRes = await fetch(inv.fileUrl);
            if (!pdfRes.ok) {
                console.error(`❌ Échec du téléchargement du PDF : ${inv.fileUrl}`);
                continue;
            }
            const arrayBuffer = await pdfRes.arrayBuffer();
            const pdfBuffer = Buffer.from(arrayBuffer);

            // Parser le PDF pour obtenir les groupes de paiements par date
            const groups = await parseCpamPdf(pdfBuffer);
            console.log(`   Trouvé ${groups.length} versement(s) individuel(s) détaillé(s) dans le PDF.`);

            for (const group of groups) {
                const groupAmount = group.totalAmount;
                const groupDate = group.date;
                const patientsList = Object.entries(group.patients).map(([name, amount]) => ({ name, amount }));

                if (groupAmount <= 0 || patientsList.length === 0) continue;

                // Trouver la transaction correspondante dans Pennylane
                const matchedTx = creditTxs.find(tx => {
                    const txAmount = parseFloat(tx.amount || "0");
                    const amountDiff = Math.abs(txAmount - groupAmount);
                    
                    const txTime = new Date(tx.date).getTime();
                    const groupTime = groupDate.getTime();
                    const dayMs = 24 * 60 * 60 * 1000;
                    
                    // Match si différence de montant < 0.05 € et de date < 4 jours
                    return amountDiff < 0.05 && Math.abs(txTime - groupTime) <= 4 * dayMs;
                });

                if (matchedTx) {
                    const txId = String(matchedTx.id);
                    const descriptionValue = `CPAM_JSON:${JSON.stringify(patientsList)}`;
                    
                    await prisma.$executeRawUnsafe(
                        'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                        txId,
                        descriptionValue
                    );
                    
                    console.log(`   ✨ Match trouvé ! Transaction ${txId} (${matchedTx.amount} €) le ${matchedTx.date} -> ${patientsList.length} patients.`);
                    enrichCount++;
                }
            }
        } catch (err) {
            console.error(`❌ Erreur lors du traitement du document CPAM :`, err);
        }
    }

    console.log(`\n🏁 Fin du script d'enrichissement CPAM ! ${enrichCount} virement(s) CPAM enrichi(s) avec succès.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
