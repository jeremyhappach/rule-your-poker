/**
 * holmChuckyFullForensics — FORENSICS ONLY.
 *
 * Consolidates every Chucky-adjacent event already being recorded by
 * the various war-time recorders into ONE categorized payload so a
 * single repro produces a complete ownership chain.
 *
 * Categories (per HOLM CHUCKY WARTIME FORENSICS spec, sections A–J):
 *   source        — authoritative chucky cards reads/writes
 *   cache         — chucky cache effect writes/skips/clears/identity churn
 *   soloState     — solo / chuckyActive / locked snapshot writers
 *   stage         — chucky stage DOM mount/unmount/render
 *   barrier       — chucky reveal barrier evaluations
 *   timer         — reveal effect / timer / stepper lifecycle
 *   visual        — per-card render face-up / face-down / flip events
 *   announcement  — result + announcement lifecycle
 *   win           — win sequence + player-to-pot + next-hand
 *   persistence   — TABLED_SELF / COMMUNITY / CHUCKY_STAGE persistence
 *   render        — MobileGameTable render / mount / subtree owner change
 *   violation     — every wartime violation captured anywhere
 *
 * Each bucket is a ring buffer ≤ 1000 events.
 *
 * Surfaces:
 *   window.__holmChuckyFullForensics                — live aggregate snapshot
 *   recordChuckyForensic(category, event, payload)  — direct emit
 *   buildChuckyFullForensicsText()                  — copyable text payload
 *
 * Auto-ingest: this module subscribes to the existing
 * holmWartimeForensics timeline + violations rings and routes every
 * entry into the appropriate category based on the event name. New
 * sites can therefore start emitting via `recordHolmTimelineEvent`
 * and they will surface here automatically.
 */

import {
  getHolmTimelineEvents,
  getHolmWartimeViolations,
  subscribeHolmWartime,
  type HolmTimelineEvent,
  type HolmWartimeViolation,
} from './holmWartimeForensics';

// ─── Categories ──────────────────────────────────────────────────────────

export type ChuckyForensicCategory =
  | 'source'
  | 'cache'
  | 'soloState'
  | 'stage'
  | 'barrier'
  | 'timer'
  | 'visual'
  | 'announcement'
  | 'win'
  | 'persistence'
  | 'render'
  | 'violation'
  | 'other';

export interface ChuckyForensicEvent {
  seq: number;
  t: number; // performance.now
  wall: string; // ISO
  category: ChuckyForensicCategory;
  event: string;
  handContextId: string | null;
  payload?: Record<string, unknown>;
}

const RING = 1000;
const buckets: Record<ChuckyForensicCategory, ChuckyForensicEvent[]> = {
  source: [],
  cache: [],
  soloState: [],
  stage: [],
  barrier: [],
  timer: [],
  visual: [],
  announcement: [],
  win: [],
  persistence: [],
  render: [],
  violation: [],
  other: [],
};

let _seq = 0;
let _lastTimelineSeq = 0;
let _lastViolationSeq = 0;

const listeners = new Set<() => void>();
function emit() {
  publishWindow();
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* */
    }
  }
}

export function subscribeChuckyFullForensics(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function nowPerf(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function pushEvent(
  category: ChuckyForensicCategory,
  event: string,
  payload: Record<string, unknown> | undefined,
  handContextId: string | null,
): void {
  const ring = buckets[category];
  const entry: ChuckyForensicEvent = {
    seq: ++_seq,
    t: nowPerf(),
    wall: new Date().toISOString(),
    category,
    event,
    handContextId,
    payload,
  };
  ring.push(entry);
  while (ring.length > RING) ring.shift();
}

export function recordChuckyForensic(
  category: ChuckyForensicCategory,
  event: string,
  payload?: Record<string, unknown>,
  handContextId: string | null = null,
): void {
  pushEvent(category, event, payload, handContextId);
  emit();
}

// ─── Event-name → category routing ───────────────────────────────────────

const EXPLICIT_ROUTES: Record<string, ChuckyForensicCategory> = {
  // source
  CHUCKY_SOURCE_READ: 'source',
  CHUCKY_SOURCE_CHANGED: 'source',

  // cache
  CHUCKY_CACHE_EFFECT_ENTER: 'cache',
  CHUCKY_CACHE_WRITE: 'cache',
  CHUCKY_CACHE_SKIP: 'cache',
  CHUCKY_CACHE_CLEAR: 'cache',
  CHUCKY_CACHE_PRESERVE: 'cache',
  CHUCKY_CACHE_SET_CARDS: 'cache',
  CHUCKY_ARRAY_IDENTITY_CHURN: 'cache',
  CHUCKY_CACHE_IDENTITY_CHURN: 'cache',

  // soloState
  SOLO_CHUCKY_STATE_WRITE: 'soloState',
  SOLO_CHUCKY_STATE_READ: 'soloState',
  SOLO_CHUCKY_STATE_CHANGED: 'soloState',
  SOLO_DECLARED: 'soloState',

  // stage
  CHUCKY_STAGE_MOUNT: 'stage',
  CHUCKY_STAGE_UNMOUNT: 'stage',
  CHUCKY_STAGE_RENDER: 'stage',
  CHUCKY_STAGE_OWNER_CHANGED: 'stage',

  // barrier
  CHUCKY_BARRIER_EVAL: 'barrier',
  CHUCKY_BARRIER_OPEN: 'barrier',
  CHUCKY_BARRIER_CLOSE: 'barrier',

  // timer / stepper
  CHUCKY_REVEAL_EFFECT_ENTER: 'timer',
  CHUCKY_REVEAL_EFFECT_CLEANUP: 'timer',
  CHUCKY_EFFECT_CLEANUP: 'timer',
  CHUCKY_EFFECT_INSTANCE: 'timer',
  CHUCKY_EFFECT_DEP_DIFF: 'timer',
  CHUCKY_TIMEOUT_ARMED: 'timer',
  CHUCKY_TIMEOUT_FIRED: 'timer',
  CHUCKY_REVEAL_TIMEOUT_CLEARED: 'timer',
  CHUCKY_REVEAL_TIMER_ARM: 'timer',
  CHUCKY_REVEAL_TIMER_FIRE: 'timer',
  CHUCKY_REVEAL_TIMER_CLEAR: 'timer',
  CHUCKY_REVEAL_STATE_WRITE: 'timer',
  CHUCKY_REVEAL_STATE_CHANGED: 'timer',
  CHUCKY_REVEAL_STATE_RESET: 'timer',
  CHUCKY_REVEAL_START: 'timer',
  CHUCKY_REVEAL_STEP: 'timer',
  CHUCKY_REVEAL_CONFIG_MISMATCH: 'timer',
  CHUCKY_REVEAL_CONFIG_UNWIRED: 'timer',
  CHUCKY_VISUAL_TRIGGER: 'timer',

  // visual
  CHUCKY_CARD_RENDER_READ: 'visual',
  CHUCKY_CARD_RENDER_WRITE: 'visual',
  CHUCKY_CARD_FACE_DOWN: 'visual',
  CHUCKY_CARD_FACE_UP: 'visual',
  CHUCKY_CARD_FLIP_START: 'visual',
  CHUCKY_CARD_FLIP_COMPLETE: 'visual',
  CHUCKY_CARD_UNMOUNT: 'visual',
  CHUCKY_REVEAL_CARD_0: 'visual',
  CHUCKY_REVEAL_CARD_1: 'visual',
  CHUCKY_REVEAL_CARD_2: 'visual',
  CHUCKY_REVEAL_CARD_3: 'visual',
  CHUCKY_REVEAL_COMPLETED: 'visual',

  // announcement / result
  HOLM_RESULT_COMPUTED: 'announcement',
  HOLM_RESULT_OVERRIDE_APPLIED: 'announcement',
  ANNOUNCEMENT_START_REQUEST: 'announcement',
  ANNOUNCEMENT_STARTED: 'announcement',
  ANNOUNCEMENT_BLOCKED: 'announcement',
  ANNOUNCEMENT_COMPLETED: 'announcement',

  // win sequence / next hand
  WIN_SEQUENCE_STARTED: 'win',
  WIN_SEQUENCE_STAGE_OWNER_CHANGED: 'win',
  PLAYER_TO_POT_STARTED: 'win',
  NEXT_HAND_STARTED: 'win',
  NEW_HAND_STARTED: 'win',

  // persistence (cross-cutting tabled / community)
  TABLED_SELF_MOUNT: 'persistence',
  TABLED_SELF_UNMOUNT: 'persistence',
  TABLED_SELF_RENDER: 'persistence',
  COMMUNITY_STAGE_MOUNT: 'persistence',
  COMMUNITY_STAGE_UNMOUNT: 'persistence',
  COMMUNITY_STAGE_RENDER: 'persistence',
  SELF_HAND_MOUNT: 'persistence',
  SELF_HAND_UNMOUNT: 'persistence',
  COMMUNITY_REVEAL_CARD_0: 'persistence',
  COMMUNITY_REVEAL_CARD_1: 'persistence',
  COMMUNITY_REVEAL_CARD_2: 'persistence',
  COMMUNITY_REVEAL_CARD_3: 'persistence',
  COMMUNITY_REHIDDEN: 'persistence',
  ALL_PLAYER_DECISIONS_COMPLETE: 'persistence',

  // render
  MGT_RENDER: 'render',
  MGT_MOUNT: 'render',
  MGT_UNMOUNT: 'render',
  MGT_SUBTREE_OWNER_CHANGE: 'render',
  CHUCKY_RENDER_TREE: 'render',
  CHUCKY_UNMOUNT_STACK: 'render',
};

function routeEvent(name: string): ChuckyForensicCategory {
  if (EXPLICIT_ROUTES[name]) return EXPLICIT_ROUTES[name];
  // Heuristic fallback by prefix substring.
  const upper = name.toUpperCase();
  if (upper.includes('CACHE')) return 'cache';
  if (upper.includes('BARRIER')) return 'barrier';
  if (upper.startsWith('CHUCKY_REVEAL') || upper.includes('TIMER') || upper.includes('TIMEOUT')) return 'timer';
  if (upper.startsWith('CHUCKY_CARD') || upper.includes('FLIP') || upper.includes('FACE')) return 'visual';
  if (upper.startsWith('CHUCKY_STAGE')) return 'stage';
  if (upper.startsWith('CHUCKY_SOURCE')) return 'source';
  if (upper.startsWith('CHUCKY')) return 'visual';
  if (upper.startsWith('ANNOUNCEMENT') || upper.includes('RESULT')) return 'announcement';
  if (upper.includes('WIN_SEQUENCE') || upper.includes('PLAYER_TO_POT') || upper.includes('NEXT_HAND')) return 'win';
  if (upper.includes('TABLED_SELF') || upper.includes('COMMUNITY') || upper.includes('SELF_HAND')) return 'persistence';
  if (upper.startsWith('MGT_')) return 'render';
  if (upper.includes('SOLO')) return 'soloState';
  return 'other';
}

// ─── Auto-ingest from existing wartime ring buffers ──────────────────────

function ingestFromWartime(): void {
  const tl = getHolmTimelineEvents();
  for (const e of tl) {
    if (e.seq <= _lastTimelineSeq) continue;
    _lastTimelineSeq = e.seq;
    const cat = routeEvent(String(e.event));
    pushEvent(cat, String(e.event), e.payload, e.handContextId);
  }
  const vs = getHolmWartimeViolations();
  for (const v of vs) {
    if (v.seq <= _lastViolationSeq) continue;
    _lastViolationSeq = v.seq;
    pushEvent(
      'violation',
      v.type,
      { ...v.payload, _violationType: v.type },
      v.handContextId,
    );
  }
}

let _subscribed = false;
function ensureWartimeSubscription(): void {
  if (_subscribed) return;
  _subscribed = true;
  // Drain anything already in the buffers on first attach.
  ingestFromWartime();
  subscribeHolmWartime(() => {
    ingestFromWartime();
    emit();
  });
}

// ─── Snapshot + window surface ───────────────────────────────────────────

export interface ChuckyFullForensicsSnapshot {
  generatedAt: string;
  totals: Record<ChuckyForensicCategory, number>;
  source: ChuckyForensicEvent[];
  cache: ChuckyForensicEvent[];
  soloState: ChuckyForensicEvent[];
  stage: ChuckyForensicEvent[];
  barrier: ChuckyForensicEvent[];
  timer: ChuckyForensicEvent[];
  visual: ChuckyForensicEvent[];
  announcement: ChuckyForensicEvent[];
  win: ChuckyForensicEvent[];
  persistence: ChuckyForensicEvent[];
  render: ChuckyForensicEvent[];
  violation: ChuckyForensicEvent[];
  other: ChuckyForensicEvent[];
}

export function getChuckyFullForensics(): ChuckyFullForensicsSnapshot {
  ensureWartimeSubscription();
  ingestFromWartime();
  const totals: Record<ChuckyForensicCategory, number> = {
    source: buckets.source.length,
    cache: buckets.cache.length,
    soloState: buckets.soloState.length,
    stage: buckets.stage.length,
    barrier: buckets.barrier.length,
    timer: buckets.timer.length,
    visual: buckets.visual.length,
    announcement: buckets.announcement.length,
    win: buckets.win.length,
    persistence: buckets.persistence.length,
    render: buckets.render.length,
    violation: buckets.violation.length,
    other: buckets.other.length,
  };
  return {
    generatedAt: new Date().toISOString(),
    totals,
    source: buckets.source.slice(),
    cache: buckets.cache.slice(),
    soloState: buckets.soloState.slice(),
    stage: buckets.stage.slice(),
    barrier: buckets.barrier.slice(),
    timer: buckets.timer.slice(),
    visual: buckets.visual.slice(),
    announcement: buckets.announcement.slice(),
    win: buckets.win.slice(),
    persistence: buckets.persistence.slice(),
    render: buckets.render.slice(),
    violation: buckets.violation.slice(),
    other: buckets.other.slice(),
  };
}

function publishWindow(): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as {
      __holmChuckyFullForensics?: ChuckyFullForensicsSnapshot;
    };
    w.__holmChuckyFullForensics = getChuckyFullForensicsSnapshotInternal();
  } catch {
    /* noop */
  }
}

// Internal snapshot without re-emit / re-ingest loops.
function getChuckyFullForensicsSnapshotInternal(): ChuckyFullForensicsSnapshot {
  const totals: Record<ChuckyForensicCategory, number> = {
    source: buckets.source.length,
    cache: buckets.cache.length,
    soloState: buckets.soloState.length,
    stage: buckets.stage.length,
    barrier: buckets.barrier.length,
    timer: buckets.timer.length,
    visual: buckets.visual.length,
    announcement: buckets.announcement.length,
    win: buckets.win.length,
    persistence: buckets.persistence.length,
    render: buckets.render.length,
    violation: buckets.violation.length,
    other: buckets.other.length,
  };
  return {
    generatedAt: new Date().toISOString(),
    totals,
    source: buckets.source.slice(),
    cache: buckets.cache.slice(),
    soloState: buckets.soloState.slice(),
    stage: buckets.stage.slice(),
    barrier: buckets.barrier.slice(),
    timer: buckets.timer.slice(),
    visual: buckets.visual.slice(),
    announcement: buckets.announcement.slice(),
    win: buckets.win.slice(),
    persistence: buckets.persistence.slice(),
    render: buckets.render.slice(),
    violation: buckets.violation.slice(),
    other: buckets.other.slice(),
  };
}

// Build copyable text payload.
export function buildChuckyFullForensicsText(): string {
  ensureWartimeSubscription();
  ingestFromWartime();
  const snap = getChuckyFullForensicsSnapshotInternal();
  const lines: string[] = [];
  lines.push('# HOLM CHUCKY FULL FORENSICS');
  lines.push(`generatedAt=${snap.generatedAt}`);
  lines.push(`totals=${JSON.stringify(snap.totals)}`);
  const cats: ChuckyForensicCategory[] = [
    'source',
    'cache',
    'soloState',
    'stage',
    'barrier',
    'timer',
    'visual',
    'announcement',
    'win',
    'persistence',
    'render',
    'violation',
    'other',
  ];
  for (const cat of cats) {
    const arr = snap[cat] as ChuckyForensicEvent[];
    lines.push('');
    lines.push(`--- ${cat.toUpperCase()} (${arr.length}) ---`);
    for (const e of arr) {
      const payload = e.payload ? ` ${safeJson(e.payload)}` : '';
      lines.push(
        `#${e.seq} t=${e.t.toFixed(1)} hc=${e.handContextId ?? '—'} ${e.event}${payload}`,
      );
    }
  }
  return lines.join('\n');
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '"[unserializable]"';
  }
}

// Eagerly attach on module load so the snapshot is always live.
if (typeof window !== 'undefined') {
  try {
    ensureWartimeSubscription();
    publishWindow();
  } catch {
    /* noop */
  }
}

// Helper used by emit() outside the closure above.
function _publishNoop(): void {
  publishWindow();
}
void _publishNoop;

// Reference timeline event type so the import is not pruned.
export type _HolmWartimeRefs = HolmTimelineEvent | HolmWartimeViolation;
