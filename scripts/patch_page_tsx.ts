import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'src/app/comptabilite/releve/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update CPAM parsing in details view
const oldCpamBlock = `                                    if (tx.productDescription.startsWith("CPAM_JSON:")) {
                                      try {
                                        const patients = JSON.parse(tx.productDescription.substring(10)) as { name: string, amount: number }[];`;

const newCpamBlock = `                                    if (tx.productDescription.startsWith("CPAM_JSON:") || tx.productDescription.startsWith("CPAM_MATCH:")) {
                                      try {
                                        const jsonStr = tx.productDescription.startsWith("CPAM_MATCH:")
                                          ? tx.productDescription.substring(tx.productDescription.indexOf('|') + 1)
                                          : tx.productDescription.substring(10);
                                        const patients = JSON.parse(jsonStr) as { name: string, amount: number }[];`;

if (!content.includes(oldCpamBlock)) {
    console.error("Could not find oldCpamBlock!");
} else {
    content = content.replace(oldCpamBlock, newCpamBlock);
    console.log("✅ oldCpamBlock replaced!");
}

// 2. Exclude CPAM_MATCH from generic product description
const oldExclusion = `!displayProductDescription.startsWith("SUMUP_JSON:") && !displayProductDescription.startsWith("CPAM_JSON:")`;
const newExclusion = `!displayProductDescription.startsWith("SUMUP_JSON:") && !displayProductDescription.startsWith("CPAM_JSON:") && !displayProductDescription.startsWith("CPAM_MATCH:")`;

if (!content.includes(oldExclusion)) {
    console.error("Could not find oldExclusion!");
} else {
    content = content.replace(oldExclusion, newExclusion);
    console.log("✅ oldExclusion replaced!");
}

// 3. Add patient summary pills in the compact table row under cleanDisplayLabel
const oldRowLabel = `<span className="truncate max-w-[220px] xs:max-w-[280px] sm:max-w-[400px] block font-semibold text-[#1E2A33]" title={tx.label}>{cleanDisplayLabel(tx.label)}</span>
                                      {tx.label !== cleanDisplayLabel(tx.label) && (
                                        <span className="text-[10px] text-[#1E2A33]/40 font-light truncate max-w-[220px] xs:max-w-[280px] sm:max-w-[400px] hidden sm:block" title={tx.label}>
                                          {tx.label}
                                        </span>
                                      )}`;

const newRowLabel = `<span className="truncate max-w-[220px] xs:max-w-[280px] sm:max-w-[400px] block font-semibold text-[#1E2A33]" title={tx.label}>{cleanDisplayLabel(tx.label)}</span>
                                      {tx.label !== cleanDisplayLabel(tx.label) && (
                                        <span className="text-[10px] text-[#1E2A33]/40 font-light truncate max-w-[220px] xs:max-w-[280px] sm:max-w-[400px] hidden sm:block" title={tx.label}>
                                          {tx.label}
                                        </span>
                                      )}
                                      
                                      {/* Direct patient indicator pills for SumUp & CPAM */}
                                      {typeof tx.productDescription === 'string' && tx.productDescription && (() => {
                                        if (tx.productDescription.startsWith("SUMUP_JSON:")) {
                                          try {
                                            const patients = JSON.parse(tx.productDescription.substring(11)) as { name: string, amount: number }[];
                                            const firstNames = patients.slice(0, 2).map(p => p.name.split(' ')[0]).join(', ');
                                            const extra = patients.length > 2 ? \` +\${patients.length - 2}\` : '';
                                            return (
                                              <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-500/20">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                  <span>\${patients.length} patient\${patients.length > 1 ? 's' : ''} SumUp (\${firstNames}\${extra})</span>
                                                </span>
                                              </div>
                                            );
                                          } catch (e) {}
                                        }
                                        if (tx.productDescription.startsWith("CPAM_JSON:") || tx.productDescription.startsWith("CPAM_MATCH:")) {
                                          try {
                                            const jsonStr = tx.productDescription.startsWith("CPAM_MATCH:")
                                              ? tx.productDescription.substring(tx.productDescription.indexOf('|') + 1)
                                              : tx.productDescription.substring(10);
                                            const patients = JSON.parse(jsonStr) as { name: string, amount: number }[];
                                            const firstNames = patients.slice(0, 2).map(p => p.name.split(' ')[0]).join(', ');
                                            const extra = patients.length > 2 ? \` +\${patients.length - 2}\` : '';
                                            return (
                                              <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-500/20">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                  <span>\${patients.length} tiers-payant CPAM (\${firstNames}\${extra})</span>
                                                </span>
                                              </div>
                                            );
                                          } catch (e) {}
                                        }
                                        return null;
                                      })()}`;

if (!content.includes(oldRowLabel)) {
    console.error("Could not find oldRowLabel!");
} else {
    content = content.replace(oldRowLabel, newRowLabel);
    console.log("✅ oldRowLabel replaced with patient indicator pills!");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("🎉 Successfully updated page.tsx!");
