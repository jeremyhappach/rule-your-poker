import { completedSccScores } from './sccTerminalCapture';

/** Qualification only: recompute the accepted completed-round outcome. */
export function diceTieExpectation(gameType: string | undefined, state: any) {
  if (!['horses', 'ship-captain-crew'].includes(gameType ?? '')) return null;
  const players = state?.playerStates ?? {};
  const ids = Object.keys(players).sort();
  if (ids.length < 2 || ids.some(id => !players[id].isComplete || players[id].rollsRemaining !== 0)) return null;
  const scores: Record<string, number> = {}, dice: Record<string, unknown> = {}, descriptions: Record<string, string> = {};
  if (gameType === 'ship-captain-crew') {
    const scc = completedSccScores(players)!;
    Object.assign(scores, scc.scores); Object.assign(dice, scc.dice);
    for (const id of ids) descriptions[id] = players[id].result.description;
  } else {
    for (const id of ids) {
      const p = players[id];
      if (!Array.isArray(p.dice) || p.dice.length !== 5 || p.dice.some((d: any) =>
        !Number.isInteger(d.value) || d.value < 1 || d.value > 6 || d.isHeld !== true)) throw new Error('Invalid completed Horses dice');
      const counts = Array(7).fill(0);
      for (const d of p.dice) counts[d.value]++;
      let count = 0, value = 0;
      for (let face = 6; face >= 2; face--) if (counts[face] + counts[1] > count) {
        count = counts[face] + counts[1]; value = face;
      }
      const wilds = counts[1] === 5;
      const rank = wilds ? 100 : count * 10 + value;
      const description = wilds ? '5 1s (Wilds!)' : count >= 2 ? `${count} ${value}s` : `${value} high`;
      if (p.result?.rank !== rank || p.result?.description !== description
        || p.result?.ofAKindCount !== (wilds ? 5 : count) || p.result?.highValue !== (wilds ? 1 : value)) {
        throw new Error('Horses score disagrees with committed dice');
      }
      scores[id] = rank; descriptions[id] = description;
      dice[id] = p.dice.map((d: any) => [d.value, d.isHeld]);
    }
  }
  const high = Math.max(...Object.values(scores));
  const leaders = ids.filter(id => scores[id] === high);
  if (leaders.length < 2) return null;
  const order = state.turnOrder;
  if (!Array.isArray(order) || JSON.stringify([...order].sort()) !== JSON.stringify(ids)) throw new Error('Invalid tie turn order');
  return { scores, dice, descriptions, leaders, turnOrder: [...order] as string[] };
}

export type DiceTieTarget = { gameId: string; dealerGameId: string; roundId: string; gameType?: string;
  playerId: string; actionSequence: number; rollKey: number; tie: ReturnType<typeof diceTieExpectation> };
export type DiceTieEvidence = { game: any; round: any; successors: any[]; results: any[]; players: any[] };

export function validateDiceTieEvidence(target: DiceTieTarget, evidence: DiceTieEvidence) {
  const { game, round, successors, results, players } = evidence;
  const expected = target.tie, state = round?.horses_state, next = successors[0], nextState = next?.horses_state;
  const fail = () => { throw new Error('Dice tie capture does not match the accepted completed round'); };
  if (!expected || game?.id !== target.gameId || game.current_game_uuid !== target.dealerGameId
    || game.game_type !== target.gameType || game.status !== 'in_progress' || game.session_ended_at != null
    || round?.id !== target.roundId || round.game_id !== target.gameId || round.dealer_game_id !== target.dealerGameId
    || round.status !== 'completed' || state?._authorityScope !== target.roundId || state.gamePhase !== 'complete'
    || !Number.isSafeInteger(state.actionSequence) || state.actionSequence < target.actionSequence
    || state.playerStates?.[target.playerId]?.rollKey !== target.rollKey) fail();
  const actual = diceTieExpectation(target.gameType, state);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail();
  if (successors.length !== 1 || !next?.id || next.id === target.roundId
    || next.game_id !== target.gameId || next.dealer_game_id !== target.dealerGameId
    || next.hand_number !== round.hand_number + 1 || next.round_number !== round.round_number + 1
    || next.status !== 'betting' || game.current_round !== next.round_number || game.total_hands !== next.hand_number
    || nextState?.gamePhase !== 'playing' || nextState.currentTurnPlayerId !== expected!.turnOrder[0]
    || JSON.stringify(nextState.turnOrder) !== JSON.stringify(expected!.turnOrder)
    || JSON.stringify(Object.keys(nextState.playerStates ?? {}).sort()) !== JSON.stringify(Object.keys(expected!.scores).sort())
    || (nextState._authorityScope != null && nextState._authorityScope !== next.id)
    || Object.values(nextState.playerStates).some((p: any) => p.isComplete !== false || p.rollsRemaining !== 3
      || p.result != null || !Array.isArray(p.dice) || p.dice.length !== 5
      || p.dice.some((d: any) => d.value !== 0 || d.isHeld !== false
        || (target.gameType === 'ship-captain-crew' && (d.isSCC !== false || d.sccType != null))))) fail();
  const tie = results.filter(r => r.hand_number === round.hand_number && r.is_chopped === true);
  const ante = results.filter(r => r.hand_number === next.hand_number && r.winning_hand_description === 'Re-Ante (Rollover)');
  if (tie.length !== 1 || ante.length !== 1 || results.some(r => r.winner_player_id != null || r.settlement_key === 'horses_terminal'
    || r.game_id !== target.gameId || r.dealer_game_id !== target.dealerGameId || r.game_type !== target.gameType)
    || !tie[0].id || !ante[0].id || tie[0].pot_won !== 0
    || tie[0].winning_hand_description !== `TIE: ${Object.values(expected!.descriptions).sort().at(-1)} - Rollover`
    || ante[0].pot_won !== 0 || ante[0].is_chopped !== false
    || Object.keys(ante[0].player_chip_changes ?? {}).length !== expected!.turnOrder.length
    || expected!.turnOrder.some(id => ante[0].player_chip_changes[id] !== -Math.max(game.ante_amount ?? 1, 0))
    || next.pot !== game.pot) fail();
  if (players.length !== expected!.turnOrder.length || new Set(players.map(p => p.id)).size !== players.length
    || new Set(players.map(p => p.user_id)).size !== players.length
    || new Set(players.map(p => p.profiles?.username)).size !== players.length
    || players.some(p => !expected!.turnOrder.includes(p.id) || p.game_id !== target.gameId || !p.user_id || p.is_bot !== false || !p.profiles?.username)) fail();
  const actor = players.find(p => p.id === target.playerId);
  return { successorRoundId: next.id as string, nextActorPlayerId: nextState.currentTurnPlayerId as string,
    tieResultId: tie[0].id as string, reanteResultId: ante[0].id as string, scores: expected!.scores,
    rollAnnouncement: `${actor.profiles.username} rolled ${expected!.descriptions[target.playerId]}!` };
}
