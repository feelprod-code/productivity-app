import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

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

function formatPatientName(rawName: string): string {
    return rawName
        .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

async function main() {
    console.log("🔌 Connexion au serveur IMAP iCloud...");
    const connection = await imaps.connect(IMAP_CONFIG);
    await connection.openBox('INBOX');
    
    // Rechercher un email SumUp de 2025
    const searchCriteria = [
        ['BEFORE', '01-Jan-2026'],
        ['SINCE', '01-Sep-2025'],
        ['SUBJECT', 'Relevé quotidien de vos paiements']
    ];
    
    const messages = await connection.search(searchCriteria, { bodies: ['HEADER', 'TEXT', ''], struct: true });
    console.log(`   Trouvé ${messages.length} e-mails.`);
    
    if (messages.length > 0) {
        const msg = messages[0];
        const rawBodyPart = msg.parts.find((p: any) => p.which === '');
        if (rawBodyPart) {
            const mail = await simpleParser(rawBodyPart.body);
            const sumupPdf = mail.attachments.find(a => a.contentType === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf'));
            if (sumupPdf) {
                console.log(`📄 Attachment found: ${sumupPdf.filename}`);
                const parsed = await pdfParse(sumupPdf.content);
                const text = parsed.text;
                
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                const patients: { name: string, amount: number }[] = [];
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.includes('1 x ')) {
                        const after = line.split('1 x ')[1].trim();
                        if (after.includes('€')) {
                            // Format: "Jiva€90.00€1.16"
                            const parts = after.split('€');
                            const name = formatPatientName(parts[0]);
                            const amountStr = parts[1].match(/[0-9.,]+/)?.[0];
                            const amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                            if (name && amount > 0) {
                                patients.push({ name, amount });
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
                                    // Found amount line, e.g. "€90.00€1.16"
                                    const parts = nextLine.split('€');
                                    const amountStr = parts[1]?.match(/[0-9.,]+/)?.[0];
                                    amount = amountStr ? parseFloat(amountStr.replace(',', '.')) : 0;
                                    break;
                                }
                                // It is part of the name
                                nameParts.push(nextLine);
                                j++;
                            }
                            const name = formatPatientName(nameParts.join(' '));
                            if (name && amount > 0) {
                                patients.push({ name, amount });
                            }
                        }
                    }
                }
                
                let netAmount = 0.0;
                const netMatch = text.match(/(?:Versement effectué|Montant du versement|La somme transférée)[^\d€]*€\s*([0-9.,]+)/i);
                if (netMatch) netAmount = parseFloat(netMatch[1].replace(',', '.'));
                
                if (isNaN(netAmount) || netAmount === 0.0) {
                    const totauxMatch = text.match(/Totaux:\s*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*[^€]*€[0-9.,]+\s*=\s*€\s*([0-9.,]+)/);
                    if (totauxMatch) netAmount = parseFloat(totauxMatch[1].replace(',', '.'));
                }
                
                console.log("\n--- PARSED PATIENTS ---");
                patients.forEach(p => console.log(`Patient: "${p.name}" -> Amount: ${p.amount} €`));
                console.log(`\nNet Amount: ${netAmount} €, Calculated Sum: ${patients.reduce((sum, p) => sum + p.amount, 0)} €`);
            }
        }
    }
    
    connection.end();
}

main().catch(console.error);
