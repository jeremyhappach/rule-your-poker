// Loopback harness only: fixture sessions, real supabase-js queries and real SQL/RLS.
import {createClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
export const fixtureAdmin = new URLSearchParams(location.search).get('session') === 'admin';
export const supabase = createClient<Database>(location.origin,'loopback-fixture',{
  accessToken:async()=>fixtureAdmin?'fixture-admin':'fixture-player',
  auth:{persistSession:false,autoRefreshToken:false},
});
