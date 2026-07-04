/**
 * runtimeTracer — authoritative server-persisted client instrumentation.
 *
 * All chat / voice / session / routing / shell / realtime events flow
 * through this module and are persisted to the Supabase tables:
 *   - client_runtime_instances
 *   - client_runtime_events
 *   - client_runtime_incidents
 *   - chat_message_delivery_trace
 *
 * The browser-local ledgers (sessionLifecycleLedger, chatDeliveryLedger,
 * authEjectionLedger) remain as a short-term buffer / retry queue but
 * are no longer the source of truth.
 *
 * Design:
 *   - One `clientInstanceId` persisted per browser (localStorage),
 *     one `tabSessionId` per tab (sessionStorage).
 *   - Events are batched (max 20 or 800ms) then flushed via
 *     `supabase.from('client_runtime_events').insert(batch)`.
 *   - Critical events (`severity: 'critical'`) trigger an immediate flush.
 *   - Failed writes are re-queued with retry counters and re-attempted on
 *     boot, reconnect, visibilitychange, and before pagehide.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  appendCapsuleEvent,
  bootVoiceCrashCapsule,
  closeCapsule,
  onAuthenticatedSessionRestored,
  openCapsule,
} from "@/lib/runtimeInstrumentation/voiceCrashCapsule";

const APP_BUILD_ID =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_APP_BUILD_ID ?? "dev";
const APP_PUBLISH_VERSION =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_PUBLISH_VERSION ?? null;

const CLIENT_INSTANCE_KEY = "runtime-tracer:client-instance-id";
const TAB_SESSION_KEY = "runtime-tracer:tab-session-id";
const RETRY_QUEUE_KEY = "runtime-tracer:retry-queue-v1";
const INCIDENT_KEY = "runtime-tracer:active-incident-v1";
const RETRY_QUEUE_MAX = 500;
const BATCH_MAX = 20;
const BATCH_INTERVAL_MS = 800;

const SUPABASE_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * Events that must reach the server even if the tab is about to be
 * killed/discarded/relaunched. They are flushed synchronously via
 * `fetch(..., {keepalive:true})` instead of the batched supabase-js path.
 */
const IMMEDIATE_EVENT_NAMES = new Set<string>([
  // Voice boundaries
  "VOICE_CAPTURE_START",
  "VOICE_CAPTURE_STARTED",
  "VOICE_CAPTURE_STOP_REQUESTED",
  "VOICE_RECORDING_HEARTBEAT",
  "VOICE_STOP_BUTTON_TAPPED",
  "VOICE_SEND_BUTTON_TAPPED_WHILE_RECORDING",
  "VOICE_STOP_HANDLER_ENTERED",
  "VOICE_STOP_HANDLER_EXITED",
  "VOICE_MEDIARECORDER_STOP_CALLED",
  "VOICE_MEDIARECORDER_ONSTOP_ENTERED",
  "VOICE_MEDIARECORDER_DATAAVAILABLE",
  "VOICE_BLOB_READY",
  "VOICE_ENCODE_START",
  "VOICE_ENCODE_COMPLETE",
  "VOICE_FN_INVOKE_START",
  "VOICE_FN_INVOKE_RESPONSE",
  "VOICE_FN_INVOKE_ERROR",
  "VOICE_FINALIZE_RETURN",
  "VOICE_SEND_BEGIN",
  "VOICE_SEND_COMPLETE",
  "VOICE_SEND_BLOCKED",
  // Page lifetime
  "PAGE_VISIBILITY_CHANGE",
  "PAGE_HIDE",
  "PAGE_SHOW",
  "BEFORE_UNLOAD",
  "UNLOAD",
  "FREEZE",
  "RESUME",
  "WINDOW_ERROR",
  "UNHANDLED_REJECTION",
  "ERROR_BOUNDARY_CAUGHT",
  "BOOT",
  "BOOT_RECOVERY_REPLAY",
  "BOOT_RECOVERED_OPEN_INCIDENT",
  // Session/route markers
  "ROUTE_REDIRECT",
  "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK",
  "ACTIVE_SESSION_ROUTE_EJECTED",
  "ACTIVE_SESSION_SHELL_UNMOUNTED",
  "ACTIVE_SESSION_AUTH_REDIRECT",
  "PERSISTED_SESSION_RESTORE_FAILED",
  // Network state + capsule lifecycle boundaries
  "NETWORK_ONLINE",
  "NETWORK_OFFLINE",
  "NETWORK_STATUS_SNAPSHOT",
  "VOICE_REQUEST_NETWORK_FAILURE",
  "DB_CRITICAL_WRITE_NETWORK_FAILURE",
  "CAPSULE_PERSISTED_LOCAL",
  "CAPSULE_UPLOAD_STARTED",
  "CAPSULE_UPLOAD_COMPLETED",
  "CAPSULE_UPLOAD_FAILED",
  "CAPSULE_RECOVERED_AFTER_BOOT",
]);

/**
 * Voice / lifecycle event names that carry an incident correlation_id
 * and should live-patch the client_runtime_incidents row (last_event_at,
 * last_voice_phase, last_lifecycle_event, last_error_*).
 */
const INCIDENT_PATCH_FAMILIES = new Set<string>([
  "voice",
  "environment",
  "fatal",
  "session",
  "route",
]);

type Severity = "debug" | "info" | "warn" | "error" | "critical";

export interface RuntimeEventInput {
  event_family: string;
  event_name: string;
  severity?: Severity;
  correlation_id?: string | null;
  message_id?: string | null;
  voice_operation_id?: string | null;
  game_id?: string | null;
  table_id?: string | null;
  dealer_game_id?: string | null;
  session_id?: string | null;
  route?: string | null;
  active_tab?: string | null;
  game_status?: string | null;
  game_type?: string | null;
  is_committed_active_session?: boolean | null;
  payload?: Record<string, unknown>;
  error?: unknown;
}

export interface IncidentInput {
  incident_type: string;
  severity?: Severity;
  summary?: string | null;
  root_cause_status?: string | null;
  correlation_id?: string | null;
  message_id?: string | null;
  voice_operation_id?: string | null;
  game_id?: string | null;
  table_id?: string | null;
  session_id?: string | null;
  payload?: Record<string, unknown>;
  breadcrumb_event_ids?: string[];
}

export interface DeliveryTraceUpsert {
  message_id: string;
  recipient_client_instance_id?: string; // defaults to self
  correlation_id?: string | null;
  sender_user_id?: string | null;
  sender_client_instance_id?: string | null;
  sender_tab_session_id?: string | null;
  sender_device_label?: string | null;
  recipient_user_id?: string | null;
  recipient_tab_session_id?: string | null;
  recipient_device_label?: string | null;
  game_id?: string | null;
  table_id?: string | null;
  session_id?: string | null;
  dealer_game_id?: string | null;
  source_type?: string | null;
  is_voice?: boolean;
  voice_operation_id?: string | null;
  send_intent_at?: string | null;
  optimistic_created_at?: string | null;
  db_insert_start_at?: string | null;
  db_insert_success_at?: string | null;
  db_insert_failure_at?: string | null;
  authoritative_row_at?: string | null;
  realtime_broadcast_at?: string | null;
  recipient_realtime_receipt_at?: string | null;
  recipient_store_admission_at?: string | null;
  recipient_panel_selector_at?: string | null;
  recipient_dom_mount_at?: string | null;
  recipient_unread_evaluated_at?: string | null;
  recipient_icon_pulse_at?: string | null;
  recipient_persistent_unread_at?: string | null;
  recipient_read_at?: string | null;
  recipient_ack_source?: string | null;
  delivery_status?: string | null;
  render_status?: string | null;
  unread_status?: string | null;
  failure_reason?: string | null;
  payload?: Record<string, unknown>;
}

// ── ID helpers ─────────────────────────────────────────────────────

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeGetItem(store: Storage | undefined, key: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
function safeSetItem(store: Storage | undefined, key: string, value: string) {
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    /* noop */
  }
}

function getStorages(): { local?: Storage; session?: Storage } {
  if (typeof window === "undefined") return {};
  try {
    return { local: window.localStorage, session: window.sessionStorage };
  } catch {
    return {};
  }
}

let cachedClientInstanceId: string | null = null;
let cachedTabSessionId: string | null = null;

export function getClientInstanceId(): string {
  if (cachedClientInstanceId) return cachedClientInstanceId;
  const { local } = getStorages();
  let id = safeGetItem(local, CLIENT_INSTANCE_KEY);
  if (!id) {
    id = randomId("ci");
    safeSetItem(local, CLIENT_INSTANCE_KEY, id);
  }
  cachedClientInstanceId = id;
  return id;
}

export function getTabSessionId(): string {
  if (cachedTabSessionId) return cachedTabSessionId;
  const { session } = getStorages();
  let id = safeGetItem(session, TAB_SESSION_KEY);
  if (!id) {
    id = randomId("tab");
    safeSetItem(session, TAB_SESSION_KEY, id);
  }
  cachedTabSessionId = id;
  return id;
}

// ── Ambient context ────────────────────────────────────────────────

interface AmbientContext {
  user_id: string | null;
  display_name: string | null;
  route: string | null;
  active_tab: string | null;
  game_id: string | null;
  table_id: string | null;
  dealer_game_id: string | null;
  session_id: string | null;
  game_status: string | null;
  game_type: string | null;
  is_committed_active_session: boolean | null;
  device_label: string | null;
}

const ambient: AmbientContext = {
  user_id: null,
  display_name: null,
  route: null,
  active_tab: null,
  game_id: null,
  table_id: null,
  dealer_game_id: null,
  session_id: null,
  game_status: null,
  game_type: null,
  is_committed_active_session: null,
  device_label: null,
};

export function setRuntimeAmbient(partial: Partial<AmbientContext>): void {
  let changed = false;
  let userIdBecameSet = false;
  (Object.keys(partial) as (keyof AmbientContext)[]).forEach((k) => {
    const v = partial[k];
    if (v === undefined) return;
    const bag = ambient as unknown as Record<string, unknown>;
    if (bag[k as string] !== v) {
      if (k === "user_id" && !bag[k as string] && v) userIdBecameSet = true;
      bag[k as string] = v as unknown;
      changed = true;
    }
  });
  if (changed) {
    scheduleInstanceHeartbeat();
  }
  if (userIdBecameSet) {
    void runOpenIncidentScan();
    // Flush any local capsules that outlived a signed-out interval or
    // were captured under an anonymous client_instance_id.
    try {
      onAuthenticatedSessionRestored((name, severity, payload) => {
        recordRuntimeEvent({
          event_family: "environment",
          event_name: name,
          severity: severity as Severity,
          payload,
        });
      });
    } catch { /* diagnostic; swallow */ }
  }
}

// ── UA parsing (best-effort) ───────────────────────────────────────

function parseUA(): { browser: string | null; browser_version: string | null; os: string | null; os_version: string | null; device_type: string | null } {
  if (typeof navigator === "undefined") {
    return { browser: null, browser_version: null, os: null, os_version: null, device_type: null };
  }
  const ua = navigator.userAgent;
  let browser: string | null = null;
  let browser_version: string | null = null;
  let os: string | null = null;
  let os_version: string | null = null;
  const m =
    /(Edg|OPR|Chrome|Firefox|CriOS|FxiOS|Safari)\/([0-9.]+)/.exec(ua);
  if (m) {
    browser = m[1] === "CriOS" ? "Chrome-iOS" : m[1] === "FxiOS" ? "Firefox-iOS" : m[1];
    browser_version = m[2];
  }
  if (/Windows NT ([0-9._]+)/.test(ua)) {
    os = "Windows";
    os_version = /Windows NT ([0-9._]+)/.exec(ua)?.[1] ?? null;
  } else if (/Mac OS X ([0-9._]+)/.test(ua)) {
    os = "macOS";
    os_version = /Mac OS X ([0-9._]+)/.exec(ua)?.[1]?.replace(/_/g, ".") ?? null;
  } else if (/Android ([0-9.]+)/.test(ua)) {
    os = "Android";
    os_version = /Android ([0-9.]+)/.exec(ua)?.[1] ?? null;
  } else if (/iPhone OS ([0-9_]+)/.test(ua) || /iPad; CPU OS ([0-9_]+)/.test(ua)) {
    os = "iOS";
    os_version = (/iPhone OS ([0-9_]+)/.exec(ua)?.[1] ??
      /iPad; CPU OS ([0-9_]+)/.exec(ua)?.[1] ??
      "").replace(/_/g, ".");
  } else if (/Linux/.test(ua)) {
    os = "Linux";
  }
  const device_type = /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop";
  return { browser, browser_version, os, os_version, device_type };
}

// ── Instance registration + heartbeat ──────────────────────────────

let instanceRegistered = false;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

function currentRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return null;
  }
}

async function upsertInstance(): Promise<void> {
  if (typeof window === "undefined") return;
  const ua = parseUA();
  const row = {
    client_instance_id: getClientInstanceId(),
    tab_session_id: getTabSessionId(),
    user_id: ambient.user_id,
    display_name: ambient.display_name,
    device_label: ambient.device_label,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    browser: ua.browser,
    browser_version: ua.browser_version,
    os: ua.os,
    os_version: ua.os_version,
    device_type: ua.device_type,
    app_build_id: APP_BUILD_ID,
    app_publish_version: APP_PUBLISH_VERSION,
    last_seen_at: new Date().toISOString(),
    last_route: ambient.route ?? currentRoute(),
    last_game_id: ambient.game_id,
    last_table_id: ambient.table_id,
    last_dealer_game_id: ambient.dealer_game_id,
    last_committed_session_id: ambient.session_id,
    last_visibility_state:
      typeof document !== "undefined" ? document.visibilityState : null,
    last_online_state:
      typeof navigator !== "undefined" ? navigator.onLine : null,
    last_known_chat_tab_state: ambient.active_tab,
    origin:
      typeof window !== "undefined" ? window.location.origin : null,
    document_was_discarded:
      typeof document !== "undefined"
        ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? null
        : null,
    active_incident_id: getActiveRuntimeIncidentId(),
    last_lifecycle_event: lastLifecycleEventName,
  };
  try {
    await supabase
      .from("client_runtime_instances")
      .upsert(row as never, { onConflict: "client_instance_id" });
    instanceRegistered = true;
  } catch {
    /* swallow; heartbeat retries */
  }
}

function scheduleInstanceHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    void upsertInstance();
  }, 2000);
}

/**
 * Force an immediate instance-heartbeat write (bypasses the 2s debounce).
 * Called at boot, at every voice-capture start, and at every lifecycle
 * boundary so `client_runtime_instances` reflects real-time state.
 */
export function forceInstanceHeartbeat(lifecycleLabel?: string): void {
  if (lifecycleLabel) lastLifecycleEventName = lifecycleLabel;
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  void upsertInstance();
}

let lastLifecycleEventName: string | null = null;

// ── Event queue + flusher ──────────────────────────────────────────

interface QueuedEvent {
  occurred_at_client: string;
  occurred_at_server?: string;
  client_instance_id: string;
  tab_session_id: string | null;
  user_id: string | null;
  game_id: string | null;
  table_id: string | null;
  dealer_game_id: string | null;
  session_id: string | null;
  message_id: string | null;
  voice_operation_id: string | null;
  correlation_id: string | null;
  event_family: string;
  event_name: string;
  severity: Severity;
  route: string | null;
  active_tab: string | null;
  game_status: string | null;
  game_type: string | null;
  is_committed_active_session: boolean | null;
  visibility_state: string | null;
  online_state: boolean | null;
  payload: Record<string, unknown> | null;
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
  __retry_count?: number;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function loadRetryQueue() {
  const { local } = getStorages();
  const raw = safeGetItem(local, RETRY_QUEUE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as QueuedEvent[];
    if (Array.isArray(parsed)) {
      queue.push(...parsed.slice(-RETRY_QUEUE_MAX));
    }
  } catch {
    /* noop */
  }
  safeSetItem(local, RETRY_QUEUE_KEY, "[]");
}

function persistRetryQueue() {
  const { local } = getStorages();
  if (!local) return;
  const toStore = queue.slice(-RETRY_QUEUE_MAX);
  safeSetItem(local, RETRY_QUEUE_KEY, JSON.stringify(toStore));
}

// ── Runtime incident id (survives tab replacement / relaunch) ──────

interface ActiveIncident {
  id: string;
  kind: string;
  started_at: string;
  meta: Record<string, unknown>;
}

let cachedIncident: ActiveIncident | null = null;
let incidentLoaded = false;

function loadIncident(): ActiveIncident | null {
  if (incidentLoaded) return cachedIncident;
  incidentLoaded = true;
  const { local } = getStorages();
  const raw = safeGetItem(local, INCIDENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveIncident;
    if (parsed && typeof parsed.id === "string") {
      cachedIncident = parsed;
      return parsed;
    }
  } catch {
    /* noop */
  }
  return null;
}

function persistIncident(incident: ActiveIncident | null) {
  const { local } = getStorages();
  if (!local) return;
  if (incident) {
    safeSetItem(local, INCIDENT_KEY, JSON.stringify(incident));
  } else {
    try { local.removeItem(INCIDENT_KEY); } catch { /* noop */ }
  }
}

export function beginRuntimeIncident(
  kind: string,
  meta: Record<string, unknown> = {},
): string {
  loadIncident();
  const id = randomId("inc");
  cachedIncident = {
    id,
    kind,
    started_at: new Date().toISOString(),
    meta,
  };
  persistIncident(cachedIncident);
  // Open a DB row immediately so cross-origin recovery can find it.
  void openDbIncidentRow(id, kind, meta);
  // Open the durable local IndexedDB capsule for this incident. Every
  // downstream event that carries this correlation_id will be appended
  // there first, so the causal chain survives connectivity loss.
  void openCapsule(id, {
    clientInstanceId: getClientInstanceId(),
    tabSessionId: getTabSessionId(),
    origin: typeof window !== "undefined" ? window.location.origin : null,
    route: currentRoute(),
    userId: ambient.user_id,
    opened_at: cachedIncident.started_at,
    openedTsMs: Date.now(),
    extra: meta,
  });
  return id;
}

export function endRuntimeIncident(reason?: string): string | null {
  loadIncident();
  const id = cachedIncident?.id ?? null;
  if (cachedIncident && reason) {
    cachedIncident = { ...cachedIncident, meta: { ...cachedIncident.meta, endReason: reason } };
  }
  if (id) {
    void closeDbIncidentRow(id, reason ?? "ended");
    void closeCapsule(id, reason ?? "ended");
  }
  cachedIncident = null;
  persistIncident(null);
  return id;
}

export function getActiveRuntimeIncidentId(): string | null {
  loadIncident();
  return cachedIncident?.id ?? null;
}

export function getActiveRuntimeIncident(): ActiveIncident | null {
  loadIncident();
  return cachedIncident;
}

// ── Keepalive transport (crash-survivable) ─────────────────────────

function keepaliveFlush(rows: QueuedEvent[]): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || rows.length === 0) return false;
  if (typeof fetch === "undefined") return false;
  const clean = rows.map(({ __retry_count: _rc, occurred_at_server: _s, ...rest }) => rest);
  try {
    // fetch(..., keepalive:true) survives page teardown up to ~64KB.
    void fetch(`${SUPABASE_URL}/rest/v1/client_runtime_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(clean),
    }).catch(() => {
      // On failure, ensure the row is durably queued for boot replay.
      queue.push(...rows);
      persistRetryQueue();
    });
    return true;
  } catch {
    return false;
  }
}

function toErrorFields(err: unknown): {
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
} {
  if (!err) return { error_name: null, error_message: null, error_stack: null };
  if (err instanceof Error) {
    return {
      error_name: err.name,
      error_message: err.message,
      error_stack: err.stack ?? null,
    };
  }
  return {
    error_name: null,
    error_message: typeof err === "string" ? err : (() => {
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    })(),
    error_stack: null,
  };
}

export function recordRuntimeEvent(input: RuntimeEventInput): void {
  if (typeof window === "undefined") return;
  const errFields = toErrorFields(input.error);
  const evt: QueuedEvent = {
    occurred_at_client: new Date().toISOString(),
    client_instance_id: getClientInstanceId(),
    tab_session_id: getTabSessionId(),
    user_id: ambient.user_id,
    game_id: input.game_id ?? ambient.game_id ?? null,
    table_id: input.table_id ?? ambient.table_id ?? null,
    dealer_game_id: input.dealer_game_id ?? ambient.dealer_game_id ?? null,
    session_id: input.session_id ?? ambient.session_id ?? null,
    message_id: input.message_id ?? null,
    voice_operation_id: input.voice_operation_id ?? null,
    correlation_id: input.correlation_id ?? getActiveRuntimeIncidentId() ?? null,
    event_family: input.event_family,
    event_name: input.event_name,
    severity: input.severity ?? "info",
    route: input.route ?? ambient.route ?? currentRoute(),
    active_tab: input.active_tab ?? ambient.active_tab ?? null,
    game_status: input.game_status ?? ambient.game_status ?? null,
    game_type: input.game_type ?? ambient.game_type ?? null,
    is_committed_active_session:
      input.is_committed_active_session ??
      ambient.is_committed_active_session ??
      null,
    visibility_state:
      typeof document !== "undefined" ? document.visibilityState : null,
    online_state:
      typeof navigator !== "undefined" ? navigator.onLine : null,
    payload: input.payload ?? null,
    ...errFields,
  };
  // Local capsule FIRST — every event with an active runtime incident
  // is appended to the durable IndexedDB capsule before any network
  // attempt, so the causal chain survives connectivity loss / reboot.
  if (evt.correlation_id) {
    try {
      appendCapsuleEvent({
        voiceCrashIncidentId: evt.correlation_id,
        eventFamily: evt.event_family,
        eventName: evt.event_name,
        severity: evt.severity,
        route: evt.route,
        clientInstanceId: evt.client_instance_id,
        tabSessionId: evt.tab_session_id ?? "",
        payload: evt.payload,
      });
    } catch { /* diagnostic; swallow */ }
  }
  const immediate =
    evt.severity === "critical" ||
    IMMEDIATE_EVENT_NAMES.has(evt.event_name);
  // Fire-and-forget: live-patch the DB incident row whenever the
  // event carries a correlation_id that matches an open voice /
  // lifecycle incident. Safe to run for every event; PostgREST
  // no-ops when there is no matching row.
  if (evt.correlation_id && INCIDENT_PATCH_FAMILIES.has(evt.event_family)) {
    void patchDbIncidentRow(evt);
  }
  if (immediate) {
    // Outbox row FIRST so we have queryable evidence of the write
    // attempt even if the tab dies before the event insert lands.
    const outboxId = writeOutboxPending(evt);
    // Attempt crash-survivable delivery first. If unavailable (SSR, no
    // fetch), fall through to the batched supabase-js path via flushNow.
    const sent = keepaliveFlush([evt]);
    if (!sent) {
      queue.push(evt);
      void flushNow();
    }
    if (outboxId) {
      // Mark the outbox row delivered/failed via supabase-js best-effort.
      void finalizeOutboxRow(outboxId, sent);
    }
    return;
  }
  queue.push(evt);
  if (evt.severity === "error") {
    void flushNow();
  } else if (queue.length >= BATCH_MAX) {
    void flushNow();
  } else {
    scheduleFlush();
  }
}

// ── DB-persisted incident lifecycle ────────────────────────────────

const incidentSequences = new Map<string, number>();

export function nextIncidentSequence(correlationId: string): number {
  const cur = incidentSequences.get(correlationId) ?? 0;
  const next = cur + 1;
  incidentSequences.set(correlationId, next);
  return next;
}

async function openDbIncidentRow(
  correlationId: string,
  kind: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const row = {
      incident_type: kind,
      kind,
      severity: "warn",
      status: "open",
      started_at: now,
      detected_at: now,
      correlation_id: correlationId,
      client_instance_id: getClientInstanceId(),
      tab_session_id: getTabSessionId(),
      user_id: ambient.user_id,
      game_id: ambient.game_id,
      table_id: ambient.table_id,
      dealer_game_id: ambient.dealer_game_id,
      session_id: ambient.session_id,
      route: ambient.route ?? currentRoute(),
      origin:
        typeof window !== "undefined" ? window.location.origin : null,
      app_build_id: APP_BUILD_ID,
      app_publish_version: APP_PUBLISH_VERSION,
      last_event_at: now,
      last_route: ambient.route ?? currentRoute(),
      last_visibility_state:
        typeof document !== "undefined" ? document.visibilityState : null,
      event_sequence: 0,
      payload: meta,
      summary: `${kind} opened`,
    };
    // Upsert on correlation_id so a retry from the same tab is idempotent.
    await supabase
      .from("client_runtime_incidents")
      .upsert(row as never, { onConflict: "correlation_id" });
  } catch {
    /* diagnostic; swallow */
  }
}

async function closeDbIncidentRow(
  correlationId: string,
  reason: string,
): Promise<void> {
  try {
    await supabase
      .from("client_runtime_incidents")
      .update({
        status: "closed",
        resolved_at: new Date().toISOString(),
        root_cause_status: reason,
      } as never)
      .eq("correlation_id", correlationId);
  } catch {
    /* diagnostic; swallow */
  }
}

async function patchDbIncidentRow(evt: QueuedEvent): Promise<void> {
  if (!evt.correlation_id) return;
  const patch: Record<string, unknown> = {
    last_event_at: evt.occurred_at_client,
    last_route: evt.route,
    last_visibility_state: evt.visibility_state,
    event_sequence: nextIncidentSequence(evt.correlation_id),
  };
  if (evt.event_family === "voice") patch.last_voice_phase = evt.event_name;
  if (
    evt.event_family === "environment" ||
    evt.event_family === "fatal" ||
    evt.event_family === "session" ||
    evt.event_family === "route"
  ) {
    patch.last_lifecycle_event = evt.event_name;
  }
  if (evt.error_message) {
    patch.last_error_name = evt.error_name;
    patch.last_error_message = evt.error_message;
  }
  try {
    await supabase
      .from("client_runtime_incidents")
      .update(patch as never)
      .eq("correlation_id", evt.correlation_id);
  } catch {
    /* diagnostic; swallow */
  }
}

// ── Authoritative outbox for critical events ───────────────────────

function writeOutboxPending(evt: QueuedEvent): string | null {
  try {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : randomId("obx");
    const row = {
      id,
      status: "pending",
      attempts: 1,
      transport: "keepalive",
      client_instance_id: evt.client_instance_id,
      tab_session_id: evt.tab_session_id,
      correlation_id: evt.correlation_id,
      event_family: evt.event_family,
      event_name: evt.event_name,
      severity: evt.severity,
      event_row: evt as unknown as Record<string, unknown>,
    };
    // supabase-js path (fire-and-forget) — no await so we don't block
    // the immediate event flush. If it never lands (tab dies), the
    // event will simply have no outbox proof — that IS the evidence.
    void supabase
      .from("client_runtime_event_outbox")
      .insert(row as never)
      .then(() => {});
    return id;
  } catch {
    return null;
  }
}

async function finalizeOutboxRow(id: string, delivered: boolean): Promise<void> {
  try {
    const patch = delivered
      ? { status: "delivered", delivered_at: new Date().toISOString() }
      : { status: "failed", failed_at: new Date().toISOString(), error_message: "keepalive-unavailable" };
    await supabase
      .from("client_runtime_event_outbox")
      .update(patch as never)
      .eq("id", id);
  } catch {
    /* diagnostic; swallow */
  }
}

// ── Cross-origin recovery scan ─────────────────────────────────────

let openIncidentScanRan = false;

async function runOpenIncidentScan(): Promise<void> {
  if (openIncidentScanRan) return;
  if (!ambient.user_id) return;
  openIncidentScanRan = true;
  try {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("client_runtime_incidents")
      .select(
        "id, correlation_id, kind, origin, client_instance_id, tab_session_id, route, detected_at, last_event_at, last_voice_phase, last_lifecycle_event",
      )
      .eq("user_id", ambient.user_id)
      .eq("status", "open")
      .gte("detected_at", since)
      .order("detected_at", { ascending: false })
      .limit(5);
    if (!data || data.length === 0) return;
    for (const raw of data) {
      const row = raw as {
        id: string;
        correlation_id: string | null;
        kind: string | null;
        origin: string | null;
        client_instance_id: string | null;
        tab_session_id: string | null;
        route: string | null;
        detected_at: string | null;
        last_event_at: string | null;
        last_voice_phase: string | null;
        last_lifecycle_event: string | null;
      };
      if (row.client_instance_id === getClientInstanceId()) continue;
      recordRuntimeEvent({
        event_family: "session",
        event_name: "BOOT_RECOVERED_OPEN_INCIDENT",
        severity: "warn",
        correlation_id: row.correlation_id ?? null,
        payload: {
          priorIncidentId: row.id,
          priorCorrelationId: row.correlation_id,
          priorKind: row.kind,
          priorOrigin: row.origin,
          priorClientInstanceId: row.client_instance_id,
          priorTabSessionId: row.tab_session_id,
          priorRoute: row.route,
          priorDetectedAt: row.detected_at,
          priorLastEventAt: row.last_event_at,
          priorLastVoicePhase: row.last_voice_phase,
          priorLastLifecycleEvent: row.last_lifecycle_event,
          currentClientInstanceId: getClientInstanceId(),
          currentOrigin:
            typeof window !== "undefined" ? window.location.origin : null,
          currentRoute: currentRoute(),
          recoveryTimestamp: new Date().toISOString(),
        },
      });
    }
  } catch {
    /* diagnostic; swallow */
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, BATCH_INTERVAL_MS);
}

async function flushNow(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (!instanceRegistered) {
    void upsertInstance();
  }
  flushing = true;
  const batch = queue.splice(0, Math.min(queue.length, 100));
  try {
    // Strip the private retry counter before insert.
    const rows = batch.map(({ __retry_count: _rc, occurred_at_server: _s, ...rest }) => rest);
    const { error } = await supabase
      .from("client_runtime_events")
      .insert(rows as never);
    if (error) throw error;
  } catch {
    // Requeue with backoff / cap.
    for (const evt of batch) {
      const rc = (evt.__retry_count ?? 0) + 1;
      if (rc <= 5) {
        evt.__retry_count = rc;
        queue.push(evt);
      }
    }
    persistRetryQueue();
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

// ── Incident + delivery-trace APIs ─────────────────────────────────

export async function openIncident(input: IncidentInput): Promise<string | null> {
  try {
    const row = {
      incident_type: input.incident_type,
      severity: input.severity ?? "error",
      status: "open",
      started_at: new Date().toISOString(),
      detected_at: new Date().toISOString(),
      client_instance_id: getClientInstanceId(),
      user_id: ambient.user_id,
      game_id: input.game_id ?? ambient.game_id ?? null,
      table_id: input.table_id ?? ambient.table_id ?? null,
      session_id: input.session_id ?? ambient.session_id ?? null,
      message_id: input.message_id ?? null,
      voice_operation_id: input.voice_operation_id ?? null,
      summary: input.summary ?? null,
      root_cause_status: input.root_cause_status ?? null,
      payload: input.payload ?? null,
      breadcrumb_event_ids: input.breadcrumb_event_ids ?? null,
    };
    const { data, error } = await supabase
      .from("client_runtime_incidents")
      .insert(row as never)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    // Also emit as a runtime event for correlation.
    recordRuntimeEvent({
      event_family: "incident",
      event_name: input.incident_type,
      severity: input.severity ?? "error",
      correlation_id: input.correlation_id ?? null,
      message_id: input.message_id ?? null,
      voice_operation_id: input.voice_operation_id ?? null,
      game_id: input.game_id ?? null,
      session_id: input.session_id ?? null,
      payload: {
        summary: input.summary,
        incident_id: data?.id ?? null,
        ...(input.payload ?? {}),
      },
    });
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function upsertDeliveryTrace(
  input: DeliveryTraceUpsert,
): Promise<void> {
  const recipient =
    input.recipient_client_instance_id ?? getClientInstanceId();
  const row: Record<string, unknown> = {
    message_id: input.message_id,
    recipient_client_instance_id: recipient,
  };
  const passThroughKeys: (keyof DeliveryTraceUpsert)[] = [
    "correlation_id",
    "sender_user_id",
    "sender_client_instance_id",
    "sender_tab_session_id",
    "sender_device_label",
    "recipient_user_id",
    "recipient_tab_session_id",
    "recipient_device_label",
    "game_id",
    "table_id",
    "session_id",
    "dealer_game_id",
    "source_type",
    "is_voice",
    "voice_operation_id",
    "send_intent_at",
    "optimistic_created_at",
    "db_insert_start_at",
    "db_insert_success_at",
    "db_insert_failure_at",
    "authoritative_row_at",
    "realtime_broadcast_at",
    "recipient_realtime_receipt_at",
    "recipient_store_admission_at",
    "recipient_panel_selector_at",
    "recipient_dom_mount_at",
    "recipient_unread_evaluated_at",
    "recipient_icon_pulse_at",
    "recipient_persistent_unread_at",
    "recipient_read_at",
    "recipient_ack_source",
    "delivery_status",
    "render_status",
    "unread_status",
    "failure_reason",
    "payload",
  ];
  for (const k of passThroughKeys) {
    const v = (input as unknown as Record<string, unknown>)[k as string];
    if (v !== undefined) row[k as string] = v;
  }
  try {
    await supabase
      .from("chat_message_delivery_trace")
      .upsert(row as never, {
        onConflict: "message_id,recipient_client_instance_id",
      });
  } catch {
    /* diagnostic table; best-effort */
  }
}

// ── Boot + lifecycle listeners ─────────────────────────────────────

let booted = false;
let historyPatched = false;

function navigationTypeString(): string | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

function pageLifecycleBase(): Record<string, unknown> {
  return {
    runtimeIncidentId: getActiveRuntimeIncidentId(),
    clientInstanceId: getClientInstanceId(),
    tabSessionId: getTabSessionId(),
    route: currentRoute(),
    href: typeof window !== "undefined" ? window.location.href : null,
    referrer: typeof document !== "undefined" ? document.referrer : null,
    visibilityState:
      typeof document !== "undefined" ? document.visibilityState : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    navigationType: navigationTypeString(),
    wasDiscarded:
      typeof document !== "undefined"
        ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? null
        : null,
    ts: Date.now(),
  };
}

function installHistoryPatch() {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  const emit = (source: string, to: string) => {
    recordRuntimeEvent({
      event_family: "route",
      event_name: "ROUTE_REDIRECT",
      severity: "info",
      payload: {
        from: currentRoute(),
        to,
        source,
        initiator: "history",
        ...pageLifecycleBase(),
      },
    });
  };
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = function patchedPush(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try { if (url != null) emit("history.pushState", String(url)); } catch { /* noop */ }
    return origPush(data as never, unused, url as never);
  } as typeof window.history.pushState;
  window.history.replaceState = function patchedReplace(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    try { if (url != null) emit("history.replaceState", String(url)); } catch { /* noop */ }
    return origReplace(data as never, unused, url as never);
  } as typeof window.history.replaceState;
  window.addEventListener("popstate", () => emit("popstate", currentRoute() ?? ""));
}

// ── App-owned session/route markers (called from consumer sites) ────

export function recordAppRouteRedirect(input: {
  from: string;
  to: string;
  reason: string;
  caller: string;
  initiator?: string;
  dealer_game_id?: string | null;
  game_id?: string | null;
  session_id?: string | null;
  userId?: string | null;
}): void {
  recordRuntimeEvent({
    event_family: "route",
    event_name: "ROUTE_REDIRECT",
    severity: "warn",
    game_id: input.game_id ?? null,
    dealer_game_id: input.dealer_game_id ?? null,
    session_id: input.session_id ?? null,
    payload: {
      from: input.from,
      to: input.to,
      reason: input.reason,
      caller: input.caller,
      initiator: input.initiator ?? "app",
      ...pageLifecycleBase(),
    },
  });
}

export function recordActiveSessionMarker(
  event: | "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK"
         | "ACTIVE_SESSION_ROUTE_EJECTED"
         | "ACTIVE_SESSION_SHELL_UNMOUNTED"
         | "ACTIVE_SESSION_AUTH_REDIRECT"
         | "PERSISTED_SESSION_RESTORE_FAILED",
  detail: {
    caller: string;
    branch?: string;
    prior_route?: string | null;
    next_route?: string | null;
    dealer_game_id?: string | null;
    game_id?: string | null;
    session_id?: string | null;
    table_id?: string | null;
    initiator?: string;
    extra?: Record<string, unknown>;
  },
): void {
  recordRuntimeEvent({
    event_family: "session",
    event_name: event,
    severity: "warn",
    game_id: detail.game_id ?? null,
    dealer_game_id: detail.dealer_game_id ?? null,
    session_id: detail.session_id ?? null,
    table_id: detail.table_id ?? null,
    payload: {
      caller: detail.caller,
      branch: detail.branch ?? null,
      prior_route: detail.prior_route ?? currentRoute(),
      next_route: detail.next_route ?? null,
      initiator: detail.initiator ?? "app",
      ...(detail.extra ?? {}),
      ...pageLifecycleBase(),
    },
  });
}

export function recordErrorBoundaryCaught(detail: {
  source: string;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  title?: string | null;
}): void {
  recordRuntimeEvent({
    event_family: "fatal",
    event_name: "ERROR_BOUNDARY_CAUGHT",
    severity: "critical",
    payload: {
      ...detail,
      ...pageLifecycleBase(),
    },
  });
}

/**
 * Emit VOICE_REQUEST_NETWORK_FAILURE when a voice-to-text edge-function
 * request fails and there is reason to believe the failure is network
 * related (navigator offline, TypeError from fetch, etc).
 */
export function recordVoiceRequestNetworkFailure(detail: {
  phase: string;
  message: string | null;
  errorName?: string | null;
  online?: boolean | null;
  extra?: Record<string, unknown>;
}): void {
  recordRuntimeEvent({
    event_family: "voice",
    event_name: "VOICE_REQUEST_NETWORK_FAILURE",
    severity: "error",
    payload: {
      phase: detail.phase,
      message: detail.message,
      errorName: detail.errorName ?? null,
      online:
        detail.online ??
        (typeof navigator !== "undefined" ? navigator.onLine : null),
      ...(detail.extra ?? {}),
      ...pageLifecycleBase(),
    },
  });
}

/**
 * Emit DB_CRITICAL_WRITE_NETWORK_FAILURE from any critical DB write path
 * (keepalive flush, outbox insert, incident upsert) that fails.
 */
export function recordDbCriticalWriteFailure(detail: {
  target: string;
  message: string | null;
  errorName?: string | null;
  extra?: Record<string, unknown>;
}): void {
  recordRuntimeEvent({
    event_family: "environment",
    event_name: "DB_CRITICAL_WRITE_NETWORK_FAILURE",
    severity: "error",
    payload: {
      target: detail.target,
      message: detail.message,
      errorName: detail.errorName ?? null,
      online:
        typeof navigator !== "undefined" ? navigator.onLine : null,
      ...(detail.extra ?? {}),
      ...pageLifecycleBase(),
    },
  });
}

export function bootRuntimeTracer(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;
  loadIncident();
  loadRetryQueue();
  void upsertInstance();
  installHistoryPatch();

  // Boot the durable IndexedDB capsule + network listeners BEFORE
  // React mounts. Emits NETWORK_STATUS_SNAPSHOT / NETWORK_ONLINE /
  // NETWORK_OFFLINE / CAPSULE_* events through the tracer.
  try {
    bootVoiceCrashCapsule((name, severity, payload) => {
      recordRuntimeEvent({
        event_family: name.startsWith("CAPSULE_") ? "environment" : "environment",
        event_name: name,
        severity: severity as Severity,
        payload,
      });
    });
  } catch { /* diagnostic; swallow */ }

  // If we have replayed queued events from a prior tab, emit a
  // dedicated marker so post-relaunch analysis can pinpoint the
  // relaunch boundary. Replayed rows carry their original tab_session_id
  // and (via correlation_id) the active runtimeIncidentId at time of
  // enqueue.
  if (queue.length > 0) {
    recordRuntimeEvent({
      event_family: "session",
      event_name: "BOOT_RECOVERY_REPLAY",
      severity: "info",
      payload: {
        replayed_count: queue.length,
        ...pageLifecycleBase(),
      },
    });
  }

  recordRuntimeEvent({
    event_family: "session",
    event_name: "BOOT",
    severity: "info",
    payload: {
      build: APP_BUILD_ID,
      publish: APP_PUBLISH_VERSION,
      activeIncident: getActiveRuntimeIncident(),
      ...pageLifecycleBase(),
    },
  });

  const flushOnBackground = (label: string, extra?: Record<string, unknown>) => {
    forceInstanceHeartbeat(label);
    recordRuntimeEvent({
      event_family: "environment",
      event_name: label,
      severity: "info",
      payload: { ...(extra ?? {}), ...pageLifecycleBase() },
    });
    void flushNow();
    persistRetryQueue();
  };

  // Immediate boot heartbeat so instances table reflects this tab now.
  forceInstanceHeartbeat("BOOT");

  window.addEventListener("pagehide", (e) => {
    const persisted = (e as PageTransitionEvent).persisted;
    flushOnBackground("PAGE_HIDE", { persisted });
  });
  window.addEventListener("pageshow", (e) => {
    const persisted = (e as PageTransitionEvent).persisted;
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "PAGE_SHOW",
      severity: "info",
      payload: { persisted, ...pageLifecycleBase() },
    });
  });
  window.addEventListener("beforeunload", () =>
    flushOnBackground("BEFORE_UNLOAD"),
  );
  window.addEventListener("unload", () => flushOnBackground("UNLOAD"));
  // Page Lifecycle API (Chrome/Android): freeze/resume around tab
  // discard. `document.wasDiscarded` on next boot indicates a discard
  // occurred; we surface it via pageLifecycleBase().
  document.addEventListener("freeze", () => flushOnBackground("FREEZE"));
  document.addEventListener("resume", () =>
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "RESUME",
      severity: "info",
      payload: pageLifecycleBase(),
    }),
  );

  window.addEventListener("online", () =>
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "ONLINE",
      severity: "info",
      payload: pageLifecycleBase(),
    }),
  );
  window.addEventListener("offline", () =>
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "OFFLINE",
      severity: "info",
      payload: pageLifecycleBase(),
    }),
  );
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      recordRuntimeEvent({
        event_family: "environment",
        event_name: "PAGE_VISIBILITY_CHANGE",
        payload: { state: document.visibilityState, ...pageLifecycleBase() },
      });
      if (document.visibilityState === "visible") void flushNow();
    });
  }
  window.addEventListener("error", (event: ErrorEvent) => {
    recordRuntimeEvent({
      event_family: "fatal",
      event_name: "WINDOW_ERROR",
      severity: "critical",
      error: event.error ?? event.message,
      payload: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        ...pageLifecycleBase(),
      },
    });
  });
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      recordRuntimeEvent({
        event_family: "fatal",
        event_name: "UNHANDLED_REJECTION",
        severity: "critical",
        error: event.reason,
        payload: pageLifecycleBase(),
      });
    },
  );

  // Retry loop for queued events every 15s if any remain.
  setInterval(() => {
    if (queue.length > 0) void flushNow();
  }, 15000);
}
