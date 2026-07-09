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
const comptaBaseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';

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

function safeDecodeURIComponent(str: string): string {
    try {
        return decodeURIComponent(str);
    } catch (e) {
        return str;
    }
}

function getEncodedSupabaseUrl(publicFileUrl: string): string {
    if (!publicFileUrl) return '';
    let fileUrl = publicFileUrl;
    
    if (!fileUrl.startsWith('http')) {
        const cleanPath = fileUrl.replace(/^\/invoices\//, '');
        const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(safeDecodeURIComponent(segment))).join('/');
        fileUrl = `https://eqcjgucfpmhvxkckokwb.supabase.co/storage/v1/object/public/invoices/${encodedPath}`;
    } else {
        try {
            const urlObj = new URL(fileUrl);
            const pathParts = urlObj.pathname.split('/');
            const invoicesIdx = pathParts.indexOf('invoices');
            if (invoicesIdx !== -1) {
                const prefix = pathParts.slice(0, invoicesIdx + 1).join('/');
                const suffix = pathParts.slice(invoicesIdx + 1).map(segment => encodeURIComponent(safeDecodeURIComponent(segment))).join('/');
                fileUrl = `${urlObj.origin}${prefix}/${suffix}`;
            }
        } catch (e) {
            // Fallback if not a valid URL structure
        }
    }
    return fileUrl;
}

// Clean merchant names
function getCleanMerchant(label: string): string {
    let clean = label.toUpperCase();
    
    // Si c'est LCL ou un abonnement LCL
    if (clean.includes('LCL') || 
        clean.includes('CONVENTION_PROFESSIONNEL') || 
        clean.includes('CONVENTION PROFESSIONNEL') || 
        clean.includes('ZEN_PRO') || 
        clean.includes('ZEN PRO') || 
        clean.includes('FORMULE ZEN') || 
        clean.includes('FORMULE_ZEN') ||
        clean.startsWith('ABON ')) {
        return 'LCL';
    }

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
    
    if (clean.includes('AMAZON') || clean.includes('AMZN')) return 'AMAZON';
    if (clean.includes('OPENAI')) return 'OPENAI';
    if (clean.includes('GOOGLE')) return 'GOOGLE';
    if (clean.includes('APPLE')) return 'APPLE';
    if (clean.includes('ADOBE')) return 'ADOBE';
    if (clean.includes('URSSAF')) return 'URSSAF';
    if (clean.includes('VW BANK') || clean.includes('VOLKSWAGEN')) return 'VOLKSWAGEN BANK';
    if (clean.includes('BOUYGUES')) return 'BOUYGUES TELECOM';
    if (clean.includes('FREE MOBILE') || clean.includes('FREE TELECOM')) return 'FREE';
    if (clean.includes('NAVIGO') || clean.includes('IDF MOBILITES') || clean.includes('ILE-DE-FRANCE')) return 'SERVICE NAVIGO';
    if (clean.includes('CARPIMKO')) return 'CARPIMKO';
    if (clean.includes('CPAM') || clean.includes('MALADIE DE PARIS')) return 'CPAM';
    if (clean.includes('SUMUP')) return 'SUMUP';
    if (clean.includes('CANVA')) return 'CANVA';
    if (clean.includes('VERCEL')) return 'VERCEL';
    if (clean.includes('SUPABASE')) return 'SUPABASE';
    if (clean.includes('WETRANSFER')) return 'WETRANSFER';
    if (clean.includes('AIR FRANCE')) return 'AIR FRANCE';
    if (clean.includes('SNCF')) return 'SNCF';
    if (clean.includes('AGIOS')) return 'AGIOS';
    if (clean.includes('COMMISSION')) return 'COMMISSION';
    if (clean.includes('INTER_GAVIOTER') || clean.includes('GAVIOTER')) return 'INTER GAVIOTER';
    if (clean.includes('LE_PARIS_HALLES') || clean.includes('LE PARIS HALLES') || clean.includes('PARIS HALLES')) return 'LE PARIS HALLES';
    if (clean.includes('MAGD_SEBASTOPOL') || clean.includes('MAGD SEBASTOPOL') || clean.includes('MAGD')) return 'MAGD SEBASTOPOL';
    if (clean.includes('TABAC_CHATELET') || clean.includes('TABAC CHATELET') || clean.includes('TABAC')) return 'TABAC DU CHATELET';
    if (clean.includes('TENUE_DE_COMPTE') || clean.includes('TENUE DE COMPTE')) return 'TENUE DE COMPTE';
    if (clean.includes('DOCTOLIB')) return 'DOCTOLIB';
    if (clean.includes('MACSF')) return 'MACSF';
    if (clean.includes('PERMANENT COMPTABILITE') || clean.includes('RAFENNE')) return 'PERMANENT COMPTABILITE';
    if (clean.includes('PAYPAL')) return 'PAYPAL';
    
    const words = clean.trim().split(/[^A-Z0-9]/).filter(w => w.length >= 2);
    const noise = ['SEPA', 'PRLV', 'VIREMENT', 'INSTANTANE', 'CARTE', 'CB', 'FACT', 'FAC', 'INV', 'EUR', 'USD', 'SDR', 'RUM', 'ICS', 'TP'];
    const filtered = words.filter(w => !noise.includes(w));
    if (filtered.length > 0) return filtered.slice(0, 3).join(' ');
    
    return clean.trim();
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: any, maxRetries = 5): Promise<any> {
    let attempts = 0;
    while (attempts < maxRetries) {
        const response = await fetch(url, options);
        if (response.status === 429) {
            attempts++;
            const backoff = Math.pow(2, attempts) * 1000 + Math.random() * 1000;
            console.warn(`⚠️ Rate limit (429) sur Pennylane. Retrying in ${backoff.toFixed(0)}ms...`);
            await sleep(backoff);
            continue;
        }
        return response;
    }
    throw new Error(`Échec après ${maxRetries} tentatives.`);
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

async function updatePennylaneInvoiceLabel(invoiceId: string, label: string) {
    try {
        const res = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
            },
            body: JSON.stringify({ label })
        });
        if (res.ok) {
            console.log(`   🏷️ Pennylane label updated : "${label}" (ID: ${invoiceId})`);
            return true;
        } else {
            console.error(`   ⚠️ Failed to update label (status ${res.status}) :`, await res.text());
            return false;
        }
    } catch (e: any) {
        console.error(`   ❌ Error updating label :`, e.message);
        return false;
    }
}

function cleanupDuplicatesInDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    console.log(`🧹 Nettoyage des doublons dans le dossier : ${dirPath}`);
    const files = fs.readdirSync(dirPath);
    const groups: { [key: string]: string[] } = {};
    
    for (const file of files) {
        if (file === '.DS_Store') continue;
        
        // Parse date (YYYY-MM-DD)
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) continue;
        const dateStr = dateMatch[1];
        
        // Parse amount (find a decimal number like XX.XX or XX,XX)
        const cleanName = file.replace(/€|EUR|usd/gi, '');
        const amountMatch = cleanName.match(/(\d+[\.,]\d{2})/);
        if (!amountMatch) continue;
        const amountStr = amountMatch[1].replace(',', '.');
        
        const groupKey = `${dateStr}_${amountStr}`;
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(file);
    }
    
    for (const [key, fileList] of Object.entries(groups)) {
        if (fileList.length > 1) {
            console.log(`\n🔍 Doublons détectés pour la clé ${key} :`, fileList);
            
            // Calculer le score de qualité pour chaque fichier
            const scoredFiles = fileList.map(f => {
                let score = 0;
                const fLower = f.toLowerCase();
                
                // Règle 1 : préfère les espaces aux underscores
                if (!f.includes('_')) {
                    score += 10;
                }
                
                // Règle 2 : préfère les marchands propres (pas de codes SEPA ou de libellés bancaires bruts)
                const isRawSeba = fLower.includes('sarl') || fLower.includes('ics') || fLower.includes('rum') || fLower.includes('sdr') || fLower.includes('abon_') || fLower.includes('commission_') || fLower.includes('tenue_de_compte_');
                if (!isRawSeba) {
                    score += 20;
                }
                
                // Règle 3 : préfère LCL aux longs libellés Zen Pro
                if (fLower.includes('lcl')) {
                    score += 15;
                }
                
                // Règle 4 : pénalise les très longs noms
                if (f.length < 60) {
                    score += 5;
                }
                
                // Règle 5 : pénalise les fichiers "REJETE" s'il y a une version pro propre
                if (f.startsWith('REJETE')) {
                    score -= 50;
                }
                
                return { file: f, score };
            });
            
            // Trier par score décroissant
            scoredFiles.sort((a, b) => b.score - a.score);
            
            const best = scoredFiles[0].file;
            console.log(`👉 Fichier conservé : "${best}" (Score: ${scoredFiles[0].score})`);
            
            for (let i = 1; i < scoredFiles.length; i++) {
                const toDelete = scoredFiles[i].file;
                const deletePath = path.join(dirPath, toDelete);
                try {
                    fs.unlinkSync(deletePath);
                    console.log(`   🗑️ Fichier doublon supprimé : "${toDelete}"`);
                } catch (e: any) {
                    console.error(`   ❌ Impossible de supprimer "${toDelete}" :`, e.message);
                }
            }
        }
    }
}

async function main() {
    console.log("📥 Récupération des factures depuis Pennylane...");
    const allInvoices: any[] = [];
    let cursor = '';
    while (true) {
        const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
        const res = await fetchWithRetry(url, {
            headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
        });
        if (!res.ok) {
            console.error(`❌ Échec du chargement des factures Pennylane.`);
            break;
        }
        const data: any = await res.json();
        const items = data.items || data.supplier_invoices || [];
        if (items.length === 0) break;
        allInvoices.push(...items);
        cursor = data.next_cursor || data.meta?.next_cursor;
        if (!cursor) break;
        await sleep(100);
    }
    console.log(`✅ ${allInvoices.length} factures récupérées de Pennylane.`);

    console.log("📥 Récupération du relevé de transactions depuis l'application locale...");
    const relRes = await fetch('http://localhost:3000/api/transactions/releve');
    if (!relRes.ok) {
        console.error("❌ Impossible de récupérer le relevé locale.");
        return;
    }
    const data: any = await relRes.json();
    const transactions = data.transactions || [];

    const proTxs = transactions.filter((t: any) => 
        (t.date.startsWith('2025-') || t.date.startsWith('2026-')) &&
        t.isPro &&
        !t.noJustificatif &&
        t.amount < 0
    );

    console.log(`📊 Total transactions pro détectées (2025 & 2026) : ${proTxs.length}`);

    // --- PHASE 1 : NORMALISATION DES TRANSACTIONS DÉJÀ RAPPROCHÉES ---
    console.log("\n--- 🏁 PHASE 1 : Normalisation des factures déjà rapprochées ---");
    const matchedTxs = proTxs.filter((t: any) => t.matchedInvoice);
    console.log(`🔍 Trouvé ${matchedTxs.length} transactions rapprochées.`);

    for (const tx of matchedTxs) {
        const txDateStr = tx.date.split('T')[0];
        const [year, month] = txDateStr.split('-');
        const monthFolder = MONTH_MAP[month] || month;
        const targetDir = path.join(comptaBaseDir, `Factures ${year}`, monthFolder);

        const cleanMerchant = getCleanMerchant(tx.label);
        const amount = Math.abs(tx.amount);
        const amountStr = amount.toFixed(2);

        // Déterminer l'extension d'origine
        const origFilename = safeDecodeURIComponent(tx.matchedInvoice.filename || '');
        const extMatch = origFilename.match(/\.([a-zA-Z0-9]+)$/);
        const ext = (extMatch ? extMatch[1] : 'pdf').toLowerCase();

        const cleanFilename = `${txDateStr} - ${cleanMerchant} - ${amountStr}€.${ext}`;
        const cleanLabel = `${txDateStr} - ${cleanMerchant} - ${amountStr}`;
        const targetFilePath = path.join(targetDir, cleanFilename);

        let fileFound = false;

        // Chercher le fichier local (avec l'ancien nom ou le nouveau)
        if (fs.existsSync(targetDir)) {
            const files = fs.readdirSync(targetDir);
            const origMatch = files.find(f => f === origFilename || safeDecodeURIComponent(f) === origFilename);
            if (origMatch) {
                const srcPath = path.join(targetDir, origMatch);
                // Si le nom d'origine et le nom propre sont différents, renommer
                if (origMatch !== cleanFilename) {
                    fs.renameSync(srcPath, targetFilePath);
                    console.log(`✅ Fichier renommé localement : "${origMatch}" -> "${cleanFilename}"`);
                }
                fileFound = true;
            } else {
                const cleanMatch = files.find(f => f === cleanFilename);
                if (cleanMatch) {
                    fileFound = true;
                }
            }
        }

        // Si absent localement, télécharger depuis Supabase
        if (!fileFound && tx.matchedInvoice.publicFileUrl) {
            const fileUrl = getEncodedSupabaseUrl(tx.matchedInvoice.publicFileUrl);
            console.log(`📥 Absent localement : "${cleanFilename}". Téléchargement depuis Supabase (${fileUrl})...`);
            try {
                fs.mkdirSync(targetDir, { recursive: true });
                const fileRes = await fetch(fileUrl);
                if (fileRes.ok) {
                    const buffer = await fileRes.buffer();
                    fs.writeFileSync(targetFilePath, buffer);
                    console.log(`💾 Sauvegardé localement : "${cleanFilename}"`);
                    fileFound = true;
                } else {
                    console.error(`⚠️ Échec téléchargement (HTTP ${fileRes.status})`);
                }
            } catch (err: any) {
                console.error(`⚠️ Échec de téléchargement pour "${cleanFilename}" :`, err.message);
            }
        }

        // Trouver la facture correspondante sur Pennylane pour mettre à jour le label
        if (fileFound) {
            const cleanFilenameLower = cleanFilename.toLowerCase();
            const origFilenameLower = origFilename.toLowerCase();

            // Rechercher dans l'index de factures chargées
            const pennylaneInv = allInvoices.find(inv => {
                const invFn = (inv.file_name || '').toLowerCase();
                const invLabel = (inv.label || '').toLowerCase();
                
                return invFn === cleanFilenameLower || invFn === origFilenameLower ||
                       invLabel.includes(amountStr) && (invLabel.includes(cleanMerchant.toLowerCase()) || cleanMerchant.toLowerCase().includes(invLabel));
            });

            if (pennylaneInv) {
                await updatePennylaneInvoiceLabel(pennylaneInv.id, cleanLabel);
            } else {
                console.log(`⚠️ Facture non trouvée sur Pennylane pour : "${cleanFilename}". Téléversement/Liaison en cours...`);
                try {
                    const localBuffer = fs.readFileSync(targetFilePath);
                    const keywords = extractKeywords(tx.label);
                    await uploadAndMatchPennylane(tx.id, localBuffer, cleanFilename, amount, txDateStr, keywords);
                } catch (e: any) {
                    console.error(`⚠️ Échec de téléversement :`, e.message);
                }
            }
        }
    }

    // --- PHASE 2 : RECHERCHE DES TRANSACTIONS NON RAPPROCHÉES ---
    console.log("\n--- ✉️ PHASE 2 : Recherche des justificatifs manquants dans les e-mails ---");
    const unmatchedTxs = proTxs.filter((t: any) => !t.matchedInvoice);
    console.log(`🔍 Trouvé ${unmatchedTxs.length} transactions sans justificatif.`);

    if (unmatchedTxs.length > 0) {
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

        console.log("🔌 Connexion aux serveurs IMAP (Gmail & iCloud)...");
        let gmailConnection: any = null;
        let icloudConnection: any = null;
        
        try {
            gmailConnection = await imaps.connect({ imap: gmailConfig } as any);
            await gmailConnection.openBox('INBOX');
            console.log("✉️ Connecté à Gmail.");
        } catch (e: any) {
            console.error("⚠️ Impossible de se connecter à Gmail :", e.message);
        }

        try {
            icloudConnection = await imaps.connect({ imap: icloudConfig } as any);
            await icloudConnection.openBox('INBOX');
            console.log("✉️ Connecté à iCloud.");
        } catch (e: any) {
            console.error("⚠️ Impossible de se connecter à iCloud :", e.message);
        }

        for (const tx of unmatchedTxs) {
            const txDateStr = tx.date.split('T')[0];
            const [year, month] = txDateStr.split('-');
            const monthFolder = MONTH_MAP[month] || month;
            const targetDir = path.join(comptaBaseDir, `Factures ${year}`, monthFolder);

            const cleanMerchant = getCleanMerchant(tx.label);
            const amount = Math.abs(tx.amount);
            const amountStr = amount.toFixed(2);
            
            const isHtml = tx.label.toLowerCase().includes('paypal');
            const ext = isHtml ? 'html' : 'pdf';
            const cleanFilename = `${txDateStr} - ${cleanMerchant} - ${amountStr}€.${ext}`;
            const targetFilePath = path.join(targetDir, cleanFilename);

            const keywords = extractKeywords(tx.label);

            // Vérifier si le fichier existe déjà localement (pas de doublons)
            let alreadyExists = false;
            if (fs.existsSync(targetDir)) {
                const files = fs.readdirSync(targetDir);
                const duplicate = files.find(f => {
                    const lf = f.toLowerCase();
                    return lf.includes(amountStr) && (lf.includes(cleanMerchant.toLowerCase()) || cleanMerchant.toLowerCase().includes(lf.replace(/\.pdf|\.html/g, '')));
                });
                if (duplicate) {
                    alreadyExists = true;
                    console.log(`💾 Local existant : "${duplicate}" pour "${tx.label}" (${tx.amount} €). Pas de doublons.`);
                    
                    // Si présent localement mais non associé sur Pennylane, on le lie
                    const localBuffer = fs.readFileSync(path.join(targetDir, duplicate));
                    await uploadAndMatchPennylane(tx.id, localBuffer, cleanFilename, amount, txDateStr, keywords);
                }
            }

            if (alreadyExists) continue;

            // Chercher dans les e-mails
            console.log(`🔍 Recherche e-mail pour : "${tx.label}" (${tx.amount} €) du ${txDateStr}...`);
            
            const searches: Promise<any>[] = [];
            if (gmailConnection) {
                searches.push(searchEmailAccount(gmailConnection, gmailConfig.user, keywords, amount, new Date(tx.date)));
            }
            if (icloudConnection) {
                searches.push(searchEmailAccount(icloudConnection, icloudConfig.user, keywords, amount, new Date(tx.date)));
            }

            const results = await Promise.all(searches);
            const emailMatch = results.find(r => r !== null);

            if (emailMatch) {
                console.log(`🎯 Justificatif e-mail trouvé !`);
                
                // 1. Sauvegarde locale
                fs.mkdirSync(targetDir, { recursive: true });
                fs.writeFileSync(targetFilePath, emailMatch.buffer);
                console.log(`💾 Sauvegardé localement : "${cleanFilename}"`);

                // 2. Synchronisation Pennylane
                await uploadAndMatchPennylane(tx.id, emailMatch.buffer, cleanFilename, amount, txDateStr, keywords);
            } else {
                console.log(`❌ Aucun justificatif trouvé pour "${tx.label}" dans les e-mails.`);
            }
        }

        if (gmailConnection) gmailConnection.end();
        if (icloudConnection) icloudConnection.end();
    }

    // --- PHASE 3 : NETTOYAGE DES DOUBLONS DANS LES REPERTOIRES ---
    console.log("\n--- 🧹 PHASE 3 : Nettoyage des doublons locaux ---");
    for (const year of ['2025', '2026']) {
        const yearDir = path.join(comptaBaseDir, `Factures ${year}`);
        if (!fs.existsSync(yearDir)) continue;
        const months = fs.readdirSync(yearDir);
        for (const month of months) {
            const monthDir = path.join(yearDir, month);
            if (fs.statSync(monthDir).isDirectory()) {
                cleanupDuplicatesInDir(monthDir);
            }
        }
    }

    console.log("\n🎉 Traitement global de synchronisation, renommage et nettoyage terminé !");
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
                    console.log(`ℹ️ La facture existe déjà sur Pennylane avec l'ID ${invoiceId} (via upload 409).`);
                }
            } else {
                console.error(`❌ Échec du téléversement Pennylane : ${errTxt}`);
                return;
            }
        } else {
            const uploadData = (await uploadRes.json()) as any;
            const fileAttachmentId = uploadData.id;

            // Rechercher le fournisseur
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

            // Créer la facture fournisseur
            console.log(`🧾 Importation de la facture sur Pennylane...`);
            const cleanLabel = filename.replace(/\.pdf|\.html|\.jpg|\.png|\.jpeg/gi, '');
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
                  label: cleanLabel
                }
              ]
            };

            const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Use-2026-API-Changes': 'true'
              },
              body: JSON.stringify(payload)
            });

            if (importRes.ok) {
              const importData = await importRes.json() as any;
              invoiceId = importData.id || importData.supplier_invoice?.id;
            } else {
              const errTxt = await importRes.text();
              if (importRes.status === 409 || errTxt.includes('already exists with such attachment')) {
                const match = errTxt.match(/document with ID (\d+) already exists/i);
                if (match && match[1]) {
                    invoiceId = match[1];
                    console.log(`ℹ️ La facture existe déjà sur Pennylane avec l'ID ${invoiceId} (via import 409).`);
                }
              } else {
                console.error(`❌ Échec import facture :`, errTxt);
              }
            }
        }

        if (invoiceId) {
            const cleanLabel = filename.replace(/\.pdf|\.html|\.jpg|\.png|\.jpeg/gi, '');
            // Mettre à jour le label
            await updatePennylaneInvoiceLabel(invoiceId, cleanLabel);

            // Rapprocher de la transaction
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
