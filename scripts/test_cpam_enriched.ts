async function main() {
    const res = await fetch('http://localhost:3000/api/transactions/releve');
    const data: any = await res.json();
    const enrichedCpam = data.transactions.filter((t: any) => t.productDescription && (t.productDescription.startsWith('CPAM_MATCH:') || t.productDescription.startsWith('CPAM_JSON:')));
    console.log(`Total enriched CPAM transactions: ${enrichedCpam.length}`);
    for (const t of enrichedCpam) {
        console.log(`- ${t.date} | ${t.id} | ${t.amount} € | matchedInvoice: ${t.matchedInvoice?.label || 'NONE'} | pdfUrl: ${t.matchedInvoice?.publicFileUrl || 'NONE'}`);
    }

    const enrichedSumUp = data.transactions.filter((t: any) => t.productDescription && t.productDescription.startsWith('SUMUP_JSON:'));
    console.log(`\nTotal enriched SumUp transactions: ${enrichedSumUp.length}`);
}

main().catch(console.error);
