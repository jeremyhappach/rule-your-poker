// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentSound } from '@/lib/audio/presentationSound';
import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
import { createCountingClock } from '@/lib/cribbage/countingClock';
import { CribbageCountingPhase } from './CribbageCountingPhase';

vi.mock('@/lib/audio/presentationSound', () => ({ presentSound: vi.fn() }));
vi.mock('@/lib/debugEventLogger', () => ({ logDebugEvent: vi.fn() }));
vi.mock('@/lib/geometryLab/cardArtifactOverlap', () => ({ useCardOverlap: () => 0.2 }));
vi.mock('./CribbagePlayingCard', () => ({ CribbagePlayingCard: () => null }));

const card = (rank: string, suit: CribbageCard['suit']): CribbageCard => ({
  rank, suit, value: rank === 'K' ? 10 : Number(rank),
});
const pone = [card('2', 'clubs'), card('2', 'diamonds'), card('9', 'hearts'), card('9', 'spades')];
const dealer = [card('4', 'clubs'), card('7', 'diamonds'), card('3', 'hearts'), card('8', 'spades')];
const seats = ['pone', 'dealer'] as const;
const players = seats.map((id, position) => ({ id, position, user_id: id }));
const baseline = { pone: 12, dealer: 10 };
const state: CribbageState = {
  phase: 'counting', turnOrder: ['pone', 'dealer'], dealerPlayerId: 'dealer', cribOwnerPlayerId: 'dealer',
  playerStates: Object.fromEntries(players.map(({ id }) => [id, {
    playerId: id, hand: [], pegScore: baseline[id], hasCalledGo: false, discardedToCrib: [],
  }])),
  cutCard: card('K', 'diamonds'), crib: [card('6', 'clubs'), card('8', 'clubs'), card('5', 'clubs'), card('4', 'hearts')],
  pegging: {
    playedCards: pone.flatMap((c, i) => [{ playerId: 'pone', card: c }, { playerId: 'dealer', card: dealer[i] }]),
    currentCount: 0, currentTurnPlayerId: null, lastToPlay: 'dealer', goCalledBy: [], sequenceStartIndex: 8,
  },
  anteAmount: 1, pot: 0, pointsToWin: 121,
  winnerPlayerId: null, loserScore: null, payoutMultiplier: 1,
  skunkEnabled: true, skunkThreshold: 91, doubleSkunkEnabled: true, doubleSkunkThreshold: 61,
};

describe('first Cribbage counting target on resume', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

  // The two-second pegging hold is followed by an 800 ms entrance and a
  // 500 ms pre-highlight beat. A restored highlight is already in progress.
  it.each([
    { elapsed: 2799, saved: -1, firstHighlightAfter: 1300 },
    { elapsed: 2800, saved: -1, firstHighlightAfter: 500 },
    { elapsed: 3000, saved: -1, firstHighlightAfter: 500 },
    { elapsed: 3299, saved: -1, firstHighlightAfter: 500 },
    { elapsed: 3300, saved: -1, firstHighlightAfter: 0 },
    { elapsed: 3000, saved: 1, firstHighlightAfter: 0 },
  ])('elapsed $elapsed ms, saved beat $saved', ({ elapsed, saved, firstHighlightAfter }) => {
    vi.useFakeTimers();
    const clock = createCountingClock(vi.fn());
    const serverNow = new Date('2026-11-05T18:00:00Z').getTime();
    const snapshot = { ...state, countingStartedAt: new Date(serverNow - elapsed).toISOString() };
    clock.accept(clock.request(), performance.now(), new Date(serverNow).toISOString(), {
      gameId: 'game', dealerGameId: 'dealer-game', roundId: 'round', handNumber: 1, paused: false, pauseVersion: 0, state: snapshot,
    });
    const score = vi.fn();
    const progress = vi.fn();
    const { container } = render(<CribbageCountingPhase
      cribbageState={snapshot} players={players} initialScores={baseline}
      cardBackColors={{ color: 'blue', darkColor: 'navy' }}
      countingTime={clock.getSnapshot()!}
      persistedTargetIndex={0} persistedBeatIndex={saved}
      audioActive debugContext={{ gameId: 'game', roundId: 'round', userId: 'viewer', handNumber: 1 }}
      onCountingComplete={vi.fn()} onScoreUpdate={score} onProgressUpdate={progress}
    />);
    const highlighted = () => container.querySelectorAll('[data-card-highlighted="true"]').length;
    if (firstHighlightAfter) {
      if (firstHighlightAfter === 1300) act(() => vi.advanceTimersByTime(800));
      act(() => vi.advanceTimersByTime(499));
      expect(highlighted()).toBe(0);
      act(() => vi.advanceTimersByTime(1));
    }
    act(() => vi.advanceTimersByTime(0));
    expect(highlighted()).toBe(2);
    expect(score).toHaveBeenLastCalledWith({ pone: saved === 1 ? 16 : 14, dealer: 10 });
    expect(progress.mock.calls).toEqual(firstHighlightAfter ? [[0, 0]] : []);
    expect(presentSound).toHaveBeenCalledTimes(firstHighlightAfter ? 1 : 0);
  });
});
