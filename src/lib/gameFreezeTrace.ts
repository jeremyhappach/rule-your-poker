/**
 * Player-operated, game-neutral freeze recorder.
 *
 * Recording is local/sessionStorage-only until the player explicitly taps
 * Send. It is card-free, bounded, refresh-safe, and has no gameplay side
 * effects: no polling, retries, state ownership, or Realtime changes.
 */
import { supabase } from '@/integrations/supabase/client';
import { buildMetaPayload } from '@/lib/buildMeta';
import { getClientId, getClientTimestamp } from '@/lib/clientContext';

const STORAGE_KEY = 'ptp:game-freeze-trace:v1';
export const GAME_FREEZE_TRACE_MAX_ENTRIES = 60;
const MAX_PAYLOAD_JSON_CHARS = 900;

export type GameFreezeTraceMode = 'idle' | 'recording' | 'stopped';

export interface GameFreezeTraceIdentity {
  gameId: string | null;
  gameType: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  phase: string | null;
  gameStatus: string | null;
  viewerUserId: string | null;
}

export interface GameFreezeTraceEntry {
  sequence: number;
  at: string;
  kind: string;
  identity: Omit<GameFreezeTraceIdentity, 'viewerUserId'>;
  payload: Record<string, unknown>;
}

export interface GameFreezeTraceSnapshot {
  mode: GameFreezeTraceMode;
  traceId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  sentAt: string | null;
  lastSendError: string | null;
  identity: GameFreezeTraceIdentity;
  entries: readonly GameFreezeTraceEntry[];
}

const EMPTY_IDENTITY: GameFreezeTraceIdentity = {
  gameId: null, gameType: null, dealerGameId: null, roundId: null,
  handNumber: null, phase: null, gameStatus: null, viewerUserId: null,
};
const EMPTY_SNAPSHOT: GameFreezeTraceSnapshot = {
  mode: 'idle', traceId: null, startedAt: null, stoppedAt: null, sentAt: null,
  lastSendError: null, identity: EMPTY_IDENTITY, entries: [],
};

let snapshot = readStoredSnapshot() ?? EMPTY_SNAPSHOT;
let sequence = snapshot.entries.at(-1)?.sequence ?? 0;
let lifecycleListenersInstalled = false;
const listeners = new Set<() => void>();

function identityForEntry(identity: GameFreezeTraceIdentity) {
  const { viewerUserId: _viewerUserId, ...entryIdentity } = identity;
  return entryIdentity;
}

function boundedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(payload);
    return json.length <= MAX_PAYLOAD_JSON_CHARS
      ? JSON.parse(json) as Record<string, unknown>
      : { truncated: true, originalLength: json.length, preview: json.slice(0, MAX_PAYLOAD_JSON_CHARS) };
  } catch {
    return { unserializable: true };
  }
}

function validStoredSnapshot(value: unknown): value is GameFreezeTraceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameFreezeTraceSnapshot>;
  return (
    (candidate.mode === 'idle' || candidate.mode === 'recording' || candidate.mode === 'stopped')
    && Array.isArray(candidate.entries) && !!candidate.identity
  );
}

function readStoredSnapshot(): GameFreezeTraceSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw && validStoredSnapshot(JSON.parse(raw)) ? JSON.parse(raw) as GameFreezeTraceSnapshot : null;
  } catch { return null; }
}

function emit(): void {
  if (typeof window !== 'undefined') {
    try {
      if (snapshot.mode === 'idle') window.sessionStorage.removeItem(STORAGE_KEY);
      else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch { /* storage is diagnostic-only */ }
  }
  listeners.forEach((listener) => listener());
}

function update(next: GameFreezeTraceSnapshot): void { snapshot = next; emit(); }

function installLifecycleListeners(): void {
  if (lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = true;
  window.addEventListener('pagehide', (event) => recordGameFreezeTrace('browser.pagehide', { persisted: event.persisted }));
  window.addEventListener('pageshow', (event) => recordGameFreezeTrace('browser.pageshow', { persisted: event.persisted }));
  window.addEventListener('online', () => recordGameFreezeTrace('browser.online'));
  window.addEventListener('offline', () => recordGameFreezeTrace('browser.offline'));
  document.addEventListener('visibilitychange', () => recordGameFreezeTrace('browser.visibility', { state: document.visibilityState }));
}

export function getGameFreezeTraceSnapshot(): GameFreezeTraceSnapshot {
  if (snapshot.mode === 'recording') installLifecycleListeners();
  return snapshot;
}
export function isGameFreezeTraceForGame(gameId: string | null | undefined): boolean {
  return !!gameId && snapshot.identity.gameId === gameId && snapshot.mode === 'recording';
}
export function subscribeGameFreezeTrace(listener: () => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
export function setGameFreezeTraceIdentity(next: Partial<GameFreezeTraceIdentity>): void {
  if (snapshot.mode === 'recording') installLifecycleListeners();
  const identity = { ...snapshot.identity, ...next };
  if (JSON.stringify(identity) !== JSON.stringify(snapshot.identity)) update({ ...snapshot, identity });
}
export function clearGameFreezeTraceIdentity(): void {
  if (snapshot.identity.gameId !== null) update({ ...snapshot, identity: EMPTY_IDENTITY });
}
export function startGameFreezeTrace(): boolean {
  if (!snapshot.identity.gameId) return false;
  installLifecycleListeners(); sequence = 0;
  update({ mode: 'recording', traceId: `game-freeze:${getClientId()}:${Date.now().toString(36)}`,
    startedAt: getClientTimestamp(), stoppedAt: null, sentAt: null, lastSendError: null,
    identity: snapshot.identity, entries: [] });
  recordGameFreezeTrace('trace.started', { online: typeof navigator === 'undefined' ? null : navigator.onLine });
  return true;
}
export function stopGameFreezeTrace(): void {
  if (snapshot.mode !== 'recording') return;
  recordGameFreezeTrace('trace.stopped');
  update({ ...snapshot, mode: 'stopped', stoppedAt: getClientTimestamp() });
}
export function recordGameFreezeTrace(kind: string, payload: Record<string, unknown> = {}): void {
  if (snapshot.mode !== 'recording' || !snapshot.identity.gameId) return;
  const entry: GameFreezeTraceEntry = { sequence: ++sequence, at: getClientTimestamp(), kind,
    identity: identityForEntry(snapshot.identity), payload: boundedPayload(payload) };
  update({ ...snapshot, entries: [...snapshot.entries, entry].slice(-GAME_FREEZE_TRACE_MAX_ENTRIES) });
}
export async function sendGameFreezeTrace(): Promise<boolean> {
  if (snapshot.mode !== 'stopped' || !snapshot.identity.gameId || !snapshot.traceId || !snapshot.entries.length) return false;
  const { identity } = snapshot;
  const { error } = await supabase.from('debug_events' as never).insert({
    game_id: identity.gameId, round_id: identity.roundId, user_id: identity.viewerUserId,
    client_role: 'game-freeze-recorder', event_type: 'game.freeze_trace',
    payload: { traceVersion: 1, traceId: snapshot.traceId, startedAt: snapshot.startedAt,
      stoppedAt: snapshot.stoppedAt, sentAt: getClientTimestamp(), clientId: getClientId(),
      ...buildMetaPayload(), identity: identityForEntry(identity), entries: snapshot.entries },
  } as never);
  if (error) { update({ ...snapshot, lastSendError: error.message || 'send-failed' }); return false; }
  update({ ...snapshot, sentAt: getClientTimestamp(), lastSendError: null });
  return true;
}
export function resetGameFreezeTraceForTest(): void {
  sequence = 0; snapshot = EMPTY_SNAPSHOT;
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}
