import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://app.pennylane.com/api/external/v2";
const pennylaneKey = process.env.PENNYLANE_API_KEY || "e3XlHUKGk2m-DAvqgPrdeG3feAXzPavAd8gqPa3fIMI";

async function main() {
  const res = await fetch(`${BASE_URL}/supplier_invoices?limit=10`, {
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json'
    }
  });
  const data = await res.json();
  console.log("Total recent supplier invoices in Pennylane:", data.items?.length);
  if (data.items) {
    data.items.slice(0, 5).forEach(inv => {
      console.log(`- Date: ${inv.date} | Supplier: ${inv.supplier?.name} | TTC: ${inv.currency_amount} € | Status: ${inv.status || 'N/A'}`);
    });
  }
}

main().catch(console.error);
