const dotenv = require('dotenv');
const os = require('os');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";

  try {
    const filterObj = [
      { field: "date", operator: "gteq", value: "2025-01-01" }
    ];
    const filterStr = encodeURIComponent(JSON.stringify(filterObj));
    
    console.log("📥 Fetching all supplier invoices from Pennylane...");
    let cursor = null;
    const invoices = [];
    
    for (let page = 1; page <= 30; page++) {
      const url = `${BASE_URL}/supplier_invoices?filter=${filterStr}&limit=100` + (cursor ? `&cursor=${cursor}` : '');
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json', 'X-Use-2026-API-Changes': 'true' }
      });
      if (!res.ok) break;
      const data = await res.json();
      const items = data.supplier_invoices || data.items || [];
      if (items.length === 0) break;
      invoices.push(...items);
      cursor = data.next_cursor || data.meta?.next_cursor;
      if (!cursor) break;
    }

    console.log(`Loaded ${invoices.length} invoices. Scanning...`);
    const anomalies = [];

    // Keywords of generic error suppliers created by the autopilot
    const genericErrorSuppliers = ['commission', 'forum', 'virement', 'prlv', 'retrait', 'dab', 'prelevement', 'vrt', 'sepa'];

    for (const inv of invoices) {
      const label = (inv.label || '').toLowerCase();
      const filename = (inv.filename || '').toLowerCase();
      const supplierName = (inv.supplier?.name || '').toLowerCase();
      const amount = parseFloat(inv.amount);

      if (!filename || filename === 'n/a' || filename === 'undefined') continue;

      let isMismatched = false;
      let reason = "";

      // 1. Check generic error suppliers
      const isGenericError = genericErrorSuppliers.some(term => 
        label.includes(term) || supplierName.includes(term)
      );

      if (isGenericError) {
        isMismatched = true;
        reason = `Generic error supplier ("${inv.supplier?.name || inv.label}") created by Autopilot`;
      }

      // 2. Specific key mismatch rules
      if (!isMismatched) {
        if (filename.includes('chargemap') && !label.includes('chargemap')) {
          isMismatched = true;
          reason = `Chargemap PDF on non-Chargemap invoice`;
        } else if (filename.includes('gandi') && !label.includes('gandi')) {
          isMismatched = true;
          reason = `Gandi PDF on non-Gandi invoice`;
        } else if (filename.includes('adobe') && !label.includes('adobe')) {
          isMismatched = true;
          reason = `Adobe PDF on non-Adobe invoice`;
        } else if ((filename.includes('volkswagen') || filename.includes('vw')) && !label.includes('volkswagen') && !label.includes('vw')) {
          isMismatched = true;
          reason = `Volkswagen PDF on non-Volkswagen invoice`;
        } else if (filename.includes('anthropic') && !label.includes('anthropic')) {
          isMismatched = true;
          reason = `Anthropic (Claude Pro) PDF on non-Anthropic invoice`;
        } else if (filename.includes('ausha') && !label.includes('ausha')) {
          isMismatched = true;
          reason = `Ausha PDF on non-Ausha invoice`;
        } else if (filename.includes('zapier') && !label.includes('zapier')) {
          isMismatched = true;
          reason = `Zapier PDF on non-Zapier invoice`;
        } else if (filename.includes('elevenlabs') && !label.includes('elevenlabs')) {
          isMismatched = true;
          reason = `ElevenLabs PDF on non-ElevenLabs invoice`;
        } else if (filename.includes('del') && filename.includes('arte') && !label.includes('arte')) {
          isMismatched = true;
          reason = `Del Arte PDF on non-Del Arte invoice`;
        } else if (filename.includes('blackmagic') && !label.includes('blackmagic')) {
          isMismatched = true;
          reason = `Black Magic PDF on non-Black Magic invoice`;
        }
      }

      // 3. Fallback word matching
      if (!isMismatched) {
        const labelClean = label
          .replace(/(facture|label généré|recu|reçu|sepa|prlv|vrt|virement)/gi, '')
          .replace(/[^a-z0-9]/gi, ' ')
          .trim();
        const fileClean = filename
          .replace(/[^a-z0-9]/gi, ' ')
          .trim();

        const labelWords = labelClean.split(/\s+/).filter(w => w.length >= 3);
        const fileWords = fileClean.split(/\s+/).filter(w => w.length >= 3);

        const isGenericFile = filename.match(/^[a-f0-9\-]+\.jpg/) || filename.startsWith('image') || filename.startsWith('photo');
        if (!isGenericFile && labelWords.length > 0 && fileWords.length > 0) {
          const sharesWord = labelWords.some(w => filename.includes(w) || fileWords.includes(w));
          if (!sharesWord && !label.includes('amazon') && !label.includes('restaurants') && !label.includes('carburant')) {
            isMismatched = true;
            reason = `No keyword match between supplier name ("${inv.label}") and PDF ("${inv.filename}")`;
          }
        }
      }

      if (isMismatched) {
        anomalies.push({
          id: inv.id,
          date: inv.date,
          supplier: inv.supplier?.name || inv.label,
          amount: inv.amount,
          filename: inv.filename || 'N/A',
          reason: reason
        });
      }
    }

    console.log(`Found ${anomalies.length} anomalous supplier invoices.`);

    // Write Markdown report to artifacts
    let md = `# Rapport des Factures Fournisseurs Erronées (Pennylane)\n\n`;
    md += `> [!IMPORTANT]\n`;
    md += `> Ce document liste les **${anomalies.length} factures fournisseurs erronées** créées par l'ancien script d'Autopilot. Vous devez les supprimer manuellement sur Pennylane.\n`;
    md += `> Pour chaque facture, cliquez sur le lien direct, puis allez dans **Actions** (en haut à droite) et choisissez **Supprimer le document**.\n\n`;
    
    md += `| Date | Fournisseur affiché (Erroné) | Montant | Fichier PDF rattaché à tort | Action de suppression |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    // Sort chronologically by date descending for better view
    anomalies.sort((a, b) => b.date.localeCompare(a.date));

    for (const an of anomalies) {
      md += `| **${an.date}** | ${an.supplier} | ${an.amount} € | \`${an.filename}\` | [🔗 Ouvrir & Supprimer](https://app.pennylane.com/purchases/invoices/${an.id}) |\n`;
    }

    const reportPath = '/Users/philippeguillaume/.gemini/antigravity/brain/ff34dbd2-a1d5-4065-b4c6-3855086a099c/invoices_anomalies_report.md';
    fs.writeFileSync(reportPath, md);
    console.log(`Report successfully written to: ${reportPath}`);

  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
