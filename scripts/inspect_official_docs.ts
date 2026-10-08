import pdfParse from 'pdf-parse';
import * as fs from 'fs';

async function main() {
    const files = [
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/URSSAF 2026.pdf',
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/CARPIMKO.pdf',
        '/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/CREDIT 2.pdf',
        "/Users/philippeguillaume/Documents/1-PAPIERS/1-PAPIERS PHIL/6-MUTELLE_PREVOYANCE/Avis d'échéance GUILLAUME.pdf"
    ];

    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.log(`NOT FOUND: ${file}`);
            continue;
        }
        console.log(`\n=== FILE: ${file} ===`);
        const buffer = fs.readFileSync(file);
        const parsed = await pdfParse(buffer);
        console.log(parsed.text.substring(0, 500));
    }
}

main().catch(console.error);
