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
 *   - Never mutates payload contents, only delays delivery to the local handler.
 *   - When mode === 'off', `simulateRealtime` calls callback synchronously (no allocation).
 *   - Always-visible UI indicator surfaces the active mode.
 *   - Server logic is untouched.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  chaosDeliver,
  startChaosSession,
  stopChaosSession,
  updateChaosRole,
  type ChaosClientRole,
} from './networkSimChaos';

export type NetworkSimMode =
  | 'off'
  | 'moderate'
  | 'heavy'
  | 'reorder'
  | 'cross_country'
  | 'cross_country_chaos';

export const NETWORK_SIM_MODE_LABELS: Record<NetworkSimMode, string> = {
  off: 'Off',
  moderate: 'Moderate Lag',
  heavy: 'Heavy Lag',
  reorder: 'Reorder/Burst',
  cross_country: 'Cross-Country',
  cross_country_chaos: 'Cross-Country Chaos',
};

interface ModeProfile {
  baseMs: number;
  jitterMs: number;
  spikeChance: number; // 0..1
  spikeMs: number;
}

const PROFILES: Record<NetworkSimMode, ModeProfile> = {
  off:           { baseMs: 0,   jitterMs: 0,   spikeChance: 0,    spikeMs: 0 },
  moderate:      { baseMs: 150, jitterMs: 75,  spikeChance: 0,    spikeMs: 0 },
  heavy:         { baseMs: 500, jitterMs: 250, spikeChance: 0,    spikeMs: 0 },
  reorder:       { baseMs: 0,   jitterMs: 600, spikeChance: 0,    spikeMs: 0 },
  cross_country: { baseMs: 250, jitterMs: 100, spikeChance: 0.10, spikeMs: 1200 },
};

// ── Global runtime state (set by NetworkSimProvider) ──────────────
interface RuntimeState {
  mode: NetworkSimMode;
  loggingEnabled: boolean;
  userId: string | null;
  gameId: string | null;
  roundId: string | null;
  handNumber: number | null;
}

const state: RuntimeState = {
  mode: 'off',
  loggingEnabled: false,
  userId: null,
  gameId: null,
  roundId: null,
  handNumber: null,
};

export function configureNetworkSim(partial: Partial<RuntimeState>): void {
  Object.assign(state, partial);
}

export function getNetworkSimMode(): NetworkSimMode {
  return state.mode;
}

export function isNetworkSimActive(): boolean {
  return state.mode !== 'off';
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
    const mode = state.mode;
    if (mode === 'off') {
      callback(payload);
      return;
    }

    const profile = PROFILES[mode];
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
