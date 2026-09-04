import { describe, expect, it, vi } from 'vitest';

// These are pure accounting-projection tests. Importing the browser client
// must not require localStorage or start an authenticated network session.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import {
  aggregatesConcurrentPotArrival,
  residualDeltaForEndpoint,
  shouldRecoverCommittedCursor,
  transferDeltaForEndpoint,
  type ChipPresentationBatch,
} from './ChipPresentationLedger';

describe('ChipPresentationLedger cursor-gap recovery', () => {
  const base = {
    gameId: 'game-1',
    hydrated: true,
    disposed: false,
    cursor: 6,
    known: false,
    recovering: false,
  };

  it('recovers one exact committed cursor only after live hydration', () => {
    expect(shouldRecoverCommittedCursor(base)).toBe(true);
    expect(shouldRecoverCommittedCursor({ ...base, hydrated: false })).toBe(false);
    expect(shouldRecoverCommittedCursor({ ...base, cursor: 0 })).toBe(false);
  });

  it('dedupes known and already-recovering cursors', () => {
    expect(shouldRecoverCommittedCursor({ ...base, known: true })).toBe(false);
    expect(shouldRecoverCommittedCursor({ ...base, recovering: true })).toBe(false);
    expect(shouldRecoverCommittedCursor({ ...base, disposed: true })).toBe(false);
  });
});

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

  it.each([
    ['ante', 5],
    ['bet', 1],
    ['transfer', 3],
  ] as const)(
    'aggregates concurrent %s receipts into one pot arrival without a residual',
    (reason, amount) => {
      const potReceipt = batch({
        reason,
        opening_balances: { 'player:one': 10, 'player:two': 10, pot: 0 },
        closing_balances: {
          'player:one': 10 - amount,
          'player:two': 10 - amount,
          pot: amount * 2,
        },
        transfers: [
          { id: 'pot-one', amount, from: { kind: 'player', playerId: 'one' }, to: { kind: 'pot' } },
          { id: 'pot-two', amount, from: { kind: 'player', playerId: 'two' }, to: { kind: 'pot' } },
        ],
      });

      expect(aggregatesConcurrentPotArrival(potReceipt, 'pot')).toBe(true);
      expect(transferDeltaForEndpoint(potReceipt, 'pot')).toBe(amount * 2);
      expect(residualDeltaForEndpoint(potReceipt, 'pot')).toBe(0);
    },
  );
});
