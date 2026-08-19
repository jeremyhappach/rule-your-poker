import { describe, expect, it } from 'vitest';
import {
  acceptThreeFiveSevenFrame,
  frameCursor,
  parseThreeFiveSevenCurrentFrame,
  selectExactThreeFiveSevenRound,
} from './currentFrame';

function rawFrame(overrides: Record<string, unknown> = {}) {
  const game = {
    id: 'game-1', status: 'in_progress', game_type: '3-5-7',
    current_game_uuid: 'dg-1', total_hands: 2, current_round: 1,
  };
  const round = {
    id: 'round-h2-r1', game_id: 'game-1', dealer_game_id: 'dg-1',
    hand_number: 2, round_number: 1, cards_dealt: 3, status: 'betting',
  };
  return {
    game, round, players: [{ id: 'player-1' }],
    player_cards: [{ player_id: 'player-1', cards: [{}, {}, {}] }],
    viewer_player_id: 'player-1', viewer_cards_required: true, viewer_cards_present: true,
    identity: {
      dealer_game_id: 'dg-1', hand_number: 2, round_number: 1,
      round_id: 'round-h2-r1', chip_transfer_cursor: 9,
    },
    ...overrides,
  };
}

describe('3-5-7 atomic current frame', () => {
  it('admits one exact H2/R1 frame with the complete private hand', () => {
    const frame = parseThreeFiveSevenCurrentFrame(rawFrame());
    expect(frame.identity).toMatchObject({ hand_number: 2, round_number: 1, round_id: 'round-h2-r1' });
    expect(frame.playerCards[0].cards).toHaveLength(3);
  });

  it('rejects an active frame whose viewer hand is empty or partial', () => {
    expect(() => parseThreeFiveSevenCurrentFrame(rawFrame({
      player_cards: [{ player_id: 'player-1', cards: [] }],
    }))).toThrow(/incomplete_viewer_hand/);
    expect(() => parseThreeFiveSevenCurrentFrame(rawFrame({
      player_cards: [{ player_id: 'player-1', cards: [{}, {}] }],
    }))).toThrow(/incomplete_viewer_hand/);
  });

  it('rejects a torn game pointer and successor round', () => {
    expect(() => parseThreeFiveSevenCurrentFrame(rawFrame({
      game: { ...rawFrame().game, total_hands: 1, current_round: 3 },
    }))).toThrow(/game_identity_mismatch/);
  });

  it('accepts R3 to next-hand R1 as forward identity', () => {
    const prior = {
      requestSequence: 10, status: 'in_progress', dealerGameId: 'dg-1',
      handNumber: 1, roundNumber: 3, roundId: 'round-h1-r3',
    };
    const next = frameCursor(parseThreeFiveSevenCurrentFrame(rawFrame()), 11);
    expect(acceptThreeFiveSevenFrame(prior, next)).toEqual({ accepted: true, reason: 'forward_active_identity' });
  });

  it('rejects a late older request after the successor frame committed', () => {
    const current = frameCursor(parseThreeFiveSevenCurrentFrame(rawFrame()), 12);
    const latePrior = {
      requestSequence: 11, status: 'in_progress', dealerGameId: 'dg-1',
      handNumber: 1, roundNumber: 3, roundId: 'round-h1-r3',
    };
    expect(acceptThreeFiveSevenFrame(current, latePrior)).toEqual({ accepted: false, reason: 'older_request' });
  });
});

describe('selectExactThreeFiveSevenRound', () => {
  const predecessor = { id: 'old', dealer_game_id: 'dg', hand_number: 1, round_number: 3 };
  const successor = { id: 'new', dealer_game_id: 'dg', hand_number: 2, round_number: 1 };

  it('does not advance from a standalone successor row while the game pointer is old', () => {
    expect(selectExactThreeFiveSevenRound([predecessor, successor], {
      dealerGameId: 'dg', handNumber: 1, roundNumber: 3,
    })).toBe(predecessor);
  });

  it('returns the successor only when the exact game pointer advances', () => {
    expect(selectExactThreeFiveSevenRound([predecessor, successor], {
      dealerGameId: 'dg', handNumber: 2, roundNumber: 1,
    })).toBe(successor);
  });

  it('fails closed on missing or duplicate exact identity', () => {
    expect(selectExactThreeFiveSevenRound([successor], {
      dealerGameId: 'dg', handNumber: 1, roundNumber: 3,
    })).toBeNull();
    expect(selectExactThreeFiveSevenRound([successor, { ...successor, id: 'duplicate' }], {
      dealerGameId: 'dg', handNumber: 2, roundNumber: 1,
    })).toBeNull();
  });
});
