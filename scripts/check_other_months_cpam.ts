import * as fs from 'fs';
import * as path from 'path';

const months = ['06 - Juin', '07 - Juillet', '08 - Aout', '08 - Août', '09 - Septembre'];
for (const m of months) {
    const dir = `/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/${m}`;
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const cpam = files.filter(f => f.toLowerCase().includes('ameli') || f.toLowerCase().includes('cpam') || f.toLowerCase().includes('tiers') || f.toLowerCase().includes('rembours'));
    console.log(`\nMonth: ${m} (total files: ${files.length})`);
    if (cpam.length > 0) {
        cpam.forEach(f => console.log('  ->', f));
    } else {
        console.log('  No CPAM/Ameli files found.');
    }
}
