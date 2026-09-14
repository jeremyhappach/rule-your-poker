import { describe, expect, it } from 'vitest';
import { applyReplayDeltaV1, reconstructReplayV1, type ReplayPackageV1, type ReplayObject } from './contractV1';

const identity = { sessionId: 'session', dealerGameId: 'dealer-game', handNumber: 1, roundId: 'round' };
const opening: ReplayObject = { balances: { a: 10, b: 0 }, scores: { a: 0 }, cards: ['hidden-1', 'hidden-2'] };

function packageFixture(): ReplayPackageV1 {
  const end: ReplayObject = { balances: { a: 7, b: 3 }, scores: { a: 2 }, cards: ['hidden-2'] };
  return {
    contract: 'ptown-replay/1', sessionId: 'session', perspective: { kind: 'public' }, coverage: 'session_genesis',
    steps: [{
      sequence: '9007199254740993', sourceKey: 'committed-action', identity,
      opening: { state: opening, coverage: 'session_genesis', rules: { game: 'fixture/1' } },
      substeps: [{
        type: 'scoring', source: 'fixture-owner', actorId: 'a', targets: ['b'], origin: 'player', operands: {},
        delta: [
          { op: 'set', path: ['balances', 'a'], existed: true, before: 10, value: 7 },
          { op: 'set', path: ['balances', 'b'], existed: true, before: 0, value: 3 },
          { op: 'set', path: ['scores', 'a'], existed: true, before: 0, value: 2 },
          { op: 'splice', path: ['cards'], index: 0, removed: ['hidden-1'], inserted: [] },
        ],
        transfers: [{ id: 'edge-1', from: 'a', to: 'b', amount: 3, reason: 'payment' }],
        scores: [{ counter: 'a', before: 0, delta: 2, after: 2, reason: 'score' }],
      }],
      closing: { scope: 'hand', identity, finalSequence: '9007199254740993', disposition: 'completed', completeness: 'complete', endingState: end, balances: { a: 7, b: 3 }, scores: { a: 2 } },
    }],
    seal: { finalSequence: '9007199254740993', stepCount: 1, completeness: 'complete' },
  };
}

describe('versioned replay data application', () => {
  it('reconstructs an exported package without game logic or a database', () => {
    const replay = JSON.parse(JSON.stringify(packageFixture())) as ReplayPackageV1;
    expect(reconstructReplayV1(replay)).toEqual(replay.steps[0].closing!.endingState);
    expect(opening.balances).toEqual({ a: 10, b: 0 });
  });

  it('distinguishes missing properties from explicit null', () => {
    expect(applyReplayDeltaV1({ a: null }, [{ op: 'set', path: ['b'], existed: false, before: null, value: null }])).toEqual({ a: null, b: null });
    expect(() => applyReplayDeltaV1({ a: null }, [{ op: 'set', path: ['a'], existed: false, before: null, value: 1 }])).toThrow('set_precondition');
  });

  it('rejects missing, reordered, or corrupted deltas instead of repairing them', () => {
    const replay = packageFixture();
    replay.steps[0].substeps[0].delta.splice(0, 1);
    expect(() => reconstructReplayV1(replay)).toThrow('financial_reconciliation');
    expect(() => applyReplayDeltaV1({ cards: ['other'] }, [{ op: 'splice', path: ['cards'], index: 0, removed: ['expected'], inserted: [] }])).toThrow('splice_precondition');
  });

  it('requires exact transfer edges even when a step has zero net money change', () => {
    const replay = packageFixture();
    const step = replay.steps[0].substeps[0];
    step.transfers.push({ id: 'edge-2', from: 'b', to: 'a', amount: 3, reason: 'return' });
    expect(() => reconstructReplayV1(replay)).toThrow('financial_reconciliation');
  });

  it('rejects duplicate economic edges and mismatched scoring', () => {
    const replay = packageFixture();
    replay.steps[0].substeps[0].transfers.push(replay.steps[0].substeps[0].transfers[0]);
    expect(() => reconstructReplayV1(replay)).toThrow('duplicate_transfer');
    const wrongScore = packageFixture();
    wrongScore.steps[0].substeps[0].scores[0].delta = 3;
    expect(() => reconstructReplayV1(wrongScore)).toThrow('score_precondition');
  });

  it('rejects a closing snapshot that disagrees with the applied journal', () => {
    const replay = packageFixture();
    replay.steps[0].closing!.endingState = structuredClone(opening);
    expect(() => reconstructReplayV1(replay)).toThrow('ending_state');
  });

  it('keeps legacy and unsealed packages partial', () => {
    const replay = packageFixture();
    replay.coverage = 'legacy_partial';
    expect(() => reconstructReplayV1(replay)).toThrow('incomplete_package');
    const unsealed = packageFixture();
    delete unsealed.steps[0].closing;
    expect(() => reconstructReplayV1(unsealed)).toThrow('unsealed_tail');
  });

  it('fails closed on unknown contract versions and unsafe paths', () => {
    const replay = packageFixture();
    Object.assign(replay, { contract: 'ptown-replay/2' });
    expect(() => reconstructReplayV1(replay)).toThrow('unsupported_contract');
    expect(() => applyReplayDeltaV1({}, [{ op: 'set', path: ['__proto__'], existed: false, before: null, value: {} }])).toThrow('unsafe_path');
  });

  it('does not let an opening checkpoint conceal between-hand money changes', () => {
    const replay = packageFixture();
    const later = structuredClone(replay.steps[0]);
    later.sequence = '9007199254741000';
    later.sourceKey = 'next-hand';
    replay.steps.push(later);
    replay.seal.stepCount = 2;
    expect(() => reconstructReplayV1(replay)).toThrow('checkpoint_reconciliation');
  });
});
