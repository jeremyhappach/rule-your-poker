/**
 * Chat-operation boundary-event recorder.
 *
 * Captures every reachable "the sender may leave" boundary event
 * (navigation, auth, page-lifecycle, error, service-worker, online/offline)
 * and appends it to every currently open chat operation via the durable
 * `chat_operation_append_boundary_event` RPC.
 *
 * Idempotent single install. Bounded: only fans out to registered
 * current-session chat operations (see serverChatOperation registry).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  getCurrentSessionChatOperations,
  type CurrentSessionChatOperationRecord,
} from './serverChatOperation';

export type ChatBoundaryEventName =
  | 'WINDOW_LOCATION_ASSIGN'
  | 'WINDOW_LOCATION_REPLACE'
  | 'WINDOW_LOCATION_RELOAD'
  | 'WINDOW_LOCATION_HREF_SET'
  | 'ROUTER_ROUTE_CHANGE'
  | 'AUTH_STATE_CHANGE'
  | 'AUTH_TOKEN_REFRESHED'
  | 'AUTH_TOKEN_REFRESH_FAILED'
  | 'AUTH_SIGN_OUT_STARTED'
  | 'AUTH_SIGN_OUT_COMPLETED'
  | 'AUTH_GUARD_REDIRECT'
  | 'ERROR_BOUNDARY_CAUGHT'
  | 'WINDOW_ERROR'
  | 'UNHANDLED_REJECTION'
  | 'PAGE_VISIBILITY_CHANGE'
  | 'PAGE_HIDE'
  | 'PAGE_SHOW'
  | 'PAGE_FREEZE'
  | 'PAGE_RESUME'
  | 'BEFORE_UNLOAD'
  | 'PAGE_SHOW_WAS_DISCARDED'
  | 'SERVICE_WORKER_REGISTERED'
  | 'SERVICE_WORKER_UPDATE_FOUND'
  | 'SERVICE_WORKER_CONTROLLER_CHANGED'
  | 'SERVICE_WORKER_MESSAGE'
  | 'NETWORK_ONLINE'
  | 'NETWORK_OFFLINE'
  | 'REALTIME_CHANNEL_STATUS'
  | 'REALTIME_CHANNEL_ERROR'
  | 'REALTIME_CHANNEL_CLOSED'
  | 'ACTIVE_SESSION_ROUTE_EJECTED'
  | 'ACTIVE_SESSION_LEGACY_JOIN_FALLBACK';

let installed = false;
let boundarySequence = 0;

function nowIso() { return new Date().toISOString(); }

async function fanOut(
  name: ChatBoundaryEventName,
  metadata: Record<string, unknown>,
): Promise<void> {
  const ops = getCurrentSessionChatOperations();
  if (ops.length === 0) return;
  const enriched: Record<string, unknown> = {
    ...metadata,
    at: nowIso(),
    sequence: ++boundarySequence,
    route: typeof window !== 'undefined' ? window.location.pathname : null,
    origin: typeof window !== 'undefined' ? window.location.origin : null,
    href: typeof window !== 'undefined' ? window.location.href : null,
    visibility_state: typeof document !== 'undefined' ? document.visibilityState : null,
    was_discarded: typeof document !== 'undefined' ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? false : false,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
  };
  await Promise.all(ops.map((op: CurrentSessionChatOperationRecord) =>
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)(
      'chat_operation_append_boundary_event',
      { _operation_id: op.operationId, _name: name, _role: op.role, _metadata: enriched },
    ).catch(() => {}),
  ));
}

/**
 * Public recorder — safe to call from anywhere; a no-op when no chat
 * operation is currently open.
 */
export function recordChatBoundaryEvent(
  name: ChatBoundaryEventName,
  metadata: Record<string, unknown> = {},
): void {
  void fanOut(name, metadata);
}

/** Install all global boundary listeners exactly once. Safe on SSR. */
export function installChatBoundaryListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // window.location wrappers (monkey-patch)
  try {
    const proto = Location.prototype;
    const origAssign = proto.assign;
    const origReplace = proto.replace;
    const origReload = proto.reload;
    proto.assign = function (url: string | URL) {
      recordChatBoundaryEvent('WINDOW_LOCATION_ASSIGN', { target: String(url) });
      return origAssign.call(this, url as string);
    };
    proto.replace = function (url: string | URL) {
      recordChatBoundaryEvent('WINDOW_LOCATION_REPLACE', { target: String(url) });
      return origReplace.call(this, url as string);
    };
    proto.reload = function () {
      recordChatBoundaryEvent('WINDOW_LOCATION_RELOAD', {});
      return origReload.call(this);
    };
  } catch { /* strict-mode locked location — skip */ }

  // page lifecycle
  window.addEventListener('visibilitychange', () => {
    recordChatBoundaryEvent('PAGE_VISIBILITY_CHANGE', { visibility_state: document.visibilityState });
  });
  window.addEventListener('pagehide', (e) => {
    recordChatBoundaryEvent('PAGE_HIDE', { persisted: (e as PageTransitionEvent).persisted });
  });
  window.addEventListener('pageshow', (e) => {
    const pte = e as PageTransitionEvent;
    const wasDiscarded = (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? false;
    recordChatBoundaryEvent('PAGE_SHOW', { persisted: pte.persisted, was_discarded: wasDiscarded });
    if (wasDiscarded) recordChatBoundaryEvent('PAGE_SHOW_WAS_DISCARDED', { persisted: pte.persisted });
  });
  // Chromium-only: freeze/resume
  window.addEventListener('freeze' as never, () => recordChatBoundaryEvent('PAGE_FREEZE', {}));
  window.addEventListener('resume' as never, () => recordChatBoundaryEvent('PAGE_RESUME', {}));
  window.addEventListener('beforeunload', () => recordChatBoundaryEvent('BEFORE_UNLOAD', {}));

  // errors
  window.addEventListener('error', (e) => {
    recordChatBoundaryEvent('WINDOW_ERROR', {
      message: (e as ErrorEvent).message ?? null,
      filename: (e as ErrorEvent).filename ?? null,
      lineno: (e as ErrorEvent).lineno ?? null,
      colno: (e as ErrorEvent).colno ?? null,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const rej = e as PromiseRejectionEvent;
    const reason = rej.reason as { message?: string; name?: string } | null;
    recordChatBoundaryEvent('UNHANDLED_REJECTION', {
      message: reason?.message ?? String(rej.reason ?? ''),
      name: reason?.name ?? null,
    });
  });

  // network
  window.addEventListener('online', () => recordChatBoundaryEvent('NETWORK_ONLINE', {}));
  window.addEventListener('offline', () => recordChatBoundaryEvent('NETWORK_OFFLINE', {}));

  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () =>
      recordChatBoundaryEvent('SERVICE_WORKER_CONTROLLER_CHANGED', {}));
    navigator.serviceWorker.addEventListener('message', (e) =>
      recordChatBoundaryEvent('SERVICE_WORKER_MESSAGE', {
        data_kind: typeof (e as MessageEvent).data,
      }));
    navigator.serviceWorker.ready.then((reg) => {
      recordChatBoundaryEvent('SERVICE_WORKER_REGISTERED', { scope: reg.scope });
      reg.addEventListener('updatefound', () =>
        recordChatBoundaryEvent('SERVICE_WORKER_UPDATE_FOUND', {}));
    }).catch(() => {});
  }

  // auth
  supabase.auth.onAuthStateChange((event, session) => {
    recordChatBoundaryEvent('AUTH_STATE_CHANGE', {
      event, has_session: !!session, user_id: session?.user?.id ?? null,
    });
    if (event === 'TOKEN_REFRESHED') recordChatBoundaryEvent('AUTH_TOKEN_REFRESHED', {});
    if (event === 'SIGNED_OUT') recordChatBoundaryEvent('AUTH_SIGN_OUT_COMPLETED', {});
  });
}
