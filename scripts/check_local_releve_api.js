async function main() {
  try {
    console.log("📥 Calling local API /api/transactions/releve...");
    const res = await fetch("http://localhost:3000/api/transactions/releve?t=" + Date.now());
    if (!res.ok) {
      console.error(`Failed: ${res.status}`);
      return;
    }
    const data = await res.json();
    const txs = data.transactions || [];
    console.log(`Total transactions returned by API: ${txs.length}`);
    
    console.log("\n=== TRANSACTIONS WITH LOCAL MATCHED INVOICES FROM API ===");
    txs.forEach(t => {
      if (t.matchedInvoice) {
        console.log(`--------------------------------------------------`);
        console.log(`TX: [${t.date}] ${t.label} | ${t.amount} EUR (ID: ${t.id})`);
        console.log(`   -> SUGGESTED INV: [${t.matchedInvoice.date ? t.matchedInvoice.date.split('T')[0] : 'N/A'}] Label: "${t.matchedInvoice.label}" | Amount: ${t.matchedInvoice.amount} EUR | File: "${t.matchedInvoice.filename}"`);
      }
    });
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
