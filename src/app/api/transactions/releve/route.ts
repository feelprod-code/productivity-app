import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
      return NextResponse.json({ error: "Missing PENNYLANE_API_KEY" }, { status: 500 });
    }

    // Load overrides from DB
    const overridesMap: Record<string, boolean> = {};
    try {
      const overrides = await prisma.transactionOverride.findMany();
      overrides.forEach(o => {
        overridesMap[o.id] = o.isPro;
      });
    } catch (err) {
      console.error("Failed to load transaction overrides:", err);
    }

    // Load PayPal Merchant Cache
    let paypalCache: Record<string, string> = {};
    try {
      const cachePath = path.join(process.cwd(), 'src/app/api/transactions/releve/paypal_cache.json');
      if (fs.existsSync(cachePath)) {
        paypalCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      }
    } catch (err) {
      console.error("Failed to load PayPal cache:", err);
    }

    const BASE_URL = "https://app.pennylane.com/api/external/v2";

    // 1. Fetch Bank Accounts
    const accountsRes = await fetch(`${BASE_URL}/bank_accounts`, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });
    if (!accountsRes.ok) {
      throw new Error(`Failed to fetch bank accounts: ${accountsRes.status}`);
    }
    const accountsData = await accountsRes.json();
    const accounts = accountsData.bank_accounts || accountsData.items || [];

    // Map account categories (Pro vs Perso)
    const accountMap: { [key: number]: { name: string; isPro: boolean; balance: number } } = {};
    accounts.forEach((acc: any) => {
      const nameLower = (acc.name || '').toLowerCase();
      // Pro accounts are Carte Gold Business or the main account id 13829443584
      const isPro = nameLower.includes('business') || acc.id === 13829443584;
      accountMap[acc.id] = {
        name: acc.name,
        isPro,
        balance: parseFloat(acc.balance || '0')
      };
    });

    // 2. Fetch Transactions (fetch up to 12 pages from 2026-01-01 to cover full year history)
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

    // 3. Fetch Supplier Invoices (fetch up to 10 pages to cover all invoices)
    let invCursor: string | null = null;
    const allInvs: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const fetchUrl: string = `${BASE_URL}/supplier_invoices?limit=100` + (invCursor ? `&cursor=${invCursor}` : '');
      const res = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        }
      });
      if (!res.ok) break;
      const data = await res.json();
      const items = data.supplier_invoices || data.items || [];
      if (items.length === 0) break;
      allInvs.push(...items);

      const nextCursor = data.next_cursor || data.meta?.next_cursor;
      if (nextCursor) {
        invCursor = nextCursor;
      } else {
        break;
      }
    }

    // 4. Process and Classify Transactions
    const processedTransactions = allTxs.map((tx: any) => {
      const amount = parseFloat(tx.amount || '0');
      const isOutflow = amount < 0;
      const absAmount = Math.abs(amount);
      const label = tx.label || '';
      const labelLower = label.toLowerCase();

      // Determine Payment Method / Category
      let category = "other";
      if (labelLower.includes('virement') || labelLower.includes('vir sepa') || labelLower.includes('vir rec')) {
        category = "transfer";
      } else if (labelLower.includes('prelevement') || labelLower.includes('prlv') || labelLower.includes('sepa prlv') || labelLower.includes('prelevt')) {
        category = "direct_debit";
      } else if (labelLower.includes('carte') || labelLower.includes('cb ') || labelLower.includes('facture carte') || labelLower.includes('achat cb')) {
        category = "card";
      }

      // Check Pro vs Perso
      const accountId = tx.bank_account ? tx.bank_account.id : null;
      const accInfo = accountId ? accountMap[accountId] : null;
      const isProAccount = accInfo ? accInfo.isPro : true; // Default to Pro if account info missing
      let isPro = isProAccount;

      const isOverridden = overridesMap[String(tx.id)] !== undefined;
      if (isOverridden) {
        isPro = overridesMap[String(tx.id)];
      }

      const isPaypal = labelLower.includes('paypal');
      
      // Look up real merchant name from PayPal cache if it's a PayPal transaction
      let realMerchantName = "";
      if (isPaypal) {
        // Try exact match first
        const exactKey = `${tx.date}_${absAmount.toFixed(2)}`;
        realMerchantName = paypalCache[exactKey] || "";
        
        // If not found, look up with a date window (1 to 6 days before transaction date)
        if (!realMerchantName) {
          const txDate = new Date(tx.date);
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
      }
      
      if (!isOverridden) {
        // Exclude personal transactions even on pro account
        const personalKeywords = [
          'canal', 'netflix', 'disney', 'carrefour', 'monoprix', 'auchan', 'leclerc', 'intermarche',
          'uber', 'deliveroo', 'fnac', 'zara', 'decathlon', 'leroy', 'boulangerie', 'restau', 
          'cafe', 'darty', 'spotify', 'sncf', 'airbnb', 'booking.com', 'h&m', 'ikea', 'castorama',
          'appart', 'loyer', 'mgen', 'bouygues', 'magd', 'kaori', 'vw bank', 'volkswagen',
          'prestations', 'assurance voiture', 'poissonnerie', 'guillaume ou mm', 'cpam 75 prestations',
          'cpam du val d oise', 'cpam carcassonne',
          // PayPal/New personal keywords
          'zalando', 'emma', 'fashion retail', 'apple', 'luiza', 'poste', 'theo', 'compagnie du',
          'draps'
        ];

        const isAlreadyExploitant = tx.categories && tx.categories.some((c: any) => c.account_number && c.account_number.startsWith('108'));
        const matchesPersonal = personalKeywords.some(k => labelLower.includes(k)) || 
                               (labelLower.includes('cpam') && labelLower.includes('prestation')) ||
                               (labelLower.includes('cpam') && !labelLower.includes('tp-')) ||
                               (realMerchantName && personalKeywords.some(k => realMerchantName.toLowerCase().includes(k)));
        
        if (isAlreadyExploitant || matchesPersonal) {
          isPro = false;
        }
      }

      const noJustificatifKeywords = [
        'genspark', 
        'telelion', 
        'decadaire', 
        'agio', 
        'commission',
        'zen pro',
        'formule zen',
        'convention professionnel',
        'access',
        'cb facture/retrait dt differe',
        'releve cb',
        // Highway tolls
        'dyn dac', 'vironvay', 'sapn', 'aprr', 'sanef', 'cofiroute', 'autoroute'
      ];
      
      const isIndigo = labelLower.includes('indigo');
      const isSmallIndigo = isIndigo && absAmount < 10.00;
      
      const noJustificatif = noJustificatifKeywords.some(k => labelLower.includes(k)) || 
                             !isPro || 
                             isSmallIndigo;

      // Match with Supplier Invoice locally
      const txTime = new Date(tx.date).getTime();
      const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;

      const techKeywords = [
        'vercel', 'supabase', 'openrouter', 'github', 'pinecone', 'openai', 'google',
        'stripe', 'microsoft', 'aws', 'amazon', 'dropbox', 'adobe', 'zoom', 'figma',
        'spotify', 'linkedin', 'eleven labs', 'elevenlabs', 'assemblyai', 'anthropic', 'midjourney',
        'heygen', 'suno', 'runway', 'cloudflare', 'genspark', 'qr-code-generator', 'qrcg', 'bitly'
      ];
      
      const isTechProvider = (isPaypal && (!realMerchantName || techKeywords.some(prov => realMerchantName.toLowerCase().includes(prov)))) || 
                             (!isPaypal && techKeywords.some(prov => labelLower.includes(prov)));

      const matchedInvoice = allInvs.find((inv: any) => {
        if (!inv.date) return false;
        const invTime = new Date(inv.date).getTime();
        const invAmount = parseFloat(inv.amount || '0');
        
        let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
        
        // Currency-aware match for USD/EUR conversion of tech providers
        if (!amountMatch && isTechProvider) {
          const ratio = absAmount / invAmount;
          if (ratio >= 0.80 && ratio <= 1.15) {
            amountMatch = true;
          } else {
            const invRatio = invAmount / absAmount;
            if (invRatio >= 0.80 && invRatio <= 1.15) {
              amountMatch = true;
            }
          }
        }
        
        const closeDate = (txTime >= invTime - 2 * 24 * 60 * 60 * 1000) && (txTime - invTime <= thirtyFiveDaysMs);
        
        // Ensure the invoice provider matches the transaction provider to avoid cross-matching
        let providerMatch = true;
        if (isTechProvider) {
          const invLabelLower = (inv.label || '').toLowerCase();
          const invFileLower = (inv.filename || '').toLowerCase();
          
          if (isPaypal) {
            if (realMerchantName) {
              const cleanMerchant = realMerchantName.toLowerCase().replace(/[^a-z0-9]/g, '');
              const cleanInvLabel = invLabelLower.replace(/[^a-z0-9]/g, '');
              const cleanInvFile = invFileLower.replace(/[^a-z0-9]/g, '');
              providerMatch = cleanInvLabel.includes(cleanMerchant) || cleanInvFile.includes(cleanMerchant) ||
                              cleanMerchant.includes(cleanInvLabel) || cleanMerchant.includes(cleanInvFile);
            } else {
              providerMatch = invLabelLower.includes('cloudflare') || invFileLower.includes('cloudflare');
            }
          } else {
            const matchedKeyword = techKeywords.find(prov => labelLower.includes(prov));
            if (matchedKeyword) {
              const cleanKeyword = matchedKeyword.replace(/[^a-z0-9]/g, '');
              const cleanInvLabel = invLabelLower.replace(/[^a-z0-9]/g, '');
              const cleanInvFile = invFileLower.replace(/[^a-z0-9]/g, '');
              
              const isQrcg = matchedKeyword === 'qr-code-generator' || matchedKeyword === 'qrcg' || matchedKeyword === 'bitly';
              if (isQrcg) {
                providerMatch = invLabelLower.includes('qr code') || invLabelLower.includes('qrcg') || invLabelLower.includes('bitly') || invFileLower.includes('qrcg') || invFileLower.includes('bitly');
              } else {
                providerMatch = cleanInvLabel.includes(cleanKeyword) || cleanInvFile.includes(cleanKeyword);
              }
            }
          }
        }
        // Generic keyword check for matching non-tech providers with slightly different amounts (e.g. partial payments/fees)
        if (!amountMatch && !isTechProvider && closeDate) {
          const txWords = labelLower.split(/[^a-z0-9]/).filter((w: string) => w.length >= 3 && !['prelvt', 'sepa', 'confrere', 'prlv', 'recu'].includes(w));
          if (txWords.length > 0) {
            const invLabelLower = (inv.label || '').toLowerCase();
            const invFileLower = (inv.filename || '').toLowerCase();
            const invProvLower = (inv.provider || '').toLowerCase();
            
            const matchesAllWords = txWords.every((word: string) => 
              invLabelLower.includes(word) || invFileLower.includes(word) || invProvLower.includes(word)
            );
            
            if (matchesAllWords) {
              const diffRatio = Math.abs(invAmount - absAmount) / Math.max(invAmount, absAmount);
              if (diffRatio <= 0.20) { // allow up to 20% difference
                amountMatch = true;
              }
            }
          }
        }

        return amountMatch && closeDate && providerMatch;
      });

      return {
        id: tx.id,
        date: tx.date,
        label,
        amount,
        absAmount,
        isOutflow,
        category,
        isProAccount,
        isPro,
        noJustificatif,
        bankAccountName: accInfo ? accInfo.name : "Compte Inconnu",
        matchedInvoice: matchedInvoice ? {
          id: matchedInvoice.id,
          date: matchedInvoice.date,
          label: matchedInvoice.label,
          filename: matchedInvoice.filename,
          publicFileUrl: matchedInvoice.public_file_url
        } : null
      };
    });

    return NextResponse.json({
      success: true,
      transactions: processedTransactions,
      bankAccounts: Object.values(accountMap)
    });
  } catch (error: any) {
    console.error("Error in bank statement API:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
