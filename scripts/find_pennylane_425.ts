import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const pennylaneKey = process.env.PENNYLANE_API_KEY;
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }

  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  console.log("Searching supplier invoices on Pennylane for amount 425.00...");

  try {
    const res = await fetch(`${BASE_URL}/supplier_invoices?limit=100`, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data: any = await res.json();
    const invoices = data.supplier_invoices || data.items || [];
    
    console.log(`Found ${invoices.length} invoices.`);
    const matched = invoices.filter((inv: any) => {
      const amt = parseFloat(inv.amount || '0');
      return Math.abs(amt - 425.00) < 0.01;
    });

    console.log(`Matches of 425.00: ${matched.length}`);
    matched.forEach((inv: any) => {
      console.log(` - ID: ${inv.id}`);
      console.log(`   Provider: ${inv.provider}`);
      console.log(`   Amount: ${inv.amount}`);
      console.log(`   Date: ${inv.date}`);
      console.log(`   FileUrl: ${inv.file_url || inv.fileUrl}`);
    });
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
