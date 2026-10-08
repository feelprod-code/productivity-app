import * as fs from 'fs';

const filePath = '/Users/philippeguillaume/ANTIGRAVITY/compta/src/app/comptabilite/releve/page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const hasCRLF = content.includes('\r\n');
console.log(`File has CRLF: ${hasCRLF}, total length: ${content.length}`);
const target = 'if (tx.productDescription.startsWith("CPAM_JSON:"))';
console.log(`Target exists: ${content.includes(target)}`);
