import fetch from 'node-fetch';
import dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';
import path from 'path';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import pdfParse from 'pdf-parse';
import FormData from 'form-data';

dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

const MONTH_MAP: { [key: string]: string } = {
  '01': '01 - Janvier',
  '02': '02 - Fe\u0301vrier', // Février (NFD)
  '03': '03 - Mars',
  '04': '04 - Avril',
  '05': '05 - Mai',
  '06': '06 - Juin',
  '07': '07 - Juillet',
  '08': '08 - Aou\u0302t', // Août (NFD)
  '09': '09 - Septembre',
  '10': '10 - Octobre',
  '11': '11 - Novembre',
  '12': '12 - De\u0301cembre' // Décembre (NFD)
};

// Clean merchant names
function getCleanMerchant(label: string): string {
  let clean = label.toUpperCase();
  clean = clean.replace(/^CARTE \d+ CB /, '');
  clean = clean.replace(/^PRELVT SEPA RECU D\/O CONFRERE PRLV SEPA /, '');
  clean = clean.replace(/^PRELVT SEPA RECU D\/O LCL PRLV SEPA /, '');
  clean = clean.replace(/^PRLV SEPA /, '');
  clean = clean.replace(/^VIREMENT SEPA RECU /, '');
  clean = clean.replace(/^VIREMENT INSTANTANE /, '');
  clean = clean.replace(/ CBLM PHILIPPE GUILLAUME$/, '');
  clean = clean.replace(/ PHILIPPE GUILLAUME$/, '');
  clean = clean.replace(/ GUILLAUME PHILIPPE$/, '');
  clean = clean.replace(/\s+\d{2}\/\d{2}\/\d{2}.*$/, '');
  clean = clean.replace(/\s+\d{2}\/\d{2}\/\d{4}.*$/, '');
  clean = clean.replace(/\s+\d{10,}.*$/, '');
  
  const words = clean.trim().split(/\s+/);
  const merchantWords = [];
  for (const w of words) {
    if (['PAYPAL', 'OPNGO', 'CLOUD', 'DIGITAL'].includes(w)) {
      merchantWords.push(w);
      continue;
    }
    if (['ICS', 'RUM', 'SDR', 'ICS.FR', 'ECHEANCE', 'PRET', 'AMZ', 'TP', 'SUMUP', 'LCL', 'ACCESS', 'TELELION', 'SERVICES'].includes(w)) {
      break;
    }
    if (/^\d+$/.test(w)) break;
    merchantWords.push(w);
  }
  return merchantWords.join('_').replace(/[^A-Z0-9_\-]/g, '');
}

function extractKeywords(label: string): string[] {
  const cleaned = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
    
  const noise = new Set([
    "virement", "sepa", "recu", "instantane", "prlv", "carte", "cb", "facture", "retrait", 
    "pay", "payment", "payments", "de", "la", "le", "du", "en", "pour", "fact", "inv", 
    "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
    "confrere", "prelvt", "bank", "banque", "ltd", "limited", "gmbh", "sas", "sarl",
    "sasu", "eurl", "cie", "company", "co", "corp", "corporation", "group", "groupe",
    "services", "service", "solutions", "solution", "international", "intl", "systems",
    "system", "france", "europe", "global", "digital", "cblm", "paris", "guillaume", "philippe"
  ]);
  
  const words = cleaned.split(/\s+/).filter(w => {
    if (w.length < 2) return false;
    if (noise.has(w)) return false;
    if (/^\d+$/.test(w) && w.length > 3) return false;
    if (w.length > 7 && /[a-z]/.test(w) && /\d/.test(w)) return false;
    return true;
  });
  
  const expanded = [...words];
  if (words.includes('vw')) expanded.push('volkswagen');
  return expanded;
}

function formatImapDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

async function searchEmailAccount(
  connection: any,
  userEmail: string,
  keywords: string[],
  absAmount: number,
  txDate: Date
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const amountStr = absAmount.toFixed(2);
    const amountStrComma = amountStr.replace(".", ",");
    const amountInt = Math.floor(absAmount).toString();

    const dateSince = new Date(txDate.getTime() - 16 * 24 * 60 * 60 * 1000);
    const dateBefore = new Date(txDate.getTime() + 16 * 24 * 60 * 60 * 1000);
    const formattedSince = formatImapDate(dateSince);
    const formattedBefore = formatImapDate(dateBefore);

    const searchKeywords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 2);

    for (const keyword of searchKeywords) {
      const searchCriteria = [
        ['HEADER', 'SUBJECT', keyword],
        ['SINCE', formattedSince],
        ['BEFORE', formattedBefore]
      ];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;

        const parsed = await simpleParser(allPart.body);
        const msgDate = new Date(parsed.date || '');
        if (Math.abs(msgDate.getTime() - txDate.getTime()) > 15 * 24 * 60 * 60 * 1000) continue;

        const isPayPalTx = keywords.includes('paypal');
        const fromText = (parsed.from?.text || '').toLowerCase();
        const subjectLower = (parsed.subject || '').toLowerCase();
        const isPayPalEmail = fromText.includes('paypal') || subjectLower.includes('paypal');

        if (isPayPalTx && isPayPalEmail) {
          const text = (parsed.text || '').toLowerCase();
          const html = parsed.html || '';
          const hasAmount = subjectLower.includes(amountStr) || subjectLower.includes(amountStrComma) ||
                            text.includes(amountStr) || text.includes(amountStrComma);

          if (hasAmount) {
            const subjectMatch = parsed.subject?.match(/(?:à|to|pour|payment to|paiement à)\s+([^,.(]+)/i);
            let merchant = "PAYPAL";
            if (subjectMatch && subjectMatch[1]) {
              const candidate = subjectMatch[1].trim();
              if (candidate.toLowerCase() !== 'paypal') {
                merchant = `PAYPAL - ${candidate.toUpperCase()}`;
              }
            }
            const cleanDateStr = txDate.toISOString().split('T')[0];
            const cleanMerchantFilename = merchant.replace(/[^a-zA-Z0-9\- ]/g, '_');
            const filename = `${cleanDateStr} - ${cleanMerchantFilename} - ${amountStr}EUR.html`;
            return { buffer: Buffer.from(html || text || '', 'utf-8'), filename };
          }
        }

        const attachments = parsed.attachments || [];
        for (const att of attachments) {
          if (att.filename && att.filename.toLowerCase().endsWith('.pdf')) {
            try {
              const buffer = att.content;
              if (buffer.slice(0, 4).toString() !== '%PDF') continue;

              const parsedPdf = await pdfParse(buffer);
              const text = (parsedPdf.text || '').toLowerCase();
              const candNameLower = att.filename.toLowerCase();

              const isAmazonInvoice = candNameLower.includes('amazon') || candNameLower.includes('amz ') || text.includes('amazon');
              const isAppleInvoice = candNameLower.includes('apple') || text.includes('apple');

              if (isAmazonInvoice || isAppleInvoice) {
                if (!text.includes("guillaume philippe")) continue;
              } else {
                if (text.includes("philippe guillaume") && !text.includes("guillaume philippe")) continue;
              }

              if (isAmazonInvoice) {
                const hasPayPal = text.includes("paypal") || text.includes("pay pal");
                const hasProCard = text.includes("1397") || text.includes("6150");
                if (!hasPayPal && !hasProCard) continue;
              }

              if (candNameLower.includes('carpimko') && !keywords.includes('carpimko')) continue;
              if (candNameLower.includes('adobe') && !keywords.includes('adobe')) continue;
              if ((candNameLower.includes('volkswagen') || candNameLower.includes('vw')) && 
                  !(keywords.includes('volkswagen') || keywords.includes('vw'))) continue;

              const hasKeyword = keywords.some(kw => {
                if (candNameLower.includes(kw)) return true;
                if (kw.length < 4) {
                  const regex = new RegExp(`\\b${kw}\\b`, 'i');
                  return regex.test(text);
                }
                return text.includes(kw);
              });
              if (!hasKeyword) continue;

              let hasAmount = text.includes(amountStr) || text.includes(amountStrComma);
              if (!hasAmount && absAmount % 1 === 0) {
                const regexTextInt = new RegExp(`\\b${amountInt}\\b`, 'i');
                if (regexTextInt.test(text)) hasAmount = true;
              }

              if (!hasAmount) {
                const cleanFn = att.filename.toLowerCase();
                if (cleanFn.includes(amountStr) || cleanFn.includes(amountStrComma)) {
                  hasAmount = true;
                } else if (absAmount % 1 === 0) {
                  const regexFnInt = new RegExp(`\\b${amountInt}\\b|_${amountInt}_|-${amountInt}-|\\s${amountInt}€|\\s${amountInt}eur`, 'i');
                  if (regexFnInt.test(cleanFn)) {
                    if (!((amountInt === '20' || amountInt === '24' || amountInt === '25' || amountInt === '26') && 
                          (cleanFn.includes('2024') || cleanFn.includes('2025') || cleanFn.includes('2026')) && 
                          !regexFnInt.test(cleanFn.replace(/2024|2025|2026/g, '')) )) {
                      hasAmount = true;
                    }
                  }
                }
              }

              if (hasAmount) {
                return { buffer, filename: att.filename };
              }
            } catch (err) {}
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`IMAP Error for ${userEmail}:`, err.message);
  }
  return null;
}

async function main() {
    console.log("🔄 Récupération des transactions pro non rapprochées 2025 & 2026...");
    const relRes = await fetch('http://localhost:3000/api/transactions/releve');
    if (!relRes.ok) {
        console.error("Impossible de récupérer le relevé local.");
        return;
    }
    const data: any = await relRes.json();
    const transactions = data.transactions || [];

    const targetTxs = transactions.filter((t: any) => 
        (t.date.startsWith('2025-') || t.date.startsWith('2026-')) &&
        t.isPro &&
        !t.noJustificatif &&
        t.amount < 0
    );

    console.log(`🔍 Trouvé ${targetTxs.length} dépenses pro 2025 & 2026 à vérifier.`);

    const gmailConfig = {
      user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
      password: process.env.GMAIL_APP_PASSWORD || 'qwni-bxfv-gqyp-kvyu',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    };

    const icloudConfig = {
      user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
      password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    };

    console.log("✉️ Connexion aux serveurs IMAP (Gmail & iCloud)...");
    const gmailConnection = await imaps.connect({ imap: gmailConfig } as any);
    await gmailConnection.openBox('INBOX');
    console.log("✉️ Connecté à Gmail.");

    const icloudConnection = await imaps.connect({ imap: icloudConfig } as any);
    await icloudConnection.openBox('INBOX');
    console.log("✉️ Connecté à iCloud.");

    for (const tx of targetTxs) {
        const dateStr = tx.date.split('T')[0];
        const year = dateStr.split('-')[0];
        const monthDigit = dateStr.split('-')[1];
        const monthFolder = MONTH_MAP[monthDigit] || monthDigit;
        
        const merchant = getCleanMerchant(tx.label);
        const amount = Math.abs(tx.amount);
        const amountStr = amount.toFixed(2);
        
        const comptaBaseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';
        const targetDir = path.join(comptaBaseDir, `Factures ${year}`, monthFolder);
        
        const isHtml = tx.label.toLowerCase().includes('paypal');
        const ext = isHtml ? 'html' : 'pdf';
        const filename = `${dateStr} - ${merchant} - ${amountStr}€.${ext}`;
        const targetFilePath = path.join(targetDir, filename);

        const keywords = extractKeywords(tx.label);

        // --- VERIFIER SI LE FICHIER EXISTE DEJA (PAS DE DOUBLONS) ---
        let alreadyExists = false;
        if (fs.existsSync(targetDir)) {
            const files = fs.readdirSync(targetDir);
            const duplicate = files.find(f => {
                const lf = f.toLowerCase();
                return lf.includes(amountStr) && (lf.includes(merchant.toLowerCase()) || merchant.toLowerCase().includes(lf.replace(/\.pdf|\.html/g, '')));
            });
            if (duplicate) {
                alreadyExists = true;
                console.log(`💾 Local existant : "${duplicate}" pour "${tx.label}" (${tx.amount} €). Pas de doublons.`);
                
                // Si le fichier est local mais pas lié sur Pennylane, on le lie !
                if (!tx.matchedInvoice) {
                    console.log(`🔗 Le fichier est présent localement mais non associé sur Pennylane. Association en cours...`);
                    const localBuffer = fs.readFileSync(path.join(targetDir, duplicate));
                    await uploadAndMatchPennylane(tx.id, localBuffer, filename, amount, dateStr, keywords);
                }
            }
        }

        // --- SI PAS LOCAL MAIS DEJA RAPPROCHÉ DANS L'APP (DISPONIBLE SUR SUPABASE) ---
        if (!alreadyExists && tx.matchedInvoice && tx.matchedInvoice.publicFileUrl) {
            console.log(`💾 Absent localement mais disponible sur Supabase : "${tx.matchedInvoice.filename}". Téléchargement en cours...`);
            try {
                fs.mkdirSync(targetDir, { recursive: true });
                const fileRes = await fetch(tx.matchedInvoice.publicFileUrl);
                if (fileRes.ok) {
                    const buffer = await fileRes.buffer();
                    fs.writeFileSync(targetFilePath, buffer);
                    console.log(`✅ Téléchargé et sauvegardé localement : "${filename}"`);
                    alreadyExists = true;

                    // Si pas encore lié sur Pennylane, on le lie
                    await uploadAndMatchPennylane(tx.id, buffer, filename, amount, dateStr, keywords);
                }
            } catch (err: any) {
                console.error(`⚠️ Échec téléchargement Supabase pour "${filename}" :`, err.message);
            }
        }

        if (alreadyExists) continue;

        // --- SI PAS LOCAL ET PAS SUR SUPABASE, ON RECHERCHE DANS LES MAILS ---
        console.log(`🔍 Recherche e-mail pour : "${tx.label}" (${tx.amount} €) du ${dateStr}...`);
        
        const [gmailMatch, icloudMatch] = await Promise.all([
          searchEmailAccount(gmailConnection, gmailConfig.user, keywords, amount, new Date(tx.date)).catch(() => null),
          searchEmailAccount(icloudConnection, icloudConfig.user, keywords, amount, new Date(tx.date)).catch(() => null)
        ]);

        const emailMatch = gmailMatch || icloudMatch;

        if (emailMatch) {
            console.log(`🎯 Justificatif e-mail trouvé ! Fichier d'origine : ${emailMatch.filename}`);
            
            // 1. Sauvegarde locale
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(targetFilePath, emailMatch.buffer);
            console.log(`💾 Facture mail sauvegardée localement sous : "${targetFilePath}"`);

            // 2. Synchronisation Pennylane
            await uploadAndMatchPennylane(tx.id, emailMatch.buffer, filename, amount, dateStr, keywords);
        } else {
            console.log(`❌ Aucun justificatif trouvé pour "${tx.label}" dans les e-mails.`);
        }
    }

    console.log("✉️ Fermeture des connexions IMAP...");
    try { gmailConnection.end(); } catch (e) {}
    try { icloudConnection.end(); } catch (e) {}

    console.log("🎉 Fin du traitement de mise à jour 2025 & 2026 !");
}

async function uploadAndMatchPennylane(
  transactionId: any, 
  buffer: Buffer, 
  filename: string, 
  amount: number,
  txDateStr: string,
  keywords: string[]
) {
    try {
        const mimeType = filename.endsWith('.html') ? 'text/html' : 'application/pdf';
        
        const formData = new FormData();
        formData.append('file', buffer, { filename, contentType: mimeType });

        console.log(`📤 Téléversement de "${filename}" sur Pennylane...`);
        const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pennylaneKey}`,
            'Accept': 'application/json',
            'X-Use-2026-API-Changes': 'true',
            ...formData.getHeaders()
          },
          body: formData
        });

        let invoiceId: string | null = null;

        if (!uploadRes.ok) {
            const errTxt = await uploadRes.text();
            if (uploadRes.status === 409 || errTxt.includes('already exists with such attachment')) {
                const match = errTxt.match(/document with ID (\d+) already exists/i);
                if (match && match[1]) {
                    invoiceId = match[1];
                    console.log(`ℹ️ La facture existe déjà sur Pennylane avec l'ID ${invoiceId}. Renommage en cours...`);
                    
                    // Renommage forcé
                    await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${pennylaneKey}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-Use-2026-API-Changes': 'true'
                        },
                        body: JSON.stringify({
                            supplier_invoice: { file_name: filename }
                        })
                    });
                }
            } else {
                console.error(`❌ Échec du téléversement Pennylane : ${errTxt}`);
                return;
            }
        } else {
            const uploadData = (await uploadRes.json()) as any;
            const fileAttachmentId = uploadData.id;

            // Create or retrieve supplier
            console.log(`🔍 Recherche du fournisseur pour "${keywords[0]}" sur Pennylane...`);
            const suppliersRes = await fetch(`${BASE_URL}/suppliers?limit=100`, {
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              }
            });

            let supplierId: number | null = null;
            if (suppliersRes.ok) {
              const suppliersData = await suppliersRes.json() as any;
              const suppliers = suppliersData.items || suppliersData.suppliers || [];
              const matchedSupplier = suppliers.find((s: any) => 
                keywords.some(kw => s.name.toLowerCase().includes(kw))
              );
              if (matchedSupplier) {
                supplierId = matchedSupplier.id;
              }
            }

            if (!supplierId) {
              console.log(`➕ Fournisseur non trouvé. Création de "${keywords[0].toUpperCase()}"...`);
              const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${pennylaneKey}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'X-Use-2026-API-Changes': 'true'
                },
                body: JSON.stringify({ name: keywords[0].toUpperCase() })
              });
              if (createSupplierRes.ok) {
                const createSupplierData = await createSupplierRes.json() as any;
                supplierId = createSupplierData.supplier?.id || createSupplierData.id;
              }
            }

            if (!supplierId) {
              console.error(`❌ Impossible de définir le fournisseur.`);
              return;
            }

            // Create supplier invoice
            console.log(`🧾 Importation de la facture sur Pennylane...`);
            const payload = {
              file_attachment_id: fileAttachmentId,
              supplier_id: supplierId,
              date: txDateStr,
              deadline: txDateStr,
              currency_amount: amount.toFixed(2),
              currency_amount_before_tax: amount.toFixed(2),
              currency_tax: '0.00',
              currency: 'EUR',
              invoice_lines: [
                {
                  currency_amount: amount.toFixed(2),
                  currency_tax: '0.00',
                  vat_rate: 'exempt',
                  label: `${keywords[0].toUpperCase()} - ${txDateStr} - ${amount.toFixed(2)}€`
                }
              ]
            };

            const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              },
              body: JSON.stringify(payload)
            });

            if (importRes.ok) {
              const importData = await importRes.json() as any;
              invoiceId = importData.id || importData.supplier_invoice?.id;
            } else {
              console.error(`❌ Échec import facture :`, await importRes.text());
            }
        }

        if (invoiceId) {
            console.log(`🔗 Liaison de la transaction ${transactionId} à la facture ${invoiceId}...`);
            const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pennylaneKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Use-2026-API-Changes': 'true'
                },
                body: JSON.stringify({ transaction_id: String(transactionId) })
            });
            if (matchRes.ok) {
                console.log(`✅ Rapprochement automatique réussi sur Pennylane pour la transaction ${transactionId}`);
            } else {
                console.error(`❌ Échec de la liaison Pennylane :`, await matchRes.text());
            }
        }
    } catch (err: any) {
        console.error(`❌ Erreur Pennylane upload:`, err.message);
    }
}

main().catch(err => console.error(err));
