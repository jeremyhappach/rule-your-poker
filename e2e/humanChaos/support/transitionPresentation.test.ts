import { describe, expect, it } from 'vitest';
import { assertRoundPresentation, type RoundPresentationExpectation, type TransitionSample } from './transitionPresentation';

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
