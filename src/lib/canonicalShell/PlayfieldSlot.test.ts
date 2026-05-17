import { describe, expect, it } from 'vitest';
import { describeSlotIdentity, slotIdentityEquals } from './PlayfieldSlot';

describe('PlayfieldSlot identity helpers', () => {
  it('null equals null', () => {
    expect(slotIdentityEquals(null, null)).toBe(true);
  });
  it('null vs identity is not equal', () => {
    expect(slotIdentityEquals(null, { gameType: 'holm-game', dealerGameId: 'a' })).toBe(false);
    expect(slotIdentityEquals({ gameType: 'holm-game', dealerGameId: 'a' }, null)).toBe(false);
  });
  it('same pair equals', () => {
    expect(slotIdentityEquals(
      { gameType: 'holm-game', dealerGameId: 'a' },
      { gameType: 'holm-game', dealerGameId: 'a' },
    )).toBe(true);
  });
  it('different gameType or dealerGameId is not equal', () => {
    expect(slotIdentityEquals(
      { gameType: 'holm-game', dealerGameId: 'a' },
      { gameType: '3-5-7', dealerGameId: 'a' },
    )).toBe(false);
    expect(slotIdentityEquals(
      { gameType: 'holm-game', dealerGameId: 'a' },
      { gameType: 'holm-game', dealerGameId: 'b' },
    )).toBe(false);
  });
  it('describeSlotIdentity', () => {
    expect(describeSlotIdentity(null)).toBe('neutral');
    expect(describeSlotIdentity({ gameType: 'holm-game', dealerGameId: 'abc' })).toBe('holm-game/abc');
  });
});
