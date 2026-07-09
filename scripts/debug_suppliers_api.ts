import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
  const res = await fetch(`${BASE_URL}/suppliers?limit=100`, {
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
  console.log(`ℹ️ Keys in GET /suppliers:`, Object.keys(data));
  console.log(`ℹ️ Full JSON GET /suppliers:`, JSON.stringify(data));
}

main().catch(console.error);
