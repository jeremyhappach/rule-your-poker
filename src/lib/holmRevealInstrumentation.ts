/**
 * Holm reveal-sequence instrumentation.
 *
 * Targets the single-stayer (vs Chucky) reveal bug where:
 *   - the first Chucky card may flip before community cards finish
 *   - Chucky 2 and 3 may flip together (collapsed step)
 *   - Chucky 4 may stay face down through resolution
 *   - winner announcement / chip transfer may fire before reveal completes
 *
 * Three layers wire into this module:
 *   L1 — Sequence layer  (logRevealSequenceStep)        backend in holmGameLogic.ts
 *   L2 — Render boundary (logRevealRenderFrame)         MobileGameTable + ChuckyHand
 *   L3 — Resolution gate (logResolutionGate)            MobileGameTable / Game.tsx
 *
 * All events persist to `debug_sync_events` via persistTransition() so the
 * next repro has an exact, queryable timeline. Invariants persist via
 * checkInvariant() (always-on, no flag required).
 *
 * Toggle for L2/L3 verbose logs (L1 always persists for sequencing):
 *   ?debug_holm_reveal=1   or   localStorage.ptp_debug_holm_reveal = "1"
 */

import { checkInvariant } from './debugSyncInvariants';
import { persistTransition } from './persistSyncDebugEvent';

// ── Toggle ────────────────────────────────────────────────────

let _verbose: boolean | null = null;

function checkVerbose(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug_holm_reveal');
    if (v === '0' || v?.toLowerCase() === 'false') return false;
    if (v === '' || v === '1' || v?.toLowerCase() === 'true') return true;
  } catch { /* */ }
  try {
    const stored = window.localStorage.getItem('ptp_debug_holm_reveal');
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch { /* */ }
  return false;
}

export function isHolmRevealVerbose(): boolean {
  if (_verbose === null) _verbose = checkVerbose();
  return _verbose;
}

export function refreshHolmRevealFlag(): void {
  _verbose = checkVerbose();
}

// ── Types ─────────────────────────────────────────────────────

export type RevealPhase =
  | 'idle'
  | 'community-revealing'
  | 'community-complete'
  | 'pre-chucky-pause'
  | 'chucky-revealing'
  | 'chucky-complete'
  | 'pre-resolution-pause'
  | 'resolution'
  | 'done';

export type RevealTriggerReason =
  | 'community-update'      // rounds.community_cards_revealed advanced
  | 'community-flip-end'    // CommunityCards finished its flip animation
  | 'chucky-update'         // rounds.chucky_cards_revealed advanced
  | 'chucky-flip-end'       // ChuckyHand finished a flip
  | 'sequence-pause-start'
  | 'sequence-pause-end'
  | 'resolution-trigger'    // showdown / announcement / chip-transfer
  | 'force-reveal'          // recovery path
  | 'init';

export interface SequenceContext {
  gameId: string;
  roundId: string | null;
  handNumber: number;
  stayerPlayerId: string | null;
}

export interface SequenceStepPayload {
  sequenceStep: string;            // human label e.g. "community-3", "chucky-2"
  revealPhase: RevealPhase;
  revealTriggerReason: RevealTriggerReason;
  communityRevealed: number;       // 0..4
  chuckyRevealed: number;          // 0..N
  chuckyTotal: number;
  extra?: Record<string, unknown>;
}

export type CardLayerType = 'community' | 'chucky';

export interface RenderFramePayload {
  cardType: CardLayerType;
  cardIndex: number;               // 0-based
  shouldBeFaceUp: boolean;         // derived from authoritative *_revealed
  actuallyRenderedFaceUp: boolean; // what the DOM/state actually shows
  renderOrderStep: number;         // monotonic per-frame counter
  extra?: Record<string, unknown>;
}

export type ResolutionGateName =
  | 'winner-announcement-start'
  | 'chip-transfer-start'
  | 'hand-resolution-complete'
  | 'next-transition-start';

// ── Per-(gameId, handNumber) sequence tracking ────────────────
//
// We track the last observed reveal indices to detect:
//   - regressions (chucky 3 -> chucky 2)
//   - skipped steps (chucky 1 -> chucky 3 in a single tick)
//   - chucky-before-community-complete

interface TrackerState {
  lastCommunityRevealed: number;
  lastChuckyRevealed: number;
  chuckyTotal: number;
  resolutionStartedAt: number | null;
  chuckyRevealHistory: Array<{ index: number; t: number }>;
  communityCompleteAt: number | null;
}

const _trackers = new Map<string, TrackerState>();
const _renderOrderCounters = new Map<string, number>();

function trackerKey(gameId: string, handNumber: number): string {
  return `${gameId}:${handNumber}`;
}

function getTracker(gameId: string, handNumber: number): TrackerState {
  const key = trackerKey(gameId, handNumber);
  let t = _trackers.get(key);
  if (!t) {
    t = {
      lastCommunityRevealed: 0,
      lastChuckyRevealed: 0,
      chuckyTotal: 0,
      resolutionStartedAt: null,
      chuckyRevealHistory: [],
      communityCompleteAt: null,
    };
    _trackers.set(key, t);
  }
  return t;
}

export function resetHolmRevealTracker(gameId: string, handNumber?: number): void {
  if (handNumber === undefined) {
    for (const k of [..._trackers.keys()]) {
      if (k.startsWith(`${gameId}:`)) _trackers.delete(k);
    }
    for (const k of [..._renderOrderCounters.keys()]) {
      if (k.startsWith(`${gameId}:`)) _renderOrderCounters.delete(k);
    }
    return;
  }
  _trackers.delete(trackerKey(gameId, handNumber));
  _renderOrderCounters.delete(trackerKey(gameId, handNumber));
}

function nextRenderOrder(gameId: string, handNumber: number): number {
  const key = trackerKey(gameId, handNumber);
  const next = (_renderOrderCounters.get(key) ?? 0) + 1;
  _renderOrderCounters.set(key, next);
  return next;
}

// ── L1: Sequence-state machine logging ────────────────────────

/**
 * Log one step of the reveal-sequence state machine and check ordering
 * invariants. Always persists (no flag needed) because this is the primary
 * timeline diagnostic.
 */
export function logRevealSequenceStep(
  ctx: SequenceContext,
  payload: SequenceStepPayload,
): void {
  const t = getTracker(ctx.gameId, ctx.handNumber);
  const now = Date.now();

  if (payload.chuckyTotal > 0) t.chuckyTotal = payload.chuckyTotal;

  // Track community-complete moment
  if (
    t.communityCompleteAt === null &&
    payload.communityRevealed >= 4 &&
    t.lastCommunityRevealed < 4
  ) {
    t.communityCompleteAt = now;
  }

  // ── Invariant: holm-community-reveal-out-of-order
  // Community must advance monotonically 0..4
  checkInvariant(
    'holm',
    'holm-community-reveal-out-of-order',
    payload.communityRevealed >= t.lastCommunityRevealed,
    `Community revealed regressed ${t.lastCommunityRevealed} -> ${payload.communityRevealed}`,
    {
      gameId: ctx.gameId,
      roundId: ctx.roundId,
      handNumber: ctx.handNumber,
      prev: t.lastCommunityRevealed,
      next: payload.communityRevealed,
      sequenceStep: payload.sequenceStep,
      revealPhase: payload.revealPhase,
    },
  );

  // ── Invariant: holm-chucky-reveal-out-of-order
  checkInvariant(
    'holm',
    'holm-chucky-reveal-out-of-order',
    payload.chuckyRevealed >= t.lastChuckyRevealed,
    `Chucky revealed regressed ${t.lastChuckyRevealed} -> ${payload.chuckyRevealed}`,
    {
      gameId: ctx.gameId,
      roundId: ctx.roundId,
      handNumber: ctx.handNumber,
      prev: t.lastChuckyRevealed,
      next: payload.chuckyRevealed,
      sequenceStep: payload.sequenceStep,
      revealPhase: payload.revealPhase,
    },
  );

  // ── Invariant: chucky must not start before community is complete
  if (payload.chuckyRevealed > 0 && t.lastChuckyRevealed === 0) {
    checkInvariant(
      'holm',
      'holm-chucky-before-community-complete',
      payload.communityRevealed >= 4,
      `First Chucky reveal at communityRevealed=${payload.communityRevealed} (<4)`,
      {
        gameId: ctx.gameId,
        roundId: ctx.roundId,
        handNumber: ctx.handNumber,
        communityRevealed: payload.communityRevealed,
        chuckyRevealed: payload.chuckyRevealed,
        sequenceStep: payload.sequenceStep,
      },
    );
  }

  // ── Invariant: holm-multiple-chucky-reveals-same-step
  // No more than one Chucky card may be revealed per sequence step.
  if (payload.chuckyRevealed > t.lastChuckyRevealed) {
    const delta = payload.chuckyRevealed - t.lastChuckyRevealed;
    checkInvariant(
      'holm',
      'holm-multiple-chucky-reveals-same-step',
      delta <= 1,
      `Chucky advanced by ${delta} in a single step (${t.lastChuckyRevealed} -> ${payload.chuckyRevealed})`,
      {
        gameId: ctx.gameId,
        roundId: ctx.roundId,
        handNumber: ctx.handNumber,
        prev: t.lastChuckyRevealed,
        next: payload.chuckyRevealed,
        sequenceStep: payload.sequenceStep,
        revealPhase: payload.revealPhase,
      },
    );

    for (let i = t.lastChuckyRevealed + 1; i <= payload.chuckyRevealed; i++) {
      t.chuckyRevealHistory.push({ index: i, t: now });
    }
  }

  // Update tracker
  t.lastCommunityRevealed = Math.max(t.lastCommunityRevealed, payload.communityRevealed);
  t.lastChuckyRevealed = Math.max(t.lastChuckyRevealed, payload.chuckyRevealed);

  // Persist sequence step
  persistTransition(
    ctx.gameId,
    'holm',
    ctx.handNumber,
    `reveal-step:${payload.sequenceStep}`,
    {
      revealPhase: payload.revealPhase,
      revealTriggerReason: payload.revealTriggerReason,
      stayerPlayerId: ctx.stayerPlayerId?.slice(0, 8) ?? null,
      communityRevealed: payload.communityRevealed,
      chuckyRevealed: payload.chuckyRevealed,
      chuckyTotal: payload.chuckyTotal,
      timestamp: now,
      ...(payload.extra ?? {}),
    },
    ctx.roundId,
  );
}

// ── L2: Render-boundary logging ───────────────────────────────

/**
 * Log a single revealable card frame. Use sparingly — only on transitions
 * (face-down -> face-up or vice versa) to keep volume bounded.
 *
 * Verbose flag gates persistence; mismatch invariants ALWAYS fire.
 */
export function logRevealRenderFrame(
  ctx: SequenceContext,
  payload: RenderFramePayload,
): void {
  const renderOrderStep = nextRenderOrder(ctx.gameId, ctx.handNumber);

  // Mismatch invariant — render reality vs authoritative intent.
  // Allow `actually=true` while `should=false` (a brief over-reveal is
  // strictly worse than under-reveal, but we still log via a softer rule
  // by piggybacking on the same invariant — direction is captured in payload).
  if (payload.shouldBeFaceUp !== payload.actuallyRenderedFaceUp) {
    checkInvariant(
      'holm',
      payload.cardType === 'chucky'
        ? 'holm-chucky-render-mismatch'
        : 'holm-community-render-mismatch',
      false,
      `${payload.cardType}[${payload.cardIndex}] should=${payload.shouldBeFaceUp} actual=${payload.actuallyRenderedFaceUp}`,
      {
        gameId: ctx.gameId,
        roundId: ctx.roundId,
        handNumber: ctx.handNumber,
        cardType: payload.cardType,
        cardIndex: payload.cardIndex,
        shouldBeFaceUp: payload.shouldBeFaceUp,
        actuallyRenderedFaceUp: payload.actuallyRenderedFaceUp,
        renderOrderStep,
      },
    );
  }

  if (!isHolmRevealVerbose()) return;

  persistTransition(
    ctx.gameId,
    'holm',
    ctx.handNumber,
    `reveal-render:${payload.cardType}-${payload.cardIndex}`,
    {
      cardType: payload.cardType,
      cardIndex: payload.cardIndex,
      shouldBeFaceUp: payload.shouldBeFaceUp,
      actuallyRenderedFaceUp: payload.actuallyRenderedFaceUp,
      renderOrderStep,
      timestamp: Date.now(),
      ...(payload.extra ?? {}),
    },
    ctx.roundId,
  );
}

// ── L3: Resolution gate logging ───────────────────────────────

/**
 * Log a resolution-gate event (announcement, chip transfer, hand complete,
 * next transition). Validates that all reveals finished BEFORE resolution.
 */
export function logResolutionGate(
  ctx: SequenceContext,
  gate: ResolutionGateName,
  payload?: Record<string, unknown>,
): void {
  const t = getTracker(ctx.gameId, ctx.handNumber);
  const now = Date.now();

  if (gate === 'winner-announcement-start' || gate === 'chip-transfer-start') {
    if (t.resolutionStartedAt === null) t.resolutionStartedAt = now;

    // ── Invariant: holm-final-chucky-not-revealed-before-resolution
    // chuckyTotal=0 means we never observed Chucky cards (e.g., everyone-folded
    // path) — skip the check in that case.
    if (t.chuckyTotal > 0) {
      checkInvariant(
        'holm',
        'holm-final-chucky-not-revealed-before-resolution',
        t.lastChuckyRevealed >= t.chuckyTotal,
        `Resolution gate '${gate}' fired at chuckyRevealed=${t.lastChuckyRevealed}/${t.chuckyTotal}`,
        {
          gameId: ctx.gameId,
          roundId: ctx.roundId,
          handNumber: ctx.handNumber,
          gate,
          chuckyRevealed: t.lastChuckyRevealed,
          chuckyTotal: t.chuckyTotal,
          communityRevealed: t.lastCommunityRevealed,
        },
      );

      // ── Invariant: holm-resolution-started-before-reveal-complete
      // Both community (4) and chucky (chuckyTotal) must be fully revealed.
      const revealComplete =
        t.lastCommunityRevealed >= 4 && t.lastChuckyRevealed >= t.chuckyTotal;
      checkInvariant(
        'holm',
        'holm-resolution-started-before-reveal-complete',
        revealComplete,
        `Resolution gate '${gate}' fired before reveal complete (community=${t.lastCommunityRevealed}/4, chucky=${t.lastChuckyRevealed}/${t.chuckyTotal})`,
        {
          gameId: ctx.gameId,
          roundId: ctx.roundId,
          handNumber: ctx.handNumber,
          gate,
          communityRevealed: t.lastCommunityRevealed,
          chuckyRevealed: t.lastChuckyRevealed,
          chuckyTotal: t.chuckyTotal,
        },
      );
    }
  }

  persistTransition(
    ctx.gameId,
    'holm',
    ctx.handNumber,
    `reveal-gate:${gate}`,
    {
      gate,
      timestamp: now,
      communityRevealed: t.lastCommunityRevealed,
      chuckyRevealed: t.lastChuckyRevealed,
      chuckyTotal: t.chuckyTotal,
      msSinceCommunityComplete:
        t.communityCompleteAt !== null ? now - t.communityCompleteAt : null,
      chuckyRevealHistory: t.chuckyRevealHistory.map(h => ({
        index: h.index,
        msFromFirst:
          t.chuckyRevealHistory.length > 0
            ? h.t - t.chuckyRevealHistory[0].t
            : 0,
      })),
      ...(payload ?? {}),
    },
    ctx.roundId,
  );
}
