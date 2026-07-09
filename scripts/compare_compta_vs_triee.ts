import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const COMPTA_DIR = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta";
const TRIEE_DIR = "/Users/guillaumephilippe/Desktop/pennylane triee";

interface FileDetails {
  relPath: string; // e.g. "Factures 2025/01 - Janvier/filename.pdf"
  size: number;
  md5: string;
}

function getMd5(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function scanFolder(dir: string, baseDir: string, results: Map<string, FileDetails>) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanFolder(fullPath, baseDir, results);
    } else if (entry.toLowerCase().endsWith('.pdf') || entry.toLowerCase().endsWith('.jpg') || entry.toLowerCase().endsWith('.html') || entry.toLowerCase().endsWith('.png') || entry.toLowerCase().endsWith('.jpeg')) {
      const relPath = path.relative(baseDir, fullPath);
      // Normalize NFD/NFC for keys to avoid unicode mismatches
      const normRelPath = relPath.normalize('NFC');
      results.set(normRelPath, {
        relPath: normRelPath,
        size: stat.size,
        md5: getMd5(fullPath)
      });
    }
  }
}

async function main() {
  const comptaFiles = new Map<string, FileDetails>();
  const trieeFiles = new Map<string, FileDetails>();

  console.log("🔍 Scanning 4-Compta directory...");
  scanFolder(path.join(COMPTA_DIR, "Factures 2025"), COMPTA_DIR, comptaFiles);
  scanFolder(path.join(COMPTA_DIR, "Factures 2026"), COMPTA_DIR, comptaFiles);

  console.log("🔍 Scanning pennylane triee directory...");
  scanFolder(path.join(TRIEE_DIR, "Factures 2025"), TRIEE_DIR, trieeFiles);
  scanFolder(path.join(TRIEE_DIR, "Factures 2026"), TRIEE_DIR, trieeFiles);

  console.log(`📊 Total files in 4-Compta: ${comptaFiles.size}`);
  console.log(`📊 Total files in pennylane triee: ${trieeFiles.size}`);

  const identical: string[] = [];
  const differentContent: string[] = [];
  const extraInCompta: string[] = [];
  const extraInTriee: string[] = [];

  // Check files in triee
  for (const [relPath, trieeFile] of trieeFiles.entries()) {
    if (comptaFiles.has(relPath)) {
      const comptaFile = comptaFiles.get(relPath)!;
      if (comptaFile.md5 === trieeFile.md5) {
        identical.push(relPath);
      } else {
        differentContent.push(relPath);
      }
    } else {
      extraInTriee.push(relPath);
    }
  }

  // Check files in compta
  for (const relPath of comptaFiles.keys()) {
    if (!trieeFiles.has(relPath)) {
      extraInCompta.push(relPath);
    }
  }

  console.log(`\n📋 COMPARISON REPORT`);
  console.log(`===================================`);
  console.log(`🟢 Identical files (same path & content): ${identical.length}`);
  console.log(`🟡 Files with same path but different content: ${differentContent.length}`);
  console.log(`🔴 Extra files in Desktop/pennylane triee (missing in 4-Compta): ${extraInTriee.length}`);
  console.log(`🔵 Extra files in 4-Compta (missing in Desktop/pennylane triee): ${extraInCompta.length}`);

  if (differentContent.length > 0) {
    console.log(`\n⚠️ DIFFERENT CONTENT FILES:`);
    differentContent.forEach(f => console.log(`  - ${f}`));
  }

  if (extraInTriee.length > 0) {
    console.log(`\n❌ MISSING IN 4-COMPTA (But present in Desktop/pennylane triee):`);
    // Print first 50
    extraInTriee.slice(0, 50).forEach(f => console.log(`  - ${f}`));
    if (extraInTriee.length > 50) {
      console.log(`  ... and ${extraInTriee.length - 50} more files`);
    }
  }

  if (extraInCompta.length > 0) {
    console.log(`\n➕ EXTRA IN 4-COMPTA (Missing in Desktop/pennylane triee):`);
    extraInCompta.forEach(f => console.log(`  - ${f}`));
  }
}

main().catch(console.error);
