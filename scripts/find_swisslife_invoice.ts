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
        if (name.includes('swiss') || name.includes('425') || name.includes('attestation')) {
          files.push(fullPath);
        }
      }
    }
  } catch (e) {}
  return files;
}

console.log("Searching for Swiss Life or 425 files...");
const results: string[] = [];
for (const dir of searchDirs) {
  results.push(...searchDir(dir));
}

console.log(`Found ${results.length} candidate(s):`);
results.forEach(f => console.log(` - ${f}`));
