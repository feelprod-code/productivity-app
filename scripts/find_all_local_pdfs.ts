import * as fs from 'fs';
import * as path from 'path';

function searchFiles(dir: string, patterns: string[]): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (!file.startsWith('.') && file !== 'node_modules' && file !== '.git') {
                        results = results.concat(searchFiles(fullPath, patterns));
                    }
                } else if (file.toLowerCase().endsWith('.pdf')) {
                    const l = file.toLowerCase();
                    if (patterns.some(p => l.includes(p))) {
                        results.push(fullPath);
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return results;
}

const foldersToSearch = [
    '/Users/philippeguillaume/Documents/1-PAPIERS',
    '/Users/philippeguillaume/Library/Mobile Documents/com~apple~CloudDocs',
    '/Users/philippeguillaume/Desktop',
    '/Users/philippeguillaume/Downloads'
];

console.log("=== SEARCHING LOCAL DISK FOR RELEVANT PDFS ===");
for (const folder of foldersToSearch) {
    const cpam = searchFiles(folder, ['cpam', 'ameli', 'releve_paiement', 'releve de paiement', 'releve-de-paiement']);
    if (cpam.length > 0) {
        console.log(`\nCPAM in ${folder}:`);
        cpam.forEach(f => console.log('  ', f));
    }

    const urssaf = searchFiles(folder, ['urssaf']);
    if (urssaf.length > 0) {
        console.log(`\nURSSAF in ${folder}:`);
        urssaf.forEach(f => console.log('  ', f));
    }

    const carpimko = searchFiles(folder, ['carpimko', 'appel_de_cotisations']);
    if (carpimko.length > 0) {
        console.log(`\nCARPIMKO in ${folder}:`);
        carpimko.forEach(f => console.log('  ', f));
    }

    const credits = searchFiles(folder, ['credit', 'pret', 'prêt', 'lixx', 'leasing', 'sofinco']);
    if (credits.length > 0) {
        console.log(`\nCREDITS / LEASING in ${folder}:`);
        credits.forEach(f => console.log('  ', f));
    }

    const adoha = searchFiles(folder, ['adoha', 'gpm', 'prevoyance', 'prévoyance']);
    if (adoha.length > 0) {
        console.log(`\nADOHA / GPM in ${folder}:`);
        adoha.forEach(f => console.log('  ', f));
    }
}
