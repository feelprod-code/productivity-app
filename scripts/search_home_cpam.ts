import * as fs from 'fs';
import * as path from 'path';

const practitionerNum = '757068309';

function searchDirectory(dir: string, depth: number = 0): string[] {
    if (depth > 6) return [];
    let found: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (['node_modules', '.git', '.cache', 'Library', '.npm', '.gemini', 'Applications'].includes(entry.name)) {
                    continue;
                }
                found = found.concat(searchDirectory(fullPath, depth + 1));
            } else if (entry.isFile()) {
                const lower = entry.name.toLowerCase();
                if (lower.endsWith('.pdf') || lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.rsp')) {
                    if (lower.includes('cpam') || lower.includes('ameli') || lower.includes('releve') || lower.includes(practitionerNum)) {
                        found.push(fullPath);
                    }
                }
            }
        }
    } catch (e) {}
    return found;
}

console.log("Searching user home for CPAM/Ameli files...");
const matches = searchDirectory('/Users/philippeguillaume');
console.log(`Found ${matches.length} matches:`);
for (const m of matches) {
    console.log('-', m);
}
