/**
 * Network Simulation — User-controlled chaos injection for testing
 * cross-country / poor-network conditions in production safely.
 *
 * Modes:
 *   - off              : passthrough, zero overhead
 *   - moderate         : ~150ms ± 75ms delay
 *   - heavy            : ~500ms ± 250ms delay
 *   - reorder          : 0–600ms jitter (causes bursts and reordering)
 *   - cross_country    : ~250ms ± 100ms + occasional 1.2s spikes
 *
 * SAFETY:
 *   - Never mutates payload contents or retries writes.
 *   - When mode === 'off', `simulateRealtime` calls callback synchronously (no allocation).
 *   - Always-visible UI indicator surfaces the active mode.
 *   - Server logic is untouched.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  getActiveChaosProfile,
  startChaosSession,
  stopChaosSession,
  subscribeChaosEvents,
  updateChaosRole,
  type ChaosClientRole,
} from './networkSimChaos';
import {
  getNetworkSimRuntime,
  NETWORK_SIM_MODE_LABELS,
  NETWORK_SIM_PROFILES,
  updateNetworkSimRuntime,
  type NetworkSimMode,
  type NetworkSimRuntimeState,
} from './networkSimRuntime';

export { NETWORK_SIM_MODE_LABELS } from './networkSimRuntime';
export type { NetworkSimMode } from './networkSimRuntime';

let anonymousClientKey: string | null = null;

export function configureNetworkSim(partial: Partial<NetworkSimRuntimeState>): void {
  const previous = getNetworkSimRuntime();
  const prevMode = previous.mode;
  updateNetworkSimRuntime(partial);
  const state = getNetworkSimRuntime();
  const nextMode = state.mode;
  if (prevMode !== nextMode) {
    if (nextMode === 'cross_country_chaos') {
      const seedStr = typeof window !== 'undefined' ? window.localStorage.getItem('ptp_chaos_seed') : null;
      const seed = seedStr ? Number(seedStr) >>> 0 : undefined;
      anonymousClientKey ??= `anon-${Math.random().toString(36).slice(2, 10)}`;
      const clientKey = state.userId ?? anonymousClientKey;
      startChaosSession({ seed, clientKey });
    } else if (prevMode === 'cross_country_chaos') {
      stopChaosSession();
    }
  } else if (nextMode === 'cross_country_chaos') {
    const activeProfile = getActiveChaosProfile();
    if (state.userId && activeProfile && activeProfile.clientKey !== state.userId) {
      startChaosSession({ seed: activeProfile.seed, clientKey: state.userId, role: activeProfile.role });
    }
  }
}

/** Optional hint so the chaos generator can bias per-role randomization. */
export function setChaosClientRole(role: ChaosClientRole): void {
  updateChaosRole(role);
}

export function getNetworkSimMode(): NetworkSimMode {
  return getNetworkSimRuntime().mode;
}

export function isNetworkSimActive(): boolean {
  return getNetworkSimRuntime().mode !== 'off';
}

// ── Logging (batched) ─────────────────────────────────────────────
interface LogEntry {
  user_id: string;
  game_id: string | null;
  round_id: string | null;
  hand_number: number | null;
  sim_mode: string;
  event_type: string;
  source: string | null;
  original_receive_ts: string;
  actual_delivery_ts: string;
  delay_ms: number;
  summary: Record<string, unknown>;
}

let logQueue: LogEntry[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLogFlush(): void {
  if (logFlushTimer) return;
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    const batch = logQueue;
    logQueue = [];
    if (batch.length === 0) return;
    void supabase.from('network_sim_events' as any).insert(batch as any).then(({ error }) => {
      if (error) {
        // Silent — don't break gameplay if logging fails
        console.warn('[networkSim] log insert failed:', error.message);
      }
    });
  }, 1500);
}

function logEvent(eventType: string, source: string, originalTs: number, deliveryTs: number, summary: Record<string, unknown>): void {
  const state = getNetworkSimRuntime();
  if (!state.loggingEnabled || !state.userId) return;
  logQueue.push({
    user_id: state.userId,
    game_id: state.gameId,
    round_id: state.roundId,
    hand_number: state.handNumber,
    sim_mode: state.mode,
    event_type: eventType,
    source,
    original_receive_ts: new Date(originalTs).toISOString(),
    actual_delivery_ts: new Date(deliveryTs).toISOString(),
    delay_ms: Math.max(0, deliveryTs - originalTs),
    summary,
  });
  // Cap queue to avoid runaway memory if Supabase is unreachable
  if (logQueue.length > 200) logQueue = logQueue.slice(-200);
  scheduleLogFlush();
}

// ── Payload summary (small, safe) ─────────────────────────────────
function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as any;
  const newRow = p.new ?? {};
  return {
    eventType: p.eventType ?? null,
    table: p.table ?? null,
    id: newRow.id ?? null,
    status: newRow.status ?? null,
    current_round: newRow.current_round ?? undefined,
    round_number: newRow.round_number ?? undefined,
    hand_number: newRow.hand_number ?? undefined,
  };
}

// ── Core: simulateRealtime ────────────────────────────────────────
/**
 * Wrap a realtime callback. Never mutates the payload — only delays delivery.
 * When mode === 'off', invokes callback synchronously (zero overhead).
 */
export function simulateRealtime<T>(source: string, callback: (payload: T) => void): (payload: T) => void {
  return (payload: T) => {
    const state = getNetworkSimRuntime();
    const mode = state.mode;
    if (mode === 'off') {
      callback(payload);
      return;
    }
    if (mode === 'cross_country_chaos') {
      // Chaos is already applied to the shared Supabase transport. Applying it
      // again here would double-delay the selected callbacks this wrapper owns.
      callback(payload);
      return;
    }

    const profile = NETWORK_SIM_PROFILES[mode];
    const originalTs = Date.now();
    const jitter = profile.jitterMs > 0 ? Math.floor(Math.random() * profile.jitterMs) : 0;
    const spike = profile.spikeChance > 0 && Math.random() < profile.spikeChance ? profile.spikeMs : 0;
    const totalDelay = profile.baseMs + jitter + spike;

    if (totalDelay <= 0) {
      callback(payload);
      logEvent('delivered', source, originalTs, originalTs, { delayMs: 0, ...summarizePayload(payload) });
      return;
    }

    setTimeout(() => {
      const deliveryTs = Date.now();
      try {
        callback(payload);
      } finally {
        const eventType = spike > 0 ? 'spike_delayed' : (mode === 'reorder' ? 'reordered' : 'delayed');
        logEvent(eventType, source, originalTs, deliveryTs, {
          baseMs: profile.baseMs,
          jitter,
          spike,
          ...summarizePayload(payload),
        });
      }
    }, totalDelay);
  };
}

subscribeChaosEvents((event) => {
  logEvent(event.type, event.source ?? 'chaos', event.ts, Date.now(), {
    cycleIndex: event.cycleIndex,
    phaseIndex: event.phaseIndex,
    ...event.detail,
  });
});
