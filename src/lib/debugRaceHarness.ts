/**
 * Race Harness — Debug-only chaos injection for realtime channel simulation.
 *
 * Wraps event-application callbacks with configurable delay, jitter, and drop
 * to force race windows open during testing.
 *
 * Toggle via:
 *   - URL params:  ?debug_race=1  (enables harness globally)
 *   - localStorage: ptp_debug_race = "1"
 *
 * Per-source config via localStorage (JSON):
 *   ptp_race_config = {
 *     "games":  { "delayMs": 500, "jitterMs": 200, "dropPct": 0, "holdFirst": false },
 *     "rounds": { "delayMs": 0,   "jitterMs": 0,   "dropPct": 0, "holdFirst": true  },
 *     "poll":   { "delayMs": 300,  "jitterMs": 100, "dropPct": 0, "holdFirst": false },
 *     "optimistic":       { "delayMs": 0 },
 *     "presentationApply": { "delayMs": 200 }
 *   }
 *
 * Or via URL params for quick overrides:
 *   ?debug_delay_games_ms=500
 *   ?debug_delay_rounds_ms=0
 *   ?debug_jitter_games_ms=200
 *   ?debug_jitter_rounds_ms=0
 *   ?debug_drop_games_pct=10
 *   ?debug_drop_rounds_pct=0
 *   ?debug_hold_first_rounds=1
 *   ?debug_delay_presentation_apply_ms=200
 *
 * All injection is fire-and-forget. When disabled, applyWithDebugTiming
 * calls the callback synchronously with zero overhead.
 */

// ── Source keys ────────────────────────────────────────────────

export type RaceSourceKey =
  | 'games'
  | 'rounds'
  | 'players'
  | 'poll'
  | 'optimistic'
  | 'presentationApply';

export interface SourceConfig {
  delayMs?: number;
  jitterMs?: number;
  dropPct?: number;
  holdFirst?: boolean;
}

// ── Enable check (cached per page load) ───────────────────────

let _enabled: boolean | null = null;

function checkEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug_race');
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    if (window.localStorage.getItem('ptp_debug_race') === '1') return true;
  } catch { /* */ }
  return false;
}

export function isRaceHarnessEnabled(): boolean {
  if (_enabled === null) _enabled = checkEnabled();
  return _enabled;
}

/** Call after toggling localStorage at runtime */
export function refreshRaceHarnessFlag(): void {
  _enabled = checkEnabled();
  _configCache = null;
}

// ── Config resolution ─────────────────────────────────────────

let _configCache: Record<string, SourceConfig> | null = null;

function getConfig(): Record<string, SourceConfig> {
  if (_configCache) return _configCache;

  const cfg: Record<string, SourceConfig> = {};

  // 1. Parse localStorage JSON config
  try {
    const raw = window.localStorage.getItem('ptp_race_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === 'object' && val !== null) {
          cfg[key] = val as SourceConfig;
        }
      }
    }
  } catch { /* */ }

  // 2. URL param overrides (take precedence)
  try {
    const params = new URLSearchParams(window.location.search);
    const sources: RaceSourceKey[] = ['games', 'rounds', 'players', 'poll', 'optimistic', 'presentationApply'];
    for (const src of sources) {
      const delay = params.get(`debug_delay_${src}_ms`);
      const jitter = params.get(`debug_jitter_${src}_ms`);
      const drop = params.get(`debug_drop_${src}_pct`);
      const holdFirst = params.get(`debug_hold_first_${src}`);

      if (delay || jitter || drop || holdFirst) {
        cfg[src] = cfg[src] ?? {};
        if (delay) cfg[src].delayMs = parseInt(delay, 10) || 0;
        if (jitter) cfg[src].jitterMs = parseInt(jitter, 10) || 0;
        if (drop) cfg[src].dropPct = parseInt(drop, 10) || 0;
        if (holdFirst === '1' || holdFirst === 'true') cfg[src].holdFirst = true;
      }
    }
  } catch { /* */ }

  _configCache = cfg;
  return cfg;
}

function getSourceConfig(source: RaceSourceKey): SourceConfig {
  const cfg = getConfig();
  return cfg[source] ?? {};
}

// ── Hold-first tracking ───────────────────────────────────────

const heldFirstSources = new Set<string>();

// ── Core: applyWithDebugTiming ────────────────────────────────

/**
 * Wraps a callback with optional delay/jitter/drop for race simulation.
 *
 * When race harness is disabled, calls `callback()` synchronously.
 * Returns true if the event was applied (or scheduled), false if dropped.
 */
export function applyWithDebugTiming(
  source: RaceSourceKey,
  callback: () => void,
  context?: Record<string, unknown>,
): boolean {
  // Fast path: no overhead when disabled
  if (!isRaceHarnessEnabled()) {
    callback();
    return true;
  }

  const cfg = getSourceConfig(source);
  const delayMs = cfg.delayMs ?? 0;
  const jitterMs = cfg.jitterMs ?? 0;
  const dropPct = cfg.dropPct ?? 0;
  const holdFirst = cfg.holdFirst ?? false;

  // Drop check
  if (dropPct > 0 && Math.random() * 100 < dropPct) {
    console.log(`[sync-race] 🚫 DROPPED ${source} event (${dropPct}% drop rate)`, context);
    return false;
  }

  // Hold-first check: delay first event from this source indefinitely until next
  if (holdFirst && !heldFirstSources.has(source)) {
    heldFirstSources.add(source);
    console.log(`[sync-race] ⏸️ HELD first ${source} event (holdFirst=true)`, context);
    return false;
  }

  // Calculate total delay
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  const totalDelay = delayMs + jitter;

  if (totalDelay <= 0) {
    console.log(`[sync-race] ⚡ ${source} applied immediately (0ms delay)`, context);
    callback();
    return true;
  }

  console.log(`[sync-race] ⏱️ ${source} delayed ${totalDelay}ms (base=${delayMs}, jitter=${jitter})`, context);
  setTimeout(callback, totalDelay);
  return true;
}

// ── Convenience: wrap a realtime handler ──────────────────────

/**
 * Returns a wrapped version of a realtime event handler that applies
 * chaos injection. Use in place of the raw handler.
 *
 * Example:
 *   .on('postgres_changes', { ... }, wrapRealtimeHandler('games', originalHandler))
 */
export function wrapRealtimeHandler<T>(
  source: RaceSourceKey,
  handler: (payload: T) => void,
): (payload: T) => void {
  if (!isRaceHarnessEnabled()) return handler;

  return (payload: T) => {
    applyWithDebugTiming(
      source,
      () => handler(payload),
      { source, eventReceived: Date.now() },
    );
  };
}

// ── Status summary for debug UI ───────────────────────────────

export function getRaceHarnessStatus(): {
  enabled: boolean;
  config: Record<string, SourceConfig>;
  heldSources: string[];
} {
  return {
    enabled: isRaceHarnessEnabled(),
    config: getConfig(),
    heldSources: Array.from(heldFirstSources),
  };
}
