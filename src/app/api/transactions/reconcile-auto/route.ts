import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import dotenv from 'dotenv';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { execSync } from 'child_process';
import os from 'os';

// Explicitly load the parent .env file to access Gmail/iCloud credentials
dotenv.config({ path: `${os.homedir()}/ANTIGRAVITY/.env` });

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
    "system", "france", "europe", "global", "digital"
  ]);
  
  const words = cleaned.split(/\s+/).filter(w => {
    // Keep words of length >= 2
    if (w.length < 2) return false;
    // Skip common noise
    if (noise.has(w)) return false;
    // Skip purely numeric strings (amounts or dates) unless they are very short (e.g. 2-3 chars)
    if (/^\d+$/.test(w) && w.length > 3) return false;
    // Skip alphanumeric code strings (like mandate refs, IBANs, etc.)
    // i.e., strings longer than 7 characters containing both letters and numbers
    if (w.length > 7 && /[a-z]/.test(w) && /\d/.test(w)) return false;
    
    return true;
  });
  
  // Custom expansions
  const expanded = [...words];
  if (words.includes('vw')) expanded.push('volkswagen');
  if (words.includes('mgen')) expanded.push('mutuelle');
  
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

    // Search subject for each keyword to find matching emails
    for (const keyword of keywords) {
      const searchCriteria = [['HEADER', 'SUBJECT', keyword]];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      console.log(`✉️ Found ${messages.length} messages matching subject "${keyword}" on ${accountConfig.user}`);

      for (const msg of messages) {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;

        const parsed = await simpleParser(allPart.body);
        
        // Verify email date: +/- 15 days window around the transaction date
        const msgDate = new Date(parsed.date || '');
        const timeDiff = Math.abs(msgDate.getTime() - txDate.getTime());
        const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
        if (timeDiff > fifteenDaysMs) continue;

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

                // Check if PDF contains keyword
                const hasKeyword = keywords.some(kw => text.includes(kw) || cand.filename.toLowerCase().includes(kw));
                if (!hasKeyword) continue;

                // Check if PDF contains amount
                const hasAmount = text.includes(amountStr) || text.includes(amountStrComma) || 
                                  (absAmount % 1 === 0 && text.includes(` ${amountInt} `)) || 
                                  cand.filename.includes(amountInt);
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
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;

      // Filter by amount, date, and keywords
      const matchingPennylaneInvoice = pennylaneInvoices.find((inv: any) => {
        // 1. Amount match (+/- 0.05 EUR for rounding)
        const invAmount = parseFloat(inv.amount || '0');
        if (Math.abs(invAmount - absAmount) > 0.05) return false;

        // 2. Date match (+/- 15 days)
        if (inv.date) {
          const invTime = new Date(inv.date).getTime();
          if (Math.abs(invTime - txTime) > fifteenDaysMs) return false;
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

    // --- PHASE 1: SEARCH LOCAL FILESYSTEM ---
    const homeDir = os.homedir();
    const searchDirs = [
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta')
    ];

    let allPdfs: string[] = [];
    for (const dir of searchDirs) {
      allPdfs.push(...(await getPdfFiles(dir, 0, 2)));
    }

    // Prioritize PDFs where the filename matches keywords or amounts
    allPdfs.sort((a, b) => {
      const aName = path.basename(a).toLowerCase();
      const bName = path.basename(b).toLowerCase();
      const aHasKeyword = keywords.some(k => aName.includes(k));
      const bHasKeyword = keywords.some(k => bName.includes(k));
      if (aHasKeyword && !bHasKeyword) return -1;
      if (!aHasKeyword && bHasKeyword) return 1;
      
      const aHasAmt = aName.includes(amountInt);
      const bHasAmt = bName.includes(amountInt);
      if (aHasAmt && !bHasAmt) return -1;
      if (!aHasAmt && bHasAmt) return 1;
      
      return 0;
    });

    let parsedCount = 0;
    for (const filePath of allPdfs) {
      if (parsedCount >= 150) {
        console.log(`⚠️ Limite de 150 PDFs analysés atteinte, arrêt de la recherche locale.`);
        break;
      }
      try {
        const buffer = await fs.promises.readFile(filePath);
        if (buffer.slice(0, 4).toString() !== '%PDF') continue;

        parsedCount++;
        const parsed = await pdfParse(buffer);
        const text = (parsed.text || '').toLowerCase();

        const hasKeyword = keywords.some(kw => text.includes(kw) || path.basename(filePath).toLowerCase().includes(kw));
        if (!hasKeyword) continue;

        const hasAmount = text.includes(amountStr) || text.includes(amountStrComma) || 
                          (absAmount % 1 === 0 && text.includes(` ${amountInt} `)) || 
                          path.basename(filePath).includes(amountInt);
        if (!hasAmount) continue;

        matchedFile = path.basename(filePath);
        matchedFileBuffer = buffer;
        console.log(`🎯 Justificatif local trouvé ! Fichier : ${filePath}`);
        break;
      } catch (err) {
        continue;
      }
    }

    // --- PHASE 2: SEARCH EMAILS (GMAIL & ICLOUD) IF LOCAL NOT FOUND ---
    if (!matchedFileBuffer) {
      console.log("🔍 Justificatif local non trouvé. Recherche dans les e-mails (Gmail & iCloud)...");
      
      // Gmail configuration
      const gmailConfig = {
        user: process.env.GMAIL_EMAIL || 'guillaumephilippe1968@gmail.com',
        password: process.env.GMAIL_APP_PASSWORD || 'ridi mpgu rfbl deqp',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      };

      // iCloud (.me) configuration
      const icloudConfig = {
        user: process.env.ICLOUD_EMAIL || 'guillaumephilippe@me.com',
        password: process.env.ICLOUD_APP_PASSWORD || 'vcny-lusr-hugo-djpa',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      };

      // Search Gmail first
      let emailMatch = await searchEmailAccount(gmailConfig, keywords, absAmount, txDate);
      
      // Search iCloud next if Gmail failed
      if (!emailMatch) {
        emailMatch = await searchEmailAccount(icloudConfig, keywords, absAmount, txDate);
      }

      if (emailMatch) {
        matchedFile = emailMatch.filename;
        matchedFileBuffer = emailMatch.buffer;
        console.log(`🎯 Justificatif e-mail trouvé ! Fichier : ${emailMatch.filename}`);
      }
    }

    // --- PHASE 3: UPLOAD & MATCH ON PENNYLANE ---
    if (!matchedFile || !matchedFileBuffer) {
      return NextResponse.json({ 
        success: false, 
        error: `Aucun justificatif correspondant à "${keywords.join(' ')}" de ${amountStr} € n'a été trouvé (Bureau, Téléchargements, e-mails Gmail ou iCloud).` 
      }, { status: 404 });
    }

    const filename = matchedFile;
    console.log(`📤 Téléversement de "${filename}" sur Pennylane...`);
    
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(matchedFileBuffer)], { type: 'application/pdf' });
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
    const txDateStr = new Date(date).toISOString().split('T')[0];
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
          label: label
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

    return NextResponse.json({ 
      success: true, 
      matchedFile: filename,
      invoice: {
        id: invoiceId,
        date: txDateStr,
        label: label,
        filename: filename,
        publicFileUrl: publicFileUrl
      }
    });

  } catch (error: any) {
    console.error("Error in auto-reconciliation API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
