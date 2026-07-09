import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";
const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

interface LocalInvoice {
  date: string;
  amount: number;
  supplier: string;
  filename: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllSuppliers(): Promise<any[]> {
  let suppliers: any[] = [];
  let cursor = '';
  
  while (true) {
    await sleep(250); // Respect rate limit (max 5 req/s)
    const url = `${BASE_URL}/suppliers` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json',
        'X-Use-2026-API-Changes': 'true'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch suppliers: ${res.status} - ${errText}`);
    }

    const data: any = await res.json();
    const batch = data.suppliers || [];
    suppliers.push(...batch);

    const nextCursor = data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
  }
  return suppliers;
}

async function createSupplier(name: string): Promise<string> {
  await sleep(250);
  console.log(`➕ Création du fournisseur '${name}' sur Pennylane...`);
  const res = await fetch(`${BASE_URL}/suppliers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create supplier: ${res.status} - ${text}`);
  }
  const data: any = await res.json();
  return data.supplier.id;
}

async function fetchAllSupplierInvoices(): Promise<any[]> {
  let invoices: any[] = [];
  let cursor = '';
  while (true) {
    await sleep(250);
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
  await sleep(250);
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

  // 1. Lire les fichiers locaux
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

  // 2. Charger les fournisseurs Pennylane
  console.log("👥 Récupération des fournisseurs Pennylane...");
  const suppliers = await fetchAllSuppliers();
  
  let amazonSupplier = suppliers.find(s => s.name.toUpperCase() === "AMAZON");
  let amazonPrimeVideoSupplier = suppliers.find(s => s.name.toUpperCase() === "AMAZON PRIME VIDEO");

  if (!amazonSupplier) {
    if (!isDryRun) {
      const newId = await createSupplier("AMAZON");
      amazonSupplier = { id: newId, name: "AMAZON" };
    } else {
      console.log("🧪 [DRY-RUN] Le fournisseur 'AMAZON' serait créé sur Pennylane.");
      amazonSupplier = { id: 'temp-amazon-id', name: "AMAZON" };
    }
  } else {
    console.log(`✅ Fournisseur 'AMAZON' trouvé (ID: ${amazonSupplier.id}).`);
  }

  if (!amazonPrimeVideoSupplier) {
    console.log("ℹ️ Fournisseur 'AMAZON PRIME VIDEO' non trouvé.");
  } else {
    console.log(`✅ Fournisseur 'AMAZON PRIME VIDEO' trouvé (ID: ${amazonPrimeVideoSupplier.id}).`);
  }

  // 3. Charger les factures de Pennylane
  console.log("📄 Récupération de toutes les factures de Pennylane...");
  const pennylaneInvoices = await fetchAllSupplierInvoices();
  console.log(`🔍 ${pennylaneInvoices.length} factures trouvées sur Pennylane.`);

  let fixCount = 0;

  for (const inv of pennylaneInvoices) {
    const isLinkedToPrimeVideo = inv.supplier_name === "AMAZON PRIME VIDEO" || 
                                 (amazonPrimeVideoSupplier && inv.supplier_id === amazonPrimeVideoSupplier.id);

    if (isLinkedToPrimeVideo) {
      const invDate = inv.date;
      const invAmount = parseFloat(inv.amount);
      
      // Trouver la facture locale correspondante
      const matches = localInvoices.filter(loc => 
        loc.date === invDate && Math.abs(loc.amount - invAmount) <= 0.02
      );

      if (matches.length > 0) {
        // Si le nom du fournisseur local est "AMAZON" (et pas AMAZON_PRIME_VIDEO)
        const bestMatch = matches[0];
        if (bestMatch.supplier === "AMAZON") {
          console.log(`⚠️ Écart détecté : Facture Pennylane du ${invDate} de ${invAmount} € est liée à 'AMAZON PRIME VIDEO', mais correspond localement à '${bestMatch.filename}' (AMAZON).`);
          
          fixCount++;
          if (!isDryRun) {
            console.log(`   ⚙️ Mise à jour du fournisseur vers 'AMAZON' (ID: ${amazonSupplier.id})...`);
            const success = await updateInvoiceSupplier(inv.id, amazonSupplier.id);
            if (success) {
              console.log("   ✅ Mise à jour réussie !");
            }
          } else {
            console.log(`   🧪 [DRY-RUN] Serait mise à jour vers le fournisseur 'AMAZON' (ID: ${amazonSupplier.id}).`);
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
