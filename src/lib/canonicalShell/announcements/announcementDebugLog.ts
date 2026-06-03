/**
 * announcementDebugLog — in-memory ring buffer of announcement lifecycle
 * events for the debug panel (AnnouncementDebugPanel).
 *
 * Temporary diagnostic infrastructure for the Gin match-win announcement
 * investigation. Safe to delete wholesale once resolved.
 */

import { isGlobalDebugModeCached, isGlobalDebugModeLoaded } from '@/lib/debugHarness/runtimeCache';

export type AnnouncementDebugEventKind =
  | 'emit'
  | 'dismiss'
  | 'clearAmbient'
  | 'clearScope'
  | 'active-change'
  | 'ambient-change'
  | 'transient-change'
  | 'rail-active-change'
  | 'rail-event-flag-change'
  | 'layer-mount'
  | 'layer-unmount'
  | 'scope-change'
  | 'scope-teardown';

export interface AnnouncementDebugEvent {
  seq: number;
  tMs: number; // ms since page load
  kind: AnnouncementDebugEventKind;
  summary: string;
  detail?: Record<string, unknown>;
  /** Number of consecutive identical events collapsed into this entry. */
  repeat: number;
  /** tMs of the most recent occurrence (== tMs when repeat === 1). */
  tLastMs: number;
}

const MAX_EVENTS = 200;
const buffer: AnnouncementDebugEvent[] = [];
let snapshot: AnnouncementDebugEvent[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

export function isAnnouncementDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('ann_debug') === '1') return true;
    if (params.get('ann_debug') === '0') return false;
    if (window.localStorage.getItem('ptp_ann_debug') === '1') return true;
    if (window.localStorage.getItem('ptp_ann_debug') === '0') return false;
  } catch {
    /* no-op */
  }
  if (isGlobalDebugModeLoaded() && isGlobalDebugModeCached()) return true;
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

function notify() {
  snapshot = buffer.slice();
  for (const l of listeners) {
    try { l(); } catch { /* */ }
  }
}

export function recordAnnouncementDebugEvent(
  kind: AnnouncementDebugEventKind,
  summary: string,
  detail?: Record<string, unknown>,
): void {
  if (!isAnnouncementDebugEnabled()) return;
  const now =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const tMs = Math.round(now - t0);

  // Collapse consecutive identical entries (same kind + summary).
  const last = buffer[buffer.length - 1];
  if (last && last.kind === kind && last.summary === summary) {
    last.repeat += 1;
    last.tLastMs = tMs;
    last.detail = detail ?? last.detail;
    notify();
    return;
  }

  buffer.push({
    seq: ++seq,
    tMs,
    tLastMs: tMs,
    kind,
    summary,
    detail,
    repeat: 1,
  });
  while (buffer.length > MAX_EVENTS) buffer.shift();
  notify();
}

export function getAnnouncementDebugEvents(): AnnouncementDebugEvent[] {
  return snapshot;
}

export function subscribeAnnouncementDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearAnnouncementDebugEvents(): void {
  buffer.length = 0;
  notify();
}

export function formatAnnouncementDebugEventsAsText(): string {
  const lines = ['# Announcement debug log (newest first)'];
  const events = buffer.slice().reverse();
  for (const e of events) {
    const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : '';
    const rep = e.repeat > 1 ? `  ×${e.repeat} (last +${e.tLastMs}ms)` : '';
    lines.push(`+${e.tMs}ms  ${e.kind}  ${e.summary}${rep}${detail}`);
  }
  return lines.join('\n');
}
