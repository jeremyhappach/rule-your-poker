import { describe, expect, it } from 'vitest';
import {
  aggregatesAntePotArrival,
  residualDeltaForEndpoint,
  transferDeltaForEndpoint,
  type ChipPresentationBatch,
} from './ChipPresentationLedger';

function batch(overrides: Partial<ChipPresentationBatch>): ChipPresentationBatch {
  return {
    id: 'batch-1',
    game_id: 'game-1',
    cursor: 1,
    reason: 'transfer',
    transfers: [],
    opening_balances: {},
    closing_balances: {},
    ...overrides,
  };
}

describe('ChipPresentationLedger signed balance deltas', () => {
  it('keeps final-leg debit, sweep credit, and pot award as three composed visible changes', () => {
    const finalLeg = batch({
      reason: 'leg',
      opening_balances: { 'player:winner': 4 },
      closing_balances: { 'player:winner': 2 },
    });
    const sweep = batch({
      reason: 'sweep',
      opening_balances: { 'player:winner': 2 },
      closing_balances: { 'player:winner': 4 },
    });
    const potAward = batch({
      reason: 'win',
      opening_balances: { 'player:winner': 4, pot: 6 },
      closing_balances: { 'player:winner': 10, pot: 0 },
      transfers: [{
        id: 'pot-award', amount: 6,
        from: { kind: 'pot' }, to: { kind: 'player', playerId: 'winner' },
      }],
    });

    expect(residualDeltaForEndpoint(finalLeg, 'player:winner')).toBe(-2);
    expect(residualDeltaForEndpoint(sweep, 'player:winner')).toBe(2);
    expect(transferDeltaForEndpoint(potAward, 'player:winner')).toBe(6);
    expect(residualDeltaForEndpoint(potAward, 'player:winner')).toBe(0);
  });

  it('aggregates a multi-player ante into one pot arrival without leaving a residual', () => {
    const antes = batch({
      reason: 'ante',
      opening_balances: { 'player:one': 10, 'player:two': 10, pot: 0 },
      closing_balances: { 'player:one': 5, 'player:two': 5, pot: 10 },
      transfers: [
        { id: 'ante-one', amount: 5, from: { kind: 'player', playerId: 'one' }, to: { kind: 'pot' } },
        { id: 'ante-two', amount: 5, from: { kind: 'player', playerId: 'two' }, to: { kind: 'pot' } },
      ],
    });

    expect(aggregatesAntePotArrival(antes, 'pot')).toBe(true);
    expect(transferDeltaForEndpoint(antes, 'pot')).toBe(10);
    expect(residualDeltaForEndpoint(antes, 'pot')).toBe(0);
  });
});
