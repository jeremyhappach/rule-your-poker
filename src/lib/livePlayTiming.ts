/** Temporary, count-only observation. Never awaited by a gameplay owner. */
import { buildMetaPayload } from './buildMeta';
import { getClientId } from './clientContext';

export const LIVE_TIMING_UNTIL = Date.parse('2026-09-17T12:00:00Z');
export const LIVE_TIMING_KEY = 'ptp:live-timing:v1';
export interface TimingContext { gameId: string; roundId: string | null; viewerId: string; gameType: string; handNumber: number }
type Metric = Record<string, string | number | boolean | null>;
type Batch = { id: string; at: number; context: TimingContext; samples: Metric[]; dropped: number; attempts: number; build: Record<string, string>; clientId: string; browser: string };
let context: TimingContext | null = null;
let batchContext: TimingContext | null = null;
let samples: Metric[] = [], dropped = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false, installed = false;
const seen = new Set<string>();
type Pending = { id: string; context: TimingContext; roundId: string; expected: number; start: number; background: boolean; received: boolean };
let pending: Pending[] = [];
export const liveTimingEnabled = () => Date.now() < LIVE_TIMING_UNTIL;
const readQueue = (): Batch[] => { try { const value = JSON.parse(localStorage.getItem(LIVE_TIMING_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(b => b?.context && Date.now() - b.at < 86_400_000).slice(-8) : []; } catch { return []; } };
const writeQueue = (q: Batch[]) => { try { localStorage.setItem(LIVE_TIMING_KEY, JSON.stringify(q.slice(-8))); } catch { /* best effort telemetry */ } };
function seal() {
  if (!samples.length || !batchContext) return;
  const batch: Batch = { id: crypto.randomUUID(), at: Date.now(), context: { ...batchContext }, samples, dropped, attempts: 0,
    build: buildMetaPayload(), clientId: getClientId(), browser: navigator.userAgent.slice(0, 180) };
  samples = []; dropped = 0; writeQueue([...readQueue(), batch]);
}
function schedule() {
  if (timer !== undefined) return;
  timer = setTimeout(() => { timer = undefined; try { seal(); void deliverLiveTiming(); } catch { /* cannot affect play */ } }, 15_000);
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
          payload: JSON.parse(JSON.stringify({ version: 1, expiresAt: LIVE_TIMING_UNTIL, ...batch })) }, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(abort.signal);
        if (!error) writeQueue(readQueue().filter(b => b.id !== batch.id));
      } catch { /* next bounded batch/lifecycle may retry */ } finally { clearTimeout(timeout); }
    }
  } catch { /* cannot affect play */ } finally { sending = false; }
}
export function setLiveTimingContext(next: TimingContext) {
  if (!liveTimingEnabled()) return;
  try {
    if (!context || next.roundId !== context.roundId || next.gameId !== context.gameId || next.viewerId !== context.viewerId) { seal(); context = { ...next }; }
    const key = `${next.viewerId}:${next.gameId}:${next.roundId}:${next.gameType}`;
    if (!seen.has(key)) {
      seen.add(key); if (seen.size > 64) seen.delete(seen.values().next().value!);
      record({ kind: 'coverage', state: 'mounted' }, next);
    }
    if (!installed) {
      installed = true;
      const flush = () => { try { seal(); void deliverLiveTiming(); } catch { /* cannot affect play */ } };
      window.addEventListener('pagehide', flush); window.addEventListener('online', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') pending.forEach(p => { p.background = true; }); flush(); });
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) record({ kind: 'longtask', durationMs: entry.duration, foreground: document.visibilityState === 'visible' }); });
        observer.observe({ type: 'longtask' });
        setTimeout(() => observer.disconnect(), Math.max(0, LIVE_TIMING_UNTIL - Date.now()));
      }
      void deliverLiveTiming();
    }
  } catch { /* cannot affect play */ }
}
export function recordCardScan(identity: TimingContext, durationMs: number) {
  setLiveTimingContext(identity);
  record({ kind: 'card-scan', durationMs, foreground: document.visibilityState === 'visible' }, identity);
}
export function clearLiveTimingContext(identity: TimingContext) {
  try {
    if (context?.gameId === identity.gameId && context?.roundId === identity.roundId && context?.viewerId === identity.viewerId) {
      seal(); context = null;
    }
  } catch { /* cannot affect unmount */ }
}
export function parseReplayTiming(headers: Headers) {
  const value = headers.get('x-ptown-replay-ms');
  return value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}
export function withLiveTiming(fetcher: typeof fetch): typeof fetch {
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
    const item: Pending = { id, context: identity, roundId, expected: Number(args._expected_action_count ?? -1), start, background: document.visibilityState !== 'visible', received: false };
    pending = [...pending.filter(p => start - p.start < 60_000), item].slice(-16);
    try {
      const response = await fetcher(input, init);
      item.received = true;
      record({ kind: 'gin-rpc', id, rpc, action, roundId, expectedActionCount: item.expected,
        responseHeadersMs: performance.now() - start, replayMs: parseReplayTiming(response.headers), status: response.status,
        foreground: !item.background && document.visibilityState === 'visible' }, identity);
      if (!response.ok) pending = pending.filter(p => p !== item);
      return response;
    } catch (error) {
      record({ kind: 'gin-rpc', id, rpc, action, roundId, responseHeadersMs: performance.now() - start, failed: true, foreground: !item.background }, identity);
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
