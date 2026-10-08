import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;
const BASE_URL = "https://app.pennylane.com/api/external/v2";

async function main() {
    const res = await fetch(`${BASE_URL}/suppliers?limit=100`, {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    if (!res.ok) {
        console.error("Failed to fetch suppliers:", res.status);
        return;
    }
    const data: any = await res.json();
    const suppliers = data.items || data.suppliers || [];
    console.log(`Loaded ${suppliers.length} suppliers from Pennylane.`);
    const names = suppliers.map((s: any) => `${s.id}: ${s.name}`);
    console.log("Sample suppliers:", names.slice(0, 15));

    // Check for URSSAF, CARPIMKO, LIXXBAIL, LCL
    ['URSSAF', 'CARPIMKO', 'LIXXBAIL', 'LCL', 'ADOHA', 'GPM'].forEach(target => {
        const found = suppliers.filter((s: any) => (s.name || '').toUpperCase().includes(target));
        console.log(`Searching for "${target}":`, found.map((f: any) => `${f.id}: ${f.name}`));
    });
}

main();
