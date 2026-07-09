import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import FormData from 'form-data';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();
const pennylaneKey = process.env.PENNYLANE_API_KEY;

const BASE_URL = "https://app.pennylane.com/api/external/v2";
const TRIED_DIR = path.join(process.env.HOME || '', 'Desktop', 'pennylane triee');

const CATEGORY_PREFIXES: Record<string, string> = {
  LOGICIELS_IA: "[IA & LOGICIELS]",
  RESTAURANT: "[RESTAURANT]",
  FOURNITURES: "[FOURNITURES]",
  DEPLACEMENTS: "[DEPLACEMENTS]",
  CABINET: "[CABINET]",
  COTISATIONS: "[COTISATIONS]"
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractKeywords(label: string): string[] {
  const cleaned = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopwords = new Set([
    "numero", "num", "no", "payout", "payouts", "eur", "usd", "ref", "releve", "dun",
    "sepa", "recu", "prelvt", "prlv", "confrere", "facture", "fact", "inv", "invoice",
    "virement", "instantane", "transfer", "vir", "inst", "paiement", "cb", "date"
  ]);

  const words = cleaned.split(" ");
  return words.filter(word => word.length >= 2 && !stopwords.has(word) && isNaN(Number(word)));
}

function guessCategory(supplier: string, description: string): string {
  const labelLower = (supplier + " " + description).toLowerCase();
  
  if (labelLower.includes("netflix") || labelLower.includes("spotify") || labelLower.includes("disney") || labelLower.includes("canal") || labelLower.includes("zara") || labelLower.includes("decathlon") || labelLower.includes("uber eat") || labelLower.includes("deliveroo")) {
    return "PERSO";
  }
  
  if (labelLower.includes("openai") || labelLower.includes("chatgpt") || labelLower.includes("openrouter") || labelLower.includes("google check") || labelLower.includes("google ai") || labelLower.includes("google one") || labelLower.includes("cloudflare") || labelLower.includes("supabase") || labelLower.includes("vercel") || labelLower.includes("github") || labelLower.includes("canva") || labelLower.includes("suno") || labelLower.includes("headliner") || labelLower.includes("krotos") || labelLower.includes("paddle")) {
    return "LOGICIELS_IA";
  }
  
  if (labelLower.includes("restaurant") || labelLower.includes("bistro") || labelLower.includes("cafe") || labelLower.includes("brasserie") || labelLower.includes("paris halles") || labelLower.includes("sebastopol") || labelLower.includes("traiteur") || labelLower.includes("snack") || labelLower.includes("mcdonald") || labelLower.includes("bk ") || labelLower.includes("starbucks") || labelLower.includes("repas")) {
    return "RESTAURANT";
  }
  
  if (labelLower.includes("amazon") || labelLower.includes("amzn") || labelLower.includes("office") || labelLower.includes("papeterie") || labelLower.includes("cartouche") || labelLower.includes("encre") || labelLower.includes("papier") || labelLower.includes("stylo") || labelLower.includes("fourniture") || labelLower.includes("bureau") || labelLower.includes("coque macbook") || labelLower.includes("coque ipad") || labelLower.includes("coque iphone")) {
    return "FOURNITURES";
  }
  
  if (labelLower.includes("sapn") || labelLower.includes("aprr") || labelLower.includes("sanef") || labelLower.includes("cofiroute") || labelLower.includes("autoroute") || labelLower.includes("peage") || labelLower.includes("sncf") || labelLower.includes("train") || labelLower.includes("taxi") || labelLower.includes("parking") || labelLower.includes("indigo") || labelLower.includes("total") || (labelLower.includes("station") && !labelLower.includes("prestation")) || labelLower.includes("carburant") || labelLower.includes("essence") || labelLower.includes("bp ") || labelLower.includes("shell") || labelLower.includes("esso") || labelLower.includes("uber") || labelLower.includes("déplacement")) {
    return "DEPLACEMENTS";
  }
  
  if (labelLower.includes("doctolib") || labelLower.includes("drap d'examen") || labelLower.includes("lpm ") || labelLower.includes("cotte industries") || labelLower.includes("medical") || labelLower.includes("pharmacie") || labelLower.includes("hygiene") || labelLower.includes("papier d'examen") || labelLower.includes("matériel médical") || labelLower.includes("cabinet") || labelLower.includes("patient")) {
    return "CABINET";
  }
  
  if (labelLower.includes("urssaf") || labelLower.includes("carpimko") || labelLower.includes("assurance pro") || labelLower.includes("prevoyance") || labelLower.includes("macsf") || labelLower.includes("mgen") || labelLower.includes("medicale") || labelLower.includes("axa") || labelLower.includes("allianz") || labelLower.includes("cpam") || labelLower.includes("c.p.a.m.") || labelLower.includes("assurance maladie") || labelLower.includes("ameli")) {
    return "COTISATIONS";
  }
  
  return "FOURNITURES";
}

async function fetchWithRetry(url: string, options: any, maxRetries = 6): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 1500 + Math.random() * 500;
        console.warn(`⚠️ Rate limit Pennylane (429) sur ${url}. Pause de ${Math.round(backoff)}ms (essai ${attempt}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (e: any) {
      attempt++;
      if (attempt >= maxRetries) throw e;
      await sleep(1000);
    }
  }
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante dans le fichier .env");
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("📥 1. Récupération des factures actuelles sur Pennylane...");
  let cursor = '';
  const currentInvoicesOnPennylane: any[] = [];
  let page = 0;

  while (true) {
    page++;
    const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      console.error(`❌ Échec de la récupération des factures.`);
      break;
    }
    const data: any = await res.json();
    const items = data.items || data.supplier_invoices || [];
    if (items.length === 0) break;
    currentInvoicesOnPennylane.push(...items);
    cursor = data.next_cursor || data.meta?.next_cursor;
    if (!cursor) break;
    await sleep(50);
  }

  console.log(`✅ ${currentInvoicesOnPennylane.length} factures récupérées.`);

  // --- ÉTAPE 2 : DE-LETTRAGE ET NEUTRALISATION DE L'EXISTANT ---
  console.log("\n🧹 2. Dé-lettrage et neutralisation (décalage de date) de l'existant sur Pennylane...");
  let unmatchCount = 0;
  let defuseCount = 0;
  
  for (const inv of currentInvoicesOnPennylane) {
    // Si l'invoice est déjà neutralisée (date 2028-12-31), ou déjà une facture propre importée, on ne la neutralise pas
    if (inv.date === '2028-12-31' || inv.label?.startsWith('[') || inv.filename?.includes(' - ') && !inv.label?.endsWith('(OLD)')) {
      continue;
    }

    // A. Dé-lettrage si rapprochée
    if (inv.reconciled) {
      try {
        const matchRes = await fetchWithRetry(`${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions`, {
          headers: {
            'Authorization': `Bearer ${pennylaneKey}`,
            'Accept': 'application/json'
          }
        });
        if (matchRes.ok) {
          const matchData = await matchRes.json();
          const txs = Array.isArray(matchData) ? matchData : (matchData.transactions || matchData.items || []);
          
          for (const tx of txs) {
            console.log(`🔗 Dé-lettrage : Facture ID ${inv.id} (${inv.label}) et transaction ${tx.id}...`);
            const delRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}/matched_transactions/${tx.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${pennylaneKey}`,
                'Accept': 'application/json'
              }
            });
            if (delRes.ok) {
              unmatchCount++;
            } else {
              console.error(`⚠️ Impossible de dé-lettrer ${inv.id} (Status ${delRes.status})`);
            }
          }
        }
      } catch (e: any) {
        console.error(`❌ Erreur dé-lettrage pour facture ${inv.id} :`, e.message);
      }
      await sleep(100);
    }

    // B. Neutralisation (décalage de date à 2028-12-31 pour éviter les erreurs de doublons 409)
    try {
      console.log(`🛡️ Neutralisation : Facture ID ${inv.id} -> Date déplacée au 2028-12-31...`);
      const updateRes = await fetch(`${BASE_URL}/supplier_invoices/${inv.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Use-2026-API-Changes': 'true'
        },
        body: JSON.stringify({
          label: (inv.label || "Facture") + " (OLD)",
          date: "2028-12-31"
        })
      });
      if (updateRes.ok) {
        defuseCount++;
      } else {
        console.error(`⚠️ Échec de neutralisation pour facture ${inv.id} (Status ${updateRes.status})`);
      }
    } catch (e: any) {
      console.error(`❌ Erreur neutralisation pour facture ${inv.id} :`, e.message);
    }
    await sleep(150);
  }
  
  console.log(`✅ Neutralisation terminée : ${unmatchCount} liaisons supprimées, ${defuseCount} factures décalées en 2028.`);

  // --- ÉTAPE 3 : VIDER LA BASE LOCALE ---
  console.log("\n🗑️ 3. Nettoyage de la base de données locale (Prisma)...");
  const delDb = await prisma.invoice.deleteMany({});
  console.log(`✅ Base de données locale vidée : ${delDb.count} lignes supprimées.`);

  // --- ÉTAPE 4 : CHARGER LES TRANSACTIONS DE PENNYLANE POUR LE RAPPROCHEMENT ---
  console.log("\n📥 4. Récupération de l'ensemble des transactions de 2025 & 2026 sur Pennylane...");
  cursor = '';
  const allTxs: any[] = [];
  page = 0;
  
  while (true) {
    page++;
    const url = `${BASE_URL}/transactions` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      console.error(`❌ Échec de la récupération des transactions.`);
      break;
    }
    const data: any = await res.json();
    const items = data.items || data.transactions || [];
    if (items.length === 0) break;
    
    // Filtrer pour 2025/2026, dépenses uniquement (amount < 0)
    const filtered = items.filter((tx: any) => {
      const isCorrectYear = tx.date.startsWith('2025') || tx.date.startsWith('2026');
      const isExpense = parseFloat(tx.amount || '0') < 0;
      return isCorrectYear && isExpense;
    });
    
    allTxs.push(...filtered);
    cursor = data.next_cursor || data.meta?.next_cursor;
    if (!cursor) break;
    await sleep(50);
  }
  console.log(`✅ ${allTxs.length} transactions bancaires (dépenses 2025-2026) récupérées de Pennylane.`);

  // --- ÉTAPE 5 : SCANNER LE DOSSIER DES FACTURES PROS ---
  console.log("\n🔍 5. Scan des factures professionnelles propres sur le Bureau...");
  const proFiles: { filePath: string; year: string; monthFolder: string; filename: string }[] = [];
  
  const scanDirRecursively = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === '.DS_Store') continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirRecursively(fullPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.pdf', '.html', '.jpg', '.jpeg', '.png'].includes(ext)) {
          const relPath = path.relative(TRIED_DIR, fullPath);
          const parts = relPath.split(path.sep);
          if (parts[0].startsWith('Factures ')) {
            const year = parts[0].replace('Factures ', '');
            const monthFolder = parts[1];
            proFiles.push({
              filePath: fullPath,
              year,
              monthFolder,
              filename: item
            });
          }
        }
      }
    }
  };

  scanDirRecursively(TRIED_DIR);
  console.log(`📄 ${proFiles.length} factures propres prêtes pour l'injection.`);

  // --- ÉTAPE 6 : UPLOAD, IMPORT, MATCH ET SYNC ---
  console.log("\n🚀 6. Injection et rapprochement des factures...");
  let successUploads = 0;
  let successMatches = 0;
  let errorUploads = 0;
  let skippedAlreadyImported = 0;

  for (let i = 0; i < proFiles.length; i++) {
    const fileInfo = proFiles[i];
    const { filePath, year, monthFolder, filename } = fileInfo;
    const ext = path.extname(filename).toLowerCase();
    
    console.log(`\n📥 [Facture ${i + 1}/${proFiles.length}] Traitement de : ${filename}`);

    const fileMatch = filename.match(/^(\d{4}-\d{2}-\d{2}) - (.*) - ([\d\.]+)€\.(pdf|html|jpg|jpeg|png)$/i);
    if (!fileMatch) {
      console.warn(`⚠️ Format de fichier non supporté pour l'injection : ${filename}`);
      continue;
    }

    const dateStr = fileMatch[1];
    const middleBlock = fileMatch[2];
    const amount = parseFloat(fileMatch[3]);

    const underscoreIndex = middleBlock.indexOf('_');
    let supplier = middleBlock;
    let description = "Achat";
    if (underscoreIndex !== -1) {
      supplier = middleBlock.substring(0, underscoreIndex);
      description = middleBlock.substring(underscoreIndex + 1).replace(/_/g, ' ');
    }

    const category = guessCategory(supplier, description);
    const prefix = CATEGORY_PREFIXES[category] || "";
    const cleanLabel = prefix ? `${prefix} ${supplier} - ${description}` : `${supplier} - ${description}`;

    // --- IDEMPOTENCE : Vérifier si cette facture existe déjà sur Pennylane (mêmes date, montant, nom de fichier propre) ---
    const existingPennylaneInvoice = currentInvoicesOnPennylane.find(inv => {
      const sameDate = inv.date === dateStr;
      const sameAmount = Math.abs(parseFloat(inv.amount || "0") - amount) < 0.01;
      const cleanFilename = inv.filename === filename || (inv.label && inv.label.includes(supplier) && !inv.label.endsWith('(OLD)'));
      return sameDate && sameAmount && cleanFilename;
    });

    if (existingPennylaneInvoice) {
      console.log(`   ⏭️ Facture déjà présente sur Pennylane (ID: ${existingPennylaneInvoice.id}). Rapprochement local et DB...`);
      skippedAlreadyImported++;

      try {
        // Rapprochement local DB & Supabase URL
        const cleanStorageKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.\-_ ]/g, "");
        const safeStorageKey = cleanStorageKey(filename);
        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(safeStorageKey);
        const finalFileUrl = publicUrlData?.publicUrl || "";

        await prisma.invoice.create({
          data: {
            id: String(existingPennylaneInvoice.id),
            provider: cleanLabel,
            amount: amount,
            date: new Date(dateStr),
            fileUrl: finalFileUrl
          }
        });
        console.log(`   💾 Facture synchronisée dans la base locale.`);
        
        // Si elle n'est pas encore rapprochée à sa transaction, on tente de le faire
        if (!existingPennylaneInvoice.reconciled) {
          const dateObj = new Date(dateStr);
          const minDate = new Date(dateObj.getTime() - 8 * 24 * 60 * 60 * 1000);
          const maxDate = new Date(dateObj.getTime() + 8 * 24 * 60 * 60 * 1000);

          const matchingTx = allTxs.find((tx: any) => {
            const txDate = new Date(tx.date);
            if (txDate < minDate || txDate > maxDate) return false;
            const txAmount = Math.abs(parseFloat(tx.amount || "0"));
            return Math.abs(txAmount - amount) < 0.02 && (tx.label || "").toLowerCase().includes(supplier.toLowerCase());
          });

          if (matchingTx) {
            console.log(`   🔗 Rapprochement avec la transaction : ${matchingTx.label}...`);
            const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${existingPennylaneInvoice.id}/matched_transactions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${pennylaneKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Use-2026-API-Changes": "true"
              },
              body: JSON.stringify({ transaction_id: String(matchingTx.id) })
            });
            if (matchRes.ok) {
              successMatches++;
              console.log("   🎉 Rapprochement réussi !");
            }
          }
        }
      } catch (err: any) {
        console.error(`   ❌ Erreur synchro locale pour existante :`, err.message);
      }
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      
      // 6.1 UPLOAD FILE TO PENNYLANE
      const pennylaneFormData = new FormData();
      pennylaneFormData.append("file", buffer, {
        filename: filename,
        contentType: ext === '.html' ? 'text/html' : (ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/pdf'))
      });

      const uploadRes = await fetchWithRetry(`${BASE_URL}/file_attachments`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${pennylaneKey}`,
          "Accept": "application/json",
          "X-Use-2026-API-Changes": "true",
          ...pennylaneFormData.getHeaders()
        },
        body: pennylaneFormData
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload Pennylane échoué (Status ${uploadRes.status})`);
      }

      const uploadData: any = await uploadRes.json();
      const fileAttachmentId = uploadData.id;

      // 6.2 GET OR CREATE SUPPLIER ON PENNYLANE
      const suppliersRes = await fetchWithRetry(`${BASE_URL}/suppliers?limit=100`, {
        headers: { "Authorization": `Bearer ${pennylaneKey}`, "Accept": "application/json" }
      });
      if (!suppliersRes.ok) {
        throw new Error("Impossible de récupérer les fournisseurs");
      }
      const suppData = await suppliersRes.json();
      const suppliersList = suppData.suppliers || suppData.items || [];
      
      let supplierId = suppliersList.find((s: any) => 
        s.name.toUpperCase().includes(supplier) || supplier.includes(s.name.toUpperCase())
      )?.id;

      if (!supplierId) {
        console.log(`   ➕ Création du fournisseur "${supplier}" sur Pennylane...`);
        const createSupplierRes = await fetch(`${BASE_URL}/suppliers`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pennylaneKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Use-2026-API-Changes": "true"
          },
          body: JSON.stringify({ name: supplier })
        });
        if (createSupplierRes.ok) {
          const createSupplierData: any = await createSupplierRes.json();
          supplierId = createSupplierData.supplier?.id || createSupplierData.id;
        } else {
          throw new Error("Création du fournisseur échouée");
        }
      }

      // 6.3 IMPORT SUPPLIER INVOICE ON PENNYLANE
      const payload = {
        file_attachment_id: fileAttachmentId,
        supplier_id: supplierId,
        date: dateStr,
        deadline: dateStr,
        currency_amount: amount.toFixed(2),
        currency_amount_before_tax: amount.toFixed(2),
        currency_tax: "0.00",
        currency: "EUR",
        invoice_lines: [
          {
            currency_amount: amount.toFixed(2),
            currency_tax: "0.00",
            vat_rate: "exempt",
            label: cleanLabel
          }
        ]
      };

      const importRes = await fetch(`${BASE_URL}/supplier_invoices/import`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${pennylaneKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Use-2026-API-Changes": "true"
        },
        body: JSON.stringify(payload)
      });

      if (!importRes.ok) {
        throw new Error(`Import facture échoué (Status ${importRes.status}) : ${await importRes.text()}`);
      }

      const importData: any = await importRes.json();
      const invoiceId = importData.id || importData.supplier_invoice?.id;
      successUploads++;

      // 6.4 RAPPROCHEMENT BANCAIRE AUTOMATIQUE SUR PENNYLANE
      const dateObj = new Date(dateStr);
      const minDate = new Date(dateObj.getTime() - 8 * 24 * 60 * 60 * 1000);
      const maxDate = new Date(dateObj.getTime() + 8 * 24 * 60 * 60 * 1000);

      const matchingTx = allTxs.find((tx: any) => {
        const txDate = new Date(tx.date);
        if (txDate < minDate || txDate > maxDate) return false;
        
        const txAmount = Math.abs(parseFloat(tx.amount || "0"));
        const amountDiff = Math.abs(txAmount - amount);
        if (amountDiff > 0.02) return false;

        const labelLower = (tx.label || "").toLowerCase();
        const keywords = extractKeywords(supplier);
        return keywords.some(kw => labelLower.includes(kw));
      });

      if (matchingTx) {
        console.log(`   🔗 Rapprochement avec la transaction : ${matchingTx.label} (${matchingTx.date} | ${matchingTx.amount}€)`);
        const matchRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}/matched_transactions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pennylaneKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Use-2026-API-Changes": "true"
          },
          body: JSON.stringify({ transaction_id: String(matchingTx.id) })
        });
        if (matchRes.ok) {
          successMatches++;
          console.log("   🎉 Rapprochement réussi !");
        } else {
          console.warn(`   ⚠️ Échec de rapprochement sur Pennylane (Status ${matchRes.status})`);
        }
      } else {
        console.log(`   🔍 Aucune transaction correspondante trouvée pour rapprocher.`);
      }

      // 6.5 TÉLÉVERSER SUR SUPABASE STORAGE (DOUBLE ÉCRITURE)
      const cleanStorageKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.\-_ ]/g, "");
      const safeStorageKey = cleanStorageKey(filename);

      const { error: storageErr } = await supabase.storage
        .from('invoices')
        .upload(safeStorageKey, buffer, {
          contentType: ext === '.html' ? 'text/html' : (ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/pdf')),
          upsert: true
        });

      let finalFileUrl = "";
      if (storageErr) {
        console.error("   ⚠️ Échec du stockage Supabase :", storageErr.message);
      } else {
        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(safeStorageKey);
        finalFileUrl = publicUrlData.publicUrl;
      }

      // 6.6 INSÉRER LA LIGNE DANS LA BASE DE DONNÉES PRISMA LOCALE
      await prisma.invoice.create({
        data: {
          id: String(invoiceId),
          provider: cleanLabel,
          amount: amount,
          date: dateObj,
          fileUrl: finalFileUrl
        }
      });
      console.log(`   💾 Facture synchronisée avec succès dans la base locale.`);

    } catch (err: any) {
      console.error(`❌ Échec complet pour la facture ${filename} :`, err.message);
      errorUploads++;
    }

    // Petite pause pour respecter le Rate Limit
    await sleep(200);
  }

  console.log(`\n🏁 Injection terminée !`);
  console.log(`📊 Bilan :`);
  console.log(`- Total factures à traiter : ${proFiles.length}`);
  console.log(`- Factures déjà importées (passées) : ${skippedAlreadyImported}`);
  console.log(`- Nouvelles factures importées sur Pennylane & Local DB : ${successUploads}`);
  console.log(`- Rapprochements bancaires réussis : ${successMatches}`);
  console.log(`- Factures en échec : ${errorUploads}`);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
