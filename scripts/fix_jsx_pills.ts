import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'src/app/comptabilite/releve/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    '<span>${patients.length} patient${patients.length > 1 ? \'s\' : \'\'} SumUp (${firstNames}${extra})</span>',
    '<span>{patients.length} patient{patients.length > 1 ? \'s\' : \'\'} SumUp ({firstNames}{extra})</span>'
);

content = content.replace(
    '<span>${patients.length} tiers-payant CPAM (${firstNames}${extra})</span>',
    '<span>{patients.length} tiers-payant CPAM ({firstNames}{extra})</span>'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Replaced JSX interpolations!");
