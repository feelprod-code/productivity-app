import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'src/app/comptabilite/releve/page.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (tx.productDescription.startsWith("CPAM_JSON:"))')) {
        console.log(`Found at line ${i + 1}`);
        const indent1 = lines[i].substring(0, lines[i].indexOf('if'));
        const indent2 = lines[i + 1].substring(0, lines[i + 1].indexOf('try'));
        const indent3 = lines[i + 2].substring(0, lines[i + 2].indexOf('const'));
        
        lines[i] = `${indent1}if (tx.productDescription.startsWith("CPAM_JSON:") || tx.productDescription.startsWith("CPAM_MATCH:")) {`;
        lines[i + 2] = `${indent3}const jsonStr = tx.productDescription.startsWith("CPAM_MATCH:") ? tx.productDescription.substring(tx.productDescription.indexOf('|') + 1) : tx.productDescription.substring(10);\n${indent3}const patients = JSON.parse(jsonStr) as { name: string, amount: number }[];`;
        console.log("Patched successfully!");
        break;
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
