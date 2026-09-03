/**
 * Cribbage liveness flight recorder.
 *
 * This recorder is deliberately local-only while it is running. A player
 * explicitly starts it from the Debug Tray, it retains a small card-free
 * trace in sessionStorage across a normal reload, and Send uploads one
 * bounded evidence capsule to the existing debug_events sink.
 *
 * It is diagnostic-only: no gameplay owner reads this state, and it never
 * starts polling, retries a request, or changes Realtime behavior.
 */

import { supabase } from '@/integrations/supabase/client';
import { buildMetaPayload } from '@/lib/buildMeta';
import { getClientId, getClientTimestamp } from '@/lib/clientContext';

const STORAGE_KEY = 'ptp:cribbage-liveness-trace:v1';
export const CRIBBAGE_LIVENESS_TRACE_MAX_ENTRIES = 60;
const MAX_PAYLOAD_JSON_CHARS = 900;

export type CribbageLivenessTraceMode = 'idle' | 'recording' | 'stopped';

export interface CribbageLivenessTraceIdentity {
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  phase: string | null;
  gameStatus: string | null;
  viewerUserId: string | null;
}

export interface CribbageLivenessTraceEntry {
  sequence: number;
  at: string;
  kind: string;
  identity: Omit<CribbageLivenessTraceIdentity, 'viewerUserId'>;
  payload: Record<string, unknown>;
}

export interface CribbageLivenessTraceSnapshot {
  mode: CribbageLivenessTraceMode;
  traceId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  sentAt: string | null;
  lastSendError: string | null;
  identity: CribbageLivenessTraceIdentity;
  entries: readonly CribbageLivenessTraceEntry[];
}

const EMPTY_IDENTITY: CribbageLivenessTraceIdentity = {
  gameId: null,
  dealerGameId: null,
  roundId: null,
  handNumber: null,
  phase: null,
  gameStatus: null,
  viewerUserId: null,
};

const EMPTY_SNAPSHOT: CribbageLivenessTraceSnapshot = {
  mode: 'idle',
  traceId: null,
  startedAt: null,
  stoppedAt: null,
  sentAt: null,
  lastSendError: null,
  identity: EMPTY_IDENTITY,
  entries: [],
};

let snapshot = readStoredSnapshot() ?? EMPTY_SNAPSHOT;
let sequence = snapshot.entries.at(-1)?.sequence ?? 0;
let lifecycleListenersInstalled = false;
const listeners = new Set<() => void>();

function identityForEntry(identity: CribbageLivenessTraceIdentity) {
  const { viewerUserId: _viewerUserId, ...entryIdentity } = identity;
  return entryIdentity;
}

function boundedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(payload);
    if (json.length <= MAX_PAYLOAD_JSON_CHARS) return JSON.parse(json) as Record<string, unknown>;
    return {
      truncated: true,
      originalLength: json.length,
      preview: json.slice(0, MAX_PAYLOAD_JSON_CHARS),
    };
  } catch {
    return { unserializable: true };
  }
}

function validStoredSnapshot(value: unknown): value is CribbageLivenessTraceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CribbageLivenessTraceSnapshot>;
  return (
    (candidate.mode === 'idle' || candidate.mode === 'recording' || candidate.mode === 'stopped')
    && Array.isArray(candidate.entries)
    && !!candidate.identity
  );
}

function readStoredSnapshot(): CribbageLivenessTraceSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validStoredSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    if (snapshot.mode === 'idle') {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage is best-effort only; the recorder must never affect gameplay.
  }
}

function emit(): void {
  persist();
  listeners.forEach((listener) => listener());
}

function update(next: CribbageLivenessTraceSnapshot): void {
  snapshot = next;
  emit();
}

function recordLifecycle(kind: string, payload: Record<string, unknown>): void {
  recordCribbageLivenessTrace(kind, payload);
}

function installLifecycleListeners(): void {
  if (lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = true;
  window.addEventListener('pagehide', (event) => {
    recordLifecycle('browser.pagehide', { persisted: event.persisted });
  });
  window.addEventListener('pageshow', (event) => {
    recordLifecycle('browser.pageshow', { persisted: event.persisted });
  });
  window.addEventListener('online', () => recordLifecycle('browser.online', {}));
  window.addEventListener('offline', () => recordLifecycle('browser.offline', {}));
  document.addEventListener('visibilitychange', () => {
    recordLifecycle('browser.visibility', { state: document.visibilityState });
  });
}

export function getCribbageLivenessTraceSnapshot(): CribbageLivenessTraceSnapshot {
  if (snapshot.mode === 'recording') installLifecycleListeners();
  return snapshot;
}

export function isCribbageLivenessTraceForGame(gameId: string | null | undefined): boolean {
  return !!gameId && snapshot.identity.gameId === gameId && snapshot.mode === 'recording';
}

export function subscribeCribbageLivenessTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCribbageLivenessTraceIdentity(
  next: Partial<CribbageLivenessTraceIdentity>,
): void {
  if (snapshot.mode === 'recording') installLifecycleListeners();
  const identity = { ...snapshot.identity, ...next };
  if (
    identity.gameId === snapshot.identity.gameId
    && identity.dealerGameId === snapshot.identity.dealerGameId
    && identity.roundId === snapshot.identity.roundId
    && identity.handNumber === snapshot.identity.handNumber
    && identity.phase === snapshot.identity.phase
    && identity.gameStatus === snapshot.identity.gameStatus
    && identity.viewerUserId === snapshot.identity.viewerUserId
  ) return;
  update({ ...snapshot, identity });
}

export function clearCribbageLivenessTraceIdentity(): void {
  if (snapshot.identity.gameId === null) return;
  update({ ...snapshot, identity: EMPTY_IDENTITY });
}

export function startCribbageLivenessTrace(): boolean {
  if (!snapshot.identity.gameId) return false;
  installLifecycleListeners();
  sequence = 0;
  update({
    mode: 'recording',
    traceId: `crib-live:${getClientId()}:${Date.now().toString(36)}`,
    startedAt: getClientTimestamp(),
    stoppedAt: null,
    sentAt: null,
    lastSendError: null,
    identity: snapshot.identity,
    entries: [],
  });
  recordCribbageLivenessTrace('trace.started', {
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
  });
  return true;
}

export function stopCribbageLivenessTrace(): void {
  if (snapshot.mode !== 'recording') return;
  recordCribbageLivenessTrace('trace.stopped', {});
  update({ ...snapshot, mode: 'stopped', stoppedAt: getClientTimestamp() });
}

export function recordCribbageLivenessTrace(
  kind: string,
  payload: Record<string, unknown> = {},
): void {
  if (snapshot.mode !== 'recording' || !snapshot.identity.gameId) return;
  const entry: CribbageLivenessTraceEntry = {
    sequence: ++sequence,
    at: getClientTimestamp(),
    kind,
    identity: identityForEntry(snapshot.identity),
    payload: boundedPayload(payload),
  };
  const entries = [...snapshot.entries, entry].slice(-CRIBBAGE_LIVENESS_TRACE_MAX_ENTRIES);
  update({ ...snapshot, entries });
}

export async function sendCribbageLivenessTrace(): Promise<boolean> {
  if (
    snapshot.mode !== 'stopped'
    || !snapshot.identity.gameId
    || !snapshot.traceId
    || snapshot.entries.length === 0
  ) return false;

  const { identity } = snapshot;
  const { error } = await supabase.from('debug_events' as never).insert({
    game_id: identity.gameId,
    round_id: identity.roundId,
    user_id: identity.viewerUserId,
    client_role: 'cribbage-liveness-recorder',
    event_type: 'cribbage.liveness_trace',
    payload: {
      traceVersion: 1,
      traceId: snapshot.traceId,
      startedAt: snapshot.startedAt,
      stoppedAt: snapshot.stoppedAt,
      sentAt: getClientTimestamp(),
      clientId: getClientId(),
      ...buildMetaPayload(),
      identity: identityForEntry(identity),
      entries: snapshot.entries,
    },
  } as never);

  if (error) {
    update({ ...snapshot, lastSendError: error.message || 'send-failed' });
    return false;
  }
  update({ ...snapshot, sentAt: getClientTimestamp(), lastSendError: null });
  return true;
}

/** Test-only reset. */
export function resetCribbageLivenessTraceForTest(): void {
  sequence = 0;
  snapshot = EMPTY_SNAPSHOT;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}
