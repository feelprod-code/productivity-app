import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    console.log("Calling local releve API on http://localhost:3000/api/transactions/releve...");
    const res = await fetch('http://localhost:3000/api/transactions/releve');
    if (!res.ok) {
        console.error(`Status ${res.status}: ${await res.text()}`);
        return;
    }
    const data: any = await res.json();
    console.log(`Success! Total transactions returned: ${data.transactions?.length}`);

    // Check CPAM transactions in output
    const cpamTxs = data.transactions.filter((t: any) => {
        const l = (t.label || '').toLowerCase();
        return l.includes('cpam') || l.includes('c.p.a.m.') || (t.productDescription && t.productDescription.includes('CPAM'));
    });
    console.log(`\nCPAM transactions in API output (${cpamTxs.length}):`);
    for (const t of cpamTxs.slice(0, 8)) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'} | desc: ${t.productDescription ? t.productDescription.substring(0, 50) + '...' : 'NONE'}`);
    }

    // Check URSSAF transactions in output
    const urssafTxs = data.transactions.filter((t: any) => (t.label || '').toLowerCase().includes('urssaf'));
    console.log(`\nURSSAF transactions in API output (${urssafTxs.length}):`);
    for (const t of urssafTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'}`);
    }

    // Check ADOHA transactions in output
    const adohaTxs = data.transactions.filter((t: any) => (t.label || '').toLowerCase().includes('adoha'));
    console.log(`\nADOHA transactions in API output (${adohaTxs.length}):`);
    for (const t of adohaTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'}`);
    }

    // Check LIXXBAIL transactions in output
    const lixxTxs = data.transactions.filter((t: any) => (t.label || '').toLowerCase().includes('lixxbail'));
    console.log(`\nLIXXBAIL transactions in API output (${lixxTxs.length}):`);
    for (const t of lixxTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'}`);
    }

    // Check PRÊT 18942536 in output
    const pretTxs = data.transactions.filter((t: any) => (t.label || '').toLowerCase().includes('18942536'));
    console.log(`\nPRÊT 18942536 transactions in API output (${pretTxs.length}):`);
    for (const t of pretTxs) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'}`);
    }
}

main().catch(console.error);
