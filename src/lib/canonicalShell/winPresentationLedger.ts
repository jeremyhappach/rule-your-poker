/**
 * CANONICAL_WIN_PRESENTATION_LEDGER
 *
 * Persistent, exportable per-client ledger of win-presentation events for
 * 3-5-7, Horses, and SCC. Retains the last 20 win attempts across
 * teardown/navigation so a failed win (e.g. Horses freeze) can be
 * exported after the route has changed.
 *
 * Instrumentation-only. This module does NOT alter win behavior.
 *
 * Storage: localStorage key `CANONICAL_WIN_PRESENTATION_LEDGER_v1`.
 * Ring buffer: last 20 attempts, each with an in-order event list.
 *
 * Attempts are identified by winAttemptId (caller-supplied stable key,
 * typically `${gameType}:${gameId}:${winnerPlayerId}:${handContextId}`).
 */

export type WinPresentationEventName =
  // A. Outcome / phase admission
  | 'outcome-detected'
  | 'presentation-outcome-admitted'
  | 'winner-identity-resolved'
  | 'local-viewer-classified'
  | 'pre-win-overlay-required'
  | 'pre-win-overlay-started'
  | 'pre-win-overlay-completed'
  | 'pre-win-overlay-skipped'
  | 'shell-win-phase-entered'
  | 'duplicate-outcome-suppressed'
  | 'replay-suppressed'
  // B. Canonical celly orchestration
  | 'canonical-sequence-requested'
  | 'canonical-sequence-accepted'
  | 'canonical-sequence-rejected'
  | 'transfer-start'
  | 'confetti-trigger-requested'
  | 'confetti-mounted'
  | 'transfer-mounted'
  | 'transfer-first-frame'
  | 'transfer-complete'
  | 'winner-destination-resolved'
  | 'destination-arrival'
  | 'bounce-start'
  | 'bounce-complete'
  | 'confetti-complete'
  | 'teardown-requested'
  | 'teardown-committed'
  // C./D. violations (also fired via recordViolation for immediate error)
  | 'violation';

export type WinPresentationViolation =
  | 'WIN_CONFETTI_ON_NONWINNER_CLIENT'
  | 'WIN_CONFETTI_AFTER_TRANSFER_START'
  | 'WIN_TRANSFER_WITHOUT_SIMULTANEOUS_CONFETTI'
  | 'WIN_TRANSFER_COMPLETED_WITHOUT_BOUNCE'
  | 'WIN_BOUNCE_TARGET_MISSING'
  | 'WIN_SEQUENCE_SKIPPED_TO_TEARDOWN'
  | 'WIN_PRESENTATION_FROZEN'
  | 'WIN_DUPLICATE_OR_REPLAYED_SEQUENCE'
  | 'WIN_OUTCOME_WITHOUT_TRANSFER';

export interface WinAttemptIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  gameType?: string | null;
  outcomeId?: string | null;
  winnerPlayerId?: string | null;
  localViewerId?: string | null;
  localRole?: 'winner' | 'loser' | 'observer' | 'bot-seat' | 'unknown' | null;
  winAttemptId: string;
}

export interface WinPresentationEvent {
  t: number;                 // Date.now()
  perf: number;              // performance.now()
  name: WinPresentationEventName;
  source: string;            // caller file / function tag
  owner?: string | null;     // 'shell' | '357' | 'horses' | 'scc' | ...
  violation?: WinPresentationViolation | null;
  severity?: 'info' | 'warn' | 'error';
  payload?: Record<string, unknown>;
}

export interface WinAttemptRecord {
  identity: WinAttemptIdentity;
  createdAt: number;
  updatedAt: number;
  events: WinPresentationEvent[];
  hasViolation: boolean;
}

const STORAGE_KEY = 'CANONICAL_WIN_PRESENTATION_LEDGER_v1';
const MAX_ATTEMPTS = 20;
const MAX_EVENTS_PER_ATTEMPT = 200;

type Listener = () => void;
const listeners = new Set<Listener>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function load(): WinAttemptRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WinAttemptRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(records: WinAttemptRecord[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* quota – best effort */
  }
}

function notify(): void {
  for (const l of Array.from(listeners)) {
    try { l(); } catch { /* ignore */ }
  }
}

export function subscribeWinLedger(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function readWinLedger(): WinAttemptRecord[] {
  return load();
}

function upsertAttempt(identity: WinAttemptIdentity): WinAttemptRecord[] {
  const records = load();
  const idx = records.findIndex(r => r.identity.winAttemptId === identity.winAttemptId);
  const now = Date.now();
  if (idx >= 0) {
    // Merge identity (fill missing fields as more info becomes known)
    records[idx].identity = { ...records[idx].identity, ...identity };
    records[idx].updatedAt = now;
    return records;
  }
  records.push({
    identity,
    createdAt: now,
    updatedAt: now,
    events: [],
    hasViolation: false,
  });
  // Cap ring buffer to last MAX_ATTEMPTS
  while (records.length > MAX_ATTEMPTS) records.shift();
  return records;
}

export interface RecordEventArgs {
  identity: WinAttemptIdentity;
  name: WinPresentationEventName;
  source: string;
  owner?: string | null;
  severity?: 'info' | 'warn' | 'error';
  violation?: WinPresentationViolation | null;
  payload?: Record<string, unknown>;
}

export function recordWinPresentationEvent(args: RecordEventArgs): void {
  if (!isBrowser()) return;
  try {
    const records = upsertAttempt(args.identity);
    const rec = records.find(r => r.identity.winAttemptId === args.identity.winAttemptId);
    if (!rec) return;
    const evt: WinPresentationEvent = {
      t: Date.now(),
      perf: typeof performance !== 'undefined' ? performance.now() : 0,
      name: args.name,
      source: args.source,
      owner: args.owner ?? null,
      violation: args.violation ?? null,
      severity: args.severity ?? (args.violation ? 'error' : 'info'),
      payload: args.payload,
    };
    rec.events.push(evt);
    if (rec.events.length > MAX_EVENTS_PER_ATTEMPT) {
      rec.events.splice(0, rec.events.length - MAX_EVENTS_PER_ATTEMPT);
    }
    if (evt.violation) rec.hasViolation = true;
    rec.updatedAt = evt.t;
    save(records);
    notify();
    if (evt.violation) {
      // eslint-disable-next-line no-console
      console.warn('[WIN_LEDGER]', evt.violation, args.identity, args.payload);
    }
  } catch {
    /* never break gameplay */
  }
}

export function recordWinPresentationViolation(
  identity: WinAttemptIdentity,
  violation: WinPresentationViolation,
  source: string,
  payload?: Record<string, unknown>,
): void {
  recordWinPresentationEvent({
    identity,
    name: 'violation',
    source,
    severity: 'error',
    violation,
    payload,
  });
}

export function clearWinLedger(): void {
  if (!isBrowser()) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  notify();
}

export function exportWinLedgerJson(): string {
  const records = load();
  return JSON.stringify(
    { key: STORAGE_KEY, exportedAt: new Date().toISOString(), records },
    null,
    2,
  );
}

export function hasAnyWinAttempts(): boolean {
  return load().length > 0;
}

/**
 * Watchdog for Horses-freeze coverage. Arms a timer against `identity`;
 * if no `confetti-mounted`/`transfer-complete`/`bounce-complete`/
 * `teardown-committed` event is recorded on the same attempt within
 * `deadlineMs`, records a `WIN_PRESENTATION_FROZEN` violation.
 * Idempotent per winAttemptId + label.
 */
const armedWatchdogs = new Set<string>();
export function armWinFreezeWatchdog(
  identity: WinAttemptIdentity,
  deadlineMs: number,
  source: string,
  label: string = 'default',
): void {
  if (!isBrowser()) return;
  const key = `${identity.winAttemptId}::${label}`;
  if (armedWatchdogs.has(key)) return;
  armedWatchdogs.add(key);
  const armedAt = Date.now();
  window.setTimeout(() => {
    try {
      const records = load();
      const rec = records.find(r => r.identity.winAttemptId === identity.winAttemptId);
      const progressed = !!rec?.events.some(e =>
        e.name === 'confetti-mounted' ||
        e.name === 'transfer-complete' ||
        e.name === 'bounce-complete' ||
        e.name === 'teardown-committed'
      );
      if (!progressed) {
        recordWinPresentationViolation(identity, 'WIN_PRESENTATION_FROZEN', source, {
          deadlineMs,
          elapsedMs: Date.now() - armedAt,
          label,
          lastEvent: rec?.events[rec.events.length - 1]?.name ?? null,
          eventCount: rec?.events.length ?? 0,
        });
      }
    } catch { /* */ }
  }, deadlineMs);
}
