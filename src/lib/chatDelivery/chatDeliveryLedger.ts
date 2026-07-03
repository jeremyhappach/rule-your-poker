/**
 * CHAT_DELIVERY_LEDGER
 *
 * Persistent, exportable per-client ledger of chat message lifecycles.
 * Retains the last 100 message lifecycles per client across
 * navigation / reload / auth redirect so a delivery failure (write,
 * realtime, cache, render, unread indicator, read-clear) can be
 * exported afterward from either device and compared.
 *
 * Instrumentation-only. This module does NOT alter chat behavior.
 *
 * Storage: localStorage key `CHAT_DELIVERY_LEDGER_v1`.
 *
 * A ring buffer of `MessageLifecycle` records is keyed by
 * `messageId` (server row id when known, otherwise the optimistic /
 * hydration key). A separate `system` bucket captures events that
 * are not tied to a specific message (subscription lifecycle, panel
 * open/close, hydration boundaries).
 *
 * All state derives from the running client. A `clientInstanceId` is
 * generated once per browser tab (sessionStorage) so exports from
 * two devices / tabs / clients can be diffed side-by-side.
 */

export type ChatDeliveryEventName =
  // Send / write path
  | 'send-intent'
  | 'send-optimistic-created'
  | 'send-insert-start'
  | 'send-insert-success'
  | 'send-insert-error'
  | 'send-authoritative-received'
  | 'send-optimistic-reconciled'
  | 'send-optimistic-dropped'
  // Realtime path
  | 'realtime-subscription-created'
  | 'realtime-subscription-status'
  | 'realtime-subscription-error'
  | 'realtime-subscription-teardown'
  | 'realtime-insert-received'
  | 'realtime-payload-admitted'
  | 'realtime-payload-rejected'
  | 'realtime-payload-deduped'
  // Fetch / hydration
  | 'fetch-start'
  | 'fetch-end'
  | 'fetch-message-admitted'
  | 'hydration-complete'
  | 'refetch-detected-missing-message'
  // Store / cache admission
  | 'store-message-added'
  | 'store-message-merged'
  | 'store-message-skipped-duplicate'
  | 'store-message-classified'
  // Render
  | 'chat-panel-open'
  | 'chat-panel-close'
  | 'chat-list-render'
  | 'chat-message-mounted'
  | 'chat-message-hidden'
  // Unread / new-chat indicator
  | 'unread-evaluation-start'
  | 'unread-eligibility-resolved'
  | 'indicator-eligibility'
  | 'indicator-requested'
  | 'indicator-mounted'
  | 'indicator-suppressed'
  | 'indicator-cleared'
  | 'indicator-badge-value'
  | 'read-cursor-advanced'
  | 'read-action'
  // Free-form (used by the console tap for existing indicator logs)
  | 'legacy-log'
  // Explicit violations
  | 'violation';

export type ChatDeliveryViolation =
  | 'CHAT_REMOTE_INSERT_NOT_RECEIVED'
  | 'CHAT_REMOTE_EVENT_REJECTED'
  | 'CHAT_REMOTE_EVENT_ADMITTED_NOT_RENDERED'
  | 'CHAT_MESSAGE_VISIBLE_ONLY_AFTER_REFRESH'
  | 'CHAT_UNREAD_ELIGIBLE_INDICATOR_NOT_REQUESTED'
  | 'CHAT_INDICATOR_REQUESTED_NOT_MOUNTED'
  | 'CHAT_INDICATOR_CLEARED_BEFORE_READ'
  | 'CHAT_READ_CURSOR_ADVANCED_WITHOUT_READ'
  | 'CHAT_SESSION_OR_GAME_FILTER_MISMATCH'
  | 'CHAT_REALTIME_SUBSCRIPTION_NOT_READY'
  | 'CHAT_REMOTE_MESSAGE_NEVER_EVALUATED_FOR_UNREAD'
  | 'CHAT_STORE_MESSAGE_EXCLUDED_FROM_PLAYER_LIST'
  | 'CHAT_MESSAGE_CLASSIFIED_AS_DEALER_OR_SYSTEM_UNEXPECTEDLY'
  | 'CHAT_STORE_RENDER_COUNT_MISMATCH';

export interface ChatMessageIdentity {
  messageId: string;          // server row id, optimistic id, or hydration key
  clientInstanceId: string;   // this browser tab
  localViewerId?: string | null;
  senderPlayerId?: string | null;
  dealerGameId?: string | null;
  sessionId?: string | null;  // gameId serves as session id in this app
  sentAt?: string | null;     // ISO
  transportSource: 'send' | 'realtime' | 'fetch' | 'hydration' | 'system' | 'unknown';
}

export interface ChatDeliveryEvent {
  t: number;                        // Date.now()
  perf: number;                     // performance.now()
  name: ChatDeliveryEventName;
  source: string;                   // caller tag
  route?: string | null;            // window.location.pathname at emit
  severity?: 'info' | 'warn' | 'error';
  violation?: ChatDeliveryViolation | null;
  payload?: Record<string, unknown>;
}

export interface MessageLifecycle {
  identity: ChatMessageIdentity;
  createdAt: number;
  updatedAt: number;
  events: ChatDeliveryEvent[];
  hasViolation: boolean;
}

interface LedgerFile {
  clientInstanceId: string;
  messages: MessageLifecycle[]; // last MAX_MESSAGES
  system: ChatDeliveryEvent[];  // last MAX_SYSTEM_EVENTS
}

const STORAGE_KEY = 'CHAT_DELIVERY_LEDGER_v1';
const CLIENT_INSTANCE_KEY = 'CHAT_DELIVERY_CLIENT_INSTANCE_ID_v1';
const MAX_MESSAGES = 100;
const MAX_EVENTS_PER_MESSAGE = 120;
const MAX_SYSTEM_EVENTS = 500;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function nowRoute(): string | null {
  try { return isBrowser() ? window.location.pathname : null; } catch { return null; }
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cachedClientInstanceId: string | null = null;
export function getClientInstanceId(): string {
  if (cachedClientInstanceId) return cachedClientInstanceId;
  if (!isBrowser()) {
    cachedClientInstanceId = 'ssr';
    return cachedClientInstanceId;
  }
  try {
    // Per-tab: sessionStorage means two tabs on the same device get
    // distinct ids. That is desired for side-by-side diffs.
    let id = sessionStorage.getItem(CLIENT_INSTANCE_KEY);
    if (!id) {
      id = genId();
      sessionStorage.setItem(CLIENT_INSTANCE_KEY, id);
    }
    cachedClientInstanceId = id;
    return id;
  } catch {
    cachedClientInstanceId = genId();
    return cachedClientInstanceId;
  }
}

function loadFile(): LedgerFile {
  if (!isBrowser()) {
    return { clientInstanceId: 'ssr', messages: [], system: [] };
  }
  const clientInstanceId = getClientInstanceId();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clientInstanceId, messages: [], system: [] };
    const parsed = JSON.parse(raw) as LedgerFile;
    return {
      clientInstanceId,
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      system: Array.isArray(parsed?.system) ? parsed.system : [],
    };
  } catch {
    return { clientInstanceId, messages: [], system: [] };
  }
}

function saveFile(f: LedgerFile): void {
  if (!isBrowser()) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)); } catch { /* quota */ }
}

type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  for (const l of Array.from(listeners)) {
    try { l(); } catch { /* ignore */ }
  }
}
export function subscribeChatDeliveryLedger(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function upsertMessage(file: LedgerFile, identity: ChatMessageIdentity): MessageLifecycle {
  const idx = file.messages.findIndex(m => m.identity.messageId === identity.messageId);
  const now = Date.now();
  if (idx >= 0) {
    // Merge: never overwrite a known field with null/undefined
    const merged: ChatMessageIdentity = { ...file.messages[idx].identity };
    for (const k of Object.keys(identity) as Array<keyof ChatMessageIdentity>) {
      const v = identity[k];
      if (v !== undefined && v !== null && v !== '') {
        (merged as unknown as Record<string, unknown>)[k] = v as unknown;
      }
    }
    file.messages[idx].identity = merged;
    file.messages[idx].updatedAt = now;
    return file.messages[idx];
  }
  const rec: MessageLifecycle = {
    identity,
    createdAt: now,
    updatedAt: now,
    events: [],
    hasViolation: false,
  };
  file.messages.push(rec);
  while (file.messages.length > MAX_MESSAGES) file.messages.shift();
  return rec;
}

export interface RecordChatEventArgs {
  identity?: ChatMessageIdentity | null; // null → system bucket
  name: ChatDeliveryEventName;
  source: string;
  severity?: 'info' | 'warn' | 'error';
  violation?: ChatDeliveryViolation | null;
  payload?: Record<string, unknown>;
}

export function recordChatDeliveryEvent(args: RecordChatEventArgs): void {
  if (!isBrowser()) return;
  // Passive: track latest observed store size so render surfaces can
  // detect store↔render count mismatches without new plumbing.
  try {
    const s = (args.payload as { storeSize?: unknown } | undefined)?.storeSize;
    if (typeof s === 'number') lastKnownStoreSize = s;
  } catch { /* ignore */ }
  try {
    const file = loadFile();
    const evt: ChatDeliveryEvent = {
      t: Date.now(),
      perf: typeof performance !== 'undefined' ? performance.now() : 0,
      name: args.name,
      source: args.source,
      route: nowRoute(),
      severity: args.severity ?? (args.violation ? 'error' : 'info'),
      violation: args.violation ?? null,
      payload: args.payload,
    };
    if (args.identity && args.identity.messageId) {
      const rec = upsertMessage(file, args.identity);
      rec.events.push(evt);
      if (rec.events.length > MAX_EVENTS_PER_MESSAGE) {
        rec.events.splice(0, rec.events.length - MAX_EVENTS_PER_MESSAGE);
      }
      if (evt.violation) rec.hasViolation = true;
      rec.updatedAt = evt.t;
    } else {
      file.system.push(evt);
      if (file.system.length > MAX_SYSTEM_EVENTS) {
        file.system.splice(0, file.system.length - MAX_SYSTEM_EVENTS);
      }
    }
    saveFile(file);
    notify();
  } catch {
    /* never break chat */
  }
}

export function recordChatDeliveryViolation(
  identity: ChatMessageIdentity | null,
  violation: ChatDeliveryViolation,
  source: string,
  payload?: Record<string, unknown>,
): void {
  recordChatDeliveryEvent({
    identity,
    name: 'violation',
    source,
    severity: 'error',
    violation,
    payload,
  });
}

export function readChatDeliveryLedger(): LedgerFile {
  return loadFile();
}

export function clearChatDeliveryLedger(): void {
  if (!isBrowser()) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  notify();
}

export function exportChatDeliveryLedgerJson(): string {
  const f = loadFile();
  return JSON.stringify(
    {
      key: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      clientInstanceId: f.clientInstanceId,
      route: nowRoute(),
      userAgent: isBrowser() ? navigator.userAgent : null,
      messages: f.messages,
      system: f.system,
    },
    null,
    2,
  );
}

export function hasAnyChatLifecycles(): boolean {
  const f = loadFile();
  return f.messages.length > 0 || f.system.length > 0;
}

/* ────────────────────────────────────────────────────────────
   Console-log tap
   ────────────────────────────────────────────────────────────
   The three game tables (MobileGameTable, CribbageMobileGameTable,
   GinRummyGameTable) already emit chat-indicator lifecycle logs via
   `console.log('[chat-indicator] ...', {...})` and useGameChat emits
   `console.log('[holm-chat-indicator] ...', {...})`. To capture every
   such event into the ledger without editing every call site (which
   would risk changing behavior), we install a passive tap on
   `console.log` that recognizes those two tag prefixes and forwards
   the event to the ledger. Original console output is preserved.
*/
const TAP_TAGS = ['[chat-indicator]', '[holm-chat-indicator]'];

function installConsoleTap(): void {
  if (!isBrowser()) return;
  const w = window as unknown as { __CHAT_DELIVERY_LEDGER_TAP_INSTALLED__?: boolean };
  if (w.__CHAT_DELIVERY_LEDGER_TAP_INSTALLED__) return;
  w.__CHAT_DELIVERY_LEDGER_TAP_INSTALLED__ = true;

  const original = console.log.bind(console);
  console.log = ((...args: unknown[]) => {
    try {
      const first = args[0];
      if (typeof first === 'string') {
        const tag = TAP_TAGS.find(t => first.startsWith(t));
        if (tag) {
          const rest = first.slice(tag.length).trim();
          const payload = (args[1] && typeof args[1] === 'object')
            ? args[1] as Record<string, unknown>
            : {};
          const messageId =
            (payload.messageId as string | null | undefined) ??
            (payload.lastSeen as string | null | undefined) ??
            null;
          const localViewerId =
            (payload.currentUserId as string | null | undefined) ?? null;
          if (messageId) {
            recordChatDeliveryEvent({
              identity: {
                messageId,
                clientInstanceId: getClientInstanceId(),
                localViewerId,
                transportSource: 'unknown',
              },
              name: 'legacy-log',
              source: `console.log ${tag}`,
              payload: { event: rest, ...payload },
            });
          } else {
            recordChatDeliveryEvent({
              identity: null,
              name: 'legacy-log',
              source: `console.log ${tag}`,
              payload: { event: rest, ...payload },
            });
          }
        }
      }
    } catch { /* never break console */ }
    original(...args);
  }) as typeof console.log;
}

// Auto-install at module load.
installConsoleTap();
// Warm the client instance id so exports always carry it.
getClientInstanceId();

/* ────────────────────────────────────────────────────────────
   Unread-evaluation expectation tracker

   When a remote (non-self) chat message is admitted from realtime,
   consumers call `armRemoteUnreadExpectation(identity)`. The
   indicator effect calls `markUnreadEvaluated(messageId)` when it
   runs. If no evaluation is seen within one macrotask window
   (~one render cycle), the ledger emits
   `CHAT_REMOTE_MESSAGE_NEVER_EVALUATED_FOR_UNREAD`.

   Instrumentation-only. This never blocks or alters chat.
   ──────────────────────────────────────────────────────────── */

const UNREAD_EVAL_DEADLINE_MS = 100;

interface UnreadExpectation {
  identity: ChatMessageIdentity;
  timer: ReturnType<typeof setTimeout>;
  armedAt: number;
  evaluated: boolean;
}

const unreadExpectations = new Map<string, UnreadExpectation>();

/** Latest observed store size from `store-message-*` payloads. */
let lastKnownStoreSize: number | null = null;
export function getLastKnownStoreSize(): number | null {
  return lastKnownStoreSize;
}
export function noteStoreSize(size: number): void {
  if (typeof size === 'number' && size >= 0) lastKnownStoreSize = size;
}

export function armRemoteUnreadExpectation(identity: ChatMessageIdentity): void {
  if (!isBrowser() || !identity?.messageId) return;
  // Idempotent per message id.
  const existing = unreadExpectations.get(identity.messageId);
  if (existing) return;
  const armedAt = Date.now();
  const timer = setTimeout(() => {
    const rec = unreadExpectations.get(identity.messageId);
    if (rec && !rec.evaluated) {
      recordChatDeliveryViolation(
        identity,
        'CHAT_REMOTE_MESSAGE_NEVER_EVALUATED_FOR_UNREAD',
        'chatDeliveryLedger#unreadExpectationDeadline',
        { deadlineMs: UNREAD_EVAL_DEADLINE_MS, armedAt },
      );
    }
    unreadExpectations.delete(identity.messageId);
  }, UNREAD_EVAL_DEADLINE_MS);
  unreadExpectations.set(identity.messageId, {
    identity,
    timer,
    armedAt,
    evaluated: false,
  });
}

export function markUnreadEvaluated(messageId: string): void {
  const rec = unreadExpectations.get(messageId);
  if (!rec) return;
  rec.evaluated = true;
  clearTimeout(rec.timer);
  unreadExpectations.delete(messageId);
}

