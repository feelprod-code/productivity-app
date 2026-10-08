import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const homeDir = os.homedir();
const searchDirs = [
  path.join(homeDir, 'Desktop'),
  path.join(homeDir, 'Downloads')
];

const now = Date.now();
const oneHourMs = 60 * 60 * 1000;

console.log("Searching for files modified in the last 60 minutes...");
const results: string[] = [];

for (const dir of searchDirs) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        const fullPath = path.join(dir, entry.name);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs < oneHourMs) {
          results.push(fullPath);
        }
      }
    }
  } catch (e) {}
}

console.log(`Found ${results.length} recent files:`);
results.forEach(f => console.log(` - ${f}`));
