import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://app.pennylane.com/api/external/v2";
const pennylaneKey = process.env.PENNYLANE_API_KEY || "e3XlHUKGk2m-DAvqgPrdeG3feAXzPavAd8gqPa3fIMI";

async function main() {
  const res = await fetch(`${BASE_URL}/bank_accounts`, {
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json'
    }
  });
  const data = await res.json();
  console.log("All Pennylane Bank Accounts:");
  data.items.forEach(acc => {
    console.log(`- ID: ${acc.id} | Name: ${acc.name} | Balance: ${acc.balance} € | Updated: ${acc.updated_at}`);
  });
}

main().catch(console.error);
