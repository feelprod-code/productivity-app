import * as fs from 'fs';
import * as path from 'path';

function findFilesRecursive(dir: string, matcher: (name: string) => boolean): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.git') {
                    results = results.concat(findFilesRecursive(fullPath, matcher));
                }
            } else if (entry.isFile()) {
                if (matcher(entry.name.toLowerCase())) {
                    results.push(fullPath);
                }
            }
        }
    } catch (e) {}
    return results;
}

const searchRoots = [
    '/Users/philippeguillaume/Downloads',
    '/Users/philippeguillaume/Desktop',
    '/Users/philippeguillaume/Documents',
    '/Users/philippeguillaume/.Trash',
    '/Users/philippeguillaume/Library/Mobile Documents/com~apple~CloudDocs'
];

console.log("=== DEEP SEARCH FOR ALL CPAM / AMELI / TIERS-PAYANT FILES ===");
for (const root of searchRoots) {
    const matches = findFilesRecursive(root, (name) => {
        return (name.includes('ameli') || 
                name.includes('cpam') || 
                name.includes('tierspayant') || 
                name.includes('tiers_payant') || 
                name.includes('tiers-payant') ||
                name.includes('757068309') ||
                name.includes('releve_paiement') ||
                name.includes('releve-paiement') ||
                name.includes('releve_de_paiement')) && name.endsWith('.pdf');
    });

    console.log(`\nFound ${matches.length} file(s) in ${root}:`);
    for (const m of matches) {
        try {
            const stat = fs.statSync(m);
            console.log(`- ${m} (${(stat.size / 1024).toFixed(1)} KB, mtime: ${stat.mtime.toISOString().split('T')[0]})`);
        } catch (e) {
            console.log(`- ${m}`);
        }
    }
}
