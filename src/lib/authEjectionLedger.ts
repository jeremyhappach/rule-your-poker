/**
 * AUTH_EJECTION_LEDGER — wartime instrumentation.
 *
 * Retained, exportable ring buffer that survives navigation to /auth so we
 * can forensically reconstruct why a user was ejected from an active table
 * back to the login screen. Behavior-change-free: this module ONLY records
 * events and installs a passive history listener. It never redirects,
 * signs out, or mutates auth / recovery / waiting-table state.
 *
 * Persisted in localStorage under a per-browser-session key so the trace
 * remains exportable after landing on /auth.
 */

const LEDGER_VERSION = 1;
const SESSION_KEY = "auth-ejection-ledger:session-id";
const STORAGE_PREFIX = "auth-ejection-ledger:";
const MAX_EVENTS = 500;
const RETAIN_MS = 60_000;

export type AuthEjectionEventKind =
  | "AUTH_STATE_CHANGE"
  | "ROUTE_REDIRECT"
  | "WAITING_TABLE_LIFECYCLE"
  | "SESSION_RECOVERY_LEASE"
  | "AUTH_REDIRECT_BLOCKED"
  | "BOOT";

export interface AuthEjectionEvent {
  ts: number;
  kind: AuthEjectionEventKind;
  detail: Record<string, unknown>;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "no-storage";
  }
}

function storageKey(): string {
  return `${STORAGE_PREFIX}${getSessionId()}`;
}

let buffer: AuthEjectionEvent[] = [];
let loaded = false;
let historyPatched = false;

function loadFromStorage(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.events)) {
      buffer = parsed.events.slice(-MAX_EVENTS);
    }
  } catch {
    /* noop */
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    // Keep at least the last RETAIN_MS window, but never let the persisted
    // buffer grow beyond MAX_EVENTS to bound storage cost.
    const trimmed = buffer.filter((e) => now - e.ts <= RETAIN_MS).slice(-MAX_EVENTS);
    // If time-window filter dropped everything, retain the last 25 events
    // anyway so post-mortem after long idle still shows the ejection tail.
    const tail = trimmed.length > 0 ? trimmed : buffer.slice(-25);
    window.localStorage.setItem(
      storageKey(),
      JSON.stringify({
        version: LEDGER_VERSION,
        sessionId: getSessionId(),
        savedAt: now,
        events: tail,
      }),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

export function appendAuthEjectionEvent(
  kind: AuthEjectionEventKind,
  detail: Record<string, unknown> = {},
): void {
  loadFromStorage();
  const evt: AuthEjectionEvent = {
    ts: Date.now(),
    kind,
    detail: {
      ...detail,
      route:
        typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      visibility: typeof document !== "undefined" ? document.visibilityState : null,
    },
  };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  persist();
}

export function readAuthEjectionEvents(): AuthEjectionEvent[] {
  loadFromStorage();
  return buffer.slice();
}

export function exportAuthEjectionTrace(): string {
  loadFromStorage();
  return JSON.stringify(
    {
      version: LEDGER_VERSION,
      sessionId: getSessionId(),
      exportedAt: Date.now(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      route: typeof window !== "undefined" ? window.location.href : null,
      events: buffer,
    },
    null,
    2,
  );
}

export function clearAuthEjectionTrace(): void {
  buffer = [];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKey());
    } catch {
      /* noop */
    }
  }
}

/**
 * Passively records every history navigation into the ledger so that
 * every ROUTE_REDIRECT (including the ejection one) is captured even if
 * the calling site did not explicitly report a reason. Called sites can
 * still call `recordRouteRedirect` with a `reason`/`caller` label to
 * enrich the record; the auto-capture is a safety net.
 */
export function installAuthEjectionHistoryListener(): void {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  loadFromStorage();

  const emit = (source: string, to: string) => {
    appendAuthEjectionEvent("ROUTE_REDIRECT", {
      from: window.location.pathname + window.location.search,
      to,
      source,
      caller: null,
      reason: "history-auto-capture",
    });
  };

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPush(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try {
      if (url != null) emit("history.pushState", String(url));
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
      if (url != null) emit("history.replaceState", String(url));
    } catch {
      /* noop */
    }
    return origReplace(data as never, unused, url as never);
  } as typeof window.history.replaceState;

  window.addEventListener("popstate", () => {
    appendAuthEjectionEvent("ROUTE_REDIRECT", {
      from: null,
      to: window.location.pathname + window.location.search,
      source: "popstate",
      caller: null,
      reason: "browser-back-or-forward",
    });
  });

  appendAuthEjectionEvent("BOOT", {
    sessionId: getSessionId(),
    href: window.location.href,
  });
}

// ── Typed helpers for callers ────────────────────────────────────────

export interface AuthStateChangeInput {
  previousState: string | null;
  nextState: string;
  supabaseEvent?: string | null;
  sessionBefore: boolean;
  sessionAfter: boolean;
  accessTokenExpiresAt?: number | null;
  refreshTokenPresent?: boolean | null;
  userId?: string | null;
  callerLabel: string;
}

export function recordAuthStateChange(input: AuthStateChangeInput): void {
  appendAuthEjectionEvent("AUTH_STATE_CHANGE", input as unknown as Record<string, unknown>);
}

export interface RouteRedirectInput {
  from: string;
  to: string;
  reason: string;
  caller: string;
  dealerGameId?: string | null;
  sessionId?: string | null;
  playerId?: string | null;
  waitingLobbyState?: Record<string, unknown> | null;
}

export function recordRouteRedirect(input: RouteRedirectInput): void {
  appendAuthEjectionEvent("ROUTE_REDIRECT", input as unknown as Record<string, unknown>);
}

export interface WaitingTableLifecycleInput {
  phase:
    | "mount"
    | "unmount"
    | "lookup-start"
    | "lookup-ok"
    | "lookup-missing"
    | "membership-ok"
    | "membership-missing"
    | "session-ended"
    | "realtime-error"
    | "fetch-error"
    | "stale-branch";
  dealerGameId?: string | null;
  userId?: string | null;
  detail?: Record<string, unknown>;
}

export function recordWaitingTableLifecycle(input: WaitingTableLifecycleInput): void {
  appendAuthEjectionEvent("WAITING_TABLE_LIFECYCLE", {
    ...input,
    ...(input.detail ?? {}),
  });
}

export interface SessionRecoveryLeaseInput {
  action: "acquire" | "release" | "expire" | "reject";
  reason: string;
  oldDealerGameId?: string | null;
  newDealerGameId?: string | null;
  routeFallbackRequested?: boolean;
  authRedirectRequested?: boolean;
  detail?: Record<string, unknown>;
}

export function recordSessionRecoveryLease(input: SessionRecoveryLeaseInput): void {
  appendAuthEjectionEvent("SESSION_RECOVERY_LEASE", {
    ...input,
    ...(input.detail ?? {}),
  });
}

export interface AuthRedirectBlockedInput {
  caller: string;
  hasValidSession: boolean;
  hasWaitingTableMembership: boolean;
  hasActiveRecoveryLease: boolean;
  userId?: string | null;
  dealerGameId?: string | null;
  guardInputs?: Record<string, unknown> | null;
  note?: string;
}

export function recordAuthRedirectBlocked(input: AuthRedirectBlockedInput): void {
  appendAuthEjectionEvent("AUTH_REDIRECT_BLOCKED", input as unknown as Record<string, unknown>);
}

/**
 * Diagnostic guard used by call sites that are about to navigate to
 * `/auth`. It never blocks the redirect — the "BLOCKED" name refers to
 * the *class of condition* worth investigating, and the ledger event
 * flags any attempt to eject while a plausibly-valid session, waiting
 * membership, or recovery lease still exists.
 */
export function noteAuthRedirectAttempt(input: AuthRedirectBlockedInput): void {
  if (
    input.hasValidSession ||
    input.hasWaitingTableMembership ||
    input.hasActiveRecoveryLease
  ) {
    recordAuthRedirectBlocked(input);
  }
}
