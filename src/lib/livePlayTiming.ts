/** Bounded, sampled observation. Never awaited by a gameplay owner. */
import { buildMetaPayload } from './buildMeta';
import { getClientId } from './clientContext';
import type { NetworkSimMode } from './networkSimRuntime';
import type { ChaosPhaseKind } from './networkSimChaos';

export const LIVE_TIMING_KEY = 'ptp:live-timing:v1';
export const LIVE_TIMING_SAMPLE_RATE = 0.25;
export const LIVE_TIMING_FLUSH_MS = 60_000;
export interface TimingContext { gameId: string; roundId: string | null; viewerId: string; gameType: string; handNumber: number }
type Metric = Record<string, string | number | boolean | null>;
/** One request-local observation; never passed to fetch or retained with operands. */
export interface LiveFetchTiming {
  networkSimMode: NetworkSimMode | null;
  chaosPhase: ChaosPhaseKind | null;
  injectedDelayPlannedMs: number;
  injectedDelayMs: number;
  nativeFetchMs: number | null;
  simulationFailure: 'before-send' | 'response-loss' | null;
}
type ObservedFetch = (input: RequestInfo | URL, init?: RequestInit, timing?: LiveFetchTiming) => Promise<Response>;
const transportFields = (timing: LiveFetchTiming): Metric => ({
  transportTimingVersion: 1, networkSimMode: timing.networkSimMode, chaosPhase: timing.chaosPhase,
  injectedDelayPlannedMs: timing.injectedDelayPlannedMs, injectedDelayMs: timing.injectedDelayMs,
  nativeFetchMs: timing.nativeFetchMs, simulationFailure: timing.simulationFailure,
});
type Batch = { id: string; at: number; context: TimingContext; samples: Metric[]; dropped: number; attempts: number; build: Record<string, string>; clientId: string; browser: string };
let context: TimingContext | null = null;
let batchContext: TimingContext | null = null;
let samples: Metric[] = [], dropped = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false, installed = false;
let observer: PerformanceObserver | undefined;
let ready: Batch[] = [];
let lastScanSample = -Infinity;
const seen = new Set<string>();
type Pending = { id: string; context: TimingContext; roundId: string; expected: number; start: number; background: boolean; received: boolean; retain: boolean };
let pending: Pending[] = [];
export const liveTimingEnabled = () => true;
const readQueue = (): Batch[] => { try { const value = JSON.parse(localStorage.getItem(LIVE_TIMING_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(b => b?.context && Date.now() - b.at < 86_400_000).slice(-8) : []; } catch { return []; } };
const writeQueue = (q: Batch[]) => { try { localStorage.setItem(LIVE_TIMING_KEY, JSON.stringify(q.slice(-8))); } catch { /* best effort telemetry */ } };
function seal() {
  if (!samples.length || !batchContext) return;
  const batch: Batch = { id: crypto.randomUUID(), at: Date.now(), context: { ...batchContext }, samples, dropped, attempts: 0,
    build: buildMetaPayload(), clientId: getClientId(), browser: navigator.userAgent.slice(0, 180) };
  samples = []; dropped = 0; ready = [...ready, batch].slice(-8);
}
// Storage serialization happens only on a scheduled flush or page exit, never
// on an action response, React commit, or hand identity change.
function persist() { if (ready.length) { writeQueue([...readQueue(), ...ready]); ready = []; } }
function schedule() {
  if (timer !== undefined) return;
  timer = setTimeout(() => { timer = undefined; try { seal(); persist(); void deliverLiveTiming(); } catch { /* cannot affect play */ } }, LIVE_TIMING_FLUSH_MS);
}
function record(metric: Metric, identity = context) {
  if (!liveTimingEnabled() || !identity) return;
  try {
    if (!batchContext || identity.gameId !== batchContext.gameId || identity.roundId !== batchContext.roundId || identity.viewerId !== batchContext.viewerId) { seal(); batchContext = { ...identity }; }
    if (samples.length < 128) samples.push({ at: Date.now(), ...metric }); else dropped++;
    schedule();
  } catch { /* cannot affect play */ }
}
export async function deliverLiveTiming() {
  if (sending || !navigator.onLine) return;
  sending = true;
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data } = await supabase.auth.getSession();
    const viewer = data.session?.user.id;
    for (const batch of readQueue().filter(b => b.context.viewerId === viewer && b.attempts < 3).slice(0, 2)) {
      batch.attempts++; writeQueue(readQueue().map(b => b.id === batch.id ? batch : b));
      const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 5_000);
      try {
        const { error } = await supabase.from('debug_events').upsert({ id: batch.id, game_id: batch.context.gameId,
          round_id: batch.context.roundId, user_id: viewer, client_role: 'live-timing', event_type: 'live-play-timing-v1',
          payload: JSON.parse(JSON.stringify({ version: 2, policy: 'sampled-continuous/1', sampleRate: LIVE_TIMING_SAMPLE_RATE, retentionDays: 7, ...batch })) }, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(abort.signal);
        if (!error) writeQueue(readQueue().filter(b => b.id !== batch.id));
      } catch { /* next bounded batch/lifecycle may retry */ } finally { clearTimeout(timeout); }
    }
  } catch { /* cannot affect play */ } finally { sending = false; }
}
export function setLiveTimingContext(next: TimingContext) {
  if (!liveTimingEnabled()) return;
  try {
    if (!context || next.roundId !== context.roundId || next.gameId !== context.gameId || next.viewerId !== context.viewerId || next.gameType !== context.gameType) { seal(); context = { ...next }; lastScanSample = -Infinity; }
    const key = `${next.viewerId}:${next.gameId}:${next.roundId}:${next.gameType}`;
    if (!seen.has(key)) {
      seen.add(key); if (seen.size > 64) seen.delete(seen.values().next().value!);
      record({ kind: 'coverage', state: 'mounted' }, next);
    }
    if (!installed) {
      installed = true;
      const flush = () => { try { seal(); persist(); void deliverLiveTiming(); } catch { /* cannot affect play */ } };
      window.addEventListener('pagehide', flush); window.addEventListener('online', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') pending.forEach(p => { p.background = true; }); flush(); });
      void deliverLiveTiming();
    }
    if (!observer && typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) record({ kind: 'longtask', durationMs: entry.duration, foreground: document.visibilityState === 'visible' }); });
      observer.observe({ type: 'longtask' });
    }
  } catch { /* cannot affect play */ }
}
export function recordCardScan(identity: TimingContext, durationMs: number) {
  setLiveTimingContext(identity);
  // At most one ordinary scan sample per five seconds, plus slow scans.
  const periodic = performance.now() - lastScanSample >= 5_000;
  if (durationMs < 10 && !periodic) return;
  lastScanSample = performance.now();
  record({ kind: 'card-scan', sampleClass: periodic ? 'periodic' : 'slow', durationMs, foreground: document.visibilityState === 'visible' }, identity);
}
export function clearLiveTimingContext(identity: TimingContext) {
  try {
    if (context?.gameId === identity.gameId && context?.roundId === identity.roundId && context?.viewerId === identity.viewerId) {
      seal(); context = null; observer?.disconnect(); observer = undefined;
    }
  } catch { /* cannot affect unmount */ }
}
export function parseReplayTiming(headers: Headers) {
  const value = headers.get('x-ptown-replay-ms');
  return value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}
export function withLiveTiming(fetcher: ObservedFetch): typeof fetch {
  return async (input, init) => {
    if (!liveTimingEnabled() || !context || context.gameType !== 'gin-rummy') return fetcher(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rpc = url.match(/\/rest\/v1\/rpc\/(gin_rummy_[a-z_]+|start_gin_rummy_initial_hand)(?:\?|$)/)?.[1];
    if (!rpc || rpc === 'gin_rummy_get_state') return fetcher(input, init);
    let args: Record<string, unknown> = {};
    try { if (typeof init?.body === 'string') args = JSON.parse(init.body); } catch { /* never retain raw request */ }
    const identity = { ...context };
    const roundId = String(args._round_id ?? args.p_round_id ?? args._predecessor_round_id ?? identity.roundId ?? '');
    const action = typeof args._action === 'string' && /^[a-z_]{1,40}$/.test(args._action) ? args._action : rpc;
    const start = performance.now(); const id = crypto.randomUUID();
    const timing: LiveFetchTiming = { networkSimMode: null, chaosPhase: null, injectedDelayPlannedMs: 0,
      injectedDelayMs: 0, nativeFetchMs: null, simulationFailure: null };
    const sampled = Math.random() < LIVE_TIMING_SAMPLE_RATE;
    const lifecycle = !['draw_stock', 'draw_discard', 'discard', 'pass_first_draw', 'take_first_draw', 'lay_off'].includes(action);
    const item: Pending = { id, context: identity, roundId, expected: Number(args._expected_action_count ?? -1), start, background: document.visibilityState !== 'visible', received: false, retain: sampled || lifecycle };
    pending = [...pending.filter(p => start - p.start < 60_000), item].slice(-16);
    try {
      const response = await fetcher(input, init, timing);
      item.received = true;
      const elapsed = performance.now() - start;
      item.retain ||= elapsed >= 1_000 || !response.ok;
      if (item.retain) record({ kind: 'gin-rpc', id, rpc, action, roundId, expectedActionCount: item.expected,
        sampleClass: sampled ? 'random' : !response.ok ? 'error' : lifecycle ? 'lifecycle' : 'slow',
        ...transportFields(timing),
        responseHeadersMs: elapsed, replayMs: parseReplayTiming(response.headers), status: response.status,
        foreground: !item.background && document.visibilityState === 'visible' }, identity);
      if (!response.ok || !item.retain) pending = pending.filter(p => p !== item);
      return response;
    } catch (error) {
      record({ kind: 'gin-rpc', id, rpc, action, roundId, sampleClass: sampled ? 'random' : 'error', ...transportFields(timing), responseHeadersMs: performance.now() - start, failed: true, foreground: !item.background && document.visibilityState === 'visible' }, identity);
      pending = pending.filter(p => p !== item); throw error;
    }
  };
}
/** Called after the committed caller projection has been parsed, before UI publication. */
export function recordGinResponse(roundId: string, actionCount: number, outcome: string) {
  const item = pending.find(p => p.roundId === roundId && p.received && p.expected === actionCount - 1);
  if (!item) return;
  record({ kind: 'gin-response', id: item.id, outcome, actionCount, responseMs: performance.now() - item.start, foreground: !item.background }, item.context);
  if (outcome !== 'applied') pending = pending.filter(p => p !== item);
}
/** React commit + two animation frames: a paint opportunity, not animation completion. */
export function recordGinTableCommit(identity: TimingContext, actionCount: number) {
  setLiveTimingContext(identity);
  for (const item of pending.filter(p => p.received && p.context.gameId === identity.gameId && p.roundId === identity.roundId && p.expected >= 0 && actionCount === p.expected + 1)) {
    pending = pending.filter(p => p !== item);
    const committedMs = performance.now() - item.start;
    requestAnimationFrame(() => requestAnimationFrame(() => record({ kind: 'gin-paint-opportunity', id: item.id, actionCount,
      committedMs, paintOpportunityMs: performance.now() - item.start, foreground: !item.background && document.visibilityState === 'visible' }, item.context)));
  }
}
