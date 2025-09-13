import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database Types
export interface DatabaseClient {
  supabase: any;
}

const getClient = async (): Promise<DatabaseClient> => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
  return { supabase };
};

export { getClient };
