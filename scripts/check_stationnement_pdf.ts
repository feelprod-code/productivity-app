import pdfParse from 'pdf-parse';
import * as fs from 'fs';

async function main() {
    const f = '/Users/philippeguillaume/Documents/4-CABINET KINE/MK STATIONNEMENT/PDFReleveIndividuels.pdf';
    if (fs.existsSync(f)) {
        const buf = fs.readFileSync(f);
        const parsed = await pdfParse(buf);
        console.log("PDFReleveIndividuels:", parsed.text.substring(0, 400));
    }
}
main().catch(console.error);
