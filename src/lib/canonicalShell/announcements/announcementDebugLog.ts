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
}

const MAX_EVENTS = 40;
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
  // Visible in the same condition the user is actually testing: global
  // debug mode. This matters on the published app, where import.meta.env.DEV
  // is false but the in-game red Debug Mode banner is active.
  if (isGlobalDebugModeLoaded() && isGlobalDebugModeCached()) return true;

  // Default-on in dev so investigation works without setup; off in prod
  // unless global debug mode / explicit URL or localStorage flags are active.
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
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
  buffer.push({
    seq: ++seq,
    tMs: Math.round(now - t0),
    kind,
    summary,
    detail,
  });
  while (buffer.length > MAX_EVENTS) buffer.shift();
  snapshot = buffer.slice();
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* */
    }
  }
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
  snapshot = [];
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* */
    }
  }
}

export function formatAnnouncementDebugEventsAsText(): string {
  const lines = ['# Announcement debug log (newest first)'];
  const events = buffer.slice().reverse();
  for (const e of events) {
    const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : '';
    lines.push(`+${e.tMs}ms  ${e.kind}  ${e.summary}${detail}`);
  }
  return lines.join('\n');
}
