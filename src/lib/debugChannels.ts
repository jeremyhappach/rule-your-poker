/**
 * Unified debug channel registry.
 *
 * Production posture: all channels OFF by default. Each channel is a named
 * forensic surface that callers can short-circuit cheaply before building
 * expensive payloads.
 *
 * Two enablement mechanisms are supported (any-of):
 *
 *   1. Master switch — comma-separated channel list:
 *        URL:          ?ptp_debug=sync,holm-reveal,dice
 *        localStorage: ptp_debug = "sync,holm-reveal"
 *        Wildcard:     ?ptp_debug=*   (enables every channel)
 *
 *   2. Legacy per-channel flags (kept for backwards compatibility, see CHANNELS):
 *        URL:          ?debug_<name>=1
 *        localStorage: ptp_debug_<name> = "1"
 *
 * NOTE: This module does NOT replace existing flag helpers. It provides a
 * single check (`isDebugChannel(name)`) that callers wrap expensive payload
 * construction in. Existing call sites continue to work unchanged.
 */

export type DebugChannel =
  | 'sync'          // persistSyncDebugEvent transitions (legacy: ptp_debug_sync_events)
  | 'sync-invariants' // verbose invariant summaries (legacy: ptp_debug_sync_invariants)
  | 'events'        // debugEventLogger (legacy: ptp_debug_events)
  | 'holm-reveal'   // Holm reveal L2/L3 (legacy: ptp_debug_holm_reveal)
  | 'race'          // race harness (legacy: ptp_debug_race)
  | 'dice'          // dice presentation trace + snapshots
  | 'yahtzee-held'  // yahtzee held-die trace
  | 'cribbage'      // cribbage handoff + per-action chatter
  | 'enforce';      // edge function verbose (consumed server-side via env)

interface ChannelDef {
  /** Master-switch keyword in ?ptp_debug= list */
  key: DebugChannel;
  /** Legacy URL param name (without leading '?') */
  legacyUrl: string;
  /** Legacy localStorage key */
  legacyLs: string;
}

const CHANNELS: readonly ChannelDef[] = [
  { key: 'sync',            legacyUrl: 'debug_sync_events',     legacyLs: 'ptp_debug_sync_events' },
  { key: 'sync-invariants', legacyUrl: 'debug_sync_invariants', legacyLs: 'ptp_debug_sync_invariants' },
  { key: 'events',          legacyUrl: 'debug_events',          legacyLs: 'ptp_debug_events' },
  { key: 'holm-reveal',     legacyUrl: 'debug_holm_reveal',     legacyLs: 'ptp_debug_holm_reveal' },
  { key: 'race',            legacyUrl: 'debug_race',            legacyLs: 'ptp_debug_race' },
  { key: 'dice',            legacyUrl: 'debug_dice',            legacyLs: 'ptp_debug_dice' },
  { key: 'yahtzee-held',    legacyUrl: 'debug_yahtzee_held',    legacyLs: 'ptp_debug_yahtzee_held' },
  { key: 'cribbage',        legacyUrl: 'debug_cribbage',        legacyLs: 'ptp_debug_cribbage' },
  { key: 'enforce',         legacyUrl: 'debug_enforce',         legacyLs: 'ptp_debug_enforce' },
];

let _masterChannels: Set<string> | null = null;
let _channelCache: Partial<Record<DebugChannel, boolean>> = {};

function readMaster(): Set<string> {
  if (_masterChannels) return _masterChannels;
  const set = new Set<string>();
  const collect = (raw: string | null | undefined) => {
    if (!raw) return;
    for (const part of raw.split(',')) {
      const v = part.trim().toLowerCase();
      if (v) set.add(v);
    }
  };
  try {
    const params = new URLSearchParams(window.location.search);
    collect(params.get('ptp_debug'));
  } catch { /* */ }
  try {
    collect(window.localStorage.getItem('ptp_debug'));
  } catch { /* */ }
  _masterChannels = set;
  return set;
}

function isLegacyOn(def: ChannelDef): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(def.legacyUrl);
    if (v === '0' || v?.toLowerCase() === 'false') return false;
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    const stored = window.localStorage.getItem(def.legacyLs);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch { /* */ }
  return false;
}

/**
 * Cheap check — call this BEFORE building any expensive debug payload.
 * Memoized after first call per channel; call `refreshDebugChannels()` to clear.
 */
export function isDebugChannel(channel: DebugChannel): boolean {
  const cached = _channelCache[channel];
  if (cached !== undefined) return cached;

  const master = readMaster();
  if (master.has('*') || master.has(channel)) {
    _channelCache[channel] = true;
    return true;
  }
  const def = CHANNELS.find((c) => c.key === channel);
  const on = def ? isLegacyOn(def) : false;
  _channelCache[channel] = on;
  return on;
}

/** Re-read flags (after runtime toggling). */
export function refreshDebugChannels(): void {
  _masterChannels = null;
  _channelCache = {};
}

/** For diagnostics UIs — current channel states (does not trigger reads). */
export function listDebugChannels(): readonly DebugChannel[] {
  return CHANNELS.map((c) => c.key);
}
