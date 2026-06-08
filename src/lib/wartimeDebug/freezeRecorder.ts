/**
 * freezeRecorder — temporary persisted flight recorder for the
 * dealer-selection freeze investigation.
 *
 * Persists a tightly scoped set of wartime events to public.debug_events
 * (fire-and-forget) so that traces survive even when the UI becomes
 * non-interactive and the in-app Wartime export cannot be reached.
 *
 * Toggle on/off via:
 *   - URL param ?freeze_rec=1
 *   - localStorage ptp_freeze_recorder=1
 *
 * Scope (intentionally narrow):
 *   - Wartime category GAMEPLAY (Start Game, status transitions,
 *     dealer-selection init/draw, slot resolution)
 *   - Wartime category ANNOUNCEMENTS when summary mentions dealer/selection
 *   - Global error + unhandledrejection
 *   - Heartbeat every 2s while enabled (so we can prove the moment the
 *     main thread or network stalled)
 *
 * Remove after the freeze defect is closed. Sentinel: tag `[FREEZE_REC]`.
 */

import { supabase } from '@/integrations/supabase/client';
import { getClientId } from '@/lib/clientContext';
import { subscribeWartime, getWartimeEvents, type WartimeEvent } from './core';

// ── enable flag ──────────────────────────────────────────────
function readEnabled(): boolean {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('freeze_rec');
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    if (window.localStorage.getItem('ptp_freeze_recorder') === '1') return true;
  } catch { /* */ }
  return false;
}

let _enabled = readEnabled();
export function isFreezeRecorderEnabled(): boolean { return _enabled; }
export function enableFreezeRecorder(): void {
  try { window.localStorage.setItem('ptp_freeze_recorder', '1'); } catch { /* */ }
  _enabled = true;
  start();
}
export function disableFreezeRecorder(): void {
  try { window.localStorage.removeItem('ptp_freeze_recorder'); } catch { /* */ }
  _enabled = false;
}

// ── context registry (current game snapshot) ────────────────
interface FreezeContext {
  gameId: string | null;
  userId: string | null;
  status: string | null;
  gameType: string | null;
  currentGameUuid: string | null;
  dealerSelectionState: unknown;
  configComplete: boolean | null;
  dealerPosition: number | null;
}
const _ctx: FreezeContext = {
  gameId: null,
  userId: null,
  status: null,
  gameType: null,
  currentGameUuid: null,
  dealerSelectionState: null,
  configComplete: null,
  dealerPosition: null,
};

export function setFreezeRecorderContext(patch: Partial<FreezeContext>): void {
  Object.assign(_ctx, patch);
}

// ── persistence ──────────────────────────────────────────────
const SESSION_ID = getClientId();
let _seq = 0;

function persist(
  eventType: string,
  sourceFile: string,
  sourceFunction: string,
  payload: Record<string, unknown>,
): void {
  if (!_enabled) return;
  _seq += 1;
  const enriched = {
    sessionId: SESSION_ID,
    tabId: SESSION_ID,
    seq: _seq,
    timestamp: new Date().toISOString(),
    sourceFile,
    sourceFunction,
    ctx: {
      status: _ctx.status,
      gameType: _ctx.gameType,
      currentGameUuid: _ctx.currentGameUuid,
      dealerSelectionState: _ctx.dealerSelectionState,
      configComplete: _ctx.configComplete,
      dealerPosition: _ctx.dealerPosition,
    },
    ...payload,
  };
  supabase
    .from('debug_events' as any)
    .insert({
      game_id: _ctx.gameId,
      user_id: _ctx.userId,
      client_role: 'freeze-recorder',
      event_type: eventType,
      payload: enriched,
    } as any)
    .then(({ error }) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[FREEZE_REC] insert failed:', error.message);
      }
    });
}

// Exposed so call-site instrumentation (gameStartTransition,
// dealerSelectionTrace) can directly persist without waiting on the
// wartime subscription tick.
export function persistFreezeEvent(
  eventType: string,
  source: string,
  payload: Record<string, unknown> = {},
): void {
  persist(eventType, source, source, payload);
}

// ── wartime mirror ───────────────────────────────────────────
function shouldMirror(ev: WartimeEvent): boolean {
  if (ev.category === 'GAMEPLAY') return true;
  if (ev.category === 'ANNOUNCEMENTS') {
    const s = ev.event.toLowerCase();
    return /dealer|selection|high.card|game.selection/.test(s);
  }
  return false;
}

let _started = false;
let _lastSeenSeq = 0;
function start(): void {
  if (_started || !_enabled) return;
  _started = true;

  // initialize cursor to current tail so we don't dump prior history.
  const snap0 = getWartimeEvents();
  _lastSeenSeq = snap0.length ? snap0[snap0.length - 1].seq : 0;

  subscribeWartime(() => {
    if (!_enabled) return;
    const snap = getWartimeEvents();
    for (const ev of snap) {
      if (ev.seq <= _lastSeenSeq) continue;
      _lastSeenSeq = ev.seq;
      if (!shouldMirror(ev)) continue;
      persist(
        `wartime.${ev.category}.${ev.event}`,
        'wartime-mirror',
        ev.event,
        { wartimeSeq: ev.seq, wallTime: ev.wallTime, ...(ev.payload ?? {}) },
      );
    }
  });

  // global error handlers
  try {
    window.addEventListener('error', (e) => {
      persist('global.error', 'window.error', 'error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack,
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      persist('global.unhandledrejection', 'window.unhandledrejection', 'unhandledrejection', {
        message: r?.message ?? String(r),
        stack: r?.stack,
      });
    });
  } catch { /* */ }

  // heartbeat — proves main thread + network round-trip every 2s
  let hbN = 0;
  setInterval(() => {
    if (!_enabled) return;
    hbN += 1;
    persist('heartbeat', 'freezeRecorder', 'heartbeat', {
      n: hbN,
      perfNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
    });
  }, 2000);

  // eslint-disable-next-line no-console
  console.info('[FREEZE_REC] enabled — persisting dealer-selection trace to debug_events');
}

// auto-start on module load when flag already set
if (typeof window !== 'undefined' && _enabled) {
  // defer slightly so wartime core finishes module init
  setTimeout(start, 0);
}

// expose for console access
if (typeof window !== 'undefined') {
  (window as unknown as { __freezeRec?: unknown }).__freezeRec = {
    enable: enableFreezeRecorder,
    disable: disableFreezeRecorder,
    isEnabled: isFreezeRecorderEnabled,
    setContext: setFreezeRecorderContext,
  };
}
