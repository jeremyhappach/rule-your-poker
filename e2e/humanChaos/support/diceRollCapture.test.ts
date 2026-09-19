import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosDomSnapshot } from './continuousObserver';
import { diceRollTarget, waitForDiceRollCapture } from './diceRollCapture';

const scope = { gameId: 'game-1', dealerGameId: 'dealer-1', roundId: 'round-1' };
const dice = [5, 1, 1, 3, 5].map(value => ({ value, isHeld: false }));
const request = { _round_id: scope.roundId, _player_id: 'player-1', _action: 'roll', _expected_action_sequence: 4 };
const response = { outcome: 'applied', action_sequence: 5,
  state: { _authorityScope: scope.roundId, actionSequence: 5, playerStates: {
    'player-1': { rollKey: 12345, dice },
  } } };
const target = diceRollTarget(scope, request, response);
const frame = (time: number, row = 'scatter', overrides: Partial<ChaosDomSnapshot> = {}): ChaosDomSnapshot => ({
  kind: 'snapshot', client: 'peer', ...scope, wallTime: time, gameType: 'ship-captain-crew',
  visibleDice: dice.map((die, index) => `${index}:${die.value}:${die.isHeld}:${row}:${row === 'animating' ? '<unknown-phase>' : 'normal'}`),
  ...overrides,
} as ChaosDomSnapshot);

describe('dice qualification capture', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => vi.useRealTimers());

  it('does not admit the next roll at the old 1,754 ms cutoff or on rumble; waits for committed peer faces', async () => {
    const frames: ChaosDomSnapshot[] = [];
    let nextRoll = false;
    const pending = waitForDiceRollCapture({ snapshotsSince: () => frames }, 'peer', target, 10_000)
      .then(result => { nextRoll = true; return result; });
    await vi.advanceTimersByTimeAsync(1_754);
    expect(nextRoll).toBe(false);
    frames.push(frame(12_256, 'animating'));
    await vi.advanceTimersByTimeAsync(502);
    expect(nextRoll).toBe(false);
    frames.push(frame(13_300));
    await vi.advanceTimersByTimeAsync(1_050);
    const result = await pending;
    expect(result.actionSequence).toBe(5);
    expect(result.progressMs).toBe(3_300);
    expect(nextRoll).toBe(true);
  });

  it('retains an exact intermediate paint even if the latest snapshot has advanced', async () => {
    const frames = [frame(10_100, 'animating'), frame(10_800), frame(11_000, 'scatter', { roundId: 'next-round' })];
    vi.setSystemTime(11_200);
    expect((await waitForDiceRollCapture({ snapshotsSince: () => frames }, 'peer', target, 10_000)).observedAt).toBe(10_800);
  });

  it('supports the last-roll frozen result using exact server hold bits', async () => {
    const heldTarget = { ...target, dice: dice.map(die => ({ ...die, isHeld: true })) };
    const frozen = frame(10_500, 'frozen', { visibleDice: dice.map((die, i) => `${i}:${die.value}:true:frozen:freeze`) });
    vi.setSystemTime(10_600);
    expect((await waitForDiceRollCapture({ snapshotsSince: () => [frame(10_100, 'animating'), frozen] },
      'peer', heldTarget, 10_000)).progressMs).toBe(500);
  });

  it.each([
    ['no peer paint', []],
    ['cached equal dice without a new animation', [frame(10_500)]],
    ['rumble matching the final values', [frame(10_100, 'animating'), frame(10_500, 'animating')]],
    ['wrong session', [frame(10_100, 'animating'), frame(10_500, 'scatter', { gameId: 'other' })]],
    ['wrong dealer game', [frame(10_100, 'animating'), frame(10_500, 'scatter', { dealerGameId: 'other' })]],
    ['wrong round', [frame(10_100, 'animating'), frame(10_500, 'scatter', { roundId: 'other' })]],
    ['another outcome', [frame(10_100, 'animating'), frame(10_500, 'scatter', { visibleDice: ['0:6:false:scatter:normal'] })]],
    ['pre-click evidence', [frame(9_000, 'animating'), frame(9_500)]],
    ['late evidence', [frame(10_100, 'animating'), frame(25_001)]],
  ] as Array<[string, ChaosDomSnapshot[]]>)('rejects %s within the existing budget', async (_name, frames) => {
    const pending = waitForDiceRollCapture({ snapshotsSince: () => frames }, 'peer', target, 10_000);
    const rejected = expect(pending).rejects.toThrow('within 15000 ms of the click');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
  });

  it('counts waiting for the action response against the original budget', async () => {
    vi.setSystemTime(24_900);
    const pending = waitForDiceRollCapture({ snapshotsSince: () => [] }, 'peer', target, 10_000);
    const rejected = expect(pending).rejects.toThrow('within 15000 ms of the click');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
  });

  it.each([
    [{ ...request, _round_id: 'other' }, response],
    [{ ...request, _player_id: 'other' }, response],
    [{ ...request, _action: 'hold' }, response],
    [request, { ...response, outcome: 'rejected' }],
    [request, { ...response, action_sequence: 6 }],
    [request, { ...response, state: { ...response.state, _authorityScope: 'other' } }],
    [request, { ...response, state: { ...response.state, actionSequence: 6 } }],
  ])('rejects an unproven or unrelated mutation response', (input, output) => {
    expect(() => diceRollTarget(scope, input, output)).toThrow('exact accepted roll');
  });
});
