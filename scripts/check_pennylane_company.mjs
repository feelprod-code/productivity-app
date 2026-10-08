import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://app.pennylane.com/api/external/v2";
const pennylaneKey = process.env.PENNYLANE_API_KEY || "e3XlHUKGk2m-DAvqgPrdeG3feAXzPavAd8gqPa3fIMI";

async function main() {
  console.log("Checking Pennylane API company profile & settings...");
  
  const endpoints = [
    "/company",
    "/companies",
    "/ledger_accounts?limit=10",
    "/bank_accounts",
    "/suppliers?limit=5"
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep}`, {
        headers: {
          'Authorization': `Bearer ${pennylaneKey}`,
          'Accept': 'application/json'
        }
      });
      console.log(`Endpoint ${ep}: Status ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Response for ${ep}:`, JSON.stringify(data, null, 2).slice(0, 500));
      }
    } catch (err) {
      console.error(`Error on ${ep}:`, err.message);
    }
  }
}

main().catch(console.error);
