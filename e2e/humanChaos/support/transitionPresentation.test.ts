import { describe, expect, it } from 'vitest';
import { assertRoundPresentation, type RoundPresentationExpectation, type TransitionSample } from './transitionPresentation';
import { assertCribbagePresentation, type CribbagePresentationExpectation } from './cribbagePresentation';
import { assertWinnerPayoutPresentation } from './winnerPayoutPresentation';

const scope = { gameId: 'game', dealerGameId: 'dealer', roundId: 'round', handNumber: 5, terminalGenerationId: 'generation' };
const expected: RoundPresentationExpectation = {
  ...scope, actionAt: 0, revealId: 'reveal', revealServerEnd: 600, terminal: true,
  openingBalances: { player: '$100' }, closingBalances: { player: '$110' },
  chargeBatchIds: ['charge'], potTransferIds: ['pot-transfer'], sweepFlightCount: 2,
};
function healthy(): TransitionSample[] {
  const row = (at: number, extra: Partial<TransitionSample> = {}): TransitionSample => ({
    at, scope, reveal: null, stages: [], sweepOverlay: false, setup: false,
    balances: { player: '$100' }, deltas: [], documentVisible: true, ...extra,
  });
  const award = { kind: 'award' as const, id: 'award', finished: false, winning: true, generation: 'generation' };
  const sweeps = [0, 1].map(i => ({ kind: 'sweep' as const, id: `sweep-${i}`, finished: false }));
  const pot = { kind: 'pot' as const, id: 'pot-transfer', finished: false };
  return [
    row(0), ...['3', '2', '1', 'DROP', 'hold'].map((beat, i) => row(100 + i * 100, { reveal: { ...scope, id: 'reveal', beat, localEnd: 600, serverEnd: 600 } })),
    row(600), row(610, { stages: [award] }), row(800, { stages: [{ ...award, finished: true }] }),
    row(810, { stages: sweeps, sweepOverlay: true }),
    row(1100, { stages: sweeps.map(stage => ({ ...stage, finished: true })), sweepOverlay: true }),
    row(1150), row(1200, { stages: [pot] }), row(1400, { stages: [{ ...pot, finished: true }], balances: { player: '$110' } }),
    row(1500, { setup: true, balances: { player: '$110' } }),
  ];
}
describe('3-5-7 visible transition acceptance', () => {
  it('accepts a complete identity-bound reveal, award, sweep, pot and setup', () => {
    expect(assertRoundPresentation(healthy(), expected)).toEqual({ revealEnd: 600, awardEnd: 800, sweepEnd: 1100, potEnd: 1400, setupAt: 1500 });
  });
  it('rejects the incident even when final balances and setup are correct', () => {
    const rows = healthy(); rows.splice(5, 0, { ...rows[0], at: 456, setup: true });
    expect(() => assertRoundPresentation(rows, expected)).toThrow('setup before reveal completion');
  });
  for (const kind of ['award', 'sweep', 'pot'] as const) {
    it(`rejects a missing ${kind}`, () => {
      const rows = healthy().map(row => ({ ...row, stages: row.stages.filter(stage => stage.kind !== kind) }));
      expect(() => assertRoundPresentation(rows, expected)).toThrow(/missing/);
    });
    it(`rejects an unfinished ${kind} removed by setup`, () => {
      const rows = healthy().map(row => ({ ...row, stages: row.stages.map(stage => stage.kind === kind ? { ...stage, finished: false } : stage) }));
      expect(() => assertRoundPresentation(rows, expected)).toThrow(/finish/);
    });
  }
  it('rejects the early signed helper', () => {
    const rows = healthy(); rows[2].deltas = [{ id: 'delta', batch: 'charge', cursor: 2, reason: 'leg', text: '-$2' }];
    expect(() => assertRoundPresentation(rows, expected)).toThrow('early chip helper');
  });
  it('rejects an early balance even without its helper', () => {
    const rows = healthy(); rows[2].balances = { player: '$98' };
    expect(() => assertRoundPresentation(rows, expected)).toThrow('early balance');
  });
  it('rejects the other player balance leaking on an otherwise healthy client', () => {
    const rows = healthy().map(row => ({ ...row, balances: { ...row.balances, peer: '$50' } }));
    rows[2].balances.peer = '$48';
    expect(() => assertRoundPresentation(rows, { ...expected,
      openingBalances: { ...expected.openingBalances, peer: '$50' },
      closingBalances: { ...expected.closingBalances, peer: '$50' },
    })).toThrow('early balance for peer');
  });
  it('rejects a correct closing balance missing from one client', () => {
    expect(() => assertRoundPresentation(healthy(), { ...expected,
      openingBalances: { ...expected.openingBalances, peer: '$50' },
      closingBalances: { ...expected.closingBalances, peer: '$50' },
    })).toThrow('missing closing balance for peer');
  });
  it('rejects a reveal clock borrowed from another receipt', () => {
    expect(() => assertRoundPresentation(healthy(), { ...expected, revealServerEnd: 601 })).toThrow('clock does not match');
  });
  it('rejects a duplicate award', () => {
    const rows = healthy(); rows[8].stages.push({ ...rows[8].stages[0], id: 'duplicate' });
    expect(() => assertRoundPresentation(rows, expected)).toThrow('duplicate leg award');
  });
  it('rejects replay of the same award identifier', () => {
    const rows = healthy(); rows.splice(10, 0, { ...rows[8], at: 1000 });
    expect(() => assertRoundPresentation(rows, expected)).toThrow('duplicate award');
  });
  it('rejects a stale round that otherwise shows the entire story', () => {
    const rows = healthy(); rows[7].scope = { ...scope, roundId: 'old-round' };
    expect(() => assertRoundPresentation(rows, expected)).toThrow('stale stage identity');
  });
  it('rejects a stale reveal with the same display text', () => {
    const rows = healthy(); rows[1].reveal!.dealerGameId = 'old-dealer';
    expect(() => assertRoundPresentation(rows, expected)).toThrow('stale reveal identity');
  });
  it('rejects unrelated financial activity as a pot award', () => {
    const rows = healthy().map(row => ({ ...row, stages: row.stages.map(stage => stage.kind === 'pot' ? { ...stage, id: 'other-transfer' } : stage) }));
    expect(() => assertRoundPresentation(rows, expected)).toThrow('unrelated pot transfer');
  });
  it('rejects a trace that ends before setup', () => {
    expect(() => assertRoundPresentation(healthy().slice(0, -1), expected)).toThrow('missing setup');
  });
  it('rejects a skipped reveal beat', () => {
    expect(() => assertRoundPresentation(healthy().filter(row => row.reveal?.beat !== 'DROP'), expected)).toThrow('beat DROP');
  });
  it('keeps ordinary continuation distinct from setup', () => {
    const rows = healthy().slice(0, 9).map(row => ({ ...row, stages: row.stages.map(stage => ({ ...stage, winning: false })) }));
    rows.push({ ...rows[0], at: 900, balances: { player: '$98' } });
    expect(assertRoundPresentation(rows, { ...expected, terminal: false, closingBalances: { player: '$98' } }).potEnd).toBeNull();
    rows[rows.length - 1].setup = true;
    expect(() => assertRoundPresentation(rows, { ...expected, terminal: false })).toThrow('setup during ordinary');
  });
});

describe('Cribbage visible transition acceptance', () => {
  const cribExpected: CribbagePresentationExpectation = { ...scope, startedAt: 0, winnerId: 'winner', multiplier: 1,
    transferIds: ['payout'], openingBalances: { player: '$100' }, closingBalances: { player: '$110' } };
  const eventId = 'game:round:match_win:winner';
  const rows = (): TransitionSample[] => [
    { ...healthy()[0], at: 0 },
    { ...healthy()[0], at: 100, matchWin: { id: eventId, text: 'Winner wins' } },
    { ...healthy()[0], at: 200, matchWin: { id: eventId, text: 'Winner wins' }, stages: [{ kind: 'payout', id: 'payout', finished: false }] },
    { ...healthy()[0], at: 400, stages: [{ kind: 'payout', id: 'payout', finished: true }], balances: { player: '$110' } },
    { ...healthy()[0], at: 450, setup: true, balances: { player: '$110' } },
  ];
  it('accepts the complete exact winner, transport, balance and setup story', () => {
    expect(assertCribbagePresentation(rows(), cribExpected)).toEqual({ announcementAt: 100, payoutStart: 200, payoutEnd: 400, setupAt: 450 });
  });
  for (const [name, mutate] of [
    ['missing announcement', (r: TransitionSample[]) => { r[1].matchWin = null; r[2].matchWin = null; }],
    ['stale announcement', (r: TransitionSample[]) => { r[1].scope = { ...scope, roundId: 'old' }; }],
    ['missing payout', (r: TransitionSample[]) => { r.forEach(row => { row.stages = []; }); }],
    ['unfinished payout', (r: TransitionSample[]) => { r[3].stages[0].finished = false; }],
    ['premature setup', (r: TransitionSample[]) => { r[1].setup = true; }],
    ['wrong transfer', (r: TransitionSample[]) => { r[2].stages[0].id = 'other'; }],
    ['stale payout', (r: TransitionSample[]) => { r[2].scope = { ...scope, dealerGameId: 'old' }; }],
    ['early balance', (r: TransitionSample[]) => { r[1].balances = { player: '$110' }; }],
    ['wrong closing balance', (r: TransitionSample[]) => { r[3].balances = {}; r[4].balances = {}; }],
    ['hidden observation', (r: TransitionSample[]) => { r[2].documentVisible = false; }],
    ['incomplete observation', (r: TransitionSample[]) => { r.pop(); }],
    ['duplicate payout', (r: TransitionSample[]) => { r.splice(3, 0, { ...r[0], at: 300 }); }],
  ] as const) {
    it(`rejects ${name} even when settlement is correct`, () => {
      const r = rows(); mutate(r); expect(() => assertCribbagePresentation(r, cribExpected)).toThrow();
    });
  }
  it('requires the actual skunk overlay when the multiplier calls for one', () => {
    expect(() => assertCribbagePresentation(rows(), { ...cribExpected, multiplier: 3 })).toThrow('missing skunk');
    const r = rows(); r[0] = { ...r[0], celebration: eventId };
    expect(() => assertCribbagePresentation(r, { ...cribExpected, multiplier: 3 })).not.toThrow();
  });
});

describe('Yahtzee concurrent winner and payout', () => {
  const expected = { ...scope, startedAt: 0, announcementId: 'yahtzee-win', simultaneousAnnouncement: true,
    transferIds: ['payout'], openingBalances: { player: '$100' }, closingBalances: { player: '$110' } };
  const rows = (): TransitionSample[] => [
    { ...healthy()[0], at: 100, matchWin: { id: 'yahtzee-win', text: 'Winner wins' }, stages: [{ kind: 'payout', id: 'payout', finished: false }] },
    { ...healthy()[0], at: 300, stages: [{ kind: 'payout', id: 'payout', finished: true }], balances: { player: '$110' } },
    { ...healthy()[0], at: 400, setup: true, balances: { player: '$110' } },
  ];
  it('allows the exact winner plate and payout to begin together', () => {
    expect(assertWinnerPayoutPresentation(rows(), expected).payoutEnd).toBe(300);
  });
  it('preserves Cribbage dedicated announcement timing by default', () => {
    expect(() => assertWinnerPayoutPresentation(rows(), { ...expected, simultaneousAnnouncement: false })).toThrow('preceded');
  });
  it('rejects a later unrelated announcement', () => {
    const r = rows(); r[0].matchWin = null; r[1].matchWin = { id: 'yahtzee-win', text: 'Winner wins' };
    expect(() => assertWinnerPayoutPresentation(r, expected)).toThrow('preceded');
  });
  it('still requires full transport completion before setup', () => {
    const r = rows(); r[1].stages[0].finished = false;
    expect(() => assertWinnerPayoutPresentation(r, expected)).toThrow('never finished');
  });
});
