import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const homeDir = os.homedir();
const searchDirs = [
  path.join(homeDir, 'Desktop'),
  path.join(homeDir, 'Downloads'),
  path.join(homeDir, 'Documents')
];

function searchDir(dir: string, depth = 0): string[] {
  if (depth > 4) return [];
  let files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'Library') {
          files.push(...searchDir(fullPath, depth + 1));
        }
      } else if (entry.isFile()) {
        const name = entry.name.toLowerCase();
        if (name.includes('prograde') || name.includes('219') || name.includes('219_99') || name.includes('carte_memoire') || name.includes('carte-memoire')) {
          files.push(fullPath);
        }
      }
    }
  } catch (e) {}
  return files;
}

import pdfParse from 'pdf-parse';

async function run() {
  const p = "/Users/philippeguillaume/Desktop/invoice.pdf";
  console.log(`Parsing ${p}...`);
  try {
    const buffer = fs.readFileSync(p);
    const parsed = await pdfParse(buffer);
    console.log("Text:\n", parsed.text.substring(0, 500));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
