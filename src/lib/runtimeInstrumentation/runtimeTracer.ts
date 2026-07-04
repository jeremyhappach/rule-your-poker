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
  "VOICE_CAPTURE_STOP_REQUESTED",
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
  // Session/route markers
  "ROUTE_REDIRECT",
  "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK",
  "ACTIVE_SESSION_ROUTE_EJECTED",
  "ACTIVE_SESSION_SHELL_UNMOUNTED",
  "PERSISTED_SESSION_RESTORE_FAILED",
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
  (Object.keys(partial) as (keyof AmbientContext)[]).forEach((k) => {
    const v = partial[k];
    if (v === undefined) return;
    const bag = ambient as unknown as Record<string, unknown>;
    if (bag[k as string] !== v) {
      bag[k as string] = v as unknown;
      changed = true;
    }
  });
  if (changed) {
    scheduleInstanceHeartbeat();
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
    correlation_id: input.correlation_id ?? null,
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
  queue.push(evt);
  if (evt.severity === "critical" || evt.severity === "error") {
    void flushNow();
  } else if (queue.length >= BATCH_MAX) {
    void flushNow();
  } else {
    scheduleFlush();
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
export function bootRuntimeTracer(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;
  loadRetryQueue();
  void upsertInstance();

  recordRuntimeEvent({
    event_family: "session",
    event_name: "BOOT",
    severity: "info",
    payload: {
      href: window.location.href,
      referrer: typeof document !== "undefined" ? document.referrer : null,
      build: APP_BUILD_ID,
      publish: APP_PUBLISH_VERSION,
    },
  });

  const flushOnBackground = () => {
    void flushNow();
    persistRetryQueue();
  };
  window.addEventListener("pagehide", flushOnBackground);
  window.addEventListener("beforeunload", flushOnBackground);
  window.addEventListener("online", () => {
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "ONLINE",
      severity: "info",
    });
    void flushNow();
  });
  window.addEventListener("offline", () =>
    recordRuntimeEvent({
      event_family: "environment",
      event_name: "OFFLINE",
      severity: "info",
    }),
  );
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      recordRuntimeEvent({
        event_family: "environment",
        event_name: "VISIBILITY_CHANGE",
        payload: { state: document.visibilityState },
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
      });
    },
  );

  // Retry loop for queued events every 15s if any remain.
  setInterval(() => {
    if (queue.length > 0) void flushNow();
  }, 15000);
}
