/**
 * holmChuckyTotalForensics — WAR-TIME ONLY.
 *
 * Implements the explicit recorders called out in
 * "HOLM CHUCKY — TOTAL WARTIME FORENSICS":
 *   A. HOLM_SOLO_CHUCKY_STATE_SNAPSHOT
 *   B. HOLM_RESULT_GATE_EVAL / HOLM_RESULT_COMPUTED / HOLM_ANNOUNCEMENT_REQUEST /
 *      HOLM_ANNOUNCEMENT_START / HOLM_ANNOUNCEMENT_RENDER /
 *      HOLM_WIN_SEQUENCE_REQUEST / HOLM_WIN_SEQUENCE_START /
 *      HOLM_PLAYER_TO_POT_START / HOLM_NEXT_HAND_START
 *      + HOLM_RESULT_BEFORE_VISUAL_CHUCKY_REVEAL_COMPLETE violation
 *   C. CHUCKY_SERVER_REVEAL_READ / _CHANGED, CHUCKY_VISUAL_REVEAL_READ / _CHANGED
 *      + SERVER_REVEAL_ADVANCED_BEFORE_VISUAL
 *      + ANNOUNCEMENT_USED_SERVER_REVEAL_NOT_VISUAL
 *   E. CHUCKY_CARD_FACE_PROP / _RENDERED_FACEUP / _RENDERED_FACEDOWN +
 *      CHUCKY_CARD_REHIDDEN_AFTER_REVEAL violation +
 *      CHUCKY_CARD_FACE_PROP_RESET_DURING_WIN violation
 *   F. CHUCKY_STAGE_RENDER_INPUT
 *      + CHUCKY_STAGE_REVEAL_COUNT_REGRESSED
 *      + CHUCKY_STAGE_REVEAL_COUNT_DEFAULTED_TO_ZERO
 *   G. HOLM_PHASE_CHANGED, HOLM_ROUND_STATUS_CHANGED, HOLM_LIFECYCLE_OWNER_CHANGED
 *      + HOLM_PHASE_ADVANCED_BEFORE_VISUAL_REVEAL_COMPLETE
 *
 * Routes everything through `recordHolmTimelineEvent` so the existing
 * `buildChuckyFullForensicsText()` / `window.__holmChuckyFullForensics`
 * aggregator surfaces it automatically (event names are added to
 * EXPLICIT_ROUTES in holmChuckyFullForensics.ts).
 *
 * NO LOGIC CHANGES. Pure forensics.
 */

import { recordHolmTimelineEvent } from './holmWartimeForensics';

// ── Stack capture helper ────────────────────────────────────────────────
function stk(skip = 2): string | null {
  try {
    const e = new Error();
    const lines = (e.stack || '').split('\n');
    return lines.slice(skip, skip + 8).map((l) => l.trim()).join(' | ');
  } catch {
    return null;
  }
}

// ── A. Global state snapshot ────────────────────────────────────────────
export interface HolmSoloChuckyStateSnapshot {
  handContextId: string | null;
  renderSeq?: number;
  phase?: string | null;
  roundStatus?: string | null;
  isSoloVsChuckyRaw?: boolean;
  soloDeclared?: boolean;
  soloVsChuckyTableLocked?: boolean;
  soloVsChuckyPlayerIdLocked?: string | null;
  chuckyActive?: boolean;
  cachedChuckyActive?: boolean;
  cachedChuckyHandContextId?: string | null;
  cachedChuckyCardsLen?: number;
  cachedChuckyCardsHash?: string | null;
  cachedChuckyCardsRevealed?: number;
  chuckyCardsRevealedServer?: number;
  chuckyExpected?: number;
  chuckySettled?: number;
  chuckyBarrierOpen?: boolean;
  chuckyStageMounted?: boolean;
  tabledSelfMounted?: boolean;
  communityMounted?: boolean;
  announcementShowing?: boolean;
  resultAnnouncementRequested?: boolean;
  winSequenceActive?: boolean;
  playerToPotActive?: boolean;
  nextHandStarted?: boolean;
  caller?: string;
  callsite?: string;
}

let _snapSeq = 0;
export function recordHolmSoloChuckyStateSnapshot(
  s: HolmSoloChuckyStateSnapshot,
): void {
  recordHolmTimelineEvent(
    'HOLM_SOLO_CHUCKY_STATE_SNAPSHOT',
    { renderSeq: ++_snapSeq, ...s, stack: stk() },
    s.handContextId ?? null,
  );
}

// ── B. Result / announcement / win gates ────────────────────────────────
export interface HolmGateSnapshot {
  handContextId: string | null;
  callsite: string;
  caller?: string;
  phase?: string | null;
  roundStatus?: string | null;
  naturalWinner?: string | null;
  finalWinner?: string | null;
  resultSource?: string | null;
  cachedChuckyCardsRevealed?: number;
  cachedChuckyCardsLen?: number;
  chuckyCardsRevealedServer?: number;
  chuckyStageMounted?: boolean;
  tabledSelfMounted?: boolean;
  allowed?: boolean;
  blockedReason?: string | null;
  extra?: Record<string, unknown>;
}

function _visualComplete(s: HolmGateSnapshot): boolean {
  const r = s.cachedChuckyCardsRevealed ?? 0;
  const t = s.cachedChuckyCardsLen ?? 0;
  return t > 0 && r >= t;
}
function _serverComplete(s: HolmGateSnapshot): boolean {
  return (s.chuckyCardsRevealedServer ?? 0) >= 4;
}

function _emitGate(
  name: string,
  s: HolmGateSnapshot,
): void {
  const visualRevealComplete = _visualComplete(s);
  const serverRevealComplete = _serverComplete(s);
  recordHolmTimelineEvent(
    name,
    { ...s, visualRevealComplete, serverRevealComplete, stack: stk() },
    s.handContextId ?? null,
  );
  // Violations
  if (!visualRevealComplete && (s.cachedChuckyCardsLen ?? 0) > 0) {
    if (
      name === 'HOLM_RESULT_COMPUTED' ||
      name === 'HOLM_ANNOUNCEMENT_REQUEST' ||
      name === 'HOLM_ANNOUNCEMENT_START' ||
      name === 'HOLM_WIN_SEQUENCE_REQUEST' ||
      name === 'HOLM_WIN_SEQUENCE_START' ||
      name === 'HOLM_PLAYER_TO_POT_START' ||
      name === 'HOLM_NEXT_HAND_START'
    ) {
      recordHolmTimelineEvent(
        'HOLM_RESULT_BEFORE_VISUAL_CHUCKY_REVEAL_COMPLETE',
        { gate: name, ...s, visualRevealComplete, serverRevealComplete, stack: stk() },
        s.handContextId ?? null,
      );
    }
    if (
      serverRevealComplete &&
      (name === 'HOLM_ANNOUNCEMENT_START' || name === 'HOLM_WIN_SEQUENCE_START')
    ) {
      recordHolmTimelineEvent(
        'ANNOUNCEMENT_USED_SERVER_REVEAL_NOT_VISUAL',
        { gate: name, ...s, stack: stk() },
        s.handContextId ?? null,
      );
    }
  }
}

export const recordHolmResultGateEval = (s: HolmGateSnapshot) => _emitGate('HOLM_RESULT_GATE_EVAL', s);
export const recordHolmResultComputed = (s: HolmGateSnapshot) => _emitGate('HOLM_RESULT_COMPUTED', s);
export const recordHolmAnnouncementRequest = (s: HolmGateSnapshot) => _emitGate('HOLM_ANNOUNCEMENT_REQUEST', s);
export const recordHolmAnnouncementStart = (s: HolmGateSnapshot) => _emitGate('HOLM_ANNOUNCEMENT_START', s);
export const recordHolmAnnouncementRender = (s: HolmGateSnapshot) => _emitGate('HOLM_ANNOUNCEMENT_RENDER', s);
export const recordHolmWinSequenceRequest = (s: HolmGateSnapshot) => _emitGate('HOLM_WIN_SEQUENCE_REQUEST', s);
export const recordHolmWinSequenceStart = (s: HolmGateSnapshot) => _emitGate('HOLM_WIN_SEQUENCE_START', s);
export const recordHolmPlayerToPotStart = (s: HolmGateSnapshot) => _emitGate('HOLM_PLAYER_TO_POT_START', s);
export const recordHolmNextHandStart = (s: HolmGateSnapshot) => _emitGate('HOLM_NEXT_HAND_START', s);

// ── C. Server vs Visual reveal split-brain ──────────────────────────────
export interface RevealRead {
  handContextId: string | null;
  oldValue?: number;
  newValue?: number;
  source?: string;
  writer?: string;
  callsite?: string;
  cachedChuckyCardsRevealed?: number;
  chuckyCardsRevealedServer?: number;
  phase?: string | null;
  roundStatus?: string | null;
  announcementShowing?: boolean;
  winSequenceActive?: boolean;
}

export function recordChuckyServerRevealRead(s: RevealRead): void {
  recordHolmTimelineEvent('CHUCKY_SERVER_REVEAL_READ', { ...s, stack: stk() }, s.handContextId ?? null);
  _maybeSplitBrain(s);
}
export function recordChuckyServerRevealChanged(s: RevealRead): void {
  recordHolmTimelineEvent('CHUCKY_SERVER_REVEAL_CHANGED', { ...s, stack: stk() }, s.handContextId ?? null);
  _maybeSplitBrain(s);
}
export function recordChuckyVisualRevealRead(s: RevealRead): void {
  recordHolmTimelineEvent('CHUCKY_VISUAL_REVEAL_READ', { ...s, stack: stk() }, s.handContextId ?? null);
  _maybeSplitBrain(s);
}
export function recordChuckyVisualRevealChanged(s: RevealRead): void {
  recordHolmTimelineEvent('CHUCKY_VISUAL_REVEAL_CHANGED', { ...s, stack: stk() }, s.handContextId ?? null);
  _maybeSplitBrain(s);
}

function _maybeSplitBrain(s: RevealRead): void {
  const server = s.chuckyCardsRevealedServer ?? 0;
  const visual = s.cachedChuckyCardsRevealed ?? 0;
  if (server > visual) {
    recordHolmTimelineEvent(
      'SERVER_REVEAL_ADVANCED_BEFORE_VISUAL',
      { server, visual, ...s, stack: stk() },
      s.handContextId ?? null,
    );
  }
}

// ── E. Per-card face ownership & rehide detection ───────────────────────
interface CardFaceMemo {
  handContextId: string | null;
  faceUp: boolean;
  hasBeenFaceUp: boolean;
  owner?: string | null;
}
const _cardMemo = new Map<string, CardFaceMemo>();

export interface CardFaceObservation {
  handContextId: string | null;
  cardIndex: number;
  cardId?: string | null;
  componentInstanceId?: string | null;
  owner?: string | null;
  cachedChuckyCardsRevealed?: number;
  chuckyCardsRevealedServer?: number;
  actualPropIsHidden?: boolean;
  actualPropFaceUp?: boolean;
  actualRenderedFace?: 'UP' | 'DOWN' | null;
  phase?: string | null;
  roundStatus?: string | null;
  announcementShowing?: boolean;
  winSequenceActive?: boolean;
  caller?: string;
  callsite?: string;
}

export function recordChuckyCardRenderEval(o: CardFaceObservation): void {
  const key = `${o.handContextId}|${o.cardIndex}`;
  const prev = _cardMemo.get(key);
  const faceUp = !!o.actualPropFaceUp || o.actualRenderedFace === 'UP';
  const shouldByVisual =
    (o.cachedChuckyCardsRevealed ?? 0) > o.cardIndex;
  const shouldByServer =
    (o.chuckyCardsRevealedServer ?? 0) > o.cardIndex;

  recordHolmTimelineEvent(
    'CHUCKY_CARD_RENDER_EVAL',
    {
      ...o,
      faceUp,
      shouldBeFaceUpByVisual: shouldByVisual,
      shouldBeFaceUpByServer: shouldByServer,
      previousFaceUp: prev?.faceUp ?? null,
      previousOwner: prev?.owner ?? null,
      stack: stk(),
    },
    o.handContextId ?? null,
  );

  if (faceUp) {
    recordHolmTimelineEvent(
      'CHUCKY_CARD_RENDERED_FACEUP',
      { cardIndex: o.cardIndex, owner: o.owner, callsite: o.callsite },
      o.handContextId ?? null,
    );
  } else {
    recordHolmTimelineEvent(
      'CHUCKY_CARD_RENDERED_FACEDOWN',
      { cardIndex: o.cardIndex, owner: o.owner, callsite: o.callsite },
      o.handContextId ?? null,
    );
  }

  // Violation: face went UP -> DOWN within the same hand.
  if (prev && prev.handContextId === o.handContextId) {
    if (prev.faceUp && !faceUp) {
      recordHolmTimelineEvent(
        'CHUCKY_CARD_REHIDDEN_AFTER_REVEAL',
        {
          cardIndex: o.cardIndex,
          previousOwner: prev.owner ?? null,
          newOwner: o.owner ?? null,
          phase: o.phase,
          announcementShowing: o.announcementShowing,
          winSequenceActive: o.winSequenceActive,
          callsite: o.callsite,
          stack: stk(),
        },
        o.handContextId ?? null,
      );
      if (o.announcementShowing || o.winSequenceActive) {
        recordHolmTimelineEvent(
          'CHUCKY_CARD_FACE_PROP_RESET_DURING_WIN',
          {
            cardIndex: o.cardIndex,
            owner: o.owner,
            phase: o.phase,
            callsite: o.callsite,
            stack: stk(),
          },
          o.handContextId ?? null,
        );
      }
    }
  }

  _cardMemo.set(key, {
    handContextId: o.handContextId,
    faceUp,
    hasBeenFaceUp: (prev?.hasBeenFaceUp ?? false) || faceUp,
    owner: o.owner,
  });

  // Violation: render reads server reveal count instead of visual.
  if (
    shouldByServer &&
    !shouldByVisual &&
    faceUp
  ) {
    recordHolmTimelineEvent(
      'CHUCKY_CARD_RENDER_USES_SERVER_INSTEAD_OF_VISUAL',
      {
        cardIndex: o.cardIndex,
        cachedChuckyCardsRevealed: o.cachedChuckyCardsRevealed,
        chuckyCardsRevealedServer: o.chuckyCardsRevealedServer,
        owner: o.owner,
        callsite: o.callsite,
        stack: stk(),
      },
      o.handContextId ?? null,
    );
  }
}

// ── F. Stage render input ───────────────────────────────────────────────
interface StageMemo {
  handContextId: string | null;
  revealCount: number;
}
let _stageMemo: StageMemo | null = null;

export interface ChuckyStageRenderInput {
  handContextId: string | null;
  phase?: string | null;
  roundStatus?: string | null;
  stageMounted?: boolean;
  cardIds?: string[];
  cardsLen?: number;
  cachedChuckyCardsRevealed?: number;
  chuckyCardsRevealedServer?: number;
  computedRevealCount?: number;
  computedRevealCountSource?:
    | 'cachedVisual'
    | 'server'
    | 'defaultZero'
    | 'hiddenFallback'
    | 'unknown';
  isHiddenArrayByIndex?: boolean[];
  faceUpArrayByIndex?: boolean[];
  caller?: string;
  callsite?: string;
}

export function recordChuckyStageRenderInput(s: ChuckyStageRenderInput): void {
  recordHolmTimelineEvent(
    'CHUCKY_STAGE_RENDER_INPUT',
    { ...s, stack: stk() },
    s.handContextId ?? null,
  );

  const prev = _stageMemo;
  const cur: StageMemo = {
    handContextId: s.handContextId,
    revealCount: s.computedRevealCount ?? 0,
  };
  if (prev && prev.handContextId === s.handContextId) {
    if (cur.revealCount < prev.revealCount) {
      recordHolmTimelineEvent(
        'CHUCKY_STAGE_REVEAL_COUNT_REGRESSED',
        {
          previous: prev.revealCount,
          current: cur.revealCount,
          source: s.computedRevealCountSource,
          callsite: s.callsite,
          stack: stk(),
        },
        s.handContextId ?? null,
      );
    }
    if (
      cur.revealCount === 0 &&
      prev.revealCount > 0 &&
      (s.phase === 'RESULT_ANNOUNCEMENT' ||
        s.phase === 'SHOWDOWN' ||
        s.phase === 'WIN_SEQUENCE' ||
        s.phase === 'PLAYER_TO_POT')
    ) {
      recordHolmTimelineEvent(
        'CHUCKY_STAGE_REVEAL_COUNT_DEFAULTED_TO_ZERO',
        {
          phase: s.phase,
          source: s.computedRevealCountSource,
          callsite: s.callsite,
          stack: stk(),
        },
        s.handContextId ?? null,
      );
    }
  }
  _stageMemo = cur;
}

// ── G. Phase / status / owner transitions ───────────────────────────────
let _phaseMemo: { handContextId: string | null; phase: string | null } | null = null;
let _statusMemo: { handContextId: string | null; status: string | null } | null = null;

export interface PhaseChange {
  handContextId: string | null;
  oldPhase?: string | null;
  newPhase: string | null;
  cachedChuckyCardsRevealed?: number;
  cachedChuckyCardsLen?: number;
  chuckyCardsRevealedServer?: number;
  triggeredBy?: string;
  callsite?: string;
}

export function recordHolmPhaseChanged(s: PhaseChange): void {
  const prev = _phaseMemo;
  const oldPhase = s.oldPhase ?? prev?.phase ?? null;
  if (oldPhase === s.newPhase && prev?.handContextId === s.handContextId) return;
  recordHolmTimelineEvent(
    'HOLM_PHASE_CHANGED',
    { ...s, oldPhase, stack: stk() },
    s.handContextId ?? null,
  );
  const visualComplete =
    (s.cachedChuckyCardsLen ?? 0) > 0 &&
    (s.cachedChuckyCardsRevealed ?? 0) >= (s.cachedChuckyCardsLen ?? 0);
  if (
    !visualComplete &&
    (s.cachedChuckyCardsLen ?? 0) > 0 &&
    (s.newPhase === 'SHOWDOWN' ||
      s.newPhase === 'WIN_SEQUENCE' ||
      s.newPhase === 'PLAYER_TO_POT' ||
      s.newPhase === 'NEXT_HAND' ||
      s.newPhase === 'completed')
  ) {
    recordHolmTimelineEvent(
      'HOLM_PHASE_ADVANCED_BEFORE_VISUAL_REVEAL_COMPLETE',
      { ...s, oldPhase, stack: stk() },
      s.handContextId ?? null,
    );
  }
  _phaseMemo = { handContextId: s.handContextId, phase: s.newPhase };
}

export interface RoundStatusChange {
  handContextId: string | null;
  oldRoundStatus?: string | null;
  newRoundStatus: string | null;
  triggeredBy?: string;
  callsite?: string;
}
export function recordHolmRoundStatusChanged(s: RoundStatusChange): void {
  const prev = _statusMemo;
  const oldStatus = s.oldRoundStatus ?? prev?.status ?? null;
  if (oldStatus === s.newRoundStatus && prev?.handContextId === s.handContextId) return;
  recordHolmTimelineEvent(
    'HOLM_ROUND_STATUS_CHANGED',
    { ...s, oldRoundStatus: oldStatus, stack: stk() },
    s.handContextId ?? null,
  );
  _statusMemo = { handContextId: s.handContextId, status: s.newRoundStatus };
}

export interface LifecycleOwnerChange {
  handContextId: string | null;
  owner: string;
  oldOwner?: string | null;
  callsite?: string;
}
export function recordHolmLifecycleOwnerChanged(s: LifecycleOwnerChange): void {
  recordHolmTimelineEvent(
    'HOLM_LIFECYCLE_OWNER_CHANGED',
    { ...s, stack: stk() },
    s.handContextId ?? null,
  );
}
