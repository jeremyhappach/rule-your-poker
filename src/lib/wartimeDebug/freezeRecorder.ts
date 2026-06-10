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
  const seq = _seq;
  const enriched = {
    sessionId: SESSION_ID,
    tabId: SESSION_ID,
    seq,
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
  // RAW MIRROR — session b972cde8 proved the SDK can wedge while the
  // page keeps emitting: seqs 371–414 were persisted via supabase-js
  // only and were permanently lost. Every persisted event is therefore
  // also sent over the raw fetch transport with the SAME seq, tagged
  // channel='raw-mirror'. Dedupe at query time on (sessionId, seq).
  rawSend(eventType, seq, 'raw-mirror', enriched);
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

// ── RAW transport — bypasses supabase-js entirely ────────────
//
// DISCRIMINATOR for the freeze investigation: every prior "freeze"
// signal (heartbeat rows stopping, UPDATE never resolving, fetches
// never returning) flows through the supabase-js client. A wedged
// client (e.g. auth navigator.locks deadlock during token refresh)
// is indistinguishable in debug_events from a halted main thread.
//
// rawPersist() POSTs directly to PostgREST with fetch(keepalive),
// reading the access token synchronously from localStorage. If RAW
// heartbeats continue while SDK heartbeats stop → main thread is
// ALIVE and the supabase client is wedged. If both stop → genuine
// main-thread halt.
const RAW_URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/debug_events`;
const RAW_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const AUTH_STORAGE_KEY = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;
const LAST_BEAT_KEY = 'ptp_freeze_last_beat';

let _lastRawStatus: number | string | null = null;

function readAccessTokenSync(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

function rawPersist(eventType: string, payload: Record<string, unknown>): void {
  if (!_enabled) return;
  _seq += 1;
  const token = readAccessTokenSync();
  const body = JSON.stringify({
    game_id: _ctx.gameId,
    user_id: _ctx.userId,
    client_role: 'freeze-recorder',
    event_type: eventType,
    payload: {
      sessionId: SESSION_ID,
      tabId: SESSION_ID,
      seq: _seq,
      channel: 'raw',
      timestamp: new Date().toISOString(),
      hadToken: token != null,
      lastRawStatus: _lastRawStatus,
      ctx: { status: _ctx.status, gameType: _ctx.gameType },
      ...payload,
    },
  });
  try {
    fetch(RAW_URL, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: RAW_ANON,
        Authorization: `Bearer ${token ?? RAW_ANON}`,
        Prefer: 'return=minimal',
      },
      body,
    })
      .then((r) => { _lastRawStatus = r.status; })
      .catch((e) => { _lastRawStatus = String(e?.message ?? e); });
  } catch (e) {
    _lastRawStatus = String((e as Error)?.message ?? e);
  }
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

  // boot marker — reports the previous session's last local breadcrumb
  // so we can tell whether JS kept beating after its last DB row.
  try {
    const prev = window.localStorage.getItem(LAST_BEAT_KEY);
    rawPersist('freeze.PAGE_BOOT', { previousBeat: prev ? JSON.parse(prev) : null });
    persist('freeze.PAGE_BOOT', 'freezeRecorder', 'boot', {
      previousBeat: prev ? JSON.parse(prev) : null,
    });
  } catch { /* */ }

  // heartbeat — DUAL CHANNEL every 2s:
  //   channel=sdk → supabase-js insert (existing path)
  //   channel=raw → direct fetch to PostgREST, bypassing supabase-js
  // Divergence (raw continues, sdk stops) = supabase client wedged,
  // main thread alive. Both stopping = genuine main-thread halt.
  // A synchronous localStorage breadcrumb survives even total network
  // loss and is reported by freeze.PAGE_BOOT on next load.
  let hbN = 0;
  setInterval(() => {
    if (!_enabled) return;
    hbN += 1;
    const perfNow = typeof performance !== 'undefined' ? Math.round(performance.now()) : null;
    const visibility = typeof document !== 'undefined' ? document.visibilityState : null;
    try {
      window.localStorage.setItem(LAST_BEAT_KEY, JSON.stringify({
        sessionId: SESSION_ID, n: hbN, perfNow, iso: new Date().toISOString(),
      }));
    } catch { /* */ }
    persist('heartbeat', 'freezeRecorder', 'heartbeat', {
      n: hbN,
      channel: 'sdk',
      perfNow,
      visibility,
    });
    rawPersist('heartbeat.raw', { n: hbN, perfNow, visibility });
  }, 2000);

  // eslint-disable-next-line no-console
  console.info('[FREEZE_REC] enabled — persisting dealer-selection trace to debug_events (dual-channel heartbeat)');
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
