import * as fs from 'fs';

const filePath = '/Users/philippeguillaume/ANTIGRAVITY/compta/src/app/comptabilite/releve/page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
lines.forEach((l, i) => {
    if (l.includes('if (tx.productDescription.startsWith("CPAM_JSON:"))')) {
        console.log(`Line ${i + 1}: ${JSON.stringify(l)}`);
        for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 5); j++) {
            console.log(`  ${j + 1}: ${JSON.stringify(lines[j])}`);
        }
    }
});
