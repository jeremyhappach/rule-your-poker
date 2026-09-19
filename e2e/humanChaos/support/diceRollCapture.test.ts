import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosDomSnapshot } from './continuousObserver';
import { diceRollTarget, waitForDiceRollCapture } from './diceRollCapture';
import { validateSccTerminalEvidence } from './sccTerminalCapture';
import { diceTieExpectation, validateDiceTieEvidence } from './diceTieCapture';

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
    turnOrder: ['player-1', 'player-2'],
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
    expect(target.sccTerminal).toBeNull();
  });
});

describe('shared completed-round tie capture', () => {
  const hand = (values: number[]) => ({ dice: values.map(value => ({ value, isHeld: true })),
    isComplete: true, rollsRemaining: 0, rollKey: 12345,
    result: { rank: 36, description: '3 6s', ofAKindCount: 3, highValue: 6 } });
  // Exact dice and order from the frozen September 19 Horses failure.
  const state = { _authorityScope: scope.roundId, actionSequence: 5, gamePhase: 'playing',
    turnOrder: ['player-2', 'player-1'], playerStates: {
      'player-1': hand([2, 5, 6, 1, 1]), 'player-2': hand([6, 4, 6, 1, 3]),
    } };
  const tieTarget = diceRollTarget({ ...scope, gameType: 'horses' }, request, { outcome: 'applied', action_sequence: 5, state });
  const evidence = (): any => ({
    game: { id: scope.gameId, current_game_uuid: scope.dealerGameId, game_type: 'horses', status: 'in_progress',
      session_ended_at: null, current_round: 2, total_hands: 2, ante_amount: 1, pot: 4 },
    round: { id: scope.roundId, game_id: scope.gameId, dealer_game_id: scope.dealerGameId, hand_number: 1, round_number: 1,
      status: 'completed', horses_state: { ...structuredClone(state), gamePhase: 'complete', actionSequence: 6 } },
    successors: [{ id: 'round-2', game_id: scope.gameId, dealer_game_id: scope.dealerGameId, hand_number: 2, round_number: 2,
      status: 'betting', pot: 4, horses_state: { gamePhase: 'playing', turnOrder: [...state.turnOrder], currentTurnPlayerId: 'player-2',
        playerStates: Object.fromEntries(state.turnOrder.map(id => [id, { dice: Array.from({ length: 5 }, () => ({ value: 0, isHeld: false })),
          isComplete: false, rollsRemaining: 3 }])) } }],
    results: [
      { id: 'tie-1', hand_number: 1, is_chopped: true, winning_hand_description: 'TIE: 3 6s - Rollover', player_chip_changes: {} },
      { id: 'ante-2', hand_number: 2, is_chopped: false, winning_hand_description: 'Re-Ante (Rollover)', player_chip_changes: { 'player-1': -1, 'player-2': -1 } },
    ].map(r => ({ ...r, game_id: scope.gameId, dealer_game_id: scope.dealerGameId, game_type: 'horses', pot_won: 0, winner_player_id: null })),
    players: state.turnOrder.map((id, i) => ({ id, game_id: scope.gameId, user_id: `user-${i}`, is_bot: false, profiles: { username: id === 'player-1' ? 'One' : 'Two' } })),
  });
  const frames = () => [frame(10_100, 'animating', { gameType: 'horses' }),
    frame(12_114, 'animating', { gameType: 'horses', announcement: 'One rolled 3 6s!' }),
    frame(15_114, 'scatter', { gameType: 'horses', roundId: 'round-2', gameStatus: 'in_progress', roundStatus: 'betting', visibleDice: [] })];
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(16_000); });
  afterEach(() => vi.useRealTimers());
  it('accepts the recorded tie path without a settled-dice frame and proves the first actor', async () => {
    const proof = await waitForDiceRollCapture({ snapshotsSince: frames }, 'peer', tieTarget, 10_000, 15_000, undefined, async () => evidence());
    expect(proof).toMatchObject({ mode: 'tie-rollover', progressMs: 5114, tieProof: {
      nextActorPlayerId: 'player-2', successorRoundId: 'round-2', scores: { 'player-1': 36, 'player-2': 36 } } });
  });
  it('uses the same continuation proof for SCC ties, including all unqualified players', () => {
    const e = evidence();
    const sccHand = () => ({ isComplete: true, rollsRemaining: 0, rollKey: 12345,
      dice: [1, 2, 3, 4, 5].map(value => ({ value, isHeld: true, isSCC: false })),
      result: { rank: 0, cargoSum: 0, isQualified: false, description: 'No Ship' } });
    const s = { ...state, playerStates: { 'player-1': sccHand(), 'player-2': sccHand() } };
    const t = diceRollTarget({ ...scope, gameType: 'ship-captain-crew' }, request, { outcome: 'applied', action_sequence: 5, state: s });
    e.game.game_type = 'ship-captain-crew'; e.results.forEach((r: any) => { r.game_type = 'ship-captain-crew'; });
    e.results[0].winning_hand_description = 'TIE: No Ship - Rollover';
    e.round.horses_state = { ...s, gamePhase: 'complete' };
    Object.values(e.successors[0].horses_state.playerStates).forEach((p: any) => p.dice.forEach((d: any) => { d.isSCC = false; }));
    expect(validateDiceTieEvidence(t, e).scores).toEqual({ 'player-1': 0, 'player-2': 0 });
  });
  it.each([
    ['score', (e: any) => { e.round.horses_state.playerStates['player-1'].result.rank++; }],
    ['changed dice', (e: any) => { e.round.horses_state.playerStates['player-1'].dice[0].value = 3; }],
    ['roll identity', (e: any) => { e.round.horses_state.playerStates['player-1'].rollKey++; }],
    ['stale sequence', (e: any) => { e.round.horses_state.actionSequence = 4; }],
    ['unfinished round', (e: any) => { e.round.status = 'betting'; }],
    ['wrong game', (e: any) => { e.game.id = 'other'; }],
    ['terminal game', (e: any) => { e.game.status = 'session_ended'; }],
    ['wrong successor dealer', (e: any) => { e.successors[0].dealer_game_id = 'other'; }],
    ['missing successor', (e: any) => { e.successors = []; }],
    ['duplicate successor', (e: any) => { e.successors.push(e.successors[0]); }],
    ['wrong next hand', (e: any) => { e.successors[0].hand_number++; }],
    ['wrong next actor', (e: any) => { e.successors[0].horses_state.currentTurnPlayerId = 'player-1'; }],
    ['changed turn order', (e: any) => { e.successors[0].horses_state.turnOrder.reverse(); }],
    ['unreset dice', (e: any) => { e.successors[0].horses_state.playerStates['player-1'].dice[0].value = 1; }],
    ['missing tie result', (e: any) => { e.results.shift(); }],
    ['duplicate tie result', (e: any) => { e.results.push(e.results[0]); }],
    ['awarded winner', (e: any) => { e.results[0].winner_player_id = 'player-1'; }],
    ['terminal settlement', (e: any) => { e.results[0].settlement_key = 'horses_terminal'; }],
    ['incorrect reante', (e: any) => { e.results[1].player_chip_changes['player-1'] = -2; }],
    ['ambiguous names', (e: any) => { e.players[0].profiles.username = e.players[1].profiles.username; }],
  ])('rejects %s', (_name, mutate) => { const e = evidence(); mutate(e); expect(() => validateDiceTieEvidence(tieTarget, e)).toThrow(); });
  it.each(['wrong caption', 'wrong successor', 'wrong game', 'late', 'cached'])('rejects %s peer evidence', async kind => {
    const f = frames();
    if (kind === 'wrong caption') f[1].announcement = 'Two rolled 3 6s!';
    if (kind === 'wrong successor') f[2].roundId = 'other';
    if (kind === 'wrong game') f[2].gameId = 'other';
    if (kind === 'late') f[2].wallTime = 25_001;
    if (kind === 'cached') f[1].wallTime = 9_999;
    const p = waitForDiceRollCapture({ snapshotsSince: () => f }, 'peer', tieTarget, 10_000, 15_000, undefined, async () => evidence());
    const rejected = expect(p).rejects.toThrow('within 15000 ms'); await vi.advanceTimersByTimeAsync(9_000); await rejected;
  });
  it('counts database reads against the unchanged click deadline', async () => {
    const p = waitForDiceRollCapture({ snapshotsSince: frames }, 'peer', tieTarget, 10_000, 15_000, undefined,
      async () => { await new Promise(r => setTimeout(r, 9_001)); return evidence(); });
    const rejected = expect(p).rejects.toThrow('within 15000 ms'); await vi.advanceTimersByTimeAsync(9_001); await rejected;
  });
  it('does not mistake a unique winner or unfinished hand for a tie', () => {
    const s = structuredClone(state); s.playerStates['player-1'].isComplete = false;
    expect(diceTieExpectation('horses', s)).toBeNull();
    s.playerStates['player-1'] = { ...hand([6, 6, 6, 6, 6]), result: { rank: 56, description: '5 6s', ofAKindCount: 5, highValue: 6 } };
    expect(diceTieExpectation('horses', s)).toBeNull();
  });
});
