import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

function formatPatientName(rawName: string): string {
    const words = rawName.trim().split(/\s+/);
    return words.map((w, idx) => {
        if (idx === 0) return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
}

function cleanStorageKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")
    .replace(/_+/g, '_')
    .trim();
}

async function main() {
    const desktopFolder = "/Users/guillaumephilippe/Desktop/Factures SumUp";
    if (!fs.existsSync(desktopFolder)) {
        fs.mkdirSync(desktopFolder, { recursive: true });
    }

    console.log("🔌 Connexion au serveur IMAP iCloud...");
    const connection = await imaps.connect(IMAP_CONFIG);
    const boxes = ['INBOX', 'Archive'];
    
    console.log("🔍 Récupération des transactions bancaires SumUp et CPAM de 2026 pour rapprochement...");
    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    const BASE_URL = "https://app.pennylane.com/api/external/v2";
    
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
        const fetchUrl: string = `${BASE_URL}/transactions?filter=${filterStr}&limit=100` + (txCursor ? `&cursor=${txCursor}` : '');
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

        const nextCursor: string | null = data.next_cursor || data.meta?.next_cursor || null;
        if (nextCursor) {
            txCursor = nextCursor;
        } else {
            break;
        }
    }

    const creditTxs = allTxs.filter(t => parseFloat(t.amount || "0") > 0);
    console.log(`✅ ${creditTxs.length} transaction(s) de crédit trouvée(s) au total.`);

    let sumupCount = 0;
    let cpamCount = 0;

    for (const box of boxes) {
        console.log(`\n📂 Ouverture de la boîte : ${box}...`);
        await connection.openBox(box);

        // 1. SUMUP
        console.log("🔍 Recherche des e-mails SumUp (Headers uniquement)...");
        const sumupCriteria = [
            ['SINCE', '01-Jan-2025'],
            ['SUBJECT', 'Relevé quotidien de vos paiements']
        ];
        const sumupMessages = await connection.search(sumupCriteria, { bodies: ['HEADER'], struct: true });
        console.log(`   Trouvé ${sumupMessages.length} e-mails SumUp.`);

        for (const msg of sumupMessages) {
            const headerPart = msg.parts.find((p: any) => p.which === 'HEADER');
            if (!headerPart) continue;

            const dateHeader = headerPart.body.date?.[0];
            const date = dateHeader ? new Date(dateHeader) : new Date();
            const dateStr = date.toISOString().split('T')[0];

            // 1. Vérification rapide sur le Bureau et en DB
            const files = fs.readdirSync(desktopFolder);
            const onDesktop = files.some(f => f.startsWith(dateStr));

            const existing = await prisma.invoice.findFirst({
                where: {
                    provider: "SUMUP RAPPORT DE PAIEMENTS",
                    date: {
                        gte: new Date(date.getTime() - 24 * 60 * 60 * 1000),
                        lte: new Date(date.getTime() + 24 * 60 * 60 * 1000)
                    }
                }
            });

            if (existing && onDesktop) {
                // Déjà traité en DB et présent sur le Bureau, on évite de télécharger le corps du message !
                continue;
            }

            // 2. Nouveau message détecté ! On télécharge le message complet avec la pièce jointe
            console.log(`   📥 Nouveau rapport SumUp détecté le ${dateStr}. Téléchargement de l'e-mail...`);
            const fullMsgs = await connection.search([['UID', msg.attributes.uid]], { bodies: [''], struct: true });
            if (!fullMsgs || fullMsgs.length === 0) continue;

            const rawBodyPart = fullMsgs[0].parts.find((p: any) => p.which === '');
            if (!rawBodyPart) continue;

            const mail = await simpleParser(rawBodyPart.body);
            const paymentPdf = mail.attachments.find(a => 
                (a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')) &&
                (a.filename?.toLowerCase().includes('payments-report') || a.filename?.toLowerCase().includes('payout'))
            );

            if (!paymentPdf) continue;

            const parsedPdf = await pdfParse(paymentPdf.content);
            const pdfText = parsedPdf.text || "";
            
            const patients: PatientTx[] = [];
            // Ne garder que la section "Versement effectué" pour ne pas inclure les paiements "À verser" (futurs versements)
            const mainPart = pdfText.split(/À verser|A verser/i)[0];
            const lines = mainPart.split('\n').map(l => l.trim()).filter(Boolean);
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('1 x ')) {
                    const after = line.split('1 x ')[1].trim();
                    if (after.includes('€')) {
                        // Format: "Jiva€90.00€1.16"
                        const parts = after.split('€');
                        const name = formatPatientName(parts[0]);
                        const amountStr = parts[1]?.match(/[0-9.,]+/)?.[0];
                        const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                        if (name && amount > 0) {
                            if (!patients.some(p => p.name === name && p.amount === amount)) {
                                patients.push({ name, amount });
                            }
                        }
                    } else {
                        // Multi-line name
                        let nameParts = [after];
                        let amount = 0;
                        let j = i + 1;
                        while (j < lines.length) {
                            const nextLine = lines[j];
                            if (nextLine.includes('1 x ') || nextLine.includes('Totaux:') || nextLine.includes('Total:')) {
                                break;
                            }
                            if (nextLine.includes('€')) {
                                // Trouvé la ligne du montant, ex: "€90.00€1.16"
                                const parts = nextLine.split('€');
                                const amountStr = parts[1]?.match(/[0-9.,]+/)?.[0];
                                amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                                break;
                            }
                            nameParts.push(nextLine);
                            j++;
                        }
                        const name = formatPatientName(nameParts.join(' '));
                        if (name && amount > 0) {
                            if (!patients.some(p => p.name === name && p.amount === amount)) {
                                patients.push({ name, amount });
                            }
                        }
                    }
                }
            }

            let netAmount = 0.0;
            const netMatch = pdfText.match(/(?:Versement effectué|Montant du versement|La somme transférée)[^\d€]*€\s*([0-9.,]+)/i);
            if (netMatch) netAmount = parseFloat(netMatch[1].replace(',', '.'));

            if (isNaN(netAmount) || netAmount === 0.0) {
                const totauxMatch = pdfText.match(/Totaux:\s*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*=\s*€\s*([0-9.,]+)/);
                if (totauxMatch) netAmount = parseFloat(totauxMatch[1].replace(',', '.'));
            }

            if (netAmount > 0 && patients.length > 0) {
                // Enregistrer le PDF localement sur le Bureau
                const rawFilename = `${dateStr} - SUMUP_RAPPORT_DE_PAIEMENTS - ${netAmount.toFixed(2)}€.pdf`;
                const desktopPath = path.join(desktopFolder, rawFilename);
                fs.writeFileSync(desktopPath, paymentPdf.content);
                console.log(`      💾 Enregistré sur le Bureau : ${rawFilename}`);

                // Upload PDF vers Supabase Storage
                const cleanKey = cleanStorageKey(rawFilename);

                const { error: uploadError } = await supabase.storage
                    .from('invoices')
                    .upload(cleanKey, paymentPdf.content, {
                        contentType: 'application/pdf',
                        upsert: true
                    });

                if (uploadError) {
                    console.error(`      ❌ Échec upload de ${cleanKey} sur Supabase Storage :`, uploadError.message);
                    continue;
                }

                const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(cleanKey);
                const fileUrl = urlData.publicUrl;

                // Créer la facture en base si elle n'existe pas déjà
                if (!existing) {
                    const newInv = await prisma.invoice.create({
                        data: {
                            provider: "SUMUP RAPPORT DE PAIEMENTS",
                            amount: netAmount,
                            currency: "EUR",
                            date: date,
                            fileUrl: fileUrl,
                            status: "COMPLETED",
                            type: "PRO"
                        }
                    });
                    sumupCount++;
                    console.log(`      ✅ Facture créée : ${newInv.provider} - ${newInv.amount} €`);
                } else {
                    console.log(`      ℹ️ Facture déjà présente en DB.`);
                }

                // Liaison avec la transaction et TransactionDetail
                const matchedTx = creditTxs.find((tx: any) => {
                    const txAmount = parseFloat(tx.amount || "0");
                    const amountDiff = Math.abs(txAmount - netAmount);
                    const txTime = new Date(tx.date).getTime();
                    const mailTime = date.getTime();
                    return amountDiff < 0.05 && Math.abs(txTime - mailTime) <= 4 * 24 * 60 * 60 * 1000;
                });

                if (matchedTx) {
                    const txId = String(matchedTx.id);
                    const descriptionValue = `SUMUP_JSON:${JSON.stringify(patients)}`;
                    await prisma.$executeRawUnsafe(
                        'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
                        txId,
                        descriptionValue
                    );
                    console.log(`      ✨ Détail des patients SumUp enregistré pour la transaction ${txId}`);
                }
            }
        }

        // 2. CPAM (Désactivé : les fichiers sont importés manuellement)
    }
    
    connection.end();
    console.log(`\n🏁 Traitement terminé !`);
    console.log(`📊 Bilan : ${sumupCount} rapports SumUp et ${cpamCount} rapports CPAM importés.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
