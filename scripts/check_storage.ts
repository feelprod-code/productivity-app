import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Use admin key to bypass RLS

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("Listing files in 'invoices' bucket (root)...");
    const { data: rootData, error: rootError } = await supabase.storage.from('invoices').list('', { limit: 1000 });
    if (rootError) console.error("Root error:", rootError);
    if (rootData) {
        console.log(`Found ${rootData.length} files/folders at root.`);
        console.log(rootData.map(f => `  - ${f.name} (size: ${f.metadata?.size || 'N/A'})`).join('\n'));
    }
}
main();
