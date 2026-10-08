const PENNYLANE_API_KEY = "e3XlHUKGk2m-DAvqgPrdeG3feAXzPavAd8gqPa3fIMI";

async function checkPennylane() {
  const url = "https://app.pennylane.com/api/external/v1/bank_transactions?page=1&per_page=100";
  // We can search through recent pages
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://app.pennylane.com/api/external/v1/bank_transactions?page=${page}&per_page=100`, {
      headers: {
        "Authorization": `Bearer ${PENNYLANE_API_KEY}`,
        "Accept": "application/json"
      }
    });
    if (!res.ok) {
      console.log(`Error fetching page ${page}:`, res.status, await res.text());
      break;
    }
    const data = await res.json();
    const items = data.bank_transactions || [];
    if (items.length === 0) break;
    
    for (const tx of items) {
      const label = (tx.label || "").toLowerCase();
      if (label.includes("higgs") || label.includes("field")) {
        console.log("MATCH:", tx.date, tx.amount, tx.currency, tx.label);
      }
    }
  }
  console.log("Pennylane search done.");
}

checkPennylane().catch(console.error);
