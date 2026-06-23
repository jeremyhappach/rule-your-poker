import type { CardEndpoint, DealPhase } from './types';
import { describeCardEndpoint } from './types';

export type HolmHiddenByReason =
  | 'none'
  | 'not_claimed'
  | 'not_settled'
  | 'wave_not_started'
  | 'deal_not_started'
  | 'gameplay_only'
  | 'unknown';

export type HolmDealWave = 'hands' | 'community' | 'chucky';

export interface HolmExpectedCardDbg {
  cardId: string;
  wave: HolmDealWave;
  endpoint: string;
  playerId?: string | null;
  seatPosition?: number | null;
  index: number;
}

export interface HolmRenderedCardDbg {
  cardId: string;
  endpoint: string;
  renderer: string;
  component?: string | null;
  playerId?: string | null;
  seatPosition?: number | null;
  domMounted: boolean;
  domVisible: boolean;
  claimed: boolean;
  settled: boolean;
  hiddenByReason: HolmHiddenByReason;
  rect?: { x: number; y: number; w: number; h: number } | null;
}

export type HolmHardViolationType =
  | 'HOLM_CARD_RENDERED_BEFORE_SETTLE'
  | 'HOLM_ALL_CARDS_VISIBLE_AT_DEAL_START'
  | 'HAND_PRESENTATION_CONTEXT_NULL'
  | 'HAND_PRESENTATION_LEAK_ACROSS_DEALER_SELECTION'
  | 'HAND_RUNTIME_IDENTITY_BREACH'
  | 'DISPATCH_WITHOUT_CURRENT_HAND_INTENT'
  | 'SOLO_OR_CHUCKY_STARTED_BEFORE_TXN_READY';

export type HolmObservationalEventType =
  | 'HOLM_STALE_CALLBACK_REJECTED'
  | 'HOLM_IDENTITY_ONLY_CHURN_IGNORED'
  | 'HOLM_OUTCOME_TEARDOWN_COMPLETE'
  | 'HOLM_NEW_HAND_INIT_COMPLETE'
  | 'HOLM_OUTCOME_PRESENTATION_COMPLETE'
  | 'VISUAL_CHUCKY_FLIP_COMPLETE';

export interface HolmDealViolationDbg {
  type: HolmHardViolationType;
  cardId?: string;
  endpoint?: string;
  renderer?: string;
  phase: DealPhase | 'NO_RUNTIME' | string;
  claimed?: boolean;
  settled?: boolean;
  domMounted?: boolean;
  actualVisibleCards?: number;
  cardsSettled?: number;
  handContextId?: string | null;
  handGeneration?: number | null;
  detail?: Record<string, unknown>;
  at: number;
}

export interface HolmDealEventDbg {
  type: HolmObservationalEventType;
  handContextId?: string | null;
  handGeneration?: number | null;
  outcomeTxnKey?: string | null;
  cardId?: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface HolmDealDbgMeta {
  handContextId: string | null;
  gameType: string | null;
  dealRuntimeMounted: boolean;
  phase: DealPhase | 'NO_RUNTIME';
  dealSettled: boolean;
  readyReleased: boolean;
  activeIntentCount: number;
  beginDealAt: number | null;
  beginWaveAt: number | null;
  enterGameplayAt: number | null;
  expectedCount: number;
  settledIds: string[];
  cardsExpected: number;
  cardsDispatched: number;
  cardsSettled: number;
  communityExpected: number;
  communityDispatched: number;
  communitySettled: number;
  chuckyExpected: number;
  chuckyDispatched: number;
  chuckySettled: number;
  buckPosition: number | null;
  dealerPosition: number | null;
  seatOrder: number[];
  seatPlayerIds: string[];
  selfPlayerId: string | null;
  wave: HolmDealWave | null;
  soloDeclared: boolean;
  expectedCards: HolmExpectedCardDbg[];
  /** Holm v3 — current hand-boundary transaction state, surfaced to the HUD pill. */
  handGeneration: number;
  txnTeardownComplete: boolean;
  txnNewHandInitComplete: boolean;
  presentationHandContextId: string | null;
  outcomeTxnKey: string | null;
  visualChuckyFlipCommittedIds: string[];
  hardViolationCounts: Partial<Record<HolmHardViolationType, number>>;
  observationalCounts: Partial<Record<HolmObservationalEventType, number>>;
  recentViolations: HolmDealViolationDbg[];
  recentEvents: HolmDealEventDbg[];
  updatedAt: number;
}

export interface HolmDealDbgSnapshot extends HolmDealDbgMeta {
  runtime: Record<string, unknown>;
  hands: Record<string, unknown>;
  community: Record<string, unknown>;
  chucky: Record<string, unknown>;
  visibility: HolmRenderedCardDbg[];
  violations: HolmDealViolationDbg[];
}

type W = typeof window & { __holmDealDbg?: HolmDealDbgSnapshot | HolmDealDbgMeta };

const listeners = new Set<() => void>();

const RECENT_LIMIT = 32;

let meta: HolmDealDbgMeta = {
  handContextId: null,
  gameType: null,
  dealRuntimeMounted: false,
  phase: 'NO_RUNTIME',
  dealSettled: false,
  readyReleased: false,
  activeIntentCount: 0,
  beginDealAt: null,
  beginWaveAt: null,
  enterGameplayAt: null,
  expectedCount: 0,
  settledIds: [],
  cardsExpected: 0,
  cardsDispatched: 0,
  cardsSettled: 0,
  communityExpected: 0,
  communityDispatched: 0,
  communitySettled: 0,
  chuckyExpected: 0,
  chuckyDispatched: 0,
  chuckySettled: 0,
  buckPosition: null,
  dealerPosition: null,
  seatOrder: [],
  seatPlayerIds: [],
  selfPlayerId: null,
  wave: null,
  soloDeclared: false,
  expectedCards: [],
  handGeneration: 0,
  txnTeardownComplete: false,
  txnNewHandInitComplete: false,
  presentationHandContextId: null,
  outcomeTxnKey: null,
  visualChuckyFlipCommittedIds: [],
  hardViolationCounts: {},
  observationalCounts: {},
  recentViolations: [],
  recentEvents: [],
  updatedAt: Date.now(),
};

function publish(value: HolmDealDbgMeta | HolmDealDbgSnapshot = meta): void {
  if (typeof window !== 'undefined') (window as W).__holmDealDbg = value;
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function subscribeHolmDealDbg(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getHolmDealDbgMeta(): HolmDealDbgMeta {
  return meta;
}

export function holmDealDbgPatch(patch: Partial<HolmDealDbgMeta>): void {
  meta = { ...meta, ...patch, updatedAt: Date.now() };
  publish(meta);
}

export function holmDealDbgRecordRuntime(patch: Partial<HolmDealDbgMeta>): void {
  holmDealDbgPatch({ dealRuntimeMounted: true, gameType: 'holm-game', ...patch });
}

export function holmDealDbgRecordWave(args: {
  handContextId: string;
  wave: HolmDealWave;
  expected: number;
  dispatched: number;
  beginAt: number;
  cards: HolmExpectedCardDbg[];
  buckPosition?: number | null;
  dealerPosition?: number | null;
  seatOrder?: number[];
  seatPlayerIds?: string[];
  selfPlayerId?: string | null;
  soloDeclared?: boolean;
}): void {
  const isNewHand = meta.handContextId !== args.handContextId;
  const existingOtherWaveCards = isNewHand ? [] : meta.expectedCards.filter((c) => c.wave !== args.wave);
  const nextExpectedCards = existingOtherWaveCards.concat(args.cards);
  const patch: Partial<HolmDealDbgMeta> = {
    handContextId: args.handContextId,
    gameType: 'holm-game',
    wave: args.wave,
    expectedCards: nextExpectedCards,
    buckPosition: args.buckPosition ?? meta.buckPosition,
    dealerPosition: args.dealerPosition ?? meta.dealerPosition,
    seatOrder: args.seatOrder ?? meta.seatOrder,
    seatPlayerIds: args.seatPlayerIds ?? meta.seatPlayerIds,
    selfPlayerId: args.selfPlayerId ?? meta.selfPlayerId,
    soloDeclared: args.soloDeclared ?? meta.soloDeclared,
    ...(isNewHand ? {
      beginDealAt: null,
      beginWaveAt: null,
      enterGameplayAt: null,
      expectedCount: 0,
      settledIds: [],
      cardsExpected: 0,
      cardsDispatched: 0,
      cardsSettled: 0,
      communityExpected: 0,
      communityDispatched: 0,
      communitySettled: 0,
      chuckyExpected: 0,
      chuckyDispatched: 0,
      chuckySettled: 0,
    } : {}),
  };
  if (args.wave === 'hands') {
    patch.beginDealAt = args.beginAt;
    patch.cardsExpected = args.expected;
    patch.cardsDispatched = args.dispatched;
  } else if (args.wave === 'community') {
    patch.beginWaveAt = args.beginAt;
    patch.communityExpected = args.expected;
    patch.communityDispatched = args.dispatched;
  } else {
    patch.beginWaveAt = args.beginAt;
    patch.chuckyExpected = args.expected;
    patch.chuckyDispatched = args.dispatched;
  }
  holmDealDbgPatch(patch);
}

export function holmDealDbgPublishSnapshot(snapshot: HolmDealDbgSnapshot): void {
  if (typeof window !== 'undefined') (window as W).__holmDealDbg = snapshot;
}

export function holmDbgEndpoint(ep: CardEndpoint): string {
  return describeCardEndpoint(ep);
}

export function formatHolmDealDbgSnapshot(snapshot: HolmDealDbgSnapshot | HolmDealDbgMeta): string {
  return JSON.stringify(snapshot, null, 2);
}