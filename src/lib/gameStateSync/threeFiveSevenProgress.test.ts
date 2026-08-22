import { describe, it, expect } from 'vitest';
import {
  getThreeFiveSevenProgress,
  type ThreeFiveSevenAuthoritativeSnapshot,
  type ThreeFiveSevenPlayerSnapshot,
} from './threeFiveSevenProgress';
import { compareProgress } from './stateProgress';

function mkPlayer(overrides: Partial<ThreeFiveSevenPlayerSnapshot> = {}): ThreeFiveSevenPlayerSnapshot {
  return {
    playerId: 'p1',
    userId: 'u1',
    position: 0,
    decision: null,
    decisionLocked: false,
    autoFold: false,
    sittingOut: false,
    ...overrides,
  };
}

function mkSnap(overrides: Partial<ThreeFiveSevenAuthoritativeSnapshot> = {}): ThreeFiveSevenAuthoritativeSnapshot {
  return {
    roundId: 'r1',
    handNumber: 1,
    roundNumber: 1,
    dealerGameId: 'dg1',
    roundStatus: 'betting',
    players: [mkPlayer({ playerId: 'a' }), mkPlayer({ playerId: 'b', position: 1 })],
    currentTurnPosition: 0,
    decisionDeadline: null,
    pot: 0,
    chipTransferCursor: 0,
    lastRoundResult: null,
    awaitingNextRound: false,
    buckPosition: 0,
    dealerPosition: 0,
    cardsDealt: 3,
    ...overrides,
  };
}

describe('getThreeFiveSevenProgress', () => {
  it('returns 6-tuple in expected order', () => {
    const v = getThreeFiveSevenProgress(mkSnap());
    expect(v).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it('decided count increments with locked decisions', () => {
    const snap = mkSnap({
      players: [
        mkPlayer({ playerId: 'a', decisionLocked: true }),
        mkPlayer({ playerId: 'b', position: 1 }),
      ],
    });
    expect(getThreeFiveSevenProgress(snap)).toEqual([1, 1, 0, 1, 0, 0]);
  });

  it('phase ordinal advances betting -> completed', () => {
    expect(getThreeFiveSevenProgress(mkSnap({ roundStatus: 'completed' }))[2]).toBe(1);
  });

  it('result-revealed dim flips when lastRoundResult populated', () => {
    const pre = mkSnap({ roundStatus: 'completed', lastRoundResult: null });
    const post = mkSnap({ roundStatus: 'completed', lastRoundResult: 'PlayerA won' });
    expect(getThreeFiveSevenProgress(pre)[4]).toBe(0);
    expect(getThreeFiveSevenProgress(post)[4]).toBe(1);
    // next=post is forward of current=pre
    expect(compareProgress(getThreeFiveSevenProgress(pre), getThreeFiveSevenProgress(post))).toBe(1);
  });

  it('awaiting-next-round dim flips when awaitingNextRound true', () => {
    const pre = mkSnap({ roundStatus: 'completed', lastRoundResult: 'X', awaitingNextRound: false });
    const post = mkSnap({ roundStatus: 'completed', lastRoundResult: 'X', awaitingNextRound: true });
    expect(getThreeFiveSevenProgress(post)[5]).toBe(1);
    expect(compareProgress(getThreeFiveSevenProgress(pre), getThreeFiveSevenProgress(post))).toBe(1);
  });

  it('regressive result-revealed snapshot rejected vs forward', () => {
    const forward = getThreeFiveSevenProgress(mkSnap({ roundStatus: 'completed', lastRoundResult: 'X' }));
    const backward = getThreeFiveSevenProgress(mkSnap({ roundStatus: 'completed', lastRoundResult: null }));
    // current=forward, next=backward is behind → -1
    expect(compareProgress(forward, backward)).toBe(-1);
  });

  it('__syncHandNumber stamp dominates raw handNumber', () => {
    const snap = mkSnap({ handNumber: 5, __syncHandNumber: 7 });
    expect(getThreeFiveSevenProgress(snap)[0]).toBe(7);
  });

  it('hand boundary dominates regressive lower dims (result reset is fine)', () => {
    const hand1Terminal = getThreeFiveSevenProgress(mkSnap({
      handNumber: 1, roundNumber: 3, roundStatus: 'completed',
      lastRoundResult: 'won', awaitingNextRound: true,
      players: [mkPlayer({ decisionLocked: true }), mkPlayer({ position: 1, decisionLocked: true })],
    }));
    const hand2Fresh = getThreeFiveSevenProgress(mkSnap({
      handNumber: 2, roundNumber: 1, roundStatus: 'betting',
      lastRoundResult: null, awaitingNextRound: false,
    }));
    // hand2Fresh is forward of hand1Terminal despite lower dims 2-5
    expect(compareProgress(hand1Terminal, hand2Fresh)).toBe(1);
    expect(compareProgress(hand2Fresh, hand1Terminal)).toBe(-1);
  });

  it('round boundary within hand dominates dims 2-5', () => {
    const r1Done = getThreeFiveSevenProgress(mkSnap({
      handNumber: 1, roundNumber: 1, roundStatus: 'completed',
      lastRoundResult: 'X', awaitingNextRound: true,
    }));
    const r2Fresh = getThreeFiveSevenProgress(mkSnap({
      handNumber: 1, roundNumber: 2, roundStatus: 'betting',
      lastRoundResult: null, awaitingNextRound: false,
    }));
    expect(compareProgress(r1Done, r2Fresh)).toBe(1);
  });
});
