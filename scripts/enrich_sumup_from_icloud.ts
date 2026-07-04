import { PrismaClient } from '@prisma/client';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const IMAP_CONFIG = {
    imap: {
        user: 'guillaumephilippe@me.com',
        password: 'ezux-gvqf-htzt-xxpi',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

interface PatientTx {
    name: string;
    amount: number;
}

function parseSumUpPdf(text: string): { patients: PatientTx[], netAmount: number } {
    const patients: PatientTx[] = [];
    const lines = text.split('\n');
    
    // Recherche des lignes de transaction (ex: 1 x Grios €63.65)
    for (const line of lines) {
        if (line.includes('1 x') && line.includes('€')) {
            const match = line.match(/1\s*x\s*([^€]+)€\s*([0-9.,]+)/);
            if (match) {
                const name = match[1].trim();
                const amountStr = match[2].replace(',', '.');
                const amount = parseFloat(amountStr);
                if (!isNaN(amount)) {
                    // Éviter les doublons
                    if (!patients.some(p => p.name === name && p.amount === amount)) {
                        patients.push({ name, amount });
                    }
                }
            }
        }
    }

    // Recherche du montant net total du versement
    let netAmount = 0.0;
    const netMatch = text.match(/(?:Versement effectué|Montant du versement|La somme transférée)[^\d€]*€\s*([0-9.,]+)/i);
    if (netMatch) {
        netAmount = parseFloat(netMatch[1].replace(',', '.'));
    }

    if (isNaN(netAmount) || netAmount === 0.0) {
        const totauxMatch = text.match(/Totaux:\s*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*=\s*€\s*([0-9.,]+)/);
        if (totauxMatch) {
            netAmount = parseFloat(totauxMatch[1].replace(',', '.'));
        }
    }

    return {
        patients,
        netAmount: isNaN(netAmount) ? 0 : netAmount
    };
}

async function main() {
    console.log("🔍 Récupération des transactions SumUp de 2026...");
    
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

    // Filtrer pour ne garder que les transactions SumUp de type versement/crédit (montant positif)
    const sumupTxs = allTxs.filter((tx: any) => {
        const labelLower = (tx.label || "").toLowerCase();
        const isSumUp = labelLower.includes("sumup");
        const isCredit = parseFloat(tx.amount || "0") > 0;
        return isSumUp && isCredit;
    });

    console.log(`✅ ${sumupTxs.length} transaction(s) de versement SumUp trouvée(s).`);

    // Charger les détails déjà existants pour éviter les appels inutiles
    const details = await prisma.$queryRawUnsafe('SELECT id FROM "TransactionDetail" WHERE description LIKE \'SUMUP_JSON:%\'') as any[];
    const processedIds = new Set(details.map(d => String(d.id)));

    const remainingTxs = sumupTxs.filter(t => !processedIds.has(String(t.id)));
    console.log(`⚡ ${remainingTxs.length} transaction(s) nécessitent une extraction d'email.`);
    
    if (remainingTxs.length === 0) {
        console.log("🏁 Toutes les transactions SumUp de 2026 sont déjà à jour !");
        return;
    }

    console.log("🔌 Connexion au serveur IMAP iCloud...");
    const connection = await imaps.connect(IMAP_CONFIG);
    const boxes = ['INBOX', 'Archive'];
    
    let enrichmentsCount = 0;

    for (const box of boxes) {
        console.log(`📂 Lecture de la boîte : ${box}...`);
        await connection.openBox(box);

        // Recherche des e-mails SumUp de relevé quotidien depuis le 01 Janvier 2026
        const searchCriteria = [
            ['SINCE', '01-Jan-2026'],
            ['SUBJECT', 'Relevé quotidien de vos paiements']
        ];
        
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            struct: true
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`   Trouvé ${messages.length} e-mails de relevé SumUp.`);

        for (const msg of messages) {
            const rawBodyPart = msg.parts.find((p: any) => p.which === '');
            if (!rawBodyPart) continue;

            const mail = await simpleParser(rawBodyPart.body);
            const date = mail.date || new Date();
            const subject = mail.subject || "";

            // Trouver la pièce jointe PDF du rapport des paiements
            const paymentPdf = mail.attachments.find(a => 
                (a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')) &&
                a.filename?.toLowerCase().includes('daily-payments-report')
            );

            if (!paymentPdf) continue;

            const parsedPdf = await pdfParse(paymentPdf.content);
            const pdfText = parsedPdf.text || "";
            const { patients, netAmount } = parseSumUpPdf(pdfText);

            if (netAmount > 0 && patients.length > 0) {
                // Trouver la transaction correspondante dans notre liste
                const matchedTx = remainingTxs.find(tx => {
                    const txAmount = parseFloat(tx.amount || "0");
                    const amountDiff = Math.abs(txAmount - netAmount);
                    
                    const txTime = new Date(tx.date).getTime();
                    const mailTime = date.getTime();
                    const dayMs = 24 * 60 * 60 * 1000;
                    
                    // Correspondance si écart de montant < 0.05 € et écart de date < 3 jours
                    return amountDiff < 0.05 && Math.abs(txTime - mailTime) <= 3 * dayMs;
                });

                if (matchedTx) {
                    const txId = String(matchedTx.id);
                    const descriptionValue = `SUMUP_JSON:${JSON.stringify(patients)}`;
                    
                    await prisma.$executeRawUnsafe(
                        'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                        txId,
                        descriptionValue
                    );
                    
                    console.log(`   ✨ Match trouvé ! Transaction ${txId} (${matchedTx.amount} €) -> ${patients.length} patients.`);
                    enrichmentsCount++;
                    
                    // Retirer de la liste de recherche pour ne pas chercher de doublons
                    const idx = remainingTxs.indexOf(matchedTx);
                    if (idx > -1) remainingTxs.splice(idx, 1);
                }
            }
        }
    }

    connection.end();
    console.log(`\n🏁 Traitement terminé ! ${enrichmentsCount} versement(s) SumUp enrichi(s) avec succès.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
