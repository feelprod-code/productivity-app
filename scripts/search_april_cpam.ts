import * as fs from 'fs';
import * as path from 'path';

function searchInDir(dir: string, regex: RegExp): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const list = fs.readdirSync(dir);
        for (const f of list) {
            const full = path.join(dir, f);
            try {
                const s = fs.statSync(full);
                if (s.isDirectory() && !f.startsWith('.') && f !== 'node_modules' && f !== '.git') {
                    results = results.concat(searchInDir(full, regex));
                } else if (s.isFile()) {
                    if (regex.test(f.toLowerCase())) {
                        results.push(full);
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return results;
}

const base = '/Users/philippeguillaume';
console.log("Searching for 04 - Avril or avril or april in Documents/1-PAPIERS...");
const files = searchInDir('/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/04 - Avril', /.*/);
console.log(`Found ${files.length} files in 04 - Avril:`);
for (const f of files) {
    console.log(' -', path.basename(f));
}

console.log("\nSearching for any file with 'cpam' or 'ameli' or 'releve' in the whole Documents/1-PAPIERS...");
const allDocs = searchInDir('/Users/philippeguillaume/Documents/1-PAPIERS', /(cpam|ameli|noemie|fse|vega)/i);
for (const f of allDocs) {
    console.log(' -', f);
}
