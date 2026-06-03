/**
 * shellLifecycleLog — in-memory ring buffer of canonical shell surface
 * lifecycle events for the on-screen ShellLifecyclePanel.
 *
 * Investigation-scope diagnostic. Records:
 *   - mount/unmount of shell-owned surfaces
 *   - PlayfieldSlotController phase transitions and neutral reasons
 *   - SurfaceReadinessContract probe registrations and report flips
 *   - Gin readiness pipeline transitions
 *
 * Mirrors the structure of announcementDebugLog so the on-screen panel
 * can render a unified timeline. Pure observability — no behavior.
 */

import { useEffect, useRef } from 'react';
import { isGlobalDebugModeCached, isGlobalDebugModeLoaded } from '@/lib/debugHarness/runtimeCache';

export type ShellLifecycleEventKind =
  | 'mount'
  | 'unmount'
  | 'unmount-detail'
  | 'render-decision'
  | 'key-change'
  | 'slot-phase'
  | 'neutral-shown'
  | 'neutral-hidden'
  | 'readiness-probe-register'
  | 'readiness-probe-unregister'
  | 'readiness-report'
  | 'readiness-clear'
  | 'gin-identity'
  | 'gin-ready'
  | 'gating'
  | 'fact';

export interface ShellLifecycleEvent {
  seq: number;
  tMs: number;
  tLastMs: number;
  kind: ShellLifecycleEventKind;
  summary: string;
  detail?: Record<string, unknown>;
  repeat: number;
}

const MAX_EVENTS = 300;
const buffer: ShellLifecycleEvent[] = [];
let snapshot: ShellLifecycleEvent[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

export function isShellLifecycleDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('shell_lc') === '1') return true;
    if (params.get('shell_lc') === '0') return false;
    if (window.localStorage.getItem('ptp_shell_lc') === '1') return true;
    if (window.localStorage.getItem('ptp_shell_lc') === '0') return false;
  } catch { /* */ }
  if (isGlobalDebugModeLoaded() && isGlobalDebugModeCached()) return true;
  try { return Boolean(import.meta.env?.DEV); } catch { return false; }
}

function notify() {
  snapshot = buffer.slice();
  for (const l of listeners) {
    try { l(); } catch { /* */ }
  }
}

export function recordShellLifecycleEvent(
  kind: ShellLifecycleEventKind,
  summary: string,
  detail?: Record<string, unknown>,
): void {
  if (!isShellLifecycleDebugEnabled()) return;
  const now =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  const tMs = Math.round(now - t0);

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

export function getShellLifecycleEvents(): ShellLifecycleEvent[] {
  return snapshot;
}

export function subscribeShellLifecycle(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearShellLifecycleEvents(): void {
  buffer.length = 0;
  notify();
}

export function formatShellLifecycleEventsAsText(): string {
  const lines = ['# Shell lifecycle log (newest first)'];
  const events = buffer.slice().reverse();
  for (const e of events) {
    const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : '';
    const rep = e.repeat > 1 ? `  ×${e.repeat} (last +${e.tLastMs}ms)` : '';
    lines.push(`+${e.tMs}ms  ${e.kind}  ${e.summary}${rep}${detail}`);
  }
  return lines.join('\n');
}
