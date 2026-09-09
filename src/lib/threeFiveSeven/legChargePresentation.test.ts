import { describe, expect, it } from 'vitest';
import type { ThreeFiveSevenDecisionRevealClock } from './decisionReveal';
import {
  buildThreeFiveSevenRevealedFinancialPresentation as build,
  getThreeFiveSevenLegChargeAdmission as admit,
  retainThreeFiveSevenFinancialPresentation as retain,
} from './financialPresentation';

const clock: ThreeFiveSevenDecisionRevealClock = {
  serverOffsetMs: 100,
  window: {
    id: 'reveal-1', gameId: 'game-1', dealerGameId: 'dealer-1',
    roundId: 'round-1', handNumber: 1, roundNumber: 2,
    startedAtMs: 0, countdownAtMs: 1000, dropAtMs: 3700,
    endsAtMs: 5300, continuationAtMs: 9300,
  },
};
const input = {
  ...clock.window, transferCursor: 10, roundCompleted: true,
  revealClock: clock, revealBlocked: false, nowMs: 5200,
};
const batch = { game_id: 'game-1', reason: 'leg' as const, cursor: 10 };

describe('3-5-7 leg-charge financial reveal admission', () => {
  it.each([0, 1000, 1900, 2800, 3700, 4700, 5199])(
    'holds the charge through countdown, DROP and hold at local time %i', (nowMs) => {
      expect(admit(batch, build({ ...input, nowMs }))).toBe(false);
    },
  );

  it('releases at the server-adjusted end, not the start of DROP', () => {
    const receipt = build(input);
    expect(receipt?.revealId).toBe(clock.window.id);
    expect(admit(batch, receipt)).toBe(true);
    expect(admit({ ...batch, cursor: 11 }, receipt)).toBe(false);
  });

  it('fails closed for a batch-first delivery with no clock or accepted result', () => {
    expect(admit(batch, build({ ...input, revealClock: null }))).toBe(false);
    expect(admit(batch, build({ ...input, roundCompleted: false }))).toBe(false);
    expect(admit(batch, build({ ...input, revealBlocked: true }))).toBe(false);
    expect(admit(batch, build({ ...input, transferCursor: 9 }))).toBe(false);
  });

  it.each([
    { gameId: 'game-2' }, { dealerGameId: 'dealer-2' }, { roundId: 'round-2' },
    { handNumber: 2 }, { roundNumber: 3 }, { transferCursor: null },
    { transferCursor: -1 }, { transferCursor: 0 }, { transferCursor: 1.5 },
  ])('rejects missing/mismatched atomic frame identity: %j', (patch) => {
    expect(build({ ...input, ...patch })).toBeNull();
  });

  it('retains the completed cursor through a successor but cannot open its new charge', () => {
    const first = build(input);
    const retained = retain(first, null, input);
    expect(admit(batch, retained)).toBe(true);
    expect(admit({ ...batch, cursor: 11 }, retained)).toBe(false);
    expect(retain(first, build({ ...input, transferCursor: 9 }), input)).toEqual(first);
    expect(retain(first, null, { ...input, dealerGameId: 'dealer-2' })).toBeNull();
    expect(retain(first, null, { ...input, gameId: 'game-2' })).toBeNull();
    expect(retain(first, null, { gameId: null, dealerGameId: null })).toBeNull();
  });

  it('admits the final leg below its terminal closing cursor without admitting sweep/pot', () => {
    const final = build({ ...input, transferCursor: 12 });
    expect(admit(batch, final)).toBe(true);
    expect(admit({ ...batch, reason: 'sweep', cursor: 11 }, final)).toBeNull();
    expect(admit({ ...batch, reason: 'win', cursor: 12 }, final)).toBeNull();
    expect(admit({ ...batch, cursor: 13 }, final)).toBe(false);
  });

  it('cannot release another session or an invalid batch cursor', () => {
    const receipt = build(input);
    expect(admit({ ...batch, game_id: 'game-2' }, receipt)).toBe(false);
    for (const cursor of [0, -1, 1.5, NaN]) {
      expect(admit({ ...batch, cursor }, receipt)).toBe(false);
    }
  });

  it.each(['ante', 'bet', 'win', 'sweep', 'transfer'] as const)(
    'leaves %s under its existing admission owner', (reason) => {
      expect(admit({ ...batch, reason }, null)).toBeNull();
    },
  );
});
