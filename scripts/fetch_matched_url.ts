import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const pennylaneKey = process.env.PENNYLANE_API_KEY;

async function main() {
    const res = await fetch('https://app.pennylane.com/api/external/v2/transactions/28890877427712/matched_invoices', {
        headers: { 'Authorization': `Bearer ${pennylaneKey}`, 'Accept': 'application/json' }
    });
    const data = await res.json();
    console.log("Matched Invoices list:", data);
}

main();
