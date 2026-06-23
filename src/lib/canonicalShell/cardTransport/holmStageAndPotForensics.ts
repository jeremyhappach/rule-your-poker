/**
 * holmStageAndPotForensics — FORENSICS ONLY.
 *
 * Read-only render-phase observers that emit additional Chucky-adjacent
 * timeline events into the existing COPY CHUCKY FULL FORENSICS export
 * (`holmChuckyFullForensics`). No React state, no effects, no timers,
 * no behavior change.
 *
 * Three concerns:
 *   1. SELF_HAND ↔ TABLED_SELF routing for the seated self player.
 *      Detect every render-phase route flip and flag any flip that
 *      occurs while the Chucky reveal is mid-flight.
 *   2. Pot-transfer trigger lifecycle for the Holm win-pot animation
 *      (raw → gated → mounted → consumed → complete) with a single
 *      structured skip reason for every render where the gate withholds.
 *   3. New-hand Chucky admission summary captured at every Chucky-stage
 *      render so the H1→H2 origin lineage is visible per render tick.
 *
 * All emissions go through `recordChuckyForensic(...)` so they ride the
 * existing copy export under the appropriate category. Module-level
 * refs are used to compute deltas across renders without React state.
 */

import {
  recordChuckyForensic,
  type ChuckyForensicCategory,
} from './holmChuckyFullForensics';

type Prim = string | number | boolean | null | undefined;
type Payload = Record<string, Prim>;

// ─── SELF_HAND / TABLED_SELF routing ───────────────────────────────────

export type HolmSelfStageRoute = 'SELF_HAND' | 'TABLED_SELF';

interface SelfStageSnapshot {
  handContextId: string | null;
  phase: string;
  roundStatus: string | null;
  lonePlayerVisible: boolean;
  hasLiveLonePlayer: boolean;
  activeSnapSource: 'sticky' | 'stage' | 'none';
  activeSnapOriginHandContextId: string | null;
  tabledSelfStickyOriginHandContextId: string | null;
  lonePlayerStageSnapshotOriginHandContextId: string | null;
  selfHandAnchorPresent: boolean;
  tabledSelfStagePresent: boolean;
  cachedChuckyRevealed: number;
  requiredRevealCount: number;
  visualRevealCount: number;
  chuckyVisualRevealComplete: boolean;
  rawWinTriggerId: string | null;
  gatedWinTriggerId: string | null;
  rawLossTriggerId: string | null;
  gatedLossTriggerId: string | null;
  callerFile: string;
  callerFn: string;
}

let _prevSelfStage: SelfStageSnapshot | null = null;
let _prevSelfStageRoute: HolmSelfStageRoute | null = null;
let _prevLonePlayerVisible: boolean | null = null;
let _prevSelfHandPresent: boolean | null = null;

function deriveRoute(s: SelfStageSnapshot): HolmSelfStageRoute {
  return s.lonePlayerVisible ? 'TABLED_SELF' : 'SELF_HAND';
}

function snapshotToPayload(s: SelfStageSnapshot, route: HolmSelfStageRoute, prevRoute: HolmSelfStageRoute | null): Payload {
  return {
    phase: s.phase,
    roundStatus: s.roundStatus,
    priorRoute: prevRoute,
    nextRoute: route,
    hasLiveLonePlayer: s.hasLiveLonePlayer,
    lonePlayerVisible: s.lonePlayerVisible,
    activeSnapSource: s.activeSnapSource,
    activeSnapOriginHCI: s.activeSnapOriginHandContextId,
    tabledSelfStickyOriginHCI: s.tabledSelfStickyOriginHandContextId,
    lonePlayerStageSnapshotOriginHCI: s.lonePlayerStageSnapshotOriginHandContextId,
    selfHandAnchorPresent: s.selfHandAnchorPresent,
    tabledSelfStagePresent: s.tabledSelfStagePresent,
    cachedChuckyRevealed: s.cachedChuckyRevealed,
    requiredRevealCount: s.requiredRevealCount,
    visualRevealCount: s.visualRevealCount,
    chuckyVisualRevealComplete: s.chuckyVisualRevealComplete,
    rawWinTriggerId: s.rawWinTriggerId,
    gatedWinTriggerId: s.gatedWinTriggerId,
    rawLossTriggerId: s.rawLossTriggerId,
    gatedLossTriggerId: s.gatedLossTriggerId,
    callerFile: s.callerFile,
    callerFn: s.callerFn,
  };
}

/**
 * Call once per MobileGameTable render from the Holm self-stage routing
 * block. Emits HOLM_SELF_STAGE_ROUTE every render and the
 * HOLM_SELF_STAGE_CHANGED / mount / unmount / violation deltas as
 * required.
 */
export function instrumentHolmSelfStageRender(s: SelfStageSnapshot): void {
  const route = deriveRoute(s);
  const payload = snapshotToPayload(s, route, _prevSelfStageRoute);

  recordChuckyForensic('persistence', 'HOLM_SELF_STAGE_ROUTE', payload, s.handContextId);

  if (_prevSelfStageRoute !== null && _prevSelfStageRoute !== route) {
    recordChuckyForensic('persistence', 'HOLM_SELF_STAGE_CHANGED', payload, s.handContextId);
    // Violation: route flip while Chucky reveal is mid-flight and no
    // terminal outcome has been gated yet.
    const revealMidFlight =
      s.requiredRevealCount > 0 &&
      s.visualRevealCount > 0 &&
      s.visualRevealCount < s.requiredRevealCount &&
      !s.chuckyVisualRevealComplete;
    const terminalGated = !!s.gatedWinTriggerId || !!s.gatedLossTriggerId;
    if (revealMidFlight && !terminalGated) {
      recordChuckyForensic(
        'violation',
        'HOLM_SELF_STAGE_CHANGED_DURING_CHUCKY_REVEAL',
        payload,
        s.handContextId,
      );
    }
  }

  // Synthesized mount / unmount edges from observed presence flags.
  if (_prevLonePlayerVisible !== null && _prevLonePlayerVisible !== s.lonePlayerVisible) {
    recordChuckyForensic(
      'persistence',
      s.lonePlayerVisible ? 'HOLM_TABLED_SELF_MOUNTED' : 'HOLM_TABLED_SELF_UNMOUNTED',
      payload,
      s.handContextId,
    );
  }
  if (_prevSelfHandPresent !== null && _prevSelfHandPresent !== s.selfHandAnchorPresent) {
    recordChuckyForensic(
      'persistence',
      s.selfHandAnchorPresent ? 'HOLM_SELF_HAND_MOUNTED' : 'HOLM_SELF_HAND_UNMOUNTED',
      payload,
      s.handContextId,
    );
  }

  _prevSelfStage = s;
  _prevSelfStageRoute = route;
  _prevLonePlayerVisible = s.lonePlayerVisible;
  _prevSelfHandPresent = s.selfHandAnchorPresent;
}

void _prevSelfStage; // keep snapshot referenced for future cross-call use

// ─── Pot-transfer lifecycle ─────────────────────────────────────────────

export type HolmPotSkipReason =
  | 'missing_winner'
  | 'missing_pot'
  | 'hand_mismatch'
  | 'trigger_null'
  | 'already_consumed'
  | 'announcement_gate'
  | 'pause_gate'
  | 'consumer_early_return'
  | 'unknown';

interface PotRenderSnapshot {
  handContextId: string | null;
  phase: string;
  roundStatus: string | null;
  rawTriggerId: string | null;
  gatedTriggerId: string | null;
  winnerPlayerId: string | null;
  potAmount: number | null;
  lastRoundResultHandContextId: string | null;
  chuckyVisualRevealComplete: boolean;
  isShowingAnnouncement: boolean;
  sessionPaused: boolean;
  consumedTriggerId: string | null;
  callerFile: string;
  callerFn: string;
}

let _prevRawTrigger: string | null = null;
let _prevGatedTrigger: string | null = null;
let _gatedMountedTriggerId: string | null = null;
let _gatedFirstSeenAt: number | null = null;
let _expectedNotMountedFlagged: string | null = null;

const POT_MOUNT_WINDOW_MS = 1500;

function potPayload(s: PotRenderSnapshot, extra: Payload = {}): Payload {
  return {
    phase: s.phase,
    roundStatus: s.roundStatus,
    rawTriggerId: s.rawTriggerId,
    gatedTriggerId: s.gatedTriggerId,
    winnerPlayerId: s.winnerPlayerId,
    potAmount: s.potAmount,
    lastRoundResultHCI: s.lastRoundResultHandContextId,
    chuckyVisualRevealComplete: s.chuckyVisualRevealComplete,
    isShowingAnnouncement: s.isShowingAnnouncement,
    sessionPaused: s.sessionPaused,
    consumedTriggerId: s.consumedTriggerId,
    callerFile: s.callerFile,
    callerFn: s.callerFn,
    ...extra,
  };
}

function deriveSkipReason(s: PotRenderSnapshot): HolmPotSkipReason {
  if (!s.rawTriggerId) return 'trigger_null';
  if (s.consumedTriggerId === s.rawTriggerId) return 'already_consumed';
  if (
    s.lastRoundResultHandContextId &&
    s.handContextId &&
    s.lastRoundResultHandContextId !== s.handContextId
  ) return 'hand_mismatch';
  if (!s.winnerPlayerId) return 'missing_winner';
  if (s.potAmount === 0) return 'missing_pot';
  if (s.sessionPaused) return 'pause_gate';
  if (!s.chuckyVisualRevealComplete) return 'announcement_gate';
  if (s.isShowingAnnouncement) return 'announcement_gate';
  return 'unknown';
}

/**
 * Call once per MobileGameTable render from the Holm win-pot decision
 * block. Emits RAW / GATED / MOUNTED / SKIPPED transitions and the
 * HOLM_POT_ANIMATION_EXPECTED_NOT_MOUNTED violation if the gate stays
 * open without the consumer mounting within POT_MOUNT_WINDOW_MS.
 */
export function instrumentHolmPotRender(s: PotRenderSnapshot): void {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  if (s.rawTriggerId && s.rawTriggerId !== _prevRawTrigger) {
    recordChuckyForensic('win', 'HOLM_POT_TRIGGER_RAW', potPayload(s), s.handContextId);
  }
  if (s.gatedTriggerId && s.gatedTriggerId !== _prevGatedTrigger) {
    recordChuckyForensic('win', 'HOLM_POT_TRIGGER_GATED', potPayload(s), s.handContextId);
    if (_gatedMountedTriggerId !== s.gatedTriggerId) {
      recordChuckyForensic('win', 'HOLM_POT_ANIMATION_MOUNTED', potPayload(s), s.handContextId);
      _gatedMountedTriggerId = s.gatedTriggerId;
      _gatedFirstSeenAt = now;
      _expectedNotMountedFlagged = null;
    }
  }

  if (s.rawTriggerId && !s.gatedTriggerId) {
    const reason = deriveSkipReason(s);
    recordChuckyForensic(
      'win',
      'HOLM_POT_ANIMATION_SKIPPED',
      potPayload(s, { reason }),
      s.handContextId,
    );
    if (_gatedFirstSeenAt === null) _gatedFirstSeenAt = now;
    if (
      _expectedNotMountedFlagged !== s.rawTriggerId &&
      _gatedFirstSeenAt !== null &&
      now - _gatedFirstSeenAt > POT_MOUNT_WINDOW_MS
    ) {
      recordChuckyForensic(
        'violation',
        'HOLM_POT_ANIMATION_EXPECTED_NOT_MOUNTED',
        potPayload(s, { reason, ageMs: Math.round(now - _gatedFirstSeenAt) }),
        s.handContextId,
      );
      _expectedNotMountedFlagged = s.rawTriggerId;
    }
  }

  if (!s.rawTriggerId && !s.gatedTriggerId) {
    _gatedFirstSeenAt = null;
    _expectedNotMountedFlagged = null;
  }

  _prevRawTrigger = s.rawTriggerId;
  _prevGatedTrigger = s.gatedTriggerId;
}

/** Called from the consumer onAnimationStart hook. */
export function recordHolmPotConsumed(payload: Payload, handContextId: string | null): void {
  recordChuckyForensic('win', 'HOLM_POT_ANIMATION_CONSUMED', payload, handContextId);
}

/** Called from the consumer onAnimationComplete hook. */
export function recordHolmPotComplete(payload: Payload, handContextId: string | null): void {
  recordChuckyForensic('win', 'HOLM_POT_ANIMATION_COMPLETE', payload, handContextId);
}

// ─── New-hand Chucky admission summary ──────────────────────────────────

interface ChuckyAdmissionSnapshot {
  handContextId: string | null;
  cachedChuckyOriginHandContextId: string | null;
  cachedChuckySourceEligible: boolean;
  stickyChuckyOriginHandContextId: string | null;
  stickyChuckySourceEligible: boolean;
  stickyChuckyRevealOriginHandContextId: string | null;
  stickyChuckyRevealEligible: boolean;
  renderedChuckyCount: number;
  renderedRevealCount: number;
  serverRevealCount: number;
  callerFile: string;
  callerFn: string;
}

let _lastChuckyAdmissionHandContextId: string | null = null;
let _lastChuckyAdmissionRendered: number | null = null;
let _lastChuckyAdmissionRevealed: number | null = null;

/**
 * Call once per Chucky-stage render. Emits one snapshot per
 * (handContextId, renderedCount, revealedCount) tuple so the ring
 * buffer reflects every distinct admission decision without flooding.
 */
export function recordHolmChuckyAdmission(s: ChuckyAdmissionSnapshot): void {
  const sameHand = _lastChuckyAdmissionHandContextId === s.handContextId;
  const sameCounts =
    _lastChuckyAdmissionRendered === s.renderedChuckyCount &&
    _lastChuckyAdmissionRevealed === s.renderedRevealCount;
  if (sameHand && sameCounts) return;

  const cat: ChuckyForensicCategory =
    _lastChuckyAdmissionHandContextId !== s.handContextId ? 'persistence' : 'stage';

  recordChuckyForensic(
    cat,
    'HOLM_CHUCKY_ADMISSION',
    {
      currentHCI: s.handContextId,
      cachedChuckyOriginHCI: s.cachedChuckyOriginHandContextId,
      cachedChuckySourceEligible: s.cachedChuckySourceEligible,
      stickyChuckyOriginHCI: s.stickyChuckyOriginHandContextId,
      stickyChuckySourceEligible: s.stickyChuckySourceEligible,
      stickyChuckyRevealOriginHCI: s.stickyChuckyRevealOriginHandContextId,
      stickyChuckyRevealEligible: s.stickyChuckyRevealEligible,
      renderedChuckyCount: s.renderedChuckyCount,
      renderedRevealCount: s.renderedRevealCount,
      serverRevealCount: s.serverRevealCount,
      callerFile: s.callerFile,
      callerFn: s.callerFn,
    },
    s.handContextId,
  );

  _lastChuckyAdmissionHandContextId = s.handContextId;
  _lastChuckyAdmissionRendered = s.renderedChuckyCount;
  _lastChuckyAdmissionRevealed = s.renderedRevealCount;
}
