import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from 'fs';
import * as path from 'path';

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

    // Load transaction product descriptions from DB
    const detailsMap: Record<string, string> = {};
    try {
      const details = await prisma.$queryRawUnsafe('SELECT id, description FROM "TransactionDetail"') as any[];
      details.forEach((d: any) => {
        detailsMap[d.id] = d.description;
      });
    } catch (err) {
      console.error("Failed to load transaction details:", err);
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

    // 3. Load Local Invoices from DB
    const allInvs = await prisma.invoice.findMany() as any[];

    // 4. Process and Classify Transactions
    let backgroundEnrichCount = 0;
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
        const invAmount = inv.amount || 0;
        
        let amountMatch = Math.abs(invAmount - absAmount) < 0.01;
        
        // Tolerance for currency/tech conversion or minor variations
        if (!amountMatch) {
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
        if (!closeDate) return false;

        // Clean label for transaction provider lookup
        const cleanTx = (realMerchantName || labelLower)
          .replace(/(virement|prlv|sepa|carte|cb|facture|achat|payments|digital|sarl|gmbh|inc|sas|eu)/gi, '')
          .toLowerCase()
          .trim();
        
        const txWords = cleanTx.split(/[^a-z0-9]/).filter((w: string) => w.length >= 3);

        // Clean label for invoice provider
        const cleanInv = (inv.provider || '')
          .split(' - ')[0] // extract merchant name before product description
          .toLowerCase()
          .trim();

        // Provider match logic
        let providerMatch = false;
        if (txWords.length > 0) {
          providerMatch = txWords.some((word: string) => cleanInv.includes(word) || word.includes(cleanInv));
        } else {
          providerMatch = cleanInv.includes(cleanTx) || cleanTx.includes(cleanInv);
        }

        return amountMatch && providerMatch;
      });

      let productDescription = detailsMap[String(tx.id)] || null;
      if (!productDescription && matchedInvoice && matchedInvoice.provider.includes(' - ')) {
        productDescription = matchedInvoice.provider.split(' - ').slice(1).join(' - ');
      }

      const txResult = {
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
        productDescription,
        matchedInvoice: matchedInvoice ? {
          id: matchedInvoice.id,
          date: matchedInvoice.date,
          label: matchedInvoice.provider,
          filename: matchedInvoice.fileUrl ? matchedInvoice.fileUrl.substring(matchedInvoice.fileUrl.lastIndexOf('/') + 1) : "facture.pdf",
          publicFileUrl: matchedInvoice.fileUrl,
          invoiceLines: [
            {
              label: matchedInvoice.provider,
              amount: matchedInvoice.amount || 0
            }
          ]
        } : null
      };

      return txResult;
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
