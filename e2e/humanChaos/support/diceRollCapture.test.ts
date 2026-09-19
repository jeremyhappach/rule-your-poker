import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosDomSnapshot } from './continuousObserver';
import { diceRollTarget, waitForDiceRollCapture } from './diceRollCapture';
import { validateSccTerminalEvidence } from './sccTerminalCapture';

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

describe('SCC final roll terminal capture', () => {
  const hand = (cargo: number[]) => ({ isComplete: true, rollsRemaining: 0, rollKey: 12345,
    dice: [
      ...(['ship', 'captain', 'crew'] as const).map((sccType, i) => ({ value: 6 - i, isHeld: true, isSCC: true, sccType })),
      ...cargo.map(value => ({ value, isHeld: true, isSCC: false })),
    ], result: { rank: cargo[0] + cargo[1], cargoSum: cargo[0] + cargo[1], isQualified: true } });
  const state = { _authorityScope: scope.roundId, actionSequence: 5, gamePhase: 'playing',
    playerStates: { 'player-1': hand([3, 2]), 'player-2': hand([1, 1]) } };
  const finalTarget = diceRollTarget({ ...scope, gameType: 'ship-captain-crew' }, request,
    { outcome: 'applied', action_sequence: 5, state });
  const evidence = () => ({
    game: { id: scope.gameId, current_game_uuid: scope.dealerGameId, status: 'session_ended', pending_session_end: false, session_ended_at: '2026-09-19T20:00:00Z' },
    round: { id: scope.roundId, game_id: scope.gameId, dealer_game_id: scope.dealerGameId, hand_number: 1,
      status: 'completed', horses_state: { ...structuredClone(state), gamePhase: 'complete', actionSequence: 6 } },
    results: [{ id: 'result-1', game_id: scope.gameId, dealer_game_id: scope.dealerGameId, hand_number: 1,
      game_type: 'ship-captain-crew', settlement_key: 'horses_terminal', winner_player_id: 'player-1',
      winner_username: 'One', winning_hand_description: '5', is_chopped: false, pot_won: 2 }],
    snapshots: ['player-1', 'player-2'].map((player_id, i) => ({ player_id, user_id: `user-${i}`,
      username: i === 0 ? 'One' : 'Two', is_bot: false, game_id: scope.gameId, dealer_game_id: scope.dealerGameId, hand_number: 1 })),
  });
  const terminalFrame = (overrides: Partial<ChaosDomSnapshot> = {}) => frame(11_000, 'scatter', {
    visibleDice: [], gameStatus: 'session_ended', roundStatus: 'completed', announcement: 'One wins with 5', ...overrides,
  });
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(12_000); });
  afterEach(() => vi.useRealTimers());

  it('accepts exact terminal scoring, settlement UUID and winner presentation without a settled-dice frame', async () => {
    const proof = await waitForDiceRollCapture({ snapshotsSince: () => [frame(10_100, 'animating'), terminalFrame()] },
      'peer', finalTarget, 10_000, 15_000, async () => evidence());
    expect(proof.mode).toBe('terminal-result');
    expect(proof).toMatchObject({ observedAt: 11_000, terminalProof: { winnerPlayerId: 'player-1', winnerScore: 5, resultId: 'result-1' } });
  });

  it('keeps terminal evidence inside the original click budget, including database reads', async () => {
    const pending = waitForDiceRollCapture({ snapshotsSince: () => [frame(10_100, 'animating'), terminalFrame()] },
      'peer', finalTarget, 10_000, 15_000, async deadline => { expect(deadline).toBe(25_000); await new Promise(r => setTimeout(r, 13_001)); return evidence(); });
    const rejected = expect(pending).rejects.toThrow('within 15000 ms');
    await vi.advanceTimersByTimeAsync(13_001);
    await rejected;
  });

  it.each([
    ['generic Session Ended', { announcement: 'Session Ended' }],
    ['wrong displayed winner', { announcement: 'Two wins with 5' }],
    ['wrong displayed score', { announcement: 'One wins with 2' }],
    ['wrong session', { gameId: 'other' }],
    ['wrong dealer', { dealerGameId: 'other' }],
    ['wrong round', { roundId: 'other' }],
    ['not terminal', { gameStatus: 'in_progress' }],
    ['incomplete round', { roundStatus: 'betting' }],
    ['another game', { gameType: 'horses' }],
    ['late terminal paint', { wallTime: 25_001 }],
    ['cached terminal paint', { wallTime: 9_000 }],
  ] as Array<[string, Partial<ChaosDomSnapshot>]>)('rejects %s', async (_name, override) => {
    const pending = waitForDiceRollCapture({ snapshotsSince: () => [frame(10_100, 'animating'), terminalFrame(override)] },
      'peer', finalTarget, 10_000, 15_000, async () => evidence());
    const rejected = expect(pending).rejects.toThrow('within 15000 ms');
    await vi.advanceTimersByTimeAsync(13_000);
    await rejected;
  });

  it.each([
    ['wrong winner UUID', (e: ReturnType<typeof evidence>) => { e.results[0].winner_player_id = 'player-2'; }],
    ['wrong terminal state', (e: ReturnType<typeof evidence>) => { e.game.status = 'in_progress'; }],
    ['wrong completed scope', (e: ReturnType<typeof evidence>) => { e.round.horses_state._authorityScope = 'other'; }],
    ['stale sequence', (e: ReturnType<typeof evidence>) => { e.round.horses_state.actionSequence = 4; }],
    ['different final roll', (e: ReturnType<typeof evidence>) => { e.round.horses_state.playerStates['player-1'].rollKey++; }],
    ['incorrect score', (e: ReturnType<typeof evidence>) => { e.round.horses_state.playerStates['player-1'].result.cargoSum++; }],
    ['duplicate settlement', (e: ReturnType<typeof evidence>) => { e.results.push(e.results[0]); }],
    ['missing settlement', (e: ReturnType<typeof evidence>) => { e.results = []; }],
    ['wrong result hand', (e: ReturnType<typeof evidence>) => { e.results[0].hand_number++; }],
    ['wrong result scope', (e: ReturnType<typeof evidence>) => { e.results[0].dealer_game_id = 'other'; }],
    ['wrong display identity', (e: ReturnType<typeof evidence>) => { e.results[0].winner_username = 'Two'; }],
    ['ambiguous display names', (e: ReturnType<typeof evidence>) => { e.snapshots[1].username = 'One'; }],
    ['wrong snapshot UUID', (e: ReturnType<typeof evidence>) => { e.snapshots[0].player_id = 'other'; }],
  ])('rejects %s in authoritative evidence', (_name, mutate) => {
    const data = evidence(); mutate(data);
    expect(() => validateSccTerminalEvidence(finalTarget, data)).toThrow();
  });

  it('never enables terminal substitution for an ordinary roll, unfinished opponent, tie, or Horses', () => {
    for (const change of [
      (s: typeof state) => { s.playerStates['player-1'].rollsRemaining = 1; },
      (s: typeof state) => { s.playerStates['player-2'].isComplete = false; },
      (s: typeof state) => { s.playerStates['player-2'] = hand([3, 2]); },
    ]) {
      const copy = structuredClone(state); change(copy);
      expect(diceRollTarget({ ...scope, gameType: 'ship-captain-crew' }, request,
        { outcome: 'applied', action_sequence: 5, state: copy }).sccTerminal).toBeNull();
    }
    expect(diceRollTarget({ ...scope, gameType: 'horses' }, request,
      { outcome: 'applied', action_sequence: 5, state }).sccTerminal).toBeNull();
  });
});
