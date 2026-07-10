const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PENNYLANE_API_KEY = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const AMAZON_SUPPLIER_ID = 1313931083776; // Default Pennylane Amazon Supplier ID

const prisma = new PrismaClient();

function getEncryptionKey() {
  let keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    const parentEnvPath = '/Users/guillaumephilippe/ANTIGRAVITY/.env';
    if (fs.existsSync(parentEnvPath)) {
      const content = fs.readFileSync(parentEnvPath, 'utf8');
      const match = content.match(/ENCRYPTION_KEY="?([a-f0-9]{64})"?/);
      if (match) {
        keyHex = match[1];
        process.env.ENCRYPTION_KEY = keyHex;
      }
    }
  }
  return keyHex ? Buffer.from(keyHex, 'hex') : null;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    return encryptedText; // fallback to plain text if not encrypted
  }
  try {
    const key = getEncryptionKey();
    if (!key) return encryptedText;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed in script:', error);
    return null;
  }
}

// Read unmatched Amazon transactions list (optional for matching)
const unmatchedFile = path.join(__dirname, 'unmatched_amazon.json');
let unmatched = [];
if (fs.existsSync(unmatchedFile)) {
  unmatched = JSON.parse(fs.readFileSync(unmatchedFile, 'utf8'));
}

// Helper to parse French Amazon order dates
function parseAmazonFrenchDate(dateStr) {
  const months = {
    'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
    'juillet': 6, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11
  };
  const parts = dateStr.trim().toLowerCase().split(/\s+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1];
    const year = parseInt(parts[2], 10);
    const month = months[monthStr];
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return { day, month, year };
    }
  }
  return null;
}

// Clean and parse currency amount
function parseAmazonAmount(amtStr) {
  const cleaned = amtStr.replace(/[^\d,\.]/g, '').replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

async function uploadFileAttachment(fileBuffer, filename) {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' });
  formData.append('file', blob, filename);
  
  const res = await fetch(`${BASE_URL}/file_attachments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PENNYLANE_API_KEY}`,
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: formData
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload attachment: ${res.status} - ${text}`);
  }
  const data = await res.json();
  return data.id;
}

async function importInvoice(fileAttachmentId, supplierId, dateStr, amount, label) {
  const amt = parseFloat(amount);
  const payload = {
    file_attachment_id: fileAttachmentId,
    supplier_id: supplierId,
    date: dateStr,
    deadline: dateStr,
    currency_amount: amt.toFixed(2),
    currency_amount_before_tax: amt.toFixed(2),
    currency_tax: '0.00',
    currency: 'EUR',
    invoice_lines: [
      {
        currency_amount: amt.toFixed(2),
        currency_tax: '0.00',
        vat_rate: 'exempt',
        label: label
      }
    ]
  };
  
  const res = await fetch(`${BASE_URL}/supplier_invoices/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PENNYLANE_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to import invoice: ${res.status} - ${text}`);
  }
  const data = await res.json();
  return data.id || data.supplier_invoice?.id;
}

async function matchTransactionToInvoice(invoiceId, transactionId) {
  const url = `${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PENNYLANE_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ transaction_id: transactionId })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  ⚠️ Match failed: ${res.status} - ${text}`);
    return false;
  }
  console.log(`  🔗 Match succeeded (Invoice ${invoiceId} <-> Transaction ${transactionId})`);
  return true;
}

async function handleDownloadedBuffer(buffer, orderDate, amount, orderDateStr, matchesFound) {
  console.log(`  Downloaded successfully! Size: ${buffer.length} bytes`);
  
  // Parse PDF and filter by Recipient & Card
  try {
    const parsedPdf = await pdfParse(buffer);
    const text = (parsedPdf.text || '').toLowerCase();
    
    // 1. Recipient check
    const hasRecipient = text.includes("guillaume philippe") || text.includes("philippe guillaume");
    if (!hasRecipient) {
      console.warn(`  ❌ Filter rejected: Invoice not addressed to Guillaume Philippe. Skipping.`);
      return;
    }
    
    // 2. Card/PayPal payment method check
    const hasPayPal = text.includes("paypal") || text.includes("pay pal");
    const hasProCard = text.includes("1397") || text.includes("6150");
    const hasAnyCardMention = text.includes("visa") || text.includes("mastercard") || text.includes("carte de crédit") || text.includes("carte de paiement");

    if (!hasPayPal && !hasProCard) {
      if (hasAnyCardMention) {
        console.warn(`  ❌ Filter rejected: Payment card listed is not a pro card. Skipping.`);
        return;
      }
      
      const hasProAddress = text.includes("via sana") || text.includes("sebastopol");
      if (!hasProAddress) {
        console.warn(`  ❌ Filter rejected: No pro card found and billing address is not pro. Skipping.`);
        return;
      }
      console.log("  ⚠️ No card details in invoice, but billing address is Centre Via Sana pro. Accepting.");
    } else {
      console.log("  ✅ Filter passed (pro card or PayPal detected).");
    }
  } catch (pdfErr) {
    console.warn(`  ⚠️ Could not verify PDF metadata, importing anyway: ${pdfErr.message}`);
  }

  const dateFormatted = orderDate.toISOString().split('T')[0];
  const localFilename = `Amazon_${dateFormatted}_${amount.toFixed(2)}.pdf`;
  const localDest = path.join('/Users/guillaumephilippe/Desktop/Factures Amazon Rapatriees', localFilename);
  fs.mkdirSync(path.dirname(localDest), { recursive: true });
  fs.writeFileSync(localDest, buffer);
  console.log(`  💾 Saved locally on Desktop: ${localDest}`);
  
  // Check if we can match to an unmatched transaction in Pennylane
  const tx = unmatched.find(t => {
    if (matchesFound.has(t.id)) return false;
    const txDate = new Date(t.date);
    const txMonth = txDate.getMonth();
    const txYear = txDate.getFullYear();
    return txMonth === orderDate.getMonth() && txYear === orderDate.getFullYear() && Math.abs(t.amount - amount) < 0.05;
  });

  try {
    console.log(`  📤 Uploading to Pennylane...`);
    const fileId = await uploadFileAttachment(buffer, localFilename);
    console.log(`  Uploaded to Pennylane (Attachment ID: ${fileId})`);
    
    const invId = await importInvoice(fileId, AMAZON_SUPPLIER_ID, dateFormatted, amount, `Amazon order ${orderDateStr}`);
    console.log(`  Imported invoice successfully (Invoice ID: ${invId})`);
    
    if (tx) {
      console.log(`  🎯 Found matching Pennylane transaction ${tx.id}. Associating...`);
      await matchTransactionToInvoice(invId, tx.id);
      matchesFound.add(tx.id);
    } else {
      console.log(`  ℹ️ No matching Pennylane transaction found. Left unmatched (New) in Pennylane.`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Failed to import to Pennylane: ${err.message}`);
  }
}

async function processOrder(page, orderCard, matchesFound, cutoffDate) {
  try {
    const text = await orderCard.innerText();
    
    // Extract order date
    const dateMatch = text.match(/(?:Commande effectuée le|COMMANDE EFFECTUÉE LE)\s+([^\n]+)/i);
    if (!dateMatch) return;
    const parsedDate = parseAmazonFrenchDate(dateMatch[1]);
    if (!parsedDate) return;
    
    const orderDate = new Date(parsedDate.year, parsedDate.month, parsedDate.day);
    orderDate.setHours(0, 0, 0, 0);
    
    // Limit to cutoffDate since newest orders are displayed first
    if (orderDate < cutoffDate) {
      console.log(`  ⏹️ Order date ${orderDate.toISOString().split('T')[0]} is older than cutoff ${cutoffDate.toISOString().split('T')[0]}. Stopping page scan.`);
      return 'STOP';
    }
    
    // Extract total amount
    const totalMatch = text.match(/(?:TOTAL|Total)\s+([0-9\s,.]+)\s*€/i);
    if (!totalMatch) return;
    const parsedAmt = parseAmazonAmount(totalMatch[1]);
    
    console.log(`\n📦 Processing Amazon order of ${parsedAmt} € on ${dateMatch[1]}...`);
    
    // Find Invoice dropdown or link
    const links = await orderCard.$$('a');
    let invoiceLink = null;
    for (const link of links) {
      const linkText = await link.innerText();
      const href = await link.getAttribute('href');
      if (linkText.toLowerCase().includes('facture') || (href && href.includes('invoice'))) {
        invoiceLink = link;
        break;
      }
    }
    
    if (invoiceLink) {
      console.log(`  Clicking invoice dropdown...`);
      await invoiceLink.scrollIntoViewIfNeeded();
      await invoiceLink.evaluate(el => el.click());
      await page.waitForSelector('.a-popover-content', { state: 'visible', timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(1000);
      
      const popoverLinks = await page.$$('.a-popover-content a');
      let downloadLink = null;
      if (popoverLinks.length > 0) {
        for (const pl of popoverLinks) {
          const plText = (await pl.innerText()).toLowerCase();
          if ((plText.includes('facture') || plText.includes('reçu') || plText.includes('receipt') || plText.includes('télécharger') || plText.includes('invoice')) && 
              !plText.includes('demander') && !plText.includes('request') && !plText.includes('aide') && !plText.includes('help')) {
            downloadLink = pl;
            break;
          }
        }
      }
      
      if (!downloadLink) {
        downloadLink = invoiceLink;
      }
      
      try {
        const href = await downloadLink.getAttribute('href');
        let buffer = null;
        if (!href || href.startsWith('javascript:')) {
          console.log(`  Standard click download flow...`);
          const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
          const popupPromise = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
          
          await downloadLink.evaluate(el => el.click());
          
          const result = await Promise.race([
            downloadPromise.then(d => d ? { type: 'download', value: d } : null),
            popupPromise.then(p => p ? { type: 'popup', value: p } : null)
          ].filter(Boolean));
          
          if (!result) {
            throw new Error("Timeout waiting for popups or downloads.");
          }
          
          if (result.type === 'download') {
            const downloadPath = await result.value.path();
            buffer = fs.readFileSync(downloadPath);
          } else if (result.type === 'popup') {
            const popup = result.value;
            await popup.waitForLoadState();
            const pdfUrl = popup.url();
            const bytes = await page.evaluate(async (url) => {
              const res = await fetch(url);
              const arrayBuffer = await res.arrayBuffer();
              return Array.from(new Uint8Array(arrayBuffer));
            }, pdfUrl);
            buffer = Buffer.from(bytes);
            await popup.close();
          }
        } else {
          const absoluteUrl = new URL(href, page.url()).href;
          console.log(`  Downloading direct link: ${absoluteUrl}...`);
          const bytes = await page.evaluate(async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
          }, absoluteUrl);
          buffer = Buffer.from(bytes);
        }
        
        await handleDownloadedBuffer(buffer, orderDate, parsedAmt, dateMatch[1], matchesFound);
      } catch (err) {
        console.error(`  ⚠️ Download failed:`, err.message);
      }
      
      // Close popover
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.warn(`  No invoice link found on order card.`);
    }
  } catch (err) {
    console.error("  Error processing order:", err.message);
  }
}

async function safeGoto(page, url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      return;
    } catch (err) {
      console.warn(`  Navigation attempt ${i} failed: ${err.message}. Retrying...`);
      await page.waitForTimeout(3000);
    }
  }
  throw new Error(`Failed to navigate to ${url} after ${retries} attempts.`);
}

async function main() {
  // Define cutoff date based on COPILOT_START_DATE or last 7 days
  const startDateVal = process.env.COPILOT_START_DATE;
  let cutoffDate = null;
  if (startDateVal) {
    cutoffDate = new Date(startDateVal);
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    cutoffDate = d;
  }
  cutoffDate.setHours(0, 0, 0, 0);
  console.log(`⏱️ Cutoff date is set to: ${cutoffDate.toISOString().split('T')[0]} (only orders since this date will be downloaded)`);

  const cutoffYear = cutoffDate.getFullYear();
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= cutoffYear; y--) {
    years.push(y);
  }

  console.log(`🚀 Starting Amazon play-scraper.`);
  
  const creds = await prisma.supplierCredential.findFirst({
    where: { name: { contains: 'Amazon', mode: 'insensitive' } }
  });
  
  let dbEmail = "guillaumephilippe1968@gmail.com";
  let dbPass = null;
  if (creds) {
    if (creds.email) dbEmail = creds.email;
    else if (creds.username) dbEmail = creds.username;
    if (creds.password) dbPass = decrypt(creds.password);
  }
  
  const statePath = path.join(__dirname, 'amazon_session.json');
  const browser = await chromium.launch({ headless: false });
  const contextOptions = {};
  if (fs.existsSync(statePath)) {
    contextOptions.storageState = statePath;
    console.log("📂 Loading saved session cookie state...");
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  console.log("🌐 Navigating to Amazon Order History...");
  await safeGoto(page, "https://www.amazon.fr/gp/css/order-history");
  
  const isLoginPage = page.url().includes('signin') || await page.$('input[type="email"]');
  if (isLoginPage) {
    console.log("👤 Not authenticated. Filling credentials...");
    try {
      await page.fill('input[type="email"]', dbEmail);
      await page.click('input[type="submit"]');
      
      if (dbPass) {
        await page.waitForSelector('input[type="password"]', { timeout: 10000 });
        await page.fill('input[type="password"]', dbPass);
        await page.click('input[type="submit"]');
      }
    } catch (e) {
      console.log("Could not auto-fill details, please input manually:", e.message);
    }
    
    console.log("\n⚠️ ========================================================");
    console.log("⚠️ PLEASE PERFORM MANUAL 2FA / CAPTCHA VERIFICATION IN THE CHROMIUM WINDOW.");
    console.log("⚠️ Waiting for login to complete (Max 5 minutes)...");
    console.log("⚠️ ========================================================\n");
    
    await page.waitForSelector('.order-card, .js-order-card, .order, #yourOrdersContent', { timeout: 300000 });
  } else {
    console.log("✅ Authenticated via session cookies!");
  }
  
  // Save cookies
  try {
    await context.storageState({ path: statePath });
    console.log("💾 Saved session cookies.");
  } catch (err) {
    console.error("Failed to save state:", err.message);
  }
  
  const matchesFound = new Set();
  
  for (const year of years) {
    console.log(`\n📅 Scanning orders of year ${year}...`);
    try {
      await safeGoto(page, `https://www.amazon.fr/gp/css/order-history?timeFilter=year-${year}`);
      await page.waitForTimeout(2000);
      
      let hasNextPage = true;
      let pageNum = 1;
      
      while (hasNextPage) {
        console.log(`Scanning page ${pageNum} for year ${year}...`);
        await page.waitForSelector('.order-card, .js-order-card, .order, #yourOrdersContent');
        
        const cards = await page.$$('.order-card, .js-order-card, .order');
        console.log(`Found ${cards.length} order cards.`);
        
        let stopScannedYear = false;
        for (const card of cards) {
          const status = await processOrder(page, card, matchesFound, cutoffDate);
          if (status === 'STOP') {
            stopScannedYear = true;
            break;
          }
        }
        
        if (stopScannedYear) {
          console.log(`⏹️ Stop condition reached for year ${year}.`);
          break;
        }
        
        const nextBtn = await page.$('.a-last a');
        if (nextBtn && !stopScannedYear) {
          console.log("Navigating to next page...");
          await nextBtn.click();
          await page.waitForTimeout(2000);
          pageNum++;
        } else {
          hasNextPage = false;
        }
      }
    } catch (yearErr) {
      console.error(`Error scanning year ${year}:`, yearErr.message);
    }
  }
  
  console.log(`\n🎉 Process complete. Downloaded and processed pro Amazon invoices.`);
  
  try {
    await context.storageState({ path: statePath });
  } catch (err) {}
  
  await browser.close();
}

main().catch(console.error).finally(() => prisma.$disconnect());
