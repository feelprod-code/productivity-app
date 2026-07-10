import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { execSync } from 'child_process';
import os from 'os';
import { prisma } from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

// Explicitly load the parent .env file to access Gmail/iCloud credentials
dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });

if (typeof process !== 'undefined') {
  if (!process.listeners('uncaughtException').length) {
    process.on('uncaughtException', (err) => {
      console.error('🔥 [reconcile-auto] [Uncaught Exception Caught]:', err);
    });
  }
  if (!process.listeners('unhandledRejection').length) {
    process.on('unhandledRejection', (reason) => {
      console.error('🔥 [reconcile-auto] [Unhandled Rejection Caught]:', reason);
    });
  }
}

export const dynamic = 'force-dynamic';

interface EmailMatch {
  buffer: Buffer;
  filename: string;
}

function extractKeywords(label: string): string[] {
  const cleaned = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, " ");   // Keep only alphanumeric characters and spaces
    
  // Split by spaces and remove common stop words or transaction noise
  const noise = new Set([
    "virement", "sepa", "recu", "instantane", "prlv", "carte", "cb", "facture", "retrait", 
    "pay", "payment", "payments", "de", "la", "le", "du", "en", "pour", "fact", "inv", 
    "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
    "confrere", "prelvt", "bank", "banque", "ltd", "limited", "gmbh", "sas", "sarl",
    "sasu", "eurl", "cie", "company", "co", "corp", "corporation", "group", "groupe",
    "services", "service", "solutions", "solution", "international", "intl", "systems",
    "system", "france", "europe", "global", "digital", "cblm", "paris", "guillaume", "philippe",
    "com", "net", "org", "www"
  ]);
  
  const words = cleaned.split(/\s+/).filter(w => {
    // Keep words of length >= 2
    if (w.length < 2) return false;
    // Skip common noise
    if (noise.has(w)) return false;
    // Skip all purely numeric strings (amounts, dates, card numbers, etc.)
    if (/^\d+$/.test(w)) return false;
    // Skip alphanumeric code strings (like mandate refs, IBANs, etc.)
    // i.e., strings longer than 7 characters containing both letters and numbers
    if (w.length > 7 && /[a-z]/.test(w) && /\d/.test(w)) return false;
    
    return true;
  });
  
  // Custom expansions
  // Custom expansions
  const expanded = [...words];
  if (words.includes('vw')) expanded.push('volkswagen');
  if (words.includes('mgen')) expanded.push('mutuelle');
  if (words.includes('rafenne') || words.includes('comptab') || words.includes('comptabilite') || cleaned.includes('autonome')) {
    expanded.push('gcl');
  }
  if (words.includes('magd') || words.includes('sebastopol') || words.includes('mcdo') || words.includes('mcdonalds') || cleaned.includes('sebastopol')) {
    expanded.push('halles');
    expanded.push('paris');
  }
  
  return expanded;
}

// Recursively find pdf files in a directory
async function getPdfFiles(dir: string, depth = 0, maxDepth = 2): Promise<string[]> {
  const pdfs: string[] = [];
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < maxDepth) {
        // Skip hidden folders and common massive directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') {
          pdfs.push(...(await getPdfFiles(fullPath, depth + 1, maxDepth)));
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore errors for directories we cannot read
  }
  return pdfs;
}
// Extract PDF files from a ZIP buffer using native unzip tool
async function extractPdfsFromZip(zipBuffer: Buffer): Promise<{ buffer: Buffer; filename: string }[]> {
  const pdfs: { buffer: Buffer; filename: string }[] = [];
  const randSuffix = Math.random().toString(36).substring(7);
  const tempZipPath = path.join(os.tmpdir(), `temp-${Date.now()}-${randSuffix}.zip`);
  const tempExtractDir = path.join(os.tmpdir(), `temp-extract-${Date.now()}-${randSuffix}`);
  
  try {
    await fs.promises.writeFile(tempZipPath, zipBuffer);
    await fs.promises.mkdir(tempExtractDir, { recursive: true });
    
    // Execute command to unzip
    execSync(`unzip -d "${tempExtractDir}" "${tempZipPath}"`, { stdio: 'ignore' });
    
    // Read the unzipped files
    const entries = await fs.promises.readdir(tempExtractDir);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith('.pdf')) {
        const fullPath = path.join(tempExtractDir, entry);
        const fileBuf = await fs.promises.readFile(fullPath);
        pdfs.push({
          buffer: fileBuf,
          filename: entry
        });
      }
    }
  } catch (err: any) {
    console.error('❌ Error extracting ZIP:', err.message);
  } finally {
    // Cleanup temporary files
    try {
      await fs.promises.unlink(tempZipPath);
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    } catch (e) {}
  }
  
  return pdfs;
}
function formatImapDate(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// Search a specific IMAP email account
async function searchEmailAccount(
  accountConfig: any,
  keywords: string[],
  absAmount: number,
  txDate: Date
): Promise<EmailMatch | null> {
  let connection;
  try {
    console.log(`✉️ Connecting to IMAP server for ${accountConfig.user}...`);
    connection = await imaps.connect({
      imap: accountConfig
    } as any);
    await connection.openBox('INBOX');

    const amountStr = absAmount.toFixed(2);
    const amountStrComma = amountStr.replace(".", ",");
    const amountInt = Math.floor(absAmount).toString();

    const dateSince = new Date(txDate.getTime() - 16 * 24 * 60 * 60 * 1000);
    const dateBefore = new Date(txDate.getTime() + 16 * 24 * 60 * 60 * 1000);
    const formattedSince = formatImapDate(dateSince);
    const formattedBefore = formatImapDate(dateBefore);

    // Sort keywords by length descending and limit to top 2 to avoid searching generic/short words
    const searchKeywords = [...keywords]
      .sort((a, b) => b.length - a.length)
      .slice(0, 2);

    // Search subject for each keyword to find matching emails
    for (const keyword of searchKeywords) {
      const searchCriteria = [
        ['HEADER', 'SUBJECT', keyword],
        ['SINCE', formattedSince],
        ['BEFORE', formattedBefore]
      ];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      console.log(`✉️ Found ${messages.length} messages matching subject "${keyword}" on ${accountConfig.user}`);

      for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;

        const parsed = await simpleParser(allPart.body);
        
        // Verify email date: +/- 35 days window around the transaction date
        const msgDate = new Date(parsed.date || '');
        const timeDiff = Math.abs(msgDate.getTime() - txDate.getTime());
        const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
        if (timeDiff > thirtyFiveDaysMs) continue;

        // If it's a PayPal transaction and this email is a PayPal confirmation email:
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
            // Find the merchant name from subject or body
            const subjectMatch = parsed.subject?.match(/(?:à|to|pour|payment to|paiement à)\s+([^,.(]+)/i);
            let merchant = "PAYPAL";
            if (subjectMatch && subjectMatch[1]) {
              const candidate = subjectMatch[1].trim();
              if (candidate.toLowerCase() !== 'paypal') {
                merchant = `PAYPAL - ${candidate.toUpperCase()}`;
              }
            } else {
              const bodyMatch = text.match(/(?:marchand|merchant|compte du marchand|paiement envoyé à)\s*:\s*([^<\r\n]+)/i);
              if (bodyMatch && bodyMatch[1]) {
                const candidate = bodyMatch[1].trim();
                if (candidate.toLowerCase() !== 'paypal') {
                  merchant = `PAYPAL - ${candidate.toUpperCase()}`;
                }
              }
            }

            console.log(`🎯 Match found in PayPal email! Merchant: ${merchant}, Amount: ${amountStr}`);
            
            const cleanDateStr = txDate.toISOString().split('T')[0];
            const cleanMerchantFilename = merchant.replace(/[^a-zA-Z0-9\- ]/g, '_');
            const filename = `${cleanDateStr} - ${cleanMerchantFilename} - ${amountStr}EUR.html`;
            const buffer = Buffer.from(html || text || '', 'utf-8');

            return {
              buffer,
              filename
            };
          }
        }

        // Check attachments (direct PDFs or nested inside ZIPs)
        const attachments = parsed.attachments || [];
        for (const att of attachments) {
          const isPdf = att.filename && att.filename.toLowerCase().endsWith('.pdf');
          const isZip = att.filename && att.filename.toLowerCase().endsWith('.zip');

          if (isPdf || isZip) {
            try {
              let candidatePdfs: { buffer: Buffer; filename: string }[] = [];

              if (isPdf) {
                candidatePdfs.push({
                  buffer: att.content,
                  filename: att.filename!
                });
              } else if (isZip) {
                console.log(`✉️ Extraction de la pièce jointe ZIP : ${att.filename}`);
                candidatePdfs = await extractPdfsFromZip(att.content);
              }

              for (const cand of candidatePdfs) {
                const buffer = cand.buffer;
                if (buffer.slice(0, 4).toString() !== '%PDF') continue;

                const parsedPdf = await pdfParse(buffer);
                const text = (parsedPdf.text || '').toLowerCase();

                const candNameLower = cand.filename.toLowerCase();
                 
                 // Règles spécifiques de destinataire (Guillaume Philippe) et de moyen de paiement
                 const isAmazonInvoice = candNameLower.includes('amazon') || candNameLower.includes('amz ') || text.includes('amazon');
                 const isAppleInvoice = candNameLower.includes('apple') || text.includes('apple');

                 // 1. Pour Apple et Amazon, l'adresse doit contenir strictement "guillaume philippe" (et pas philippe guillaume seul)
                 if (isAmazonInvoice || isAppleInvoice) {
                   if (!text.includes("guillaume philippe")) {
                     console.log(`❌ Facture Apple/Amazon e-mail ${cand.filename} rejetée : non adressée à Guillaume Philippe.`);
                     continue;
                   }
                 } else {
                   // 2. Pour les autres factures, rejeter si adressé explicitement à la personne physique "philippe guillaume" sans "guillaume philippe"
                   if (text.includes("philippe guillaume") && !text.includes("guillaume philippe")) {
                     console.log(`❌ Facture e-mail ${cand.filename} rejetée : adressée à Philippe Guillaume (compte personnel).`);
                     continue;
                   }
                 }

                 // 3. Pour Amazon uniquement, valider aussi le moyen de paiement (pro card ou PayPal)
                 if (isAmazonInvoice) {
                   const hasPayPal = text.includes("paypal") || text.includes("pay pal");
                   const hasProCard = text.includes("1397") || text.includes("6150");
                   if (!hasPayPal && !hasProCard) {
                     console.log(`❌ Facture Amazon e-mail ${cand.filename} rejetée : moyen de paiement non autorisé (ni pro 1397/6150, ni PayPal).`);
                     continue;
                   }
                 }

                // Gardes-fous stricts sur les e-mails
                if (candNameLower.includes('carpimko') && !keywords.includes('carpimko')) continue;
                if (candNameLower.includes('adobe') && !keywords.includes('adobe')) continue;
                if ((candNameLower.includes('volkswagen') || candNameLower.includes('vw')) && 
                    !(keywords.includes('volkswagen') || keywords.includes('vw'))) continue;
                if (candNameLower.includes('swiss') && !keywords.includes('swiss')) continue;
                if (candNameLower.includes('urssaf') && !keywords.includes('urssaf')) continue;
                if (candNameLower.includes('cacf') && !keywords.includes('cacf')) continue;

                // Recherche intelligente par mot entier pour éviter les sous-chaînes partielles (ex: 'vw' dans 'review')
                const hasKeyword = keywords.some(kw => {
                  if (candNameLower.includes(kw)) return true;
                  if (kw.length < 4) {
                    const regex = new RegExp(`\\b${kw}\\b`, 'i');
                    return regex.test(text);
                  }
                  return text.includes(kw);
                });
                if (!hasKeyword) continue;

                // Check if PDF contains amount
                let hasAmount = text.includes(amountStr) || text.includes(amountStrComma);
                if (!hasAmount && absAmount % 1 === 0) {
                  const regexTextInt = new RegExp(`\\b${amountInt}\\b`, 'i');
                  if (regexTextInt.test(text)) {
                    hasAmount = true;
                  }
                }
                
                // Check filename for amount
                if (!hasAmount) {
                  const cleanFn = cand.filename.toLowerCase();
                  if (cleanFn.includes(amountStr) || cleanFn.includes(amountStrComma)) {
                    hasAmount = true;
                  } else if (absAmount % 1 === 0) {
                    const regexFnInt = new RegExp(`\\b${amountInt}\\b|_${amountInt}_|-${amountInt}-|\\s${amountInt}€|\\s${amountInt}eur`, 'i');
                    if (regexFnInt.test(cleanFn)) {
                      // Prevent matching years (2024, 2025, 2026) as amount if amount is 20/24/25/26
                      if (!((amountInt === '20' || amountInt === '24' || amountInt === '25' || amountInt === '26') && 
                            (cleanFn.includes('2024') || cleanFn.includes('2025') || cleanFn.includes('2026')) && 
                            !regexFnInt.test(cleanFn.replace(/2024|2025|2026/g, '')) )) {
                        hasAmount = true;
                      }
                    }
                  }
                }
                if (!hasAmount) continue;

                console.log(`🎯 Match found in email attachment: "${cand.filename}" (from ${att.filename || 'zip'})`);
                return {
                  buffer,
                  filename: cand.filename
                };
              }
            } catch (err) {
              continue;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ IMAP Error for ${accountConfig.user}:`, err.message);
  } finally {
    if (connection) {
      try {
        connection.end();
      } catch (e) {}
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactionId, label, amount, date } = body;

    if (!transactionId || !label || amount === undefined || !date) {
      return NextResponse.json({ success: false, error: 'Paramètres transaction manquants' }, { status: 400 });
    }

    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
      return NextResponse.json({ success: false, error: 'Clé API Pennylane manquante' }, { status: 500 });
    }

    const absAmount = Math.abs(amount);
    const amountStr = absAmount.toFixed(2);
    const amountStrComma = amountStr.replace(".", ",");
    const amountInt = Math.floor(absAmount).toString();

    const keywords = extractKeywords(label);
    if (keywords.length === 0) {
      return NextResponse.json({ success: false, error: `Impossible d'extraire des mots-clés de recherche du libellé "${label}"` }, { status: 400 });
    }

    const txDate = new Date(date);
    
    // Enrich PayPal keywords from cache
    const labelLower = label.toLowerCase();
    if (labelLower.includes('paypal')) {
      try {
        const cachePath = path.join(process.cwd(), 'src/app/api/transactions/releve/paypal_cache.json');
        if (fs.existsSync(cachePath)) {
          const paypalCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          const exactKey = `${date}_${absAmount.toFixed(2)}`;
          let realMerchantName = paypalCache[exactKey] || "";
          
          if (!realMerchantName) {
            // Check adjacent days (+/- 6 days)
            for (let i = 1; i <= 6; i++) {
              const checkDate = new Date(txDate);
              checkDate.setDate(txDate.getDate() - i);
              const checkDateStr = checkDate.toISOString().split('T')[0];
              const checkKey = `${checkDateStr}_${absAmount.toFixed(2)}`;
              if (paypalCache[checkKey]) {
                realMerchantName = paypalCache[checkKey];
                break;
              }
            }
          }
          
          if (realMerchantName) {
            console.log(`🎯 [AutoReconcile] PayPal cache matched merchant: "${realMerchantName}"`);
            const merchantKeywords = extractKeywords(realMerchantName);
            keywords.push(...merchantKeywords);
          }
        }
      } catch (err: any) {
        console.error("❌ Failed to load PayPal cache in auto-reconcile:", err.message);
      }
    }

    console.log(`🔍 [AutoReconciliation] Recherche pour "${label}" (${amountStr} €) du ${date}...`);
    console.log(`🔍 Mots-clés de recherche :`, keywords);

    const BASE_URL = "https://app.pennylane.com/api/external/v2";

    // --- PHASE 0: SEARCH EXISTING UNRECONCILED INVOICES ON PENNYLANE ---
    console.log("🔍 Recherche d'une facture correspondante existante directement sur Pennylane...");
    try {
      let pennylaneInvoices: any[] = [];
      let cursor = '';
      
      // Fetch up to 3 pages (300 invoices) to find a match
      for (let page = 1; page <= 3; page++) {
        const fetchUrl = `${BASE_URL}/supplier_invoices?limit=100` + (cursor ? `&cursor=${cursor}` : '');
        const res = await fetch(fetchUrl, {
          headers: {
            'Authorization': `Bearer ${pennylaneKey}`,
            'Accept': 'application/json',
            'X-Use-2026-API-Changes': 'true'
          }
        });
        if (!res.ok) break;
        const data: any = await res.json();
        const items = data.items || data.supplier_invoices || [];
        if (items.length === 0) break;
        pennylaneInvoices.push(...items);
        
        const nextCursor = data.next_cursor || data.meta?.next_cursor;
        if (nextCursor) {
          cursor = nextCursor;
        } else {
          break;
        }
      }

      const txTime = txDate.getTime();
      const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;

      // Filter by amount, date, and keywords
      const matchingPennylaneInvoice = pennylaneInvoices.find((inv: any) => {
        // 1. Amount match (+/- 0.05 EUR for rounding)
        const invAmount = parseFloat(inv.amount || '0');
        if (Math.abs(invAmount - absAmount) > 0.05) return false;

        // 2. Date match (+/- 35 days)
        if (inv.date) {
          const invTime = new Date(inv.date).getTime();
          if (Math.abs(invTime - txTime) > thirtyFiveDaysMs) return false;
        }

        // 3. Keyword match (provider or label or filename)
        const invLabel = (inv.label || '').toLowerCase();
        const invFilename = (inv.filename || '').toLowerCase();
        
        const hasKeyword = keywords.some(kw => 
          invLabel.includes(kw) || 
          invFilename.includes(kw)
        );

        return hasKeyword;
      });

      if (matchingPennylaneInvoice) {
        const invoiceId = matchingPennylaneInvoice.id;
        const publicFileUrl = matchingPennylaneInvoice.public_file_url || matchingPennylaneInvoice.file_url || '';
        console.log(`🎯 Facture existante trouvée sur Pennylane ! ID : ${invoiceId}, Fichier : ${matchingPennylaneInvoice.filename}`);
        
        // Link transaction to this existing invoice
        console.log(`🔗 Liaison de la transaction ${transactionId} à la facture existante ${invoiceId}...`);
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
          console.log(`✅ Rapprochement réussi avec la facture existante de Pennylane.`);
          return NextResponse.json({ 
            success: true, 
            matchedFile: matchingPennylaneInvoice.filename || 'Facture Pennylane',
            invoice: {
              id: invoiceId,
              date: matchingPennylaneInvoice.date,
              label: matchingPennylaneInvoice.label || label,
              filename: matchingPennylaneInvoice.filename || 'Facture',
              publicFileUrl: publicFileUrl
            }
          });
        } else {
          console.warn(`⚠️ Échec de la liaison Pennylane avec la facture existante, continuation vers la recherche locale...`);
        }
      }
    } catch (err: any) {
      console.error("❌ Erreur lors de la recherche de factures existantes sur Pennylane :", err.message);
    }

    let matchedFile: string | null = null;
    let matchedFileBuffer: Buffer | null = null;
    let matchedLocalInvoiceId: string | null = null;

    // --- PHASE 0.5: SEARCH LOCAL DATABASE (PRISMA) ---
    console.log("🔍 Recherche d'une facture correspondante existante dans la base locale (Prisma)...");
    try {
      // Find any PENDING invoice (PRO or PERSO, as requested by user)
      const localInvoices = await prisma.invoice.findMany({
        where: {
          status: "PENDING"
        }
      });
      
      const txTime = txDate.getTime();
      const cleanSupplier = keywords[0].toUpperCase();
      const txLabel = (label || '').toLowerCase();
      
      const matchedLocalInvoice = localInvoices.find(inv => {
        if (!inv.amount) return false;
        
        const invTime = new Date(inv.date).getTime();
        const invAmount = inv.amount;
        const invProv = (inv.provider || '').toLowerCase();
        
        const amtDiff = Math.abs(invAmount - absAmount);
        
        const usdOrTaxSuppliers = ['vercel', 'supabase', 'openai', 'elevenlabs', 'openrouter', 'cloudflare', 'zapier', 'canva', 'github', 'amazon', 'suno'];
        const isUsdOrTax = usdOrTaxSuppliers.some(s => invProv.includes(s) || invProv.replace(/\s+/g, '').includes(s));
        
        const ratio = absAmount / invAmount;
        const invRatio = invAmount / absAmount;
        const isUsdOrTaxAmtMatch = isUsdOrTax && (
          (ratio >= 0.80 && ratio <= 1.20) ||
          (invRatio >= 0.80 && invRatio <= 1.20)
        );

        const isAmtMatch = amtDiff <= 1.50 || amtDiff / invAmount <= 0.05 || isUsdOrTaxAmtMatch;
        const dateDiffDays = Math.abs(txTime - invTime) / (24 * 60 * 60 * 1000);
        const isDateMatch = dateDiffDays <= 45;
        
        const isCreditTx = txLabel.includes('cpam') || txLabel.includes('ameli') || txLabel.includes('remise') || txLabel.includes('credit') || txLabel.includes('avoir');
        
        // 1. Via Sana (1848 EUR or 1897 EUR or 1904.8 EUR or 1911.53 EUR)
        if (invProv.includes('via_sana') && (invAmount === 1848 || invAmount === 1897 || invAmount === 1904.8 || invAmount === 1911.53)) {
          const isViaSanaTxAmount = absAmount === 1848 || absAmount === 1897 || absAmount === 1904.8 || absAmount === 1911.53 || (absAmount >= 1800 && absAmount <= 1950);
          return isViaSanaTxAmount && isDateMatch;
        }

        // 2. SumUp report
        if (invProv.includes('sumup')) {
          const isSumUpTx = txLabel.includes('sumup') || txLabel.includes('sum up') || txLabel.includes('paypal') || txLabel.includes('autonome') || txLabel.includes('payout');
          return isAmtMatch && isDateMatch && isSumUpTx && !txLabel.includes('cpam');
        }

        // 3. Bouygues Telecom
        if (invProv.includes('bouygues')) {
          const isTxBouygues = txLabel.includes('bouygues') || txLabel.includes('btelec') || txLabel.includes('btl');
          return isAmtMatch && isDateMatch && !isCreditTx && (isTxBouygues || txLabel.includes('prelevement') || txLabel.includes('autonome') || txLabel.includes('sepa') || txLabel.includes('prlv'));
        }

        // 4. Gandi
        if (invProv.includes('gandi')) {
          return isAmtMatch && isDateMatch && !isCreditTx && (txLabel.includes('gandi') || txLabel.includes('autonome') || txLabel.includes('sepa') || txLabel.includes('prlv'));
        }

        // 5. Canva
        if (invProv.includes('canva')) {
          return isAmtMatch && isDateMatch && !isCreditTx && (txLabel.includes('canva') || txLabel.includes('autonome') || txLabel.includes('sepa') || txLabel.includes('prlv') || txLabel.includes('paypal'));
        }

        // 6. Amazon or third-party sellers
        const isAmazonInv = invProv.includes('amazon') ||
                            invProv.includes('shenzhen') ||
                            invProv.includes('ugreen') ||
                            invProv.includes('yisave') ||
                            invProv.includes('letadianzishangwu') ||
                            invProv.includes('junyu') ||
                            invProv.includes('spring grace') ||
                            invProv.includes('jiashan') ||
                            invProv.includes('beijing') ||
                            invProv.includes('hohem') ||
                            invProv.includes('li hai') ||
                            invProv.includes('jinhui') ||
                            invProv.includes('kexingtong') ||
                            invProv.includes('qilechuang') ||
                            invProv.includes('paperlike') ||
                            invProv.includes('cuperinox') ||
                            invProv.includes('bal ') ||
                            invProv.includes('recyclivre') ||
                            invProv.includes('merity');
        if (isAmazonInv && (txLabel.includes('amazon') || txLabel.includes('amzn') || txLabel.includes('amz') || txLabel.includes('digital fra') || txLabel.includes('payments'))) {
          return isAmtMatch && isDateMatch;
        }
        
        // Standard name/keyword matching
        const invFileUrl = (inv.fileUrl || '').toLowerCase();
        const isTxEleven = txLabel.includes('elevenlabs') || txLabel.includes('eleven labs');
        const isInvEleven = invProv.includes('elevenlabs') || invProv.includes('eleven labs');
        
        const hasKeyword = (isTxEleven && isInvEleven) || keywords.some(kw => 
          invProv.includes(kw) || 
          invFileUrl.includes(kw)
        );
        
        return isAmtMatch && isDateMatch && hasKeyword && !isCreditTx;
      });
      
      if (matchedLocalInvoice) {
        console.log(`🎯 Facture locale trouvée ! ID : ${matchedLocalInvoice.id}, Provider: ${matchedLocalInvoice.provider}`);
        matchedLocalInvoiceId = matchedLocalInvoice.id;
        
        let originalFilename = path.basename(matchedLocalInvoice.fileUrl);
        if (originalFilename.includes('?')) {
          originalFilename = originalFilename.split('?')[0];
        }
        if (!originalFilename) {
          originalFilename = `${date} - ${cleanSupplier} - ${absAmount.toFixed(2)}€.pdf`;
        }
        
        console.log(`📥 Téléchargement de la pièce locale depuis : ${matchedLocalInvoice.fileUrl}`);
        const downloadRes = await fetch(matchedLocalInvoice.fileUrl);
        if (downloadRes.ok) {
          matchedFileBuffer = Buffer.from(await downloadRes.arrayBuffer());
          matchedFile = originalFilename;
          console.log(`🎯 Pièce locale téléchargée avec succès !`);
        } else {
          console.warn(`⚠️ Échec du téléchargement de la pièce locale, poursuite vers la recherche e-mail...`);
        }
      }
    } catch (localDbErr: any) {
      console.error("❌ Erreur lors de la recherche locale Prisma :", localDbErr.message);
    }

    // --- PHASE 3: UPLOAD & MATCH ON PENNYLANE ---
    if (!matchedFile || !matchedFileBuffer) {
      return NextResponse.json({ 
        success: false, 
        error: `Aucun justificatif correspondant à "${keywords.join(' ')}" de ${amountStr} € n'a été trouvé dans la base locale.` 
      }, { status: 404 });
    }

    const txDateStr = new Date(date).toISOString().split('T')[0];
    const cleanSupplier = keywords[0].toUpperCase();
    let isHtml = matchedFile.toLowerCase().endsWith('.html');
    
    if (isHtml) {
      console.log(`📄 [HTML-to-PDF] Conversion du justificatif HTML en PDF via Chrome headless...`);
      const tempHtmlPath = `/tmp/temp_${Date.now()}.html`;
      const tempPdfPath = `/tmp/temp_${Date.now()}.pdf`;
      
      try {
        await fs.promises.writeFile(tempHtmlPath, matchedFileBuffer);
        const chromePath = '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"';
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execPromise = promisify(exec);
        
        await execPromise(`${chromePath} --headless --disable-gpu --print-to-pdf=${tempPdfPath} ${tempHtmlPath}`);
        
        if (fs.existsSync(tempPdfPath)) {
          matchedFileBuffer = await fs.promises.readFile(tempPdfPath);
          matchedFile = matchedFile.replace(/\.html$/i, '.pdf');
          isHtml = false;
          console.log(`📄 [HTML-to-PDF] Conversion réussie ! Taille du PDF : ${matchedFileBuffer.length} octets`);
        }
      } catch (err: any) {
        console.error("❌ [HTML-to-PDF] Échec de la conversion :", err.message);
      } finally {
        await fs.promises.unlink(tempHtmlPath).catch(() => {});
        await fs.promises.unlink(tempPdfPath).catch(() => {});
      }
    }

    const filename = isHtml ? matchedFile : `${txDateStr} - ${cleanSupplier} - ${absAmount.toFixed(2)}€.pdf`;
    const mimeType = isHtml ? 'text/html' : 'application/pdf';

    // Sauvegarde physique locale dans le dossier compta de l'ordinateur
    try {
      const year = txDateStr.split('-')[0];
      const monthDigit = txDateStr.split('-')[1];
      const MONTH_MAP: { [key: string]: string } = {
        '01': '01 - Janvier',
        '02': '02 - F\u00e9vrier',
        '03': '03 - Mars',
        '04': '04 - Avril',
        '05': '05 - Mai',
        '06': '06 - Juin',
        '07': '07 - Juillet',
        '08': '08 - Ao\u00fbt',
        '09': '09 - Septembre',
        '10': '10 - Octobre',
        '11': '11 - Novembre',
        '12': '12 - D\u00e9cembre'
      };
      
      const monthFolder = MONTH_MAP[monthDigit] || `${monthDigit}`;
      let normalizedMonthFolder = monthFolder;
      if (monthDigit === '02') {
        normalizedMonthFolder = '02 - Fe\u0301vrier';
      } else if (monthDigit === '08') {
        normalizedMonthFolder = '08 - Aou\u0302t';
      } else if (monthDigit === '12') {
        normalizedMonthFolder = '12 - De\u0301cembre';
      }

      const comptaBaseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';
      const targetDir = path.join(comptaBaseDir, `Factures ${year}`, normalizedMonthFolder);
      await fs.promises.mkdir(targetDir, { recursive: true });
      
      const localFilePath = path.join(targetDir, filename);
      await fs.promises.writeFile(localFilePath, matchedFileBuffer);
      console.log(`💾 Justificatif sauvegardé localement : ${localFilePath}`);
    } catch (localSaveErr: any) {
      console.error("⚠️ [LocalSave] Échec de l'enregistrement local de la facture :", localSaveErr.message);
    }

    console.log(`📤 Téléversement de "${filename}" sur Pennylane...`);
    
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(matchedFileBuffer)], { type: mimeType });
    formData.append('file', blob, filename);

    const uploadRes = await fetch(`${BASE_URL}/file_attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      },
      body: formData
    });

    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text();
      console.error(`❌ [Pennylane Upload Error] Status: ${uploadRes.status}, Response: ${errTxt}`);
      return NextResponse.json({ success: false, error: `Échec du téléversement Pennylane : ${errTxt}` }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const fileAttachmentId = uploadData.id;
    const publicFileUrl = uploadData.public_file_url || uploadData.file_url || '';

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
      const suppliersData = await suppliersRes.json();
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
        const createSupplierData = await createSupplierRes.json();
        supplierId = createSupplierData.supplier?.id || createSupplierData.id;
      } else {
        return NextResponse.json({ success: false, error: 'Échec de la création du fournisseur sur Pennylane' }, { status: 500 });
      }
    }

    // Create supplier invoice
    console.log(`🧾 Importation de la facture sur Pennylane...`);
    const payload = {
      file_attachment_id: fileAttachmentId,
      supplier_id: supplierId,
      date: txDateStr,
      deadline: txDateStr,
      currency_amount: absAmount.toFixed(2),
      currency_amount_before_tax: absAmount.toFixed(2),
      currency_tax: '0.00',
      currency: 'EUR',
      invoice_lines: [
        {
          currency_amount: absAmount.toFixed(2),
          currency_tax: '0.00',
          vat_rate: 'exempt',
          label: `${cleanSupplier} - ${txDateStr} - ${absAmount.toFixed(2)}€`
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

    let invoiceId: string | null = null;

    if (!importRes.ok) {
      const errTxt = await importRes.text();
      // Intercepter le cas où le document existe déjà avec cette pièce jointe (erreur 409)
      // Format : {"status":409,"error":"A document with ID 25113760727040 already exists with such attachment."}
      if (importRes.status === 409 || errTxt.includes('already exists with such attachment')) {
        const match = errTxt.match(/document with ID (\d+) already exists/i);
        if (match && match[1]) {
          invoiceId = match[1];
          console.log(`ℹ️ La facture existe déjà sur Pennylane avec l'ID ${invoiceId}. Tentative de rapprochement direct...`);
          
          // Forcer le renommage sur Pennylane pour que le nom soit identique à celui de l'application
          try {
            console.log(`✏️ Renommage de la facture existante sur Pennylane avec le nom : ${filename}...`);
            await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              },
              body: JSON.stringify({
                supplier_invoice: {
                  file_name: filename
                }
              })
            });
          } catch (renameErr: any) {
            console.error("⚠️ [PennylaneRename] Échec du renommage sur Pennylane :", renameErr.message);
          }
        }
      }
      
      if (!invoiceId) {
        return NextResponse.json({ success: false, error: `Échec de l'import de facture Pennylane : ${errTxt}` }, { status: 500 });
      }
    } else {
      const importData = await importRes.json();
      invoiceId = importData.id || importData.supplier_invoice?.id;
    }

    // Link transaction to invoice
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

    if (!matchRes.ok) {
      const errTxt = await matchRes.text();
      return NextResponse.json({ success: false, error: `Échec de la liaison Pennylane : ${errTxt}` }, { status: 500 });
    }

    console.log(`✅ Rapprochement automatique réussi pour la transaction ${transactionId}`);

    // Double sync locally with Supabase and Prisma
    let finalFileUrl = publicFileUrl || "";
    try {
      console.log("[AutoReconcile] Synchronisation avec la base de données locale...");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const cleanStorageKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.\-_ ]/g, "");
      const safeStorageKey = cleanStorageKey(filename);

      // Upload to Supabase Storage
      const { error: storageErr } = await supabase.storage
        .from('invoices')
        .upload(safeStorageKey, matchedFileBuffer, {
          contentType: mimeType,
          upsert: true
        });

      if (storageErr) {
        console.error("⚠️ [AutoReconcile] Échec du téléversement Supabase Storage :", storageErr.message);
      } else {
        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(safeStorageKey);
        finalFileUrl = publicUrlData.publicUrl;
      }

      // Check if we matched a local invoice in Phase 0.5
      if (matchedLocalInvoiceId) {
        await prisma.invoice.update({
          where: { id: matchedLocalInvoiceId },
          data: {
            status: "COMPLETED",
            fileUrl: finalFileUrl || undefined
          }
        });
        console.log(`🎉 [AutoReconcile] Facture locale existante (ID: ${matchedLocalInvoiceId}) mise à jour sur COMPLETED !`);
      } else {
        // Check if invoice already exists locally by signature
        const existingLocally = await prisma.invoice.findFirst({
          where: {
            provider: `${cleanSupplier} - ${txDateStr} - ${absAmount.toFixed(2)}€`,
            amount: absAmount,
            date: new Date(txDateStr)
          }
        });

        if (!existingLocally) {
          await prisma.invoice.create({
            data: {
              provider: `${cleanSupplier} - ${txDateStr} - ${absAmount.toFixed(2)}€`,
              amount: absAmount,
              currency: "EUR",
              date: new Date(txDateStr),
              fileUrl: finalFileUrl,
              status: "COMPLETED",
              type: "PRO"
            }
          });
          console.log("🎉 [AutoReconcile] Justificatif synchronisé avec succès dans la base locale (Prisma + Storage) !");
        }
      }
    } catch (dbErr: any) {
      console.error("⚠️ [AutoReconcile] Échec d'enregistrement base locale :", dbErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      matchedFile: filename,
      localInvoiceId: matchedLocalInvoiceId,
      invoice: {
        id: invoiceId,
        date: txDateStr,
        label: label,
        filename: filename,
        publicFileUrl: finalFileUrl
      }
    });

  } catch (error: any) {
    console.error("Error in auto-reconciliation API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
