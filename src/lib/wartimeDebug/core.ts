/**
 * Wartime Debug Framework — shell-owned platform instrumentation.
 *
 * Single recorder that captures identity / lifecycle / ownership / geometry /
 * rendering / announcement / animation / network / database / gameplay events
 * across the entire platform.
 *
 * Design goals:
 *   1. Zero overhead when Wartime Debug is OFF (recordWartime() returns
 *      immediately; bridges to existing instrumentation are not attached).
 *   2. Single global enable flag (persisted in localStorage), separate from
 *      "Recording" state — enabling the framework just allows recording to
 *      begin; the user still presses START to capture a trace.
 *   3. Ring buffer (10k events) so a normal repro never auto-purges.
 *   4. Transition-snapshot helper that diffs a "before" and "after" payload.
 */

import { useSyncExternalStore } from 'react';

export type WartimeCategory =
  | 'IDENTITY'
  | 'LIFECYCLE'
  | 'OWNERSHIP'
  | 'GEOMETRY'
  | 'RENDERING'
  | 'ANNOUNCEMENTS'
  | 'CELEBRATIONS'
  | 'ANIMATIONS'
  | 'SEATING'
  | 'NETWORK'
  | 'DATABASE'
  | 'GAMEPLAY';

export const WARTIME_CATEGORIES: WartimeCategory[] = [
  'IDENTITY',
  'LIFECYCLE',
  'OWNERSHIP',
  'GEOMETRY',
  'RENDERING',
  'ANNOUNCEMENTS',
  'CELEBRATIONS',
  'ANIMATIONS',
  'SEATING',
  'NETWORK',
  'DATABASE',
  'GAMEPLAY',
];

export interface WartimeEvent {
  seq: number;
  category: WartimeCategory;
  event: string;
  wallTime: string;
  epochMs: number;
  perfMs: number;
  payload?: Record<string, unknown>;
}

const MAX_EVENTS = 25000;
const ENABLED_KEY = 'ptp_wartime_debug_enabled';

let _enabled = false;
let _recording = false;
let _events: WartimeEvent[] = [];
let _seq = 0;
let _dropped = 0;
let _startedAtMs: number | null = null;
let _stoppedAtMs: number | null = null;

const _listeners = new Set<() => void>();
const _enableListeners = new Set<() => void>();

function _nowPerf(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function _emit() {
  // Snapshot the array reference so useSyncExternalStore notices changes.
  _events = _events.length > MAX_EVENTS ? _events.slice(_events.length - MAX_EVENTS) : _events.slice();
  for (const l of _listeners) l();
}

function _emitEnable() {
  for (const l of _enableListeners) l();
}

// ------------------------------------------------------------------
// Enable flag (persisted)
// ------------------------------------------------------------------
function _readEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  _enabled = _readEnabled();
  window.addEventListener('storage', (e) => {
    if (e.key === ENABLED_KEY) {
      _enabled = _readEnabled();
      if (!_enabled && _recording) stopWartimeRecording('disabled');
      _emitEnable();
    }
  });
}

export function isWartimeEnabled(): boolean {
  return _enabled;
}

export function setWartimeEnabled(next: boolean): void {
  _enabled = next;
  try {
    if (next) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  if (!next && _recording) stopWartimeRecording('disabled');
  _emitEnable();
}

export function subscribeWartimeEnabled(cb: () => void): () => void {
  _enableListeners.add(cb);
  return () => _enableListeners.delete(cb);
}

// ------------------------------------------------------------------
// Recording control
// ------------------------------------------------------------------
export function isWartimeRecording(): boolean {
  return _recording;
}

export function startWartimeRecording(): void {
  if (!_enabled || _recording) return;
  _recording = true;
  _startedAtMs = Date.now();
  _stoppedAtMs = null;
  recordWartime('LIFECYCLE', 'wartime.recording.start', {
    maxEvents: MAX_EVENTS,
  });
}

export function stopWartimeRecording(reason: string = 'manual'): void {
  if (!_recording) return;
  recordWartime('LIFECYCLE', 'wartime.recording.stop', { reason });
  _recording = false;
  _stoppedAtMs = Date.now();
  _emit();
}

export function clearWartimeEvents(): void {
  _events = [];
  _seq = 0;
  _dropped = 0;
  _startedAtMs = _recording ? Date.now() : null;
  _stoppedAtMs = null;
  _emit();
}

// ------------------------------------------------------------------
// Recording API
// ------------------------------------------------------------------
export function recordWartime(
  category: WartimeCategory,
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!_enabled || !_recording) return;
  if (_events.length >= MAX_EVENTS) {
    _dropped += 1;
  }
  _events.push({
    seq: ++_seq,
    category,
    event,
    wallTime: new Date().toISOString(),
    epochMs: Date.now(),
    perfMs: Math.round(_nowPerf()),
    payload,
  });
  _emit();
}

/**
 * Transition snapshot helper.
 *
 * recordWartimeTransition('Waiting → Interstitial', { gameId }, {
 *   before: () => snapshotIdentity(),
 *   after:  () => snapshotIdentity(),
 * })
 *
 * Captures before/after blobs and a shallow diff of differing keys.
 */
export function recordWartimeTransition(
  label: string,
  context: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  if (!_enabled || !_recording) return;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const a = (before as any)?.[k];
    const b = (after as any)?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { from: a, to: b };
  }
  recordWartime('LIFECYCLE', `transition: ${label}`, {
    ...context,
    before,
    after,
    diff,
  });
}

// ------------------------------------------------------------------
// State reset / overwrite helpers — Wartime standard.
//
// Any authoritative state object that can clear / reset / overwrite /
// replace / rehydrate MUST emit one of these so attribution is always
// present in a trace. Use freely for announcements, celebrations,
// overlays, dealer selection, active player, round/game state, etc.
//
// `source`   — short tag identifying the producer/owner (e.g. 'realtime',
//              'fetch', 'host-handoff', 'sync-effect').
// `callsite` — file:line or descriptive callsite ('src/foo.ts:123' /
//              'NeutralInterstitial.onExit'). Always populate.
// `reason`   — human-readable why ('status_change to dealer_selection').
// ------------------------------------------------------------------
export interface StateMutationAttribution {
  source: string;
  callsite: string;
  reason?: string;
  surface?: string;
  identityKey?: string | null;
  previousLength?: number | null;
  nextLength?: number | null;
  previousValue?: unknown;
  nextValue?: unknown;
  extra?: Record<string, unknown>;
}

export function recordStateReset(
  stateName: string,
  attribution: StateMutationAttribution,
): void {
  recordWartime('GAMEPLAY', `state-reset: ${stateName}`, {
    stateName,
    ...attribution,
  });
}

export function recordStateOverwrite(
  stateName: string,
  attribution: StateMutationAttribution,
): void {
  recordWartime('GAMEPLAY', `state-overwrite: ${stateName}`, {
    stateName,
    ...attribution,
  });
}


// ------------------------------------------------------------------
// Subscriptions / accessors
// ------------------------------------------------------------------
export function subscribeWartime(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

export function getWartimeEvents(): WartimeEvent[] {
  return _events;
}

export function getWartimeStats() {
  return {
    enabled: _enabled,
    recording: _recording,
    count: _events.length,
    dropped: _dropped,
    maxEvents: MAX_EVENTS,
    startedAtMs: _startedAtMs,
    stoppedAtMs: _stoppedAtMs,
  };
}

export function formatWartimeEventsAsText(snapshot: WartimeEvent[] = _events): string {
  return snapshot
    .map((e) => {
      const payload = e.payload && Object.keys(e.payload).length > 0
        ? ` | ${(() => { try { return JSON.stringify(e.payload); } catch { return '[unserializable]'; } })()}`
        : '';
      return `${String(e.seq).padStart(5, '0')} ${e.wallTime} +${String(e.perfMs).padStart(7, ' ')}ms [${e.category}] ${e.event}${payload}`;
    })
    .join('\n');
}

// ------------------------------------------------------------------
// Export with audit metadata — guarantees the reader can tell whether
// missing events were never recorded, filtered out at export time, or
// purged by the ring buffer (oldest-first drop policy).
// ------------------------------------------------------------------
export interface WartimeExportAudit {
  exportedAt: string;
  recordingStartedAt: string | null;
  recordingStoppedAt: string | null;
  eventCount: number;            // events serialized in this export
  retainedCount: number;         // events currently retained in ring buffer
  maxEvents: number;
  droppedOldestCount: number;
  firstEventSeq: number | null;
  lastEventSeq: number | null;
  firstEventTimestamp: string | null;
  lastEventTimestamp: string | null;
  activeFilters: { category?: string | null; text?: string | null };
  exportIncludesFilteredOnly: boolean;
}

export interface WartimeExportOptions {
  /** If true, export the filtered snapshot; otherwise the FULL retained buffer. */
  includeFilteredOnly?: boolean;
  /** Filtered snapshot from the panel (only used when includeFilteredOnly=true). */
  filtered?: WartimeEvent[];
  /** Currently active filter values, recorded in the audit header. */
  activeFilters?: { category?: string | null; text?: string | null };
}

export function buildWartimeExportAudit(
  events: WartimeEvent[],
  opts: WartimeExportOptions = {},
): WartimeExportAudit {
  const first = events[0] ?? null;
  const last = events[events.length - 1] ?? null;
  return {
    exportedAt: new Date().toISOString(),
    recordingStartedAt: _startedAtMs ? new Date(_startedAtMs).toISOString() : null,
    recordingStoppedAt: _stoppedAtMs ? new Date(_stoppedAtMs).toISOString() : null,
    eventCount: events.length,
    retainedCount: _events.length,
    maxEvents: MAX_EVENTS,
    droppedOldestCount: _dropped,
    firstEventSeq: first?.seq ?? null,
    lastEventSeq: last?.seq ?? null,
    firstEventTimestamp: first?.wallTime ?? null,
    lastEventTimestamp: last?.wallTime ?? null,
    activeFilters: opts.activeFilters ?? {},
    exportIncludesFilteredOnly: !!opts.includeFilteredOnly,
  };
}

export function buildWartimeExportText(opts: WartimeExportOptions = {}): string {
  const events = opts.includeFilteredOnly && opts.filtered ? opts.filtered : _events;
  const audit = buildWartimeExportAudit(events, opts);
  return [
    '# WARTIME EXPORT AUDIT',
    JSON.stringify(audit, null, 2),
    '# --- EVENTS ---',
    formatWartimeEventsAsText(events),
  ].join('\n');
}

export function buildWartimeExportJson(opts: WartimeExportOptions = {}): string {
  const events = opts.includeFilteredOnly && opts.filtered ? opts.filtered : _events;
  return JSON.stringify(
    { audit: buildWartimeExportAudit(events, opts), events },
    null,
    2,
  );
}

// ------------------------------------------------------------------
// React hooks
// ------------------------------------------------------------------
export function useWartimeEnabled(): boolean {
  return useSyncExternalStore(subscribeWartimeEnabled, isWartimeEnabled, isWartimeEnabled);
}

export function useWartimeEvents(): WartimeEvent[] {
  return useSyncExternalStore(subscribeWartime, getWartimeEvents, getWartimeEvents);
}
