import { describe, expect, it } from 'vitest';
import { admitFarkleSnapshot, farkleCommittedHolds, farkleStraightRow, farkleTurnStatus, selectedFarkleHold } from './presentation';
import { farkleTestState } from './__fixtures__/testState';

describe('Farkle server-owned presentation', () => {
  it('previews only exact server-enumerated selections, including unusual configured scores', () => {
    const state = farkleTestState(); state.legalHolds = [{ indexes: [0, 1], points: 731 }];
    expect(selectedFarkleHold(state, [1, 0])?.points).toBe(731);
    expect(selectedFarkleHold(state, [0])).toBeNull();
    expect(selectedFarkleHold(state, [0, 0])).toBeNull();
    state.stage = 'bank_or_roll'; expect(selectedFarkleHold(state, [0, 1])).toBeNull();
  });
  it('rejects regressive, wrong-round and changed frozen-rule snapshots', () => {
    const current = farkleTestState();
    expect(admitFarkleSnapshot(current, { ...current, actionSequence: 0 }, current._authorityScope)).toBe(false);
    expect(admitFarkleSnapshot(current, { ...current, _authorityScope: 'another-round' }, current._authorityScope)).toBe(false);
    expect(admitFarkleSnapshot(current, { ...current, actionSequence: 2, config: { ...current.config, targetScore: 7 } }, current._authorityScope)).toBe(false);
    expect(admitFarkleSnapshot(current, { ...current, thisTurn: 99 }, current._authorityScope)).toBe(false);
    expect(admitFarkleSnapshot(current, structuredClone(current), current._authorityScope)).toBe(true);
  });
  it('keeps authoritative die indices while sorting a deterministic straight row', () => {
    const dice = [{ index: 4, value: 1 }, { index: 0, value: 6 }, { index: 1, value: 1 }];
    expect(farkleStraightRow(dice).map(d => d.index)).toEqual([1, 4, 0]);
    expect(dice.map(d => d.index)).toEqual([4, 0, 1]);
  });
  it('admits a newer pause/deadline revision without allowing equal-sequence score changes', () => {
    const current = farkleTestState();
    const resumed = { ...current, turnDeadline: '2026-09-20T20:00:00Z' };
    expect(admitFarkleSnapshot(current, resumed, current._authorityScope, { previous: 2, incoming: 3 })).toBe(true);
    expect(admitFarkleSnapshot(current, { ...resumed, thisTurn: 999 }, current._authorityScope, { previous: 2, incoming: 3 })).toBe(false);
    expect(admitFarkleSnapshot(current, { ...current, actionSequence: 2 }, current._authorityScope, { previous: 3, incoming: 2 })).toBe(false);
  });
  it('reconstructs held rows from receipts and clears them at authoritative turn completion', () => {
    const state = farkleTestState(); state.actionSequence = 2;
    const frame = { sequence: 2, actorId: state.currentTurnPlayerId, configHash: 'test', stateAfter: state,
      events: [{ type: 'dice_held', playerId: state.currentTurnPlayerId, indexes: [0, 1], points: 200, rollNumber: 1 }] };
    expect(farkleCommittedHolds([frame], state)[0]).toMatchObject({ points: 200, dice: [{ index: 0, value: 1 }, { index: 1, value: 1 }] });
    expect(farkleCommittedHolds([{ ...frame, events: [...frame.events, { type: 'turn_completed' }] }], state)).toEqual([]);
  });
  it('shows exact server tiebreak number without changing lifetime turn counts', () => {
    const state = farkleTestState(); state.finalQueue = [state.currentTurnPlayerId];
    expect(farkleTurnStatus(state)).toBe('FINAL TURN');
    state.tiebreakTurn = 3; expect(farkleTurnStatus(state)).toBe('TIEBREAK TURN 3');
    expect(state.playerStates[state.currentTurnPlayerId].completedTurns).toBe(0);
  });
});
