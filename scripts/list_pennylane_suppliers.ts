import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!pennylaneKey) {
    console.error("❌ PENNYLANE_API_KEY manquante");
    return;
  }

  console.log("🔍 Liste des fournisseurs Pennylane (sans header 2026)...");
  let suppliers: any[] = [];
  let cursor = '';
  
  while (true) {
    await sleep(250);
    const url = `${BASE_URL}/suppliers` + (cursor ? `?cursor=${cursor}&limit=100` : '?limit=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${pennylaneKey}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`❌ Échec : ${res.status}`);
      break;
    }

    const data: any = await res.json();
    const batch = data.suppliers || [];
    suppliers.push(...batch);

    const nextCursor = data.meta?.next_cursor;
    if (nextCursor) {
      cursor = nextCursor;
    } else {
      break;
    }
  }

  console.log(`✅ ${suppliers.length} fournisseurs récupérés.`);
  suppliers.forEach(s => {
    console.log(`- Name: "${s.name}" | ID: ${s.id}`);
  });
}

main().catch(console.error);
