import pdfParse from 'pdf-parse';
import * as fs from 'fs';

async function main() {
    const filePath = "/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta/Factures 2026/02 - Février/2026-02-29 - CPAM_N_751_REMBOURSEMENTS_SANTE_TIERSPAYANT - 5801.98€.pdf";
    if (!fs.existsSync(filePath)) {
        console.error("File does not exist:", filePath);
        return;
    }
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    console.log("--- LOCAL CPAM TEXT ---");
    console.log(parsed.text.substring(0, 3000));
}

main().catch(console.error);
