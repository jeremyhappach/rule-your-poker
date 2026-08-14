import { describe, it, expect } from 'vitest';
import { getHolmProgress, type HolmAuthoritativeSnapshot, type HolmPlayerSnapshot } from './holmProgress';
import { compareProgress } from './stateProgress';

// ── Helpers ────────────────────────────────────────────────────

function makePlayer(overrides: Partial<HolmPlayerSnapshot> = {}): HolmPlayerSnapshot {
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

function makeSnapshot(overrides: Partial<HolmAuthoritativeSnapshot> = {}): HolmAuthoritativeSnapshot {
  return {
    roundId: 'r1',
    handNumber: 1,
    dealerGameId: 'dg1',
    roundStatus: 'betting',
    players: [
      makePlayer({ playerId: 'p1', position: 0 }),
      makePlayer({ playerId: 'p2', position: 1 }),
      makePlayer({ playerId: 'p3', position: 2 }),
      makePlayer({ playerId: 'p4', position: 3 }),
    ],
    currentTurnPosition: 0,
    turnSequence: 0,
    decisionDeadline: null,
    communityCards: [],
    communityCardsRevealed: 0,
    chuckyCards: [],
    chuckyActive: false,
    chuckyCardsRevealed: 0,
    pot: 4,
    chipTransferCursor: 1,
    lastRoundResult: null,
    buckPosition: 0,
    dealerPosition: 1,
    ...overrides,
  };
}

function expectForward(prev: HolmAuthoritativeSnapshot, next: HolmAuthoritativeSnapshot) {
  const cmp = compareProgress(getHolmProgress(prev), getHolmProgress(next));
  expect(cmp).toBe(1);
}

function expectEqual(prev: HolmAuthoritativeSnapshot, next: HolmAuthoritativeSnapshot) {
  const cmp = compareProgress(getHolmProgress(prev), getHolmProgress(next));
  expect(cmp).toBe(0);
}

// ── Tests ──────────────────────────────────────────────────────

describe('getHolmProgress', () => {
  it('returns correct vector for new hand start', () => {
    const snap = makeSnapshot({ handNumber: 3 });
    expect(getHolmProgress(snap)).toEqual([3, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('player click not yet locked — vector unchanged', () => {
    const before = makeSnapshot();
    const after = makeSnapshot({
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: false }),
        makePlayer({ playerId: 'p2', position: 1 }),
        makePlayer({ playerId: 'p3', position: 2 }),
        makePlayer({ playerId: 'p4', position: 3 }),
      ],
    });
    expectEqual(before, after);
  });

  it('locked decision increments decidedCount', () => {
    const before = makeSnapshot();
    const after = makeSnapshot({
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p2', position: 1 }),
        makePlayer({ playerId: 'p3', position: 2 }),
        makePlayer({ playerId: 'p4', position: 3 }),
      ],
      currentTurnPosition: 1,
    });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 0, 0, 1, 0, 0, 0, 0]);
  });

  it('timeout/auto-fold increments decidedCount', () => {
    const before = makeSnapshot({
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p2', position: 1 }),
        makePlayer({ playerId: 'p3', position: 2 }),
        makePlayer({ playerId: 'p4', position: 3 }),
      ],
    });
    const after = makeSnapshot({
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true, autoFold: true }),
        makePlayer({ playerId: 'p3', position: 2 }),
        makePlayer({ playerId: 'p4', position: 3 }),
      ],
    });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 0, 0, 2, 0, 0, 0, 0]);
  });

  it('betting → processing is forward', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const before = makeSnapshot({ roundStatus: 'betting', players: allLocked });
    const after = makeSnapshot({ roundStatus: 'processing', players: allLocked });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 1, 0, 4, 0, 0, 0, 0]);
  });

  it('processing → showdown is forward', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const before = makeSnapshot({ roundStatus: 'processing', players: allLocked });
    const after = makeSnapshot({ roundStatus: 'showdown', players: allLocked });
    expectForward(before, after);
  });

  it('showdown reveal increments communityCardsRevealed', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const before = makeSnapshot({ roundStatus: 'showdown', players: allLocked, communityCardsRevealed: 1 });
    const after = makeSnapshot({ roundStatus: 'showdown', players: allLocked, communityCardsRevealed: 2 });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 2, 0, 4, 0, 2, 0, 0]);
  });

  it('showdown → completed is forward', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const before = makeSnapshot({ roundStatus: 'showdown', players: allLocked, communityCardsRevealed: 4 });
    const after = makeSnapshot({ roundStatus: 'completed', players: allLocked, communityCardsRevealed: 4 });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 3, 0, 4, 0, 4, 0, 0]);
  });

  it('new hand is forward even though decidedCount resets to 0', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const completed = makeSnapshot({
      handNumber: 2,
      roundStatus: 'completed',
      players: allLocked,
      communityCardsRevealed: 4,
    });
    const newHand = makeSnapshot({
      roundId: 'r2',
      handNumber: 3,
      roundStatus: 'betting',
      communityCardsRevealed: 0,
    });
    expectForward(completed, newHand);
    expect(getHolmProgress(newHand)).toEqual([3, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('stale snapshot from previous hand is rejected as regressive', () => {
    const current = makeSnapshot({ handNumber: 3 });
    const stale = makeSnapshot({ handNumber: 2, roundStatus: 'completed', communityCardsRevealed: 4 });
    const cmp = compareProgress(getHolmProgress(current), getHolmProgress(stale));
    expect(cmp).toBe(-1);
  });

  it('__syncHandNumber stamp overrides snapshot.handNumber for progress', () => {
    // Defensive: even if a snapshot is somehow built with a stale handNumber,
    // an explicit __syncHandNumber stamp must dominate the most-significant dim.
    const snap = makeSnapshot({ handNumber: 1, __syncHandNumber: 5 });
    expect(getHolmProgress(snap)).toEqual([5, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('stale all_decisions_in snapshot cannot regress a fresh next-hand betting snapshot', () => {
    // Simulates the "premature end-round from stale all_decisions_in" defect class:
    // a late-arriving prior-hand terminal snapshot must NOT dominate the new hand.
    const stalePriorTerminal = makeSnapshot({
      handNumber: 4,
      roundStatus: 'completed',
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
        makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
      ],
      communityCardsRevealed: 4,
    });
    const freshNextBetting = makeSnapshot({
      roundId: 'r-next',
      handNumber: 5,
      roundStatus: 'betting',
      communityCardsRevealed: 0,
    });
    const cmp = compareProgress(getHolmProgress(stalePriorTerminal), getHolmProgress(freshNextBetting));
    expect(cmp).toBe(1); // next > prior (forward)
  });

  it('showdown reveal progression is monotonic 0→1→2→3→4', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    let prev = makeSnapshot({ roundStatus: 'showdown', players: allLocked, communityCardsRevealed: 0 });
    for (let n = 1; n <= 4; n++) {
      const next = makeSnapshot({ roundStatus: 'showdown', players: allLocked, communityCardsRevealed: n });
      expectForward(prev, next);
      prev = next;
    }
  });

  // ── Chucky progression-significant dims ─────────────────────

  it('chuckyActive false→true is forward (after community reveal complete)', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const base = { roundStatus: 'showdown' as const, players: allLocked, communityCardsRevealed: 4 };
    const before = makeSnapshot({ ...base, chuckyActive: false, chuckyCardsRevealed: 0 });
    const after = makeSnapshot({ ...base, chuckyActive: true, chuckyCardsRevealed: 0 });
    expectForward(before, after);
    expect(getHolmProgress(after)).toEqual([1, 2, 0, 4, 0, 4, 1, 0]);
  });

  it('chuckyCardsRevealed stepping is forward and monotonic', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const base = {
      roundStatus: 'showdown' as const,
      players: allLocked,
      communityCardsRevealed: 4,
      chuckyActive: true,
    };
    let prev = makeSnapshot({ ...base, chuckyCardsRevealed: 0 });
    for (let n = 1; n <= 4; n++) {
      const next = makeSnapshot({ ...base, chuckyCardsRevealed: n });
      expectForward(prev, next);
      prev = next;
    }
  });

  it('stale snapshot with lower chuckyCardsRevealed is rejected as regressive within same hand', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const base = {
      roundStatus: 'showdown' as const,
      players: allLocked,
      communityCardsRevealed: 4,
      chuckyActive: true,
    };
    const current = makeSnapshot({ ...base, chuckyCardsRevealed: 3 });
    const stale = makeSnapshot({ ...base, chuckyCardsRevealed: 1 });
    const cmp = compareProgress(getHolmProgress(current), getHolmProgress(stale));
    expect(cmp).toBe(-1);
  });

  it('stale snapshot with chuckyActive=false is rejected once chucky has activated', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const base = { roundStatus: 'showdown' as const, players: allLocked, communityCardsRevealed: 4 };
    const current = makeSnapshot({ ...base, chuckyActive: true, chuckyCardsRevealed: 2 });
    const stale = makeSnapshot({ ...base, chuckyActive: false, chuckyCardsRevealed: 0 });
    const cmp = compareProgress(getHolmProgress(current), getHolmProgress(stale));
    expect(cmp).toBe(-1);
  });

  it('new hand resets chucky dims but hand dim still dominates (forward)', () => {
    const allLocked = [
      makePlayer({ playerId: 'p1', position: 0, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p2', position: 1, decision: 'fold', decisionLocked: true }),
      makePlayer({ playerId: 'p3', position: 2, decision: 'stay', decisionLocked: true }),
      makePlayer({ playerId: 'p4', position: 3, decision: 'fold', decisionLocked: true }),
    ];
    const priorTerminal = makeSnapshot({
      handNumber: 4,
      roundStatus: 'completed',
      players: allLocked,
      communityCardsRevealed: 4,
      chuckyActive: true,
      chuckyCardsRevealed: 4,
    });
    const nextHand = makeSnapshot({
      roundId: 'r-next',
      handNumber: 5,
      roundStatus: 'betting',
      communityCardsRevealed: 0,
      chuckyActive: false,
      chuckyCardsRevealed: 0,
    });
    expectForward(priorTerminal, nextHand);
    expect(getHolmProgress(nextHand)).toEqual([5, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('a later atomic turn dominates a reordered snapshot with the same decisions', () => {
    const current = makeSnapshot({
      turnSequence: 2,
      currentTurnPosition: 2,
      decisionDeadline: '2026-08-12T20:00:30.000Z',
      players: [
        makePlayer({ playerId: 'p1', position: 0, decision: 'fold', decisionLocked: true }),
        makePlayer({ playerId: 'p2', position: 1, decision: 'stay', decisionLocked: true }),
        makePlayer({ playerId: 'p3', position: 2 }),
        makePlayer({ playerId: 'p4', position: 3 }),
      ],
    });
    const reorderedStale = makeSnapshot({
      turnSequence: 1,
      currentTurnPosition: 1,
      decisionDeadline: '2026-08-12T20:00:10.000Z',
      players: current.players,
    });

    expect(compareProgress(getHolmProgress(current), getHolmProgress(reorderedStale))).toBe(-1);
  });

  it('a resumed deadline dominates a reordered pre-pause deadline on the same turn', () => {
    const resumed = makeSnapshot({
      turnSequence: 1,
      decisionDeadline: '2026-08-12T20:00:30.000Z',
    });
    const stalePrePause = makeSnapshot({
      turnSequence: 1,
      decisionDeadline: '2026-08-12T20:00:10.000Z',
    });

    expect(compareProgress(getHolmProgress(resumed), getHolmProgress(stalePrePause))).toBe(-1);
  });
});
