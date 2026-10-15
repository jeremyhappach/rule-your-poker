import { supabase } from '@/integrations/supabase/client';
import { acceptsRun21Capability, run21ProjectRef } from './access';

/** Recheck discovery at submission; this does not replace authorization in SQL. */
export async function assertRun21CreationAccess(sessionId: string): Promise<void> {
  const projectRef = run21ProjectRef(import.meta.env.VITE_SUPABASE_URL);
  if (!projectRef) throw new Error('Run21 is unavailable');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Run21 requires an authenticated user');
  const { data, error } = await supabase.rpc('run21_capabilities' as never, {
    p_session_id: sessionId,
  } as never);
  if (error || !acceptsRun21Capability(data, auth.user.id, sessionId, projectRef)) {
    throw new Error('Run21 is unavailable');
  }
}
