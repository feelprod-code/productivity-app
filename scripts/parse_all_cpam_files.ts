import pdfParse from 'pdf-parse';
import * as fs from 'fs';

interface PaymentGroup {
    dateStr: string;
    caisse: string;
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

async function parsePdf(fileOrBuffer: string | Buffer): Promise<PaymentGroup[]> {
    const buffer = typeof fileOrBuffer === 'string' ? fs.readFileSync(fileOrBuffer) : fileOrBuffer;
    const parsed = await pdfParse(buffer);
    const text = parsed.text || "";
    const lines = text.split('\n');

    const groups: PaymentGroup[] = [];
    // Regex for CPAM detail lines
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
    const files = [
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/01 - Janvier/2026-01-31 - AMELI_RELEVE_COMPTE_TIERSPAYANT - 6728.64€.pdf',
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/02 - Février/2026-02-29 - CPAM_N_751_REMBOURSEMENTS_SANTE_TIERSPAYANT - 5801.98€.pdf',
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/03 - Mars/2026-03-31 - GUILLAUME_PHILIPPE_RELEVE_PAIEMENTS_TIERSPAYANT - 4496.86€.pdf',
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/05 - Mai/2026-05-31 - AMELI_REMBOURSEMENTS_FRAIS_MEDICAUX - 6056.03€.pdf'
    ];

    for (const f of files) {
        if (!fs.existsSync(f)) {
            console.log(`NOT FOUND: ${f}`);
            continue;
        }
        console.log(`\n========================================`);
        console.log(`FILE: ${f}`);
        const groups = await parsePdf(f);
        console.log(`Total payment groups found: ${groups.length}`);
        let totalSum = 0;
        for (const g of groups) {
            totalSum += g.totalAmount;
            const patNames = Object.keys(g.patients);
            console.log(`- Date: ${g.dateStr} | Caisse: ${g.caisse} | Total: ${g.totalAmount.toFixed(2)} € | Patients (${patNames.length}): ${patNames.join(', ')}`);
        }
        console.log(`TOTAL DETAILED IN FILE: ${totalSum.toFixed(2)} €`);
    }

    // Also download and test the Pennylane URL
    console.log(`\n========================================`);
    console.log(`PENNYLANE INVOICE (June 2026)`);
    const pennylaneUrl = "https://app.pennylane.com/public/invoice/pdf?encrypted_id=s%2FCdIqCgmmNKb882ayoJ4QYkWvhI8qvfve1TKASizhGrZUUvHQ2Dwae333poRSGj%2FEACAyUYOiOuM%2BfN4r49vOQRc6OYNMED21dGyXyYWxczLmcWue9aqq%2BmfQ4KZg%3D%3D--k7fhgnZS2mEapGqI--B9rieGfQ0a%2B9Jzz2jJRCSA%3D%3D";
    try {
        const res = await fetch(pennylaneUrl);
        if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            const groups = await parsePdf(buf);
            console.log(`Total payment groups in Pennylane invoice: ${groups.length}`);
            for (const g of groups.slice(0, 10)) {
                console.log(`- Date: ${g.dateStr} | Caisse: ${g.caisse} | Total: ${g.totalAmount.toFixed(2)} € | Patients: ${Object.keys(g.patients).join(', ')}`);
            }
        }
    } catch (e: any) {
        console.log(`Error fetching Pennylane invoice: ${e.message}`);
    }
}

main().catch(console.error);
