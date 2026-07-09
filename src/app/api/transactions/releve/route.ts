import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';

interface PaymentGroup {
  dateStr: string;
  caisse: string;
  date: Date;
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

function guessCategory(label: string, isPro: boolean, productDescription: string | null, amount: number): string {
  if (!isPro) return "PERSO";
  
  const labelLower = label.toLowerCase();
  const descLower = (productDescription || "").toLowerCase();
  
  if (labelLower.includes("netflix") || labelLower.includes("spotify") || labelLower.includes("disney") || labelLower.includes("canal") || labelLower.includes("zara") || labelLower.includes("decathlon") || labelLower.includes("uber eat") || labelLower.includes("deliveroo")) {
    return "PERSO";
  }
  
  if (labelLower.includes("openai") || labelLower.includes("chatgpt") || labelLower.includes("openrouter") || labelLower.includes("google check") || labelLower.includes("google ai") || labelLower.includes("google one") || labelLower.includes("cloudflare") || labelLower.includes("supabase") || labelLower.includes("vercel") || labelLower.includes("github") || labelLower.includes("canva") || labelLower.includes("suno") || labelLower.includes("headliner") || labelLower.includes("krotos") || labelLower.includes("paddle")) {
    return "LOGICIELS_IA";
  }
  
  if (labelLower.includes("restaurant") || labelLower.includes("bistro") || labelLower.includes("cafe") || labelLower.includes("brasserie") || labelLower.includes("paris halles") || labelLower.includes("sebastopol") || labelLower.includes("traiteur") || labelLower.includes("snack") || labelLower.includes("mcdonald") || labelLower.includes("bk ") || labelLower.includes("starbucks") || descLower.includes("repas") || descLower.includes("restaurant")) {
    return "RESTAURANT";
  }
  
  if (labelLower.includes("amazon") || labelLower.includes("amzn") || labelLower.includes("office") || labelLower.includes("papeterie") || labelLower.includes("cartouche") || labelLower.includes("encre") || labelLower.includes("papier") || labelLower.includes("stylo") || descLower.includes("encre") || descLower.includes("fourniture") || descLower.includes("bureau") || descLower.includes("papier") || descLower.includes("coque macbook") || descLower.includes("coque ipad") || descLower.includes("coque iphone")) {
    return "FOURNITURES";
  }
  
  if (labelLower.includes("sapn") || labelLower.includes("aprr") || labelLower.includes("sanef") || labelLower.includes("cofiroute") || labelLower.includes("autoroute") || labelLower.includes("peage") || labelLower.includes("sncf") || labelLower.includes("train") || labelLower.includes("taxi") || labelLower.includes("parking") || labelLower.includes("indigo") || labelLower.includes("total") || (labelLower.includes("station") && !labelLower.includes("prestation")) || labelLower.includes("carburant") || labelLower.includes("essence") || labelLower.includes("bp ") || labelLower.includes("shell") || labelLower.includes("esso") || labelLower.includes("uber") || descLower.includes("péage") || descLower.includes("déplacement") || descLower.includes("autoroute")) {
    return "DEPLACEMENTS";
  }
  
  if (labelLower.includes("doctolib") || labelLower.includes("drap d'examen") || labelLower.includes("lpm ") || labelLower.includes("cotte industries") || labelLower.includes("medical") || labelLower.includes("pharmacie") || labelLower.includes("hygiene") || labelLower.includes("papier d'examen") || descLower.includes("drap d'examen") || descLower.includes("matériel médical") || descLower.includes("cabinet") || descLower.includes("patient")) {
    return "CABINET";
  }
  
  if (labelLower.includes("urssaf") || labelLower.includes("carpimko") || labelLower.includes("assurance pro") || labelLower.includes("prevoyance") || labelLower.includes("macsf") || labelLower.includes("mgen") || labelLower.includes("medicale") || labelLower.includes("axa") || labelLower.includes("allianz") || labelLower.includes("cpam") || labelLower.includes("c.p.a.m.") || labelLower.includes("assurance maladie") || labelLower.includes("ameli")) {
    return "COTISATIONS";
  }
  
  return "FOURNITURES";
}

async function autoEnrichCpam(allTxs: any[], allInvs: any[], detailsMap: Record<string, string>) {
  try {
    // 1. Trouver les relevés CPAM
    const cpamInvoices = allInvs.filter((inv: any) => {
      const provLower = (inv.provider || '').toLowerCase();
      return inv.fileUrl && (provLower.includes('cpam') || provLower.includes('assurance') || provLower.includes('ameli'));
    });

    if (cpamInvoices.length === 0) return;

    // 2. Identifier les crédits récents (de type CPAM) qui n'ont pas encore de détails
    const cpamTxsToEnrich = allTxs.filter((tx: any) => {
      const amount = parseFloat(tx.amount || '0');
      if (amount <= 0) return false; // uniquement les rentrées d'argent
      if (detailsMap[String(tx.id)]) return false; // déjà enrichie en base
      
      const labelLower = (tx.label || '').toLowerCase();
      return labelLower.includes('cpam') || labelLower.includes('c.p.a.m.') || labelLower.includes('assurance maladie');
    });

    if (cpamTxsToEnrich.length === 0) return;

    console.log(`[CPAM] ${cpamTxsToEnrich.length} transaction(s) CPAM non enrichie(s) détectée(s). Tentative d'enrichissement à la volée...`);

    for (const inv of cpamInvoices) {
      // Vérifier si cette facture couvre la période des transactions à enrichir
      // (Pour éviter de parser inutilement les vieux PDFs)
      const hasCloseTx = cpamTxsToEnrich.some((tx: any) => {
        const txTime = new Date(tx.date).getTime();
        const invTime = new Date(inv.date).getTime();
        const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
        return Math.abs(txTime - invTime) <= thirtyFiveDaysMs;
      });

      if (!hasCloseTx) continue;

      console.log(`[CPAM] Parsing du PDF à la volée : ${inv.provider}`);
      const pdfRes = await fetch(inv.fileUrl);
      if (!pdfRes.ok) continue;
      
      const arrayBuffer = await pdfRes.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);
      const parsed = await pdfParse(pdfBuffer);
      const text = parsed.text || "";
      const lines = text.split('\n');

      const groups: PaymentGroup[] = [];
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
              const [d, m, y] = payDateStr.split('/');
              const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
              group = {
                dateStr: payDateStr,
                caisse,
                date,
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

      // Faire correspondre avec nos transactions non enrichies
      for (const group of groups) {
        const groupAmount = group.totalAmount;
        const groupDate = group.date;
        const patientsList = Object.entries(group.patients).map(([name, amount]) => ({ name, amount }));

        if (groupAmount <= 0 || patientsList.length === 0) continue;

        // Trouver la transaction correspondante
        const matchedTx = cpamTxsToEnrich.find((tx: any) => {
          const txAmount = parseFloat(tx.amount || "0");
          const amountDiff = Math.abs(txAmount - groupAmount);
          const txTime = new Date(tx.date).getTime();
          const groupTime = groupDate.getTime();
          const dayMs = 24 * 60 * 60 * 1000;
          return amountDiff < 0.05 && Math.abs(txTime - groupTime) <= 4 * dayMs;
        });

        if (matchedTx) {
          const txId = String(matchedTx.id);
          const descriptionValue = `CPAM_JSON:${JSON.stringify(patientsList)}`;

          // Enregistrer en base
          await prisma.$executeRawUnsafe(
            'INSERT INTO "TransactionDetail" (id, description, "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET description = $2, "updatedAt" = NOW()',
            txId,
            descriptionValue
          );

          // Mettre à jour detailsMap pour la requête en cours
          detailsMap[txId] = descriptionValue;
          console.log(`[CPAM] ✨ Match à la volée réussi pour la transaction ${txId} (${groupAmount} €) !`);
        }
      }
    }
  } catch (err) {
    console.error("[CPAM] Erreur lors de l'auto-enrichissement :", err);
  }
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pennylaneKey = process.env.PENNYLANE_API_KEY;
    if (!pennylaneKey) {
      return NextResponse.json({ error: "Missing PENNYLANE_API_KEY" }, { status: 500 });
    }

    // Load overrides from DB
    const overridesMap: Record<string, { isPro: boolean, category: string | null }> = {};
    try {
      const overrides = await prisma.transactionOverride.findMany();
      overrides.forEach(o => {
        overridesMap[o.id] = { isPro: o.isPro, category: o.category };
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

    // 2. Fetch Transactions (fetch up to 12 pages from 2025-06-30 to cover full history)
    let txCursor: string | null = null;
    const allTxs: any[] = [];
    const filterObj = [
      {
        field: "date",
        operator: "gteq",
        value: "2025-01-01"
      }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));

    for (let page = 1; page <= 15; page++) {
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

    // Load local 2025 LCL transactions (real and virtual)
    try {
      const lcl2025Path = path.join(process.cwd(), 'src/app/api/transactions/releve/lcl_2025_transactions.json');
      if (fs.existsSync(lcl2025Path)) {
        const localTxs = JSON.parse(fs.readFileSync(lcl2025Path, 'utf8'));
        
        // Convert local format to match Pennylane shape
        const formattedLocal = localTxs.map((ltx: any) => ({
          id: ltx.id,
          date: ltx.date,
          label: ltx.label,
          amount: ltx.amount,
          bank_account: { id: 13829443584 } // Mock as main pro account
        }));
        
        allTxs.push(...formattedLocal);
      }
    } catch (err) {
      console.error("Failed to load local LCL 2025 transactions:", err);
    }

    const allInvs = await prisma.invoice.findMany() as any[];
    const sortedInvs = [...allInvs].sort((a: any, b: any) => {
      const aLower = (a.provider || '').toLowerCase();
      const bLower = (b.provider || '').toLowerCase();
      const aIsSummary = aLower.includes('récapitulatif') || aLower.includes('articles divers');
      const bIsSummary = bLower.includes('récapitulatif') || bLower.includes('articles divers');
      if (aIsSummary && !bIsSummary) return 1;
      if (!aIsSummary && bIsSummary) return -1;
      return 0;
    });

    console.log("allInvs loaded in API:", allInvs.length, "Halles:", allInvs.filter(i => (i.provider || '').toLowerCase().includes('halles')).length);

    // Auto-enrich CPAM transactions dynamically with patient details
    await autoEnrichCpam(allTxs, sortedInvs, detailsMap);

    // 4. Process and Classify Transactions
    const usedInvoiceIds = new Set<string>();
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

      // Check PayPal and cache
      const isPaypal = labelLower.includes('paypal');
      let realMerchantName = "";
      if (isPaypal) {
        const exactKey = `${tx.date}_${absAmount.toFixed(2)}`;
        realMerchantName = paypalCache[exactKey] || "";
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

      // Match with Supplier Invoice locally
      const txTime = new Date(tx.date).getTime();
      const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;
      
      let matchedInvoice: any = null;

      if (isOutflow) {
        const txDesc = (detailsMap[String(tx.id)] || '').toLowerCase();
        
        // Etape 1 : Matching prioritaire par partage de mots clés de la description du produit (évite les mauvais croisements)
        if (txDesc) {
          const cleanDescWords = txDesc.split(/[^a-z0-9]/).filter((w: string) => w.length >= 4);
          const genericWords = ['avec', 'pour', 'dans', 'sans', 'noir', 'bleu', 'vert', 'rose', 'gris', 'blanc', 'taille', 'lot', 'pack', 'compatible', 'original', 'remplacement', 'rechange', 'recharge', 'produit', 'articles', 'divers', 'amazon', 'payments', 'prime', 'bouygues', 'telecom', 'sarl', 'paypal', 'openrouter'];
          const filteredWords = cleanDescWords.filter(w => !genericWords.includes(w));

          const candidates = sortedInvs
            .map((inv: any) => {
              if (usedInvoiceIds.has(inv.id)) return null;
              if (!inv.date) return null;

              const invTime = new Date(inv.date).getTime();
              const invAmount = inv.amount || 0;
              const cleanInv = (inv.provider || '').split(' - ')[0].toLowerCase().trim();
              const isTxAmazon = labelLower.includes('amazon') || !!(realMerchantName && realMerchantName.toLowerCase().includes('amazon'));
              const isInvAmazon = cleanInv.includes('amazon') || (inv.fileUrl && inv.fileUrl.toLowerCase().includes('amazon'));

              const isAmazonOrRelated = isTxAmazon && (isInvAmazon || 
                                                      cleanInv.includes('sportano') || 
                                                      cleanInv.includes('regatta') || 
                                                      cleanInv.includes('erima'));
              if (!isAmazonOrRelated) return null;

              const dateDiffDays = Math.abs(txTime - invTime) / (24 * 60 * 60 * 1000);
              if (dateDiffDays > 90) return null;

              const ratio = absAmount / invAmount;
              const amountMatch = ratio >= 0.70 && ratio <= 1.30;
              if (!amountMatch) return null;

              const cleanInvProv = (inv.provider || '').toLowerCase();
              const sharedCount = filteredWords.filter((word: string) => cleanInvProv.includes(word)).length;
              
              if (sharedCount === 0) return null;
              
              return { inv, sharedCount, dateDiffDays };
            })
            .filter(Boolean) as any[];

          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              if (b.sharedCount !== a.sharedCount) {
                return b.sharedCount - a.sharedCount;
              }
              return a.dateDiffDays - b.dateDiffDays;
            });
            matchedInvoice = candidates[0].inv;
          }
        }

        // Etape 2 : Repli sur le matching standard (si pas de match par mot-clé trouvé)
        if (!matchedInvoice) {
          matchedInvoice = sortedInvs.find((inv: any) => {
            if (usedInvoiceIds.has(inv.id)) return false;
            if (!inv.date) return false;
            const invTime = new Date(inv.date).getTime();
            const invAmount = inv.amount || 0;
            
            const cleanInv = (inv.provider || '')
              .split(' - ')[0]
              .toLowerCase()
              .trim();

            const isTxAmazon = labelLower.includes('amazon') || !!(realMerchantName && realMerchantName.toLowerCase().includes('amazon'));
            const isInvAmazon = cleanInv.includes('amazon') || (inv.fileUrl && inv.fileUrl.toLowerCase().includes('amazon'));

            const txDesc = (detailsMap[String(tx.id)] || '').toLowerCase();
            const cleanInvProv = (inv.provider || '').toLowerCase();

            let isAmazonMarketplaceMatch = false;
            if (isTxAmazon && txDesc) {
              const isInvAmazonOrRelated = isInvAmazon || 
                                           cleanInv.includes('sportano') ||
                                           cleanInv.includes('regatta') ||
                                           cleanInv.includes('erima');
              
              if (isInvAmazonOrRelated) {
                const descWords = txDesc.split(/[^a-z0-9]/).filter((w: string) => w.length >= 4);
                const genericWords = ['avec', 'pour', 'dans', 'sans', 'noir', 'bleu', 'vert', 'rose', 'gris', 'blanc', 'taille', 'lot', 'pack', 'compatible', 'original', 'remplacement', 'rechange', 'recharge', 'produit', 'articles', 'divers', 'amazon', 'payments', 'prime', 'bouygues', 'telecom', 'sarl', 'paypal', 'openrouter'];
                const filteredWords = descWords.filter(w => !genericWords.includes(w));
                const hasSharedWords = filteredWords.length > 0 && filteredWords.some((word: string) => cleanInvProv.includes(word));
                
                if (hasSharedWords) {
                  const ratio = absAmount / invAmount;
                  const dateDiffDays = Math.abs(txTime - invTime) / (24 * 60 * 60 * 1000);
                  if (ratio >= 0.70 && ratio <= 1.30 && dateDiffDays <= 90) {
                    isAmazonMarketplaceMatch = true;
                  }
                }
              }
            }

            const isAmazon = cleanInv.includes('amazon') || cleanInv.includes('sportano') || cleanInv.includes('regatta') || cleanInv.includes('erima');
            let amountMatch = Math.abs(invAmount - absAmount) < 0.01 || isAmazonMarketplaceMatch;
            
            if (!amountMatch && isAmazon) {
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
            if (!amountMatch) return false;

            // Strict date matching: standard is +/- 35 days, Amazon is up to 90 days
            const maxDaysMs = isAmazon ? 90 * 24 * 60 * 60 * 1000 : 35 * 24 * 60 * 60 * 1000;
            const closeDate = Math.abs(txTime - invTime) <= maxDaysMs;
            if (!closeDate) return false;

            if (isTxAmazon !== isInvAmazon && !isAmazonMarketplaceMatch) return false;

            const isTxOpenrouter = labelLower.includes('openrouter') || !!(realMerchantName && realMerchantName.toLowerCase().includes('openrouter'));
            const isInvOpenrouter = cleanInv.includes('openrouter');
            if (isTxOpenrouter !== isInvOpenrouter) return false;

            // Strict provider guardrails to prevent mismatched invoice links
            if (cleanInv.includes('carpimko') && !labelLower.includes('carpimko')) return false;
            if (cleanInv.includes('adobe') && !labelLower.includes('adobe')) return false;
            if ((cleanInv.includes('volkswagen') || cleanInv.includes('vw')) && 
                !(labelLower.includes('volkswagen') || labelLower.includes('vw') || labelLower.includes('volks'))) return false;
            if (cleanInv.includes('swiss') && !labelLower.includes('swiss')) return false;
            if (cleanInv.includes('urssaf') && !labelLower.includes('urssaf')) return false;
            if (cleanInv.includes('caisse') && !labelLower.includes('caisse') && !labelLower.includes('retraite') && !labelLower.includes('carpimko')) return false;

            const cleanTx = (realMerchantName || labelLower)
              .replace(/(virement|prlv|sepa|carte|cb|facture|achat|payments|digital|sarl|gmbh|inc|sas|eu)/gi, '')
              .toLowerCase()
              .trim();
            const txWords = cleanTx.split(/[^a-z0-9]/).filter((w: string) => {
              if (w.length < 3) return false;
              if (w === 'com' || w === 'net' || w === 'org' || w === 'www') return false;
              if (/^\d+$/.test(w)) return false;
              return true;
            });

            let providerMatch = false;
            if (!cleanInv || cleanInv.length < 2) {
              providerMatch = false;
            } else if (isAmazonMarketplaceMatch) {
              providerMatch = true;
            } else if (txWords.length > 0) {
              providerMatch = txWords.some((word: string) => cleanInv.includes(word) || word.includes(cleanInv));
            } else {
              providerMatch = cleanInv.includes(cleanTx) || cleanTx.includes(cleanInv);
            }

            return providerMatch;
          }) || null;
        }

        if (matchedInvoice) {
          usedInvoiceIds.add(matchedInvoice.id);
        }
      } else {
        // Inflow matching (CPAM, SumUp)
        const isTxCpam = labelLower.includes('cpam') || labelLower.includes('c.p.a.m.') || labelLower.includes('assurance maladie') || labelLower.includes('ameli');
        const isTxSumup = labelLower.includes('sumup') || labelLower.includes('sum up');
        if (isTxCpam) {
          matchedInvoice = allInvs.find((inv: any) => {
            const provLower = (inv.provider || '').toLowerCase();
             const isInvCpam = provLower.includes('cpam') || 
                               provLower.includes('assurance maladie') || 
                               provLower.includes('caisse d\'assurance') || 
                               provLower.includes('ameli');
             if (!isInvCpam) return false;
            
            const invTime = new Date(inv.date).getTime();
            return Math.abs(txTime - invTime) <= thirtyFiveDaysMs;
          }) || null;
        } else if (isTxSumup) {
          matchedInvoice = allInvs.find((inv: any) => {
            const provLower = (inv.provider || '').toLowerCase();
            const isInvSumup = provLower.includes('sumup') || provLower.includes('sum up');
            if (!isInvSumup) return false;
            
            const invTime = new Date(inv.date).getTime();
            const closeDate = Math.abs(txTime - invTime) <= 35 * 24 * 60 * 60 * 1000;
            if (!closeDate) return false;
            
            const txAmount = Math.abs(parseFloat(tx.amount || '0'));
            const invAmount = inv.amount || 0;
            return Math.abs(invAmount - txAmount) < 0.05;
          }) || null;
        }
      }

      let productDescription = detailsMap[String(tx.id)] || null;
      if (!productDescription && matchedInvoice && matchedInvoice.provider.includes(' - ')) {
        productDescription = matchedInvoice.provider.split(' - ').slice(1).join(' - ');
      }

      // PayPal heuristic product descriptions based on merchant name and amount
      if (!productDescription && isPaypal && realMerchantName) {
        const merchantLower = realMerchantName.toLowerCase();
        if (merchantLower.includes('spotify')) {
          productDescription = "Abonnement Spotify Premium Famille (Musique)";
        } else if (merchantLower.includes('openai') || merchantLower.includes('chatgpt')) {
          productDescription = "Abonnement ChatGPT Plus (IA Générative)";
        } else if (merchantLower.includes('suno')) {
          productDescription = "Abonnement Suno AI (Création musicale IA)";
        } else if (merchantLower.includes('headliner')) {
          productDescription = "Abonnement Headliner Basic (Création Vidéo/Audiogrammes)";
        } else if (merchantLower.includes('cloudflare')) {
          productDescription = "Services d'hébergement et DNS (Cloudflare)";
        } else if (merchantLower.includes('zapier')) {
          productDescription = "Abonnement Zapier Pro (Automatisation de flux)";
        } else if (merchantLower.includes('google')) {
          productDescription = "Abonnement Google One / Google AI Premium";
        } else if (merchantLower.includes('disney')) {
          productDescription = "Abonnement Disney+ (Divertissement)";
        } else if (merchantLower.includes('traite votre commande') || merchantLower.includes('lequi') || merchantLower.includes('leqi') || merchantLower.includes('深圳')) {
          productDescription = "Accessoires et matériel de prise de vue (SmallRig)";
        } else if (merchantLower.includes('paddle')) {
          productDescription = "Licence logicielle ou service en ligne (via Paddle)";
        } else if (merchantLower.includes('krotos')) {
          productDescription = "Krotos Studio Pro (Effets sonores IA)";
        }
      }

      // Amazon heuristic product descriptions when no invoice is matched
      const isAmazon = labelLower.includes('amazon') || labelLower.includes('amzn');
      if (!productDescription && isAmazon) {
        if (labelLower.includes('prime')) {
          productDescription = "Abonnement annuel Amazon Prime (Livraison et Services)";
        } else if (absAmount < 15.00) {
          productDescription = "Fournitures de bureau ou petit matériel de rechange";
        } else {
          productDescription = "Matériel ou fournitures professionnelles (Facture manquante dans INDY)";
        }
      }

      // Check Pro vs Perso
      const accountId = tx.bank_account ? tx.bank_account.id : null;
      const accInfo = accountId ? accountMap[accountId] : null;
      const isProAccount = accInfo ? accInfo.isPro : true;
      let isPro = isProAccount;

      const isOverridden = overridesMap[String(tx.id)] !== undefined;
      let overriddenCategory: string | null = null;
      if (isOverridden) {
        isPro = overridesMap[String(tx.id)].isPro;
        overriddenCategory = overridesMap[String(tx.id)].category;
      }

      if (!isOverridden) {
        // If it's a CPAM, SumUp or Amazon transaction, it's absolutely Pro (except for AMZ Digital)
        const isAmzDigital = labelLower.includes('amz digital') || labelLower.includes('amazon digital') || labelLower.includes('amz*digital');
        if (isAmzDigital) {
          isPro = false;
        } else if (labelLower.includes('cpam') || labelLower.includes('c.p.a.m.') || labelLower.includes('sumup') || labelLower.includes('sum up') || labelLower.includes('amazon') || labelLower.includes('amzn')) {
          isPro = true;
        } else if (productDescription && (productDescription.startsWith("CPAM_JSON:") || productDescription.startsWith("SUMUP_JSON:"))) {
          isPro = true;
        } else {
          const personalKeywords = [
            'canal', 'netflix', 'disney', 'carrefour', 'monoprix', 'auchan', 'leclerc', 'intermarche',
            'uber', 'deliveroo', 'zara', 'decathlon', 'leroy', 'boulangerie', 'restau', 
            'cafe', 'darty', 'spotify', 'sncf', 'airbnb', 'booking.com', 'h&m', 'ikea', 'castorama',
            'appart', 'loyer', 'mgen', 'bouygues', 'magd', 'kaori', 'vw bank', 'volkswagen',
            'assurance voiture', 'poissonnerie', 'guillaume ou mm',
            'zalando', 'emma', 'fashion retail', 'apple', 'luiza', 'poste', 'theo', 'compagnie du',
            'draps'
          ];

          const isAlreadyExploitant = tx.categories && tx.categories.some((c: any) => c.account_number && c.account_number.startsWith('108'));
          const matchesPersonal = personalKeywords.some(k => labelLower.includes(k)) || 
                                 (realMerchantName && personalKeywords.some(k => realMerchantName.toLowerCase().includes(k)));
          
          if (isAlreadyExploitant || matchesPersonal) {
            isPro = false;
          }
        }
      }

      const noJustificatifKeywords = [
        'genspark', 'telelion', 'decadaire', 'agio', 'commission', 'zen pro', 'formule zen',
        'convention professionnel', 'access', 'cb facture/retrait dt differe', 'releve cb',
        'dyn dac', 'vironvay', 'sapn', 'aprr', 'sanef', 'cofiroute', 'autoroute'
      ];
      const isIndigo = labelLower.includes('indigo');
      const isSmallIndigo = isIndigo && absAmount < 10.00;
      const isAmazonPrime = labelLower.includes('amazon prime');
      const noJustificatif = !isOutflow || 
                             noJustificatifKeywords.some(k => labelLower.includes(k)) || 
                             isSmallIndigo ||
                             isAmazonPrime;

      const proCategory = overriddenCategory || guessCategory(label, isPro, productDescription, amount);

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
        proCategory,
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
