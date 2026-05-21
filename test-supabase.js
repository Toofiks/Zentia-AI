
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Testing Supabase connection...');
try {
    const { data, error } = await supabase.from('agents').select('count', { count: 'exact', head: true });
    if (error) {
        console.error('Database query error:', error.message);
    } else {
        console.log('Database query success!');
    }
} catch (e) {
    console.error('Database query exception:', e.message);
}

console.log('Testing Auth connection...');
try {
    // This will probably fail because there's no valid session/token to check, 
    // but we want to see if it times out.
    const { data, error } = await supabase.auth.getUser('dummy-token');
    console.log('Auth query finished (expected error):', error?.message || 'No error');
} catch (e) {
    console.error('Auth query exception:', e.message);
}
