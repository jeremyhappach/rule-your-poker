/**
 * Post-authentication recovery correlation scan.
 *
 * On every `SIGNED_IN` (and once on install if a session already exists),
 * queries the caller's own unresolved `chat_send_operations` opened in the
 * last 15 minutes and appends one `chat_operation_append_recovery_correlation`
 * per operation. Never runs at anonymous `/auth` — session presence gates it.
 *
 * Attaches: current route/origin, navigation type, `document.wasDiscarded`,
 * and whether route/origin changed vs. the operation's original values.
 */
import { supabase } from '@/integrations/supabase/client';

const WINDOW_MS = 15 * 60 * 1000;
let installed = false;
const scannedForUser = new Set<string>();

interface Row {
  operation_id: string;
  route: string;
  game_id: string;
  session_id: string;
  status: string;
  terminal_status: string | null;
  created_at: string;
}

function navType(): string | null {
  if (typeof performance === 'undefined') return null;
  const entries = performance.getEntriesByType?.('navigation') as PerformanceNavigationTiming[] | undefined;
  return entries?.[0]?.type ?? null;
}

async function scanFor(userId: string) {
  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('chat_send_operations')
    .select('operation_id, route, game_id, session_id, status, terminal_status, created_at')
    .eq('sender_user_id', userId)
    .gte('created_at', sinceIso)
    .in('status', ['open', 'finalized']);
  if (error || !data) return;
  const currentRoute = typeof window !== 'undefined' ? window.location.pathname : null;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : null;
  const wasDiscarded = typeof document !== 'undefined'
    ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? false
    : false;
  const nav = navType();

  await Promise.all((data as Row[]).map(async (row) => {
    // Only interesting: operations that were still open, or that finalized
    // as sender-lost / had no explicit peer-received terminal.
    const unresolved = row.status === 'open' || row.terminal_status === 'sender-lost' || row.terminal_status === null;
    if (!unresolved) return;
    const metadata = {
      recovery_at: new Date().toISOString(),
      current_route: currentRoute,
      current_origin: currentOrigin,
      original_route: row.route,
      route_changed: currentRoute !== row.route,
      origin_changed_note: 'origin comparison unavailable without persisted origin',
      navigation_type: nav,
      was_discarded: wasDiscarded,
      operation_status: row.status,
      operation_terminal_status: row.terminal_status,
    };
    try {
      await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
        'chat_operation_append_recovery_correlation',
        { _operation_id: row.operation_id, _metadata: metadata },
      );
    } catch { /* best-effort */ }
  }));
}

export function installChatOperationRecoveryScan(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user?.id;
    if (uid && !scannedForUser.has(uid)) {
      scannedForUser.add(uid);
      void scanFor(uid);
    }
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
    const uid = session?.user?.id;
    if (!uid || scannedForUser.has(uid)) return;
    scannedForUser.add(uid);
    void scanFor(uid);
  });
}
