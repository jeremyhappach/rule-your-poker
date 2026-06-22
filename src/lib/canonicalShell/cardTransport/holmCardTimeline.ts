/**
 * holmCardTimeline — append-only per-card lifecycle timestamps + per-frame
 * sampled snapshots. Used to prove WHEN a Holm card transitioned through
 * dispatch → claim → settle → domMount → firstVisible.
 *
 * Exposes:
 *   window.__holmCardTimeline   →  Record<cardId, HolmCardTimelineEntry>
 *   window.__holmDealFrames     →  HolmDealFrame[]   (last 300 frames)
 */

export type HolmCardWave = 'hands' | 'community' | 'chucky';

export interface HolmCardTimelineEntry {
  cardId: string;
  wave: HolmCardWave;
  endpoint: string;
  dispatchAt: number | null;
  claimAt: number | null;
  settleAt: number | null;
  domMountAt: number | null;
  firstVisibleAt: number | null;
}

export interface HolmDealFrame {
  t: number;
  phase: string;
  cardsClaimed: number;
  cardsSettled: number;
  actualSelfDomCount: number;
  actualOppDomCounts: number[];
  actualCommunityDomCount: number;
  actualChuckyDomCount: number;
  visibleDomCards: number;
}

export interface HolmTimelineViolation {
  type: 'HOLM_CARD_VISIBLE_BEFORE_SETTLE' | 'HOLM_ALL_VISIBLE_TOO_EARLY';
  cardId?: string;
  endpoint?: string;
  dispatchAt?: number | null;
  claimAt?: number | null;
  settleAt?: number | null;
  domMountAt?: number | null;
  firstVisibleAt?: number | null;
  phase?: string;
  visibleDomCards?: number;
  cardsSettled?: number;
  at: number;
}

type W = typeof window & {
  __holmCardTimeline?: Record<string, HolmCardTimelineEntry>;
  __holmDealFrames?: HolmDealFrame[];
  __holmTimelineViolations?: HolmTimelineViolation[];
  __holmTimelineHandCtx?: string | null;
};

const FRAME_CAP = 300;
const VIOLATION_CAP = 200;

function bag(): Record<string, HolmCardTimelineEntry> {
  if (typeof window === 'undefined') return {};
  const w = window as W;
  if (!w.__holmCardTimeline) w.__holmCardTimeline = {};
  return w.__holmCardTimeline;
}

function frames(): HolmDealFrame[] {
  if (typeof window === 'undefined') return [];
  const w = window as W;
  if (!w.__holmDealFrames) w.__holmDealFrames = [];
  return w.__holmDealFrames;
}

function violations(): HolmTimelineViolation[] {
  if (typeof window === 'undefined') return [];
  const w = window as W;
  if (!w.__holmTimelineViolations) w.__holmTimelineViolations = [];
  return w.__holmTimelineViolations;
}

function ensure(cardId: string, wave: HolmCardWave, endpoint: string): HolmCardTimelineEntry {
  const b = bag();
  let e = b[cardId];
  if (!e) {
    e = {
      cardId,
      wave,
      endpoint,
      dispatchAt: null,
      claimAt: null,
      settleAt: null,
      domMountAt: null,
      firstVisibleAt: null,
    };
    b[cardId] = e;
  }
  return e;
}

export function holmTimelineResetForHand(handContextId: string): void {
  if (typeof window === 'undefined') return;
  const w = window as W;
  const prev = w.__holmTimelineHandCtx ?? null;
  if (prev === handContextId) return;
  w.__holmTimelineHandCtx = handContextId;
  w.__holmCardTimeline = {};
  w.__holmDealFrames = [];
  w.__holmTimelineViolations = [];
}

export function holmTimelineRecordDispatch(
  cardId: string,
  wave: HolmCardWave,
  endpoint: string,
  at: number,
): void {
  const e = ensure(cardId, wave, endpoint);
  if (e.dispatchAt == null) e.dispatchAt = at;
}

export function holmTimelineRecordClaim(cardId: string, at: number): void {
  const b = bag();
  const e = b[cardId];
  if (e && e.claimAt == null) e.claimAt = at;
}

export function holmTimelineRecordSettle(cardId: string, at: number): void {
  const b = bag();
  const e = b[cardId];
  if (e && e.settleAt == null) e.settleAt = at;
}

export function holmTimelineRecordDomMount(cardId: string, at: number): void {
  const b = bag();
  const e = b[cardId];
  if (e && e.domMountAt == null) e.domMountAt = at;
}

export function holmTimelineRecordVisible(cardId: string, at: number): void {
  const b = bag();
  const e = b[cardId];
  if (e && e.firstVisibleAt == null) {
    e.firstVisibleAt = at;
    if (e.settleAt == null || at < e.settleAt) {
      pushViolation({
        type: 'HOLM_CARD_VISIBLE_BEFORE_SETTLE',
        cardId: e.cardId,
        endpoint: e.endpoint,
        dispatchAt: e.dispatchAt,
        claimAt: e.claimAt,
        settleAt: e.settleAt,
        domMountAt: e.domMountAt,
        firstVisibleAt: e.firstVisibleAt,
        at,
      });
    }
  }
}

export function holmFramesAppend(frame: HolmDealFrame): void {
  const f = frames();
  f.push(frame);
  while (f.length > FRAME_CAP) f.shift();
  if (frame.phase === 'DEALING' && frame.visibleDomCards > frame.cardsSettled) {
    pushViolation({
      type: 'HOLM_ALL_VISIBLE_TOO_EARLY',
      phase: frame.phase,
      visibleDomCards: frame.visibleDomCards,
      cardsSettled: frame.cardsSettled,
      at: frame.t,
    });
  }
}

function pushViolation(v: HolmTimelineViolation): void {
  const vs = violations();
  vs.push(v);
  while (vs.length > VIOLATION_CAP) vs.shift();
}

export function getHolmCardTimeline(): Record<string, HolmCardTimelineEntry> {
  return bag();
}

export function getHolmDealFrames(): HolmDealFrame[] {
  return frames();
}

export function getHolmTimelineViolations(): HolmTimelineViolation[] {
  return violations();
}
