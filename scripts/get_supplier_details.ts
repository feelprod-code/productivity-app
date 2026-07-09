import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const supplierId = "1330919579648";
  const res = await fetch(`${BASE_URL}/suppliers/${supplierId}`, {
    headers: {
      'Authorization': `Bearer ${pennylaneKey}`,
      'Accept': 'application/json',
      'X-Use-2026-API-Changes': 'true'
    }
  });

  if (!res.ok) {
    console.error(`❌ Échec : ${res.status} - ${await res.text()}`);
    return;
  }

  const data: any = await res.json();
  console.log(`ℹ️ Full JSON for 1330919579648:`, JSON.stringify(data));
}

main().catch(console.error);
