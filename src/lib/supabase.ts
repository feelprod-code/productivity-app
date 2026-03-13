import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// We use the service_role key to bypass RLS since this is a secure server-side operation
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
