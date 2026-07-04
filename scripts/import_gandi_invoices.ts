import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import * as dotenv from 'dotenv';

// Charger le fichier .env local de l'application
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const openrouterKey = process.env.OPENROUTER_API_KEY;
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

if (!pennylaneKey) {
    console.error("❌ ERREUR: PENNYLANE_API_KEY n'est pas défini dans .env");
    process.exit(1);
}

if (!openrouterKey) {
    console.error("❌ ERREUR: OPENROUTER_API_KEY n'est pas défini dans .env");
    process.exit(1);
}

// En-têtes pour les requêtes à l'API Pennylane
function getHeaders(extraHeaders: Record<string, string> = {}) {
    return {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        ...extraHeaders
    };
}

// Modèle pour l'extraction
interface InvoiceData {
    invoice_number: string;
    invoice_date: string; // YYYY-MM-DD
    amount_ttc: number;
    amount_ht: number;
    amount_tva: number;
    is_2026_invoice: boolean;
}

async function extractInvoiceData(pdfText: string, filename: string): Promise<InvoiceData | null> {
    try {
        console.log(`🧠 Analyse IA du PDF via OpenRouter (Gemini) pour ${filename}...`);
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openrouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "user",
                        content: `Tu es un expert comptable. Analyse le texte extrait de cette facture Gandi et renvoie les informations financières demandées sous forme de JSON structuré.

JSON attendu :
{
  "invoice_number": "Le numéro de facture de Gandi (ex: FRXXXXXXXX)",
  "invoice_date": "La date d'émission au format YYYY-MM-DD",
  "amount_ttc": 12.34 (nombre décimal, total payé TTC),
  "amount_ht": 10.00 (nombre décimal, total Hors Taxes),
  "amount_tva": 2.34 (nombre décimal, montant de la TVA),
  "is_2026_invoice": true/false (indique si l'année de facturation est bien 2026)
}

Texte de la facture :
---
${pdfText}
---`
                    }
                ]
            })
        });

        if (!response.ok) {
            const errTxt = await response.text();
            throw new Error(`OpenRouter HTTP ${response.status} : ${errTxt}`);
        }

        const data = await response.json();
        const contentText = data.choices?.[0]?.message?.content;
        
        if (!contentText) {
            console.error("❌ Pas de contenu retourné par OpenRouter.");
            return null;
        }

        return JSON.parse(contentText) as InvoiceData;
    } catch (e) {
        console.error("❌ Erreur lors de l'extraction par OpenRouter :", e);
        return null;
    }
}

async function findOrCreateGandiSupplier(): Promise<number | null> {
    console.log("🔍 Recherche du fournisseur 'Gandi' sur Pennylane...");
    try {
        const res = await fetch(`${BASE_URL}/suppliers?limit=100`, {
            headers: getHeaders({ 'X-Use-2026-API-Changes': 'true' })
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const data = await res.json();
        const suppliers = data.items || data.suppliers || [];
        const matched = suppliers.find((s: any) => s.name.toLowerCase().includes('gandi'));
        
        if (matched) {
            console.log(`✅ Fournisseur Gandi trouvé : ${matched.name} (ID: ${matched.id})`);
            return matched.id;
        }

        // Sinon le créer
        console.log("➕ Fournisseur non trouvé. Création de 'Gandi SAS' sur Pennylane...");
        const createRes = await fetch(`${BASE_URL}/suppliers`, {
            method: 'POST',
            headers: getHeaders({
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }),
            body: JSON.stringify({ name: "GANDI SAS" })
        });
        if (!createRes.ok) throw new Error(`HTTP error ${createRes.status}`);
        const createData = await createRes.json();
        const newId = createData.supplier?.id || createData.id;
        console.log(`✅ Fournisseur 'GANDI SAS' créé avec succès (ID: ${newId})`);
        return newId;

    } catch (err) {
        console.error("❌ Erreur lors de la recherche/création du fournisseur :", err);
        return null;
    }
}

async function uploadFileToPennylane(filePath: string, filename: string): Promise<string | null> {
    console.log(`📤 Téléversement de ${filename} sur les pièces jointes Pennylane...`);
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, filename);

        const res = await fetch(`${BASE_URL}/file_attachments`, {
            method: 'POST',
            headers: getHeaders({ 'X-Use-2026-API-Changes': 'true' }),
            body: formData
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Upload failed : ${errTxt}`);
        }

        const data = await res.json();
        console.log(`✅ Pièce jointe téléversée avec succès (ID: ${data.id})`);
        return data.id;
    } catch (err) {
        console.error("❌ Erreur de téléversement :", err);
        return null;
    }
}

async function checkInvoiceExistsOnPennylane(invoiceNumber: string): Promise<boolean> {
    try {
        const res = await fetch(`${BASE_URL}/supplier_invoices?limit=100`, {
            headers: getHeaders({ 'X-Use-2026-API-Changes': 'true' })
        });
        if (!res.ok) return false;
        const data = await res.json();
        const invoices = data.supplier_invoices || data.items || [];
        return invoices.some((inv: any) => inv.invoice_number === invoiceNumber);
    } catch {
        return false;
    }
}

async function importInvoiceToPennylane(supplierId: number, fileAttachmentId: string, info: InvoiceData, filename: string) {
    console.log(`🧾 Importation de la facture ${info.invoice_number} dans Pennylane...`);
    try {
        const payload = {
            file_attachment_id: fileAttachmentId,
            supplier_id: supplierId,
            date: info.invoice_date,
            deadline: info.invoice_date,
            invoice_number: info.invoice_number,
            currency_amount: info.amount_ttc.toFixed(2),
            currency_amount_before_tax: info.amount_ht.toFixed(2),
            currency_tax: info.amount_tva.toFixed(2),
            currency: 'EUR',
            invoice_lines: [
                {
                    currency_amount: info.amount_ttc.toFixed(2),
                    currency_tax: info.amount_tva.toFixed(2),
                    vat_rate: info.amount_tva > 0 ? '20' : 'exempt',
                    label: `Facture Gandi ${info.invoice_number}`
                }
            ]
        };

        const res = await fetch(`${BASE_URL}/supplier_invoices/import`, {
            method: 'POST',
            headers: getHeaders({
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            }),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`🎉 Facture ${info.invoice_number} (${info.amount_ttc} €) importée avec succès sur Pennylane !`);
            return true;
        } else {
            const errTxt = await res.text();
            console.error(`❌ Échec de l'import de la facture ${info.invoice_number} : ${errTxt}`);
            return false;
        }
    } catch (err) {
        console.error("❌ Erreur lors de l'import :", err);
        return false;
    }
}

async function main() {
    const desktopPath = path.resolve('/Users/philippeguillaume/Desktop');
    console.log(`📂 Scan du Bureau : ${desktopPath}...`);

    if (!fs.existsSync(desktopPath)) {
        console.error(`❌ Le Bureau n'existe pas.`);
        process.exit(1);
    }

    const files = fs.readdirSync(desktopPath);
    const gandiPdfs = files.filter(f => f.toLowerCase().endsWith('.pdf') && f.toLowerCase().includes('gandi'));

    console.log(`🔍 ${gandiPdfs.length} fichier(s) PDF Gandi détecté(s).`);

    if (gandiPdfs.length === 0) {
        console.log("👉 Place tes fichiers de factures Gandi au format PDF sur ton Bureau.");
        return;
    }

    const supplierId = await findOrCreateGandiSupplier();
    if (!supplierId) {
        console.error("❌ Impossible d'initialiser le fournisseur Gandi sur Pennylane. Arrêt.");
        process.exit(1);
    }

    for (const file of gandiPdfs) {
        const filePath = path.join(desktopPath, file);
        console.log(`\n📄 Traitement du fichier : ${file}...`);

        try {
            const fileBuffer = fs.readFileSync(filePath);
            const parsedPdf = await pdfParse(fileBuffer);
            const text = parsedPdf.text || "";

            const info = await extractInvoiceData(text, file);
            if (!info) {
                console.log(`⏭️ Impossible de lire les données financières. Fichier ignoré.`);
                continue;
            }

            if (!info.is_2026_invoice) {
                console.log(`⏭️ Facture hors 2026 (${info.invoice_date}). Fichier ignoré.`);
                continue;
            }

            console.log(`   - Numéro Facture : ${info.invoice_number}`);
            console.log(`   - Date Facture   : ${info.invoice_date}`);
            console.log(`   - Montant TTC    : ${info.amount_ttc} €`);
            console.log(`   - Montant HT     : ${info.amount_ht} €`);
            console.log(`   - Montant TVA    : ${info.amount_tva} €`);

            // Vérifier les doublons sur Pennylane
            const exists = await checkInvoiceExistsOnPennylane(info.invoice_number);
            if (exists) {
                console.log(`⏭️ La facture ${info.invoice_number} existe déjà sur Pennylane. Fichier ignoré.`);
                continue;
            }

            // Téléverser le fichier
            const attachmentId = await uploadFileToPennylane(filePath, file);
            if (!attachmentId) {
                console.log(`⏭️ Échec du téléversement du justificatif. Fichier ignoré.`);
                continue;
            }

            // Importer la facture
            await importInvoiceToPennylane(supplierId, attachmentId, info, file);

        } catch (err) {
            console.error(`❌ Erreur lors du traitement de ${file} :`, err);
        }
    }

    console.log("\n🏁 Fin du traitement des factures Gandi 2026 !");
}

main().catch(console.error);
