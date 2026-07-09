import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

const AMAZON_ID = "1342225072128"; // ID de 'AMAZON'
const AMAZON_PRIME_VIDEO_ID = "1330919579648"; // ID de 'AMAZON PRIME VIDEO'

interface LocalInvoice {
  date: string;
  amount: number;
  supplier: string;
  filename: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllSupplierInvoices(): Promise<any[]> {
  let invoices: any[] = [];
  let cursor = '';
  while (true) {
    await sleep(200);
    const url = `${BASE_URL}/supplier_invoices` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch invoices: ${res.statusText}`);
    const data: any = await res.json();
    const items = data.items || data.supplier_invoices || [];
    invoices.push(...items);
    
    const nextCursor = data.next_cursor || data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
  }
  return invoices;
}

async function updateInvoiceSupplier(invoiceId: string, supplierId: string): Promise<boolean> {
  await sleep(200);
  const res = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ supplier_id: supplierId })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Échec de la mise à jour pour facture ${invoiceId}: ${res.status} - ${text}`);
    return false;
  }
  return true;
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  const isDryRun = !process.argv.includes('--run');
  console.log(`ℹ️ Mode : ${isDryRun ? 'DRY-RUN (Simulation)' : 'REEL (Modifications appliquées sur Pennylane)'}`);

  // 1. Lire les fichiers locaux pour indexer la correspondance
  console.log("📦 Lecture des fichiers locaux dans 4-Compta...");
  const localInvoices: LocalInvoice[] = [];
  
  function scanFolder(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanFolder(fullPath);
      } else if (entry.toLowerCase().endsWith('.pdf') || entry.toLowerCase().endsWith('.jpg') || entry.toLowerCase().endsWith('.html') || entry.toLowerCase().endsWith('.png') || entry.toLowerCase().endsWith('.jpeg')) {
        const match = entry.match(/^(\d{4})-(\d{2})-(\d{2}) - ([^-]+) - ([\d.]+)€/);
        if (match) {
          const date = `${match[1]}-${match[2]}-${match[3]}`;
          const supplier = match[4].trim();
          const amount = parseFloat(match[5]);
          localInvoices.push({ date, amount, supplier, filename: entry });
        }
      }
    }
  }

  scanFolder(path.join(COMPTA_DIR, "Factures 2025"));
  scanFolder(path.join(COMPTA_DIR, "Factures 2026"));
  console.log(`🔍 ${localInvoices.length} factures locales indexées.`);

  // 2. Charger toutes les factures de Pennylane
  console.log("📄 Récupération de toutes les factures de Pennylane...");
  const pennylaneInvoices = await fetchAllSupplierInvoices();
  console.log(`🔍 ${pennylaneInvoices.length} factures trouvées sur Pennylane.`);

  let fixCount = 0;

  for (const inv of pennylaneInvoices) {
    const supplierId = inv.supplier?.id?.toString();
    const isLinkedToPrimeVideo = supplierId === AMAZON_PRIME_VIDEO_ID;

    if (isLinkedToPrimeVideo) {
      const invDate = inv.date;
      const invAmount = parseFloat(inv.amount);
      
      // Trouver la facture locale correspondante avec tolérance de date de 5 jours
      const matches = localInvoices.filter(loc => {
        const locTime = new Date(loc.date).getTime();
        const invTime = new Date(invDate).getTime();
        const dateDiff = Math.abs(locTime - invTime) / (1000 * 60 * 60 * 24);
        return dateDiff <= 5 && Math.abs(loc.amount - invAmount) <= 0.02;
      });

      if (matches.length > 0) {
        const bestMatch = matches[0];
        // Si le fournisseur local commence par AMAZON mais pas par AMAZON_PRIME_VIDEO
        const localSupplierUpper = bestMatch.supplier.toUpperCase();
        if (localSupplierUpper.startsWith("AMAZON") && !localSupplierUpper.startsWith("AMAZON_PRIME_VIDEO")) {
          console.log(`⚠️ Écart détecté : Facture Pennylane du ${invDate} de ${invAmount} € est liée à 'AMAZON PRIME VIDEO', mais correspond localement à '${bestMatch.filename}' (AMAZON).`);
          
          fixCount++;
          if (!isDryRun) {
            console.log(`   ⚙️ Mise à jour du fournisseur sur Pennylane vers 'AMAZON' (ID: ${AMAZON_ID})...`);
            const success = await updateInvoiceSupplier(inv.id, AMAZON_ID);
            if (success) {
              console.log("   ✅ Mise à jour réussie !");
            }
          } else {
            console.log(`   🧪 [DRY-RUN] Serait mise à jour vers le fournisseur 'AMAZON' (ID: ${AMAZON_ID}).`);
          }
        }
      } else {
        // Si aucun match local précis, mais montant supérieur à 15€, c'est un achat physique
        if (invAmount > 15.00) {
          console.log(`⚠️ Écart détecté (sans match local direct) : Facture Pennylane du ${invDate} de ${invAmount} € est liée à 'AMAZON PRIME VIDEO' (Montant > 15€).`);
          fixCount++;
          if (!isDryRun) {
            console.log(`   ⚙️ Mise à jour du fournisseur sur Pennylane vers 'AMAZON' (ID: ${AMAZON_ID})...`);
            const success = await updateInvoiceSupplier(inv.id, AMAZON_ID);
            if (success) {
              console.log("   ✅ Mise à jour réussie !");
            }
          } else {
            console.log(`   🧪 [DRY-RUN] Serait mise à jour vers le fournisseur 'AMAZON' (ID: ${AMAZON_ID}).`);
          }
        }
      }
    }
  }

  console.log(`\n🏁 Bilan de la vérification/correction :`);
  console.log(`- Factures erronées détectées : ${fixCount}`);
  if (isDryRun && fixCount > 0) {
    console.log("💡 Pour appliquer réellement les modifications sur Pennylane, relancez le script avec l'option --run");
  }
}

main().catch(console.error);
