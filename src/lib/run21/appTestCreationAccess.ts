import { supabase } from '@/integrations/supabase/client';
import { acceptsRun21Capability } from './appTestAccess';
import { run21AppTestRequested } from './appTestEnvironment';

/** Recheck discovery at submission; this does not replace authorization in SQL. */
export async function assertRun21CreationAccess(sessionId: string): Promise<void> {
  const projectRef = import.meta.env.VITE_RUN21_TEST_PROJECT_REF ?? '';
  if (!run21AppTestRequested({ lane: true,
    enabled: import.meta.env.VITE_RUN21_APP_TEST_ENABLED,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL, projectRef,
  })) throw new Error('Run21 is unavailable');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Run21 requires an authenticated admin');
  const { data, error } = await supabase.rpc('run21_app_test_capabilities' as never, {
    p_session_id: sessionId,
  } as never);
  if (error || !acceptsRun21Capability(data, auth.user.id, sessionId, projectRef)) {
    throw new Error('Run21 is unavailable');
  }
}
