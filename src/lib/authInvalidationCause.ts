/**
 * AUTH_SESSION_INVALIDATION_CAUSE — source-level attribution for every
 * unexpected Supabase SIGNED_OUT event.
 *
 * Unlike authEjectionLedger (which records downstream *redirects* to /auth),
 * this module records the *cause* of session invalidation — prior token
 * lifetime, callback label, whether signOut() was invoked in-app and by
 * whom, auth-storage key mutation, refresh outcome, tab visibility, and
 * the pre-navigation recovery guard decision.
 *
 * Deliberately narrow surface: `markIntentionalSignOut()` +
 * `recordAuthSessionInvalidationCause()` + read helpers. No listeners,
 * no side effects on auth or navigation.
 */

const STORAGE_KEY = "auth-session-invalidation-cause:v1";
const MAX_RECORDS = 100;
const INTENTIONAL_WINDOW_MS = 10_000;

export type RefreshOutcome =
  | "not-attempted"
  | "recovered"
  | "no-session"
  | "error";

export interface AuthSessionInvalidationCause {
  ts: number;
  supabaseEvent: string;
  callbackLabel: string;
  intentional: boolean;
  intentionalCaller: string | null;
  priorTokenExpiresAt: number | null;
  priorTokenLifetimeRemainingMs: number | null;
  refreshTokenPresent: boolean | null;
  authStorageKey: string | null;
  authStorageMutation: {
    removedAt: number | null;
    lastWriteAt: number | null;
    source: string | null;
  } | null;
  refreshAttempt: {
    startedAt: number | null;
    finishedAt: number | null;
    outcome: RefreshOutcome;
    error: string | null;
  };
  visibility: string | null;
  online: boolean | null;
  broadcastOrigin: string | null;
  sessionNullTiming: "before-cleanup" | "after-cleanup" | "unknown";
  recoveryGuardDecision:
    | "kept-route-recovering"
    | "kept-route-lease"
    | "redirected-no-session"
    | "redirected-intentional"
    | "unknown";
  route: string | null;
  userId: string | null;
}

interface IntentionalMarker {
  caller: string;
  at: number;
}

let intentionalMarker: IntentionalMarker | null = null;
let lastAuthStorageWriteAt: number | null = null;
let lastAuthStorageRemovedAt: number | null = null;
let lastAuthStorageSource: string | null = null;

/** Call immediately before `supabase.auth.signOut()` so the guard can
 *  classify the subsequent SIGNED_OUT event as intentional. */
export function markIntentionalSignOut(caller: string): void {
  intentionalMarker = { caller, at: Date.now() };
}

export function consumeIntentionalSignOut(): IntentionalMarker | null {
  const m = intentionalMarker;
  if (!m) return null;
  if (Date.now() - m.at > INTENTIONAL_WINDOW_MS) {
    intentionalMarker = null;
    return null;
  }
  intentionalMarker = null;
  return m;
}

export function peekIntentionalSignOut(): IntentionalMarker | null {
  if (!intentionalMarker) return null;
  if (Date.now() - intentionalMarker.at > INTENTIONAL_WINDOW_MS) {
    intentionalMarker = null;
    return null;
  }
  return intentionalMarker;
}

function findSupabaseAuthStorageKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return k;
    }
  } catch { /* noop */ }
  return null;
}

/** Passive observer for the Supabase auth-storage key. Installed once. */
let storageListenerInstalled = false;
export function installAuthStorageWatcher(): void {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  try {
    window.addEventListener("storage", (ev: StorageEvent) => {
      if (!ev.key || !ev.key.startsWith("sb-") || !ev.key.endsWith("-auth-token")) return;
      if (ev.newValue == null) {
        lastAuthStorageRemovedAt = Date.now();
        lastAuthStorageSource = "cross-tab-storage-event";
      } else {
        lastAuthStorageWriteAt = Date.now();
        lastAuthStorageSource = "cross-tab-storage-event";
      }
    });
  } catch { /* noop */ }
}

function loadAll(): AuthSessionInvalidationCause[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveAll(records: AuthSessionInvalidationCause[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = records.slice(-MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

export interface RecordCauseInput {
  supabaseEvent: string;
  callbackLabel: string;
  priorTokenExpiresAt: number | null;
  refreshTokenPresent: boolean | null;
  refreshAttempt: AuthSessionInvalidationCause["refreshAttempt"];
  sessionNullTiming?: AuthSessionInvalidationCause["sessionNullTiming"];
  recoveryGuardDecision: AuthSessionInvalidationCause["recoveryGuardDecision"];
  userId: string | null;
  broadcastOrigin?: string | null;
}

export function recordAuthSessionInvalidationCause(input: RecordCauseInput): void {
  const intentional = consumeIntentionalSignOut();
  const nowMs = Date.now();
  const rec: AuthSessionInvalidationCause = {
    ts: nowMs,
    supabaseEvent: input.supabaseEvent,
    callbackLabel: input.callbackLabel,
    intentional: !!intentional,
    intentionalCaller: intentional?.caller ?? null,
    priorTokenExpiresAt: input.priorTokenExpiresAt,
    priorTokenLifetimeRemainingMs:
      input.priorTokenExpiresAt != null
        ? input.priorTokenExpiresAt * 1000 - nowMs
        : null,
    refreshTokenPresent: input.refreshTokenPresent,
    authStorageKey: findSupabaseAuthStorageKey(),
    authStorageMutation: {
      removedAt: lastAuthStorageRemovedAt,
      lastWriteAt: lastAuthStorageWriteAt,
      source: lastAuthStorageSource,
    },
    refreshAttempt: input.refreshAttempt,
    visibility: typeof document !== "undefined" ? document.visibilityState : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    broadcastOrigin: input.broadcastOrigin ?? null,
    sessionNullTiming: input.sessionNullTiming ?? "unknown",
    recoveryGuardDecision: input.recoveryGuardDecision,
    route: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
    userId: input.userId,
  };
  const all = loadAll();
  all.push(rec);
  saveAll(all);
}

export function readAuthSessionInvalidationCauses(): AuthSessionInvalidationCause[] {
  return loadAll();
}

export function exportAuthSessionInvalidationTrace(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: Date.now(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      records: loadAll(),
    },
    null,
    2,
  );
}

export function clearAuthSessionInvalidationTrace(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
