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
import { isInstrumentationRequest } from './chatOperationInstrumentationGuard';

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
  | 'ACTIVE_SESSION_LEGACY_JOIN_FALLBACK'
  | 'SENDER_OPERATION_ARMED'
  | 'PEER_OPERATION_OBSERVED'
  | 'CHAT_REALTIME_CHANNEL_REMOVE_INITIATED'
  | 'CHAT_REALTIME_CHANNEL_REMOVED'
  | 'CHAT_REALTIME_CHANNEL_STATUS'
  | 'CHAT_REALTIME_CHANNEL_TIMED_OUT'
  | 'ROUTER_NAVIGATION_INITIATED'
  | 'HISTORY_PUSH_STATE'
  | 'HISTORY_REPLACE_STATE'
  | 'HISTORY_POP_STATE'
  | 'FETCH_ABORT_ERROR'
  | 'APP_ABORT_CONTROLLER_ABORT'
  | 'SUPABASE_FETCH_STARTED'
  | 'SUPABASE_FETCH_RESOLVED'
  | 'SUPABASE_FETCH_REJECTED'
  | 'CHAT_HOOK_UNMOUNT'
  | 'GAME_CONTEXT_TEARDOWN'
  | 'GAME_CONTEXT_REPLACED'
  | 'ACTIVE_SESSION_CLEARED'
  | 'ACTIVE_SESSION_REPLACED'
  | 'SHELL_UNMOUNT_CONTEXT'
  | 'TERMINAL_RECOVERY_RECORDED'
  | 'RECOVERY_LEASE_RELEASED';

let installed = false;
let boundarySequence = 0;

// Re-entrancy guard registry lives in `chatOperationInstrumentationGuard.ts`
// (imported above) so the pure classifier is testable without pulling in
// the supabase client. See that module for the full instrumentation
// RPC/table registry.

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
 * Explicit navigation-initiation recorder. Call BEFORE `navigate(...)`
 * / `redirect(...)` / any session-affecting router action so the
 * boundary event is persisted even if the sender dies before
 * destination-route code runs.
 */
export function recordChatNavigationInitiated(
  source: string,
  target: string,
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  recordChatBoundaryEvent('ROUTER_NAVIGATION_INITIATED', {
    source,
    target,
    reason,
    from_route: typeof window !== 'undefined' ? window.location.pathname : null,
    ...extra,
  });
}

/**
 * Explicit AbortController.abort() recorder. Call immediately BEFORE
 * `controller.abort()` at reachable sites.
 */
export function recordChatAbortInitiated(
  source: string,
  purpose: string,
  extra: Record<string, unknown> = {},
): void {
  recordChatBoundaryEvent('APP_ABORT_CONTROLLER_ABORT', {
    source,
    purpose,
    ...extra,
  });
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

  // history API — patches all React Router navigate(...) calls at
  // initiation. Emitted BEFORE the state actually changes so the boundary
  // event is persisted even if the sender dies mid-navigation.
  try {
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = function patched(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      const target = url == null ? null : String(url);
      recordChatBoundaryEvent('HISTORY_PUSH_STATE', {
        from_route: window.location.pathname,
        target,
      });
      recordChatBoundaryEvent('ROUTER_NAVIGATION_INITIATED', {
        source: 'history.pushState',
        target,
        reason: 'router-push',
        from_route: window.location.pathname,
      });
      return origPush(data as never, unused, url as never);
    } as typeof window.history.pushState;
    window.history.replaceState = function patched(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      const target = url == null ? null : String(url);
      recordChatBoundaryEvent('HISTORY_REPLACE_STATE', {
        from_route: window.location.pathname,
        target,
      });
      recordChatBoundaryEvent('ROUTER_NAVIGATION_INITIATED', {
        source: 'history.replaceState',
        target,
        reason: 'router-replace',
        from_route: window.location.pathname,
      });
      return origReplace(data as never, unused, url as never);
    } as typeof window.history.replaceState;
    window.addEventListener('popstate', () => {
      recordChatBoundaryEvent('HISTORY_POP_STATE', {
        route: window.location.pathname,
      });
    });
  } catch { /* noop */ }

  // fetch instrumentation — supabase.co REST/RPC/Realtime HTTP requests
  // only. Records started/resolved/rejected without body, credentials, or
  // response payloads. AbortError is surfaced as FETCH_ABORT_ERROR.
  //
  // RE-ENTRANCY GUARD (per-request, concurrency-safe): every outbound
  // request derived from chat-operation instrumentation itself
  // (boundary/heartbeat/milestone/violation/recovery/finalize RPCs and
  // the two instrumentation tables) is classified as INSTRUMENTATION and
  // returned via origFetch WITHOUT emitting SUPABASE_FETCH_* events. The
  // classifier is a pure function of request URL — no shared mutable
  // state — so concurrent instrumentation and business requests cannot
  // interfere.
  try {
    const origFetch = window.fetch.bind(window);
    let fetchSeq = 0;
    window.fetch = async function patched(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      let urlStr = '';
      try {
        urlStr = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      } catch { /* noop */ }
      const isSupabase = urlStr.includes('.supabase.co') || urlStr.includes('/rest/v1/') || urlStr.includes('/rpc/');
      if (!isSupabase) return origFetch(input as never, init);
      let purpose = 'unknown';
      let leafName = '';
      let kind: 'rpc' | 'rest' | 'other' = 'other';
      try {
        const u = new URL(urlStr, window.location.origin);
        const parts = u.pathname.split('/').filter(Boolean);
        const restIdx = parts.indexOf('v1');
        if (restIdx >= 0 && parts[restIdx + 1] === 'rpc') {
          leafName = parts[restIdx + 2] ?? '';
          kind = 'rpc';
          purpose = `rpc:${leafName || '?'}`;
        } else if (restIdx >= 0) {
          leafName = parts[restIdx + 1] ?? '';
          kind = 'rest';
          purpose = `rest:${leafName || '?'}`;
        } else {
          purpose = `path:${u.pathname}`;
        }
      } catch { /* noop */ }

      if (isInstrumentationRequest(kind, leafName)) {
        // Instrumentation write: pass through untouched, emit nothing.
        return origFetch(input as never, init);
      }

      const seq = ++fetchSeq;
      const method = (init?.method ?? 'GET').toUpperCase();
      recordChatBoundaryEvent('SUPABASE_FETCH_STARTED', { seq, purpose, method });
      try {
        const res = await origFetch(input as never, init);
        recordChatBoundaryEvent('SUPABASE_FETCH_RESOLVED', {
          seq, purpose, method, status: res.status, ok: res.ok,
        });
        return res;
      } catch (err) {
        const name = err instanceof Error ? err.name : String(err);
        const message = err instanceof Error ? err.message : String(err);
        if (name === 'AbortError') {
          recordChatBoundaryEvent('FETCH_ABORT_ERROR', { seq, purpose, method, message });
        } else {
          recordChatBoundaryEvent('SUPABASE_FETCH_REJECTED', {
            seq, purpose, method, name, message,
          });
        }
        throw err;
      }
    } as typeof window.fetch;
  } catch { /* noop */ }


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
