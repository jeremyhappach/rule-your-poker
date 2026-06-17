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
  | 'gin-fetch'
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

// Active game-type hint set by the running table surface. When a Holm
// game is active we auto-enable the SHELL LC panel so lifecycle events
// stream without query params or localStorage hacks. Cleared on unmount.
let _activeGameType: string | null = null;
export function setShellLifecycleActiveGameType(gameType: string | null): void {
  if (_activeGameType === gameType) return;
  _activeGameType = gameType;
  // Notify panel subscribers so visibility re-evaluates immediately.
  for (const l of listeners) { try { l(); } catch { /* */ } }
}


const AUTO_ENABLED_GAME_TYPES = new Set(['holm-game']);

export function isShellLifecycleDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('shell_lc') === '1') return true;
    if (params.get('shell_lc') === '0') return false;
    if (window.localStorage.getItem('ptp_shell_lc') === '1') return true;
    if (window.localStorage.getItem('ptp_shell_lc') === '0') return false;
  } catch { /* */ }
  if (_activeGameType && AUTO_ENABLED_GAME_TYPES.has(_activeGameType)) return true;
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
  // Always record into the in-memory ring buffer (300 events max).
  // The on-screen panel decides visibility based on DebugTray presence,
  // not on a separate enable flag — so we must never drop events here
  // or the SHELL LC pill would appear empty when the tray opens.
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

// ── Investigation helpers ──────────────────────────────────────────
// Capture an up-to-date snapshot of arbitrary props/state every render
// and log it with the component's UNMOUNT event. Use this on shell-
// owned surfaces that might be unmounted by a parent identity/key
// transition or by a readiness gate flipping false — the snapshot
// reveals the exact state at the moment the surface left the tree.
export function useUnmountSnapshot(
  component: string,
  snapshot: Record<string, unknown>,
): void {
  const ref = useRef<Record<string, unknown>>(snapshot);
  ref.current = snapshot;
  useEffect(() => {
    return () => {
      recordShellLifecycleEvent('unmount-detail', component, ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Log when an externally-meaningful value changes (e.g. a React key,
// a readiness flag, a presence-of-wrapper flag). Logs once on mount
// (with `from: '(init)'`) and again on every subsequent change.
export function useChangeTracker(
  component: string,
  label: string,
  value: unknown,
  extra?: Record<string, unknown>,
): void {
  const lastRef = useRef<unknown>(Symbol.for('shellLifecycle.uninit'));
  useEffect(() => {
    if (lastRef.current === value) return;
    const from = lastRef.current === Symbol.for('shellLifecycle.uninit')
      ? '(init)'
      : lastRef.current;
    recordShellLifecycleEvent('key-change', `${component}.${label}: ${String(from)} → ${String(value)}`, {
      component, label, from, to: value, ...(extra ?? {}),
    });
    lastRef.current = value;
  }, [component, label, value, extra]);
}

// Log which render branch a component chose, with the gating
// condition responsible. Coalesced server-side by recordShellLifecycleEvent.
export function recordRenderDecision(
  component: string,
  decision: 'null' | 'neutral' | 'gameplay' | string,
  gating: Record<string, unknown>,
): void {
  recordShellLifecycleEvent('render-decision', `${component} → ${decision}`, gating);
}

// ── Hook-free transition logger ───────────────────────────────────
// Compares `value` against the last-seen value stored under `key` in
// a module-scoped Map. Safe to call during render: no hooks, no React
// state, no useEffect. Use when you need to observe value transitions
// at an assignment point without adding hook ordering.
const lastSeenByKey = new Map<string, unknown>();
const UNINIT = Symbol('shellLifecycle.logIfChanged.uninit');

export function logIfChanged(
  key: string,
  value: unknown,
  detail?: Record<string, unknown>,
): void {
  const prev = lastSeenByKey.has(key) ? lastSeenByKey.get(key) : UNINIT;
  if (prev === value) return;
  lastSeenByKey.set(key, value);
  const from = prev === UNINIT ? null : prev;
  recordShellLifecycleEvent('key-change', `${key}: ${String(from ?? '(init)')} → ${String(value)}`, {
    key, from, to: value, ...(detail ?? {}),
  });
}


