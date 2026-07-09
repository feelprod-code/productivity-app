import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;

async function main() {
  if (!pennylaneKey) {
    console.error("Missing PENNYLANE_API_KEY");
    return;
  }
  
  const BASE_URL = "https://app.pennylane.com/api/external/v2";
  
  // Invoice ID that failed in the logs: 25247228416000
  const invoiceId = "25247228416000";
  
  console.log(`Testing PUT update on invoice ID ${invoiceId} to inspect the 422 error details...`);
  
  const updateRes = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    },
    body: JSON.stringify({
      label: "Test Defuse (OLD)",
      date: "2028-12-31"
    })
  });

  console.log(`Status: ${updateRes.status}`);
  console.log(`Response headers:`, JSON.stringify(updateRes.headers.raw(), null, 2));
  console.log(`Response text:`, await updateRes.text());
}

main().catch(console.error);
