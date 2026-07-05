/**
 * SESSION_LIFECYCLE_LEDGER_v1 — persistent, cross-remount session
 * lifecycle trace. Purpose: capture *why* an active joined game session
 * gets ejected back to the legacy Join/landing screen, even when the
 * failure blanks the game UI and prevents in-app pills from being
 * reachable.
 *
 * Design constraints:
 *   - Independent of React component lifetime — module-scoped buffer
 *     mirrored to durable browser storage on every write.
 *   - Survives route changes, remounts, auth refresh, publish refresh,
 *     Safari BFCache restores, and full page reloads.
 *   - Never mutates auth / navigation / session state. Pure observation.
 *   - Exportable + queryable via `/diagnostics` even when the game UI
 *     never mounts.
 *
 * Storage:
 *   - localStorage key `session-lifecycle-ledger:v1` holds the rolling
 *     event ring (up to 500 events) plus the incident index (up to 20
 *     fatal/ejection incidents).
 *   - clientInstanceId persists in localStorage; sessionId scopes to
 *     the current tab (sessionStorage-backed).
 */

const LEDGER_VERSION = 1;
const STORAGE_KEY = "session-lifecycle-ledger:v1";
const CLIENT_INSTANCE_KEY = "session-lifecycle-ledger:client-instance-id";
const TAB_SESSION_KEY = "session-lifecycle-ledger:tab-session-id";
const MAX_EVENTS = 500;
const MAX_INCIDENTS = 20;

export type SessionLifecycleEventKind =
  // Route + navigation
  | "ROUTE_CHANGE"
  | "ROUTE_HISTORY_PUSH"
  | "ROUTE_HISTORY_REPLACE"
  | "ROUTE_POPSTATE"
  | "ROUTE_LOCATION_ASSIGN"
  // Shell / surface lifecycle
  | "SHELL_MOUNT"
  | "SHELL_UNMOUNT"
  | "SURFACE_MOUNT"
  | "SURFACE_UNMOUNT"
  // Auth
  | "AUTH_STATE_CHANGE"
  | "AUTH_TOKEN_REFRESH"
  | "AUTH_TOKEN_REFRESH_FAILED"
  // Session / membership / table
  | "SESSION_VALIDATION_RESULT"
  | "MEMBERSHIP_RESULT"
  | "TABLE_QUERY_RESULT"
  | "TABLE_STATUS_TRANSITION"
  | "PERSISTED_SESSION_RESTORE"
  // Chat surface events (kept coarse; details already covered by
  // chatDeliveryLedger — this is only for cross-correlation with an
  // ejection incident).
  | "CHAT_REALTIME_CALLBACK_BEGIN"
  | "CHAT_REALTIME_CALLBACK_END"
  | "CHAT_STORE_UPDATE_BEGIN"
  | "CHAT_STORE_UPDATE_END"
  // Environment
  | "VISIBILITY_CHANGE"
  | "ONLINE_STATUS"
  | "PAGE_SHOW"
  | "PAGE_HIDE"
  | "BOOT"
  // Incident markers (also written into the incident index below)
  | "ACTIVE_SESSION_ROUTE_EJECTED"
  | "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK"
  | "ACTIVE_SESSION_SHELL_UNMOUNTED"
  | "ACTIVE_SESSION_AUTH_REDIRECT"
  | "ACTIVE_SESSION_MEMBERSHIP_REJECTED"
  | "ACTIVE_SESSION_TABLE_NOT_FOUND_OR_STALE"
  | "CHAT_EVENT_PRECEDES_SESSION_EJECTION"
  | "FATAL_RENDER_OR_PROMISE_REJECTION"
  | "PERSISTED_SESSION_RESTORE_FAILED"
  | "GENERIC";

export type SessionIncidentKind = Extract<
  SessionLifecycleEventKind,
  | "ACTIVE_SESSION_ROUTE_EJECTED"
  | "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK"
  | "ACTIVE_SESSION_SHELL_UNMOUNTED"
  | "ACTIVE_SESSION_AUTH_REDIRECT"
  | "ACTIVE_SESSION_MEMBERSHIP_REJECTED"
  | "ACTIVE_SESSION_TABLE_NOT_FOUND_OR_STALE"
  | "CHAT_EVENT_PRECEDES_SESSION_EJECTION"
  | "FATAL_RENDER_OR_PROMISE_REJECTION"
  | "PERSISTED_SESSION_RESTORE_FAILED"
>;

const INCIDENT_KINDS: ReadonlySet<string> = new Set<SessionIncidentKind>([
  "ACTIVE_SESSION_ROUTE_EJECTED",
  "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK",
  "ACTIVE_SESSION_SHELL_UNMOUNTED",
  "ACTIVE_SESSION_AUTH_REDIRECT",
  "ACTIVE_SESSION_MEMBERSHIP_REJECTED",
  "ACTIVE_SESSION_TABLE_NOT_FOUND_OR_STALE",
  "CHAT_EVENT_PRECEDES_SESSION_EJECTION",
  "FATAL_RENDER_OR_PROMISE_REJECTION",
  "PERSISTED_SESSION_RESTORE_FAILED",
]);

export interface SessionLifecycleContext {
  gameId: string | null;
  tableId: string | null;
  sessionId: string | null;
  dealerGameId: string | null;
  route: string | null;
  userId: string | null;
  hasCommittedActiveSession: boolean;
  extra?: Record<string, unknown>;
}

export interface SessionLifecycleEvent {
  seq: number;
  ts: number;
  kind: SessionLifecycleEventKind;
  ctx: Partial<SessionLifecycleContext>;
  detail: Record<string, unknown>;
}

export interface SessionIncidentEntry {
  seq: number;
  ts: number;
  kind: SessionIncidentKind;
  key: string; // {clientInstanceId}|{tableId}|{sessionId}|{route}|{ts}
  ctx: Partial<SessionLifecycleContext>;
  detail: Record<string, unknown>;
}

interface PersistShape {
  version: number;
  clientInstanceId: string;
  tabSessionId: string;
  events: SessionLifecycleEvent[];
  incidents: SessionIncidentEntry[];
  seq: number;
}

// ── IDs ────────────────────────────────────────────────────────────

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClientInstanceId(): string {
  if (typeof window === "undefined") return "ssr-client";
  try {
    let id = window.localStorage.getItem(CLIENT_INSTANCE_KEY);
    if (!id) {
      id = randomId("ci");
      window.localStorage.setItem(CLIENT_INSTANCE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-client";
  }
}

function getTabSessionId(): string {
  if (typeof window === "undefined") return "ssr-tab";
  try {
    let id = window.sessionStorage.getItem(TAB_SESSION_KEY);
    if (!id) {
      id = randomId("tab");
      window.sessionStorage.setItem(TAB_SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-tab";
  }
}

// ── In-memory buffer (mirror of persisted state) ───────────────────

let buffer: SessionLifecycleEvent[] = [];
let incidents: SessionIncidentEntry[] = [];
let seqCounter = 0;
let loaded = false;
let installed = false;

// Committed active-session flag. Once a caller declares an active
// joined session, subsequent legacy-Join renders / auth redirects are
// flagged as ACTIVE_SESSION_* incidents rather than treated as normal
// navigation. This is a diagnostic flag only — it does not block any
// route change.
let committedActiveSession: {
  gameId: string | null;
  tableId: string | null;
  sessionId: string | null;
  dealerGameId: string | null;
  since: number;
} | null = null;

const ambient: Partial<SessionLifecycleContext> = {};

function loadFromStorage(): void {
  if (loaded || typeof window === "undefined") {
    loaded = true;
    return;
  }
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed && parsed.version === LEDGER_VERSION) {
      buffer = Array.isArray(parsed.events)
        ? parsed.events.slice(-MAX_EVENTS)
        : [];
      incidents = Array.isArray(parsed.incidents)
        ? parsed.incidents.slice(-MAX_INCIDENTS)
        : [];
      seqCounter = typeof parsed.seq === "number" ? parsed.seq : buffer.length;
    }
  } catch {
    /* noop */
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    const shape: PersistShape = {
      version: LEDGER_VERSION,
      clientInstanceId: getClientInstanceId(),
      tabSessionId: getTabSessionId(),
      events: buffer.slice(-MAX_EVENTS),
      incidents: incidents.slice(-MAX_INCIDENTS),
      seq: seqCounter,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // quota / private mode — drop write.
  }
}

function currentRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return null;
  }
}

function makeIncidentKey(
  kind: SessionIncidentKind,
  ctx: Partial<SessionLifecycleContext>,
  ts: number,
): string {
  return [
    getClientInstanceId(),
    ctx.tableId ?? "-",
    ctx.sessionId ?? "-",
    ctx.route ?? currentRoute() ?? "-",
    kind,
    ts,
  ].join("|");
}

// ── Public API ─────────────────────────────────────────────────────

export function setSessionLifecycleAmbient(
  partial: Partial<SessionLifecycleContext>,
): void {
  let changed = false;
  (Object.keys(partial) as (keyof SessionLifecycleContext)[]).forEach((k) => {
    const v = partial[k];
    if (v === undefined) return;
    if ((ambient as Record<string, unknown>)[k as string] !== v) {
      (ambient as Record<string, unknown>)[k as string] = v as unknown;
      changed = true;
    }
  });
  if (changed) {
    // No event emitted — ambient just enriches subsequent events.
  }
}

export function markActiveSessionCommitted(
  input: {
    gameId?: string | null;
    tableId?: string | null;
    sessionId?: string | null;
    dealerGameId?: string | null;
  } = {},
): void {
  committedActiveSession = {
    gameId: input.gameId ?? committedActiveSession?.gameId ?? null,
    tableId: input.tableId ?? committedActiveSession?.tableId ?? null,
    sessionId: input.sessionId ?? committedActiveSession?.sessionId ?? null,
    dealerGameId:
      input.dealerGameId ?? committedActiveSession?.dealerGameId ?? null,
    since: Date.now(),
  };
  recordSessionLifecycleEvent("GENERIC", {
    marker: "ACTIVE_SESSION_COMMITTED",
    ...committedActiveSession,
  });
}

export function clearActiveSessionCommitted(
  reason: "explicit-leave" | "removed" | "table-closed" | "unknown",
  detail: Record<string, unknown> = {},
): void {
  const prior = committedActiveSession;
  committedActiveSession = null;
  recordSessionLifecycleEvent("GENERIC", {
    marker: "ACTIVE_SESSION_CLEARED",
    reason,
    priorCommitted: prior,
    ...detail,
  });
}

export function getCommittedActiveSession(): typeof committedActiveSession {
  return committedActiveSession;
}

export function recordSessionLifecycleEvent(
  kind: SessionLifecycleEventKind,
  detail: Record<string, unknown> = {},
  ctxOverride?: Partial<SessionLifecycleContext>,
): void {
  loadFromStorage();
  const ts = Date.now();
  const ctx: Partial<SessionLifecycleContext> = {
    ...ambient,
    ...(ctxOverride ?? {}),
    route: ctxOverride?.route ?? ambient.route ?? currentRoute(),
    hasCommittedActiveSession: committedActiveSession != null,
  };
  seqCounter += 1;
  const evt: SessionLifecycleEvent = {
    seq: seqCounter,
    ts,
    kind,
    ctx,
    detail: {
      ...detail,
      _online: typeof navigator !== "undefined" ? navigator.onLine : null,
      _visibility:
        typeof document !== "undefined" ? document.visibilityState : null,
    },
  };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) {
    buffer.splice(0, buffer.length - MAX_EVENTS);
  }
  if (INCIDENT_KINDS.has(kind)) {
    const key = makeIncidentKey(kind as SessionIncidentKind, ctx, ts);
    incidents.push({
      seq: evt.seq,
      ts,
      kind: kind as SessionIncidentKind,
      key,
      ctx,
      detail: evt.detail,
    });
    if (incidents.length > MAX_INCIDENTS) {
      incidents.splice(0, incidents.length - MAX_INCIDENTS);
    }
  }
  persist();
}

/**
 * Convenience: record an incident marker with active-session context
 * automatically merged in.
 */
export function recordSessionIncident(
  kind: SessionIncidentKind,
  detail: Record<string, unknown> = {},
): void {
  recordSessionLifecycleEvent(kind, {
    ...detail,
    committedActiveSession,
  });
}

export function readSessionLifecycleEvents(): SessionLifecycleEvent[] {
  loadFromStorage();
  return buffer.slice();
}

export function readSessionIncidents(): SessionIncidentEntry[] {
  loadFromStorage();
  return incidents.slice();
}

export function exportSessionLifecycleTrace(): string {
  loadFromStorage();
  return JSON.stringify(
    {
      version: LEDGER_VERSION,
      clientInstanceId: getClientInstanceId(),
      tabSessionId: getTabSessionId(),
      exportedAt: Date.now(),
      route: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      committedActiveSession,
      ambient,
      incidents,
      events: buffer,
    },
    null,
    2,
  );
}

export function clearSessionLifecycleTrace(): void {
  buffer = [];
  incidents = [];
  seqCounter = 0;
  persist();
}

// ── Boot-time listeners ────────────────────────────────────────────

export function installSessionLifecycleListeners(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  loadFromStorage();

  recordSessionLifecycleEvent("BOOT", {
    clientInstanceId: getClientInstanceId(),
    tabSessionId: getTabSessionId(),
    href: window.location.href,
    referrer: typeof document !== "undefined" ? document.referrer : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });

  // History API patch. We patch on top of any existing patch (e.g.
  // authEjectionLedger) — both patches will fire in sequence.
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = function patchedPush(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try {
      recordSessionLifecycleEvent("ROUTE_HISTORY_PUSH", {
        from: currentRoute(),
        to: url == null ? null : String(url),
      });
    } catch {
      /* noop */
    }
    return origPush(data as never, unused, url as never);
  } as typeof window.history.pushState;
  window.history.replaceState = function patchedReplace(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try {
      recordSessionLifecycleEvent("ROUTE_HISTORY_REPLACE", {
        from: currentRoute(),
        to: url == null ? null : String(url),
      });
    } catch {
      /* noop */
    }
    return origReplace(data as never, unused, url as never);
  } as typeof window.history.replaceState;

  window.addEventListener("popstate", () => {
    recordSessionLifecycleEvent("ROUTE_POPSTATE", {
      to: currentRoute(),
    });
  });

  window.addEventListener("error", (event: ErrorEvent) => {
    recordSessionIncident("FATAL_RENDER_OR_PROMISE_REJECTION", {
      source: "window.onerror",
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack:
        event.error && (event.error as Error).stack
          ? String((event.error as Error).stack)
          : null,
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason as unknown;
    recordSessionIncident("FATAL_RENDER_OR_PROMISE_REJECTION", {
      source: "unhandledrejection",
      message:
        reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message: unknown }).message)
          : String(reason ?? "unknown"),
      stack:
        reason && typeof reason === "object" && "stack" in reason
          ? String((reason as { stack: unknown }).stack)
          : null,
    });
  });

  window.addEventListener("pageshow", (event: PageTransitionEvent) => {
    recordSessionLifecycleEvent("PAGE_SHOW", {
      persisted: event.persisted,
    });
  });
  window.addEventListener("pagehide", (event: PageTransitionEvent) => {
    recordSessionLifecycleEvent("PAGE_HIDE", {
      persisted: event.persisted,
    });
  });
  window.addEventListener("online", () =>
    recordSessionLifecycleEvent("ONLINE_STATUS", { online: true }),
  );
  window.addEventListener("offline", () =>
    recordSessionLifecycleEvent("ONLINE_STATUS", { online: false }),
  );
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      recordSessionLifecycleEvent("VISIBILITY_CHANGE", {
        state: document.visibilityState,
      });
    });
  }
}

// ── Typed helpers for callers ──────────────────────────────────────

export function recordRouteChange(
  from: string | null,
  to: string | null,
  source: string,
): void {
  recordSessionLifecycleEvent("ROUTE_CHANGE", { from, to, source });
}

export function recordShellMount(
  component: string,
  detail: Record<string, unknown> = {},
): void {
  recordSessionLifecycleEvent("SHELL_MOUNT", { component, ...detail });
}

export function recordShellUnmount(
  component: string,
  detail: Record<string, unknown> = {},
): void {
  recordSessionLifecycleEvent("SHELL_UNMOUNT", { component, ...detail });
  try {
    // Bridge to chat-operation boundary so an in-flight chat op sees the
    // teardown even if the shell hosting the pill is gone.
    void import("./chatOperations/chatOperationBoundary").then(({ recordChatBoundaryEvent }) => {
      recordChatBoundaryEvent("SHELL_UNMOUNT_CONTEXT", {
        source: `sessionLifecycleLedger.recordShellUnmount:${component}`,
        component,
        ...detail,
      });
    }).catch(() => {});
  } catch { /* noop */ }
  if (committedActiveSession) {
    recordSessionIncident("ACTIVE_SESSION_SHELL_UNMOUNTED", {
      component,
      ...detail,
    });
  }
}

export function recordChatRealtimeCallbackBegin(
  detail: Record<string, unknown> = {},
): void {
  recordSessionLifecycleEvent("CHAT_REALTIME_CALLBACK_BEGIN", detail);
}

export function recordChatRealtimeCallbackEnd(
  detail: Record<string, unknown> = {},
): void {
  recordSessionLifecycleEvent("CHAT_REALTIME_CALLBACK_END", detail);
}
