import { describe, expect, it } from 'vitest';
import { selectHolmClientPresentationRound } from './holmPreparedPresentation';

const predecessor = {
  id: 'h1', dealer_game_id: 'dg', hand_number: 1, status: 'completed', holm_predecessor_round_id: null,
};
const successor = {
  id: 'h2', dealer_game_id: 'dg', hand_number: 2, status: 'dealing', holm_predecessor_round_id: 'h1',
};

describe('Holm client prepared-hand presentation selection', () => {
  it('holds a live predecessor independently after server publication', () => {
    expect(selectHolmClientPresentationRound({
      rounds: [predecessor, { ...successor, status: 'betting' }],
      dealerGameId: 'dg',
      publishedRound: { ...successor, status: 'betting' },
      barrierRoundId: 'h1',
      predecessorObservedLive: true,
      predecessorReleased: false,
      awaitingNextRound: false,
    })).toMatchObject({ mode: 'held-predecessor', round: { id: 'h1' } });
  });

  it('keeps an observed live H1 until its exact local completion', () => {
    expect(selectHolmClientPresentationRound({
      rounds: [predecessor, successor],
      dealerGameId: 'dg',
      publishedRound: predecessor,
      barrierRoundId: null,
      predecessorObservedLive: true,
      predecessorReleased: false,
      awaitingNextRound: true,
    })).toMatchObject({ mode: 'published', round: { id: 'h1' } });
  });

  it('presents exact H2 immediately after this client releases H1', () => {
    expect(selectHolmClientPresentationRound({
      rounds: [predecessor, successor],
      dealerGameId: 'dg',
      publishedRound: predecessor,
      barrierRoundId: null,
      predecessorObservedLive: true,
      predecessorReleased: true,
      awaitingNextRound: true,
    })).toMatchObject({ mode: 'prepared-successor', round: { id: 'h2' }, predecessorRound: { id: 'h1' } });
  });

  it('admits prepared H2 directly on a fresh mount without replaying H1', () => {
    expect(selectHolmClientPresentationRound({
      rounds: [predecessor, successor],
      dealerGameId: 'dg',
      publishedRound: predecessor,
      barrierRoundId: null,
      predecessorObservedLive: false,
      predecessorReleased: false,
      awaitingNextRound: true,
    })).toMatchObject({ mode: 'prepared-successor', round: { id: 'h2' } });
  });

  it('rejects a prepared row from a different predecessor identity', () => {
    expect(selectHolmClientPresentationRound({
      rounds: [predecessor, { ...successor, holm_predecessor_round_id: 'other' }],
      dealerGameId: 'dg',
      publishedRound: predecessor,
      barrierRoundId: null,
      predecessorObservedLive: false,
      predecessorReleased: false,
      awaitingNextRound: true,
    })).toMatchObject({ mode: 'published', round: { id: 'h1' } });
  });
});
