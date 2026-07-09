import { describe, expect, it } from 'vitest';
import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
import {
  cribbageAuthoritativeHandCounts,
  deriveCribbageParentRenderMode,
  resolveCribbageVisibleHand,
} from './cribbageRenderGuards';

const c = (rank: string): CribbageCard => ({ rank, suit: 'spades', value: rank === 'A' ? 1 : Number(rank) || 10 });
const hand = [c('A'), c('2'), c('3'), c('4'), c('5'), c('6')];

function state(phase: CribbageState['phase'] = 'discarding'): CribbageState {
  return {
    phase,
    dealerPlayerId: 'p1',
    cribOwnerPlayerId: 'p1',
    playerStates: {
      p1: { playerId: 'p1', hand, pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
      p2: { playerId: 'p2', hand, pegScore: 0, hasCalledGo: false, discardedToCrib: [] },
    },
    turnOrder: ['p2', 'p1'],
    crib: [],
    cutCard: null,
    pegging: { playedCards: [], currentCount: 0, currentTurnPlayerId: 'p2', lastToPlay: null, goCalledBy: [], sequenceStartIndex: 0 },
    anteAmount: 10,
    pot: 0,
    pointsToWin: 121,
    skunkEnabled: true,
    skunkThreshold: 91,
    doubleSkunkEnabled: true,
    doubleSkunkThreshold: 61,
    winnerPlayerId: null,
    loserScore: null,
    payoutMultiplier: 1,
  };
}

describe('Cribbage render guards', () => {
  it('captures authoritative counts for both players', () => {
    expect(cribbageAuthoritativeHandCounts(state())).toEqual({ p1: 6, p2: 6 });
  });

  it('first-hand chaos: authoritative hands force gameplay even when initial load/render presentation are stale', () => {
    const mode = deriveCribbageParentRenderMode({
      isDealerSelection: false,
      isHighCardMode: false,
      initialLoadComplete: false,
      renderHandKey: '',
      currentHandKey: 'p1:A,2,3,4,5,6',
      currentPlayerId: 'p1',
      isObserver: false,
      isStaleCompleteAwaitingNext: false,
      authoritativeState: state('discarding'),
    });
    expect(mode.parentAuthoritativeGameplayFallback).toBe(true);
    expect(mode.isBootstrapMode).toBe(false);
    expect(mode.isGameplayMode).toBe(true);
  });

  it('both players can have auth cards while presentation is empty and parent fallback still mounts gameplay', () => {
    const mode = deriveCribbageParentRenderMode({
      isDealerSelection: false,
      isHighCardMode: false,
      initialLoadComplete: true,
      renderHandKey: '',
      currentHandKey: 'current-hand',
      currentPlayerId: 'p2',
      isObserver: false,
      isStaleCompleteAwaitingNext: false,
      authoritativeState: state('discarding'),
    });
    expect(mode.isGameplayMode).toBe(true);
  });

  it('does not bypass real pre-deal/dealer-selection bootstrap', () => {
    const mode = deriveCribbageParentRenderMode({
      isDealerSelection: true,
      isHighCardMode: true,
      initialLoadComplete: false,
      renderHandKey: '',
      currentHandKey: '',
      currentPlayerId: 'p1',
      isObserver: false,
      isStaleCompleteAwaitingNext: false,
      authoritativeState: state('dealer-select'),
    });
    expect(mode.parentAuthoritativeGameplayFallback).toBe(false);
    expect(mode.isGameplayMode).toBe(false);
  });

  it('invokes the shared visible-hand helper when parent is suppressed', () => {
    const result = resolveCribbageVisibleHand({
      authoritativeHand: hand,
      presentationHand: [],
      phase: 'discarding',
      parentSuppressed: true,
      dealPhase: 'PRE_DEAL',
      dealExpectedCount: 12,
      dealActiveIntentCount: 0,
    });
    expect(result.decision).toBe('render-authoritative-self-heal');
    expect(result.hand).toEqual(hand);
  });

  it('recovers partial stale transport after the launch queue is empty', () => {
    const result = resolveCribbageVisibleHand({
      authoritativeHand: hand,
      presentationHand: hand.slice(0, 1),
      phase: 'discarding',
      dealPhase: 'DEALING',
      dealExpectedCount: 12,
      dealActiveIntentCount: 0,
    });
    expect(result.hand).toEqual(hand);
  });

  it('normal healthy deal animation can still show a partial hand while intents are active', () => {
    const result = resolveCribbageVisibleHand({
      authoritativeHand: hand,
      presentationHand: hand.slice(0, 1),
      phase: 'discarding',
      dealPhase: 'DEALING',
      dealExpectedCount: 12,
      dealActiveIntentCount: 3,
    });
    expect(result.decision).toBe('render-presentation');
    expect(result.hand).toEqual(hand.slice(0, 1));
  });

  it('hydration and live fallback converge without refresh', () => {
    const hydration = resolveCribbageVisibleHand({
      authoritativeHand: hand,
      presentationHand: hand,
      phase: 'discarding',
      dealPhase: 'GAMEPLAY',
    });
    const live = resolveCribbageVisibleHand({
      authoritativeHand: hand,
      presentationHand: [],
      phase: 'discarding',
      parentSuppressed: true,
      dealPhase: 'PRE_DEAL',
      dealExpectedCount: 12,
      dealActiveIntentCount: 0,
    });
    expect(live.hand).toEqual(hydration.hand);
  });
});
