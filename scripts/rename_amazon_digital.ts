import * as fs from 'fs';
import * as path from 'path';

const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";

function scanAndRename(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanAndRename(fullPath);
    } else if (entry.includes("AMAZON_DIGITAL_FRANCE_SAS")) {
      const isPrimeVideo = entry.toUpperCase().includes("PRIME_VIDEO") || entry.toUpperCase().includes("PRIMEVIDEO");
      
      let newName = "";
      if (isPrimeVideo) {
        // Remplacer AMAZON_DIGITAL_FRANCE_SAS par AMAZON_PRIME_VIDEO
        newName = entry.replace("AMAZON_DIGITAL_FRANCE_SAS", "AMAZON_PRIME_VIDEO");
      } else {
        // Remplacer AMAZON_DIGITAL_FRANCE_SAS par AMAZON
        newName = entry.replace("AMAZON_DIGITAL_FRANCE_SAS_", "AMAZON_");
        // Fallback safety
        if (newName === entry) {
          newName = entry.replace("AMAZON_DIGITAL_FRANCE_SAS", "AMAZON");
        }
      }
      
      const newPath = path.join(dir, newName);
      console.log(`✨ Renommage : "${entry}" -> "${newName}"`);
      fs.renameSync(fullPath, newPath);
    }
  }
}

async function main() {
  console.log("🚀 Lancement du renommage des factures Amazon Digital...");
  scanAndRename(path.join(COMPTA_DIR, "Factures 2025"));
  scanAndRename(path.join(COMPTA_DIR, "Factures 2026"));
  console.log("✅ Renommage terminé.");
}

main().catch(console.error);
