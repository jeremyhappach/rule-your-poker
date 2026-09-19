/** Read-only qualification of the existing final-roll -> terminal presentation path. */
export type SccTerminalExpectation = {
  winnerPlayerId: string;
  winnerScore: number;
  scores: Record<string, number>;
  dice: Record<string, unknown>;
};

export function completedSccScores(players: Record<string, any>) {
  const entries = Object.entries(players);
  if (entries.length < 2 || entries.some(([, p]) => p?.isComplete !== true)) return null;
  const scores: Record<string, number> = {}, dice: Record<string, unknown> = {};
  for (const [id, player] of entries) {
    if (!Array.isArray(player.dice) || player.dice.length !== 5) throw new Error('Invalid completed SCC dice');
    const roles = new Set<string>();
    let cargo = 0;
    dice[id] = player.dice.map((die: any) => {
      if (!Number.isInteger(die.value) || die.value < 1 || die.value > 6 || die.isHeld !== true
        || typeof die.isSCC !== 'boolean') throw new Error('Invalid completed SCC die');
      if (die.isSCC) {
        const expected = { ship: 6, captain: 5, crew: 4 }[die.sccType as 'ship' | 'captain' | 'crew'];
        if (!expected || die.value !== expected || roles.has(die.sccType)) throw new Error('Invalid SCC role');
        roles.add(die.sccType);
      } else {
        if (die.sccType) throw new Error('Cargo die has an SCC role');
        cargo += die.value;
      }
      return [die.value, die.isHeld, die.isSCC, die.sccType ?? null];
    });
    if ((roles.has('crew') && !roles.has('captain')) || (roles.has('captain') && !roles.has('ship'))) {
      throw new Error('SCC roles are out of sequence');
    }
    const qualified = roles.size === 3;
    const score = qualified ? cargo : 0;
    if (player.result?.rank !== score || player.result?.cargoSum !== score
      || player.result?.isQualified !== qualified) throw new Error('SCC score disagrees with committed dice');
    scores[id] = score;
  }
  const high = Math.max(...Object.values(scores));
  const winners = Object.keys(scores).filter(id => scores[id] === high);
  return { winners, high, scores, dice };
}

function completedScores(players: Record<string, any>): SccTerminalExpectation | null {
  const result = completedSccScores(players);
  return result && result.winners.length === 1 && result.high > 0
    ? { winnerPlayerId: result.winners[0], winnerScore: result.high, scores: result.scores, dice: result.dice } : null;
}

export function sccTerminalExpectation(gameType: string | undefined, state: any, playerId: string) {
  if (gameType !== 'ship-captain-crew' || state?.playerStates?.[playerId]?.rollsRemaining !== 0) return null;
  return completedScores(state.playerStates);
}

export type SccTerminalEvidence = { game: any; round: any; results: any[]; snapshots: any[] };
export type SccCaptureTarget = { gameId: string; dealerGameId: string; roundId: string; playerId: string;
  actionSequence: number; rollKey: number; sccTerminal: SccTerminalExpectation | null };

export function validateSccTerminalEvidence(target: SccCaptureTarget, evidence: SccTerminalEvidence) {
  const expected = target.sccTerminal;
  const { game, round, results, snapshots } = evidence;
  const state = round?.horses_state;
  const fail = () => { throw new Error('SCC terminal capture does not match the accepted final roll'); };
  if (!expected || game?.id !== target.gameId || game.current_game_uuid !== target.dealerGameId
    || game.status !== 'session_ended' || game.pending_session_end !== false || !game.session_ended_at
    || round?.id !== target.roundId || round.game_id !== target.gameId || round.dealer_game_id !== target.dealerGameId
    || round.status !== 'completed' || state?._authorityScope !== target.roundId || state.gamePhase !== 'complete'
    || !Number.isSafeInteger(state.actionSequence) || state.actionSequence < target.actionSequence
    || state.playerStates?.[target.playerId]?.rollKey !== target.rollKey) fail();
  const actual = completedScores(state.playerStates);
  if (!actual || actual.winnerPlayerId !== expected.winnerPlayerId
    || Object.keys(actual.scores).length !== Object.keys(expected.scores).length
    || Object.keys(expected.scores).some(id => actual.scores[id] !== expected.scores[id]
      || JSON.stringify(actual.dice[id]) !== JSON.stringify(expected.dice[id]))) fail();
  const result = results[0];
  if (results.length !== 1 || !result?.id || result.game_id !== target.gameId
    || result.dealer_game_id !== target.dealerGameId || result.hand_number !== round.hand_number
    || result.game_type !== 'ship-captain-crew' || result.settlement_key !== 'horses_terminal'
    || result.winner_player_id !== expected.winnerPlayerId || result.is_chopped !== false
    || result.winning_hand_description !== String(expected.winnerScore) || !(result.pot_won > 0)) fail();
  const ids = Object.keys(expected.scores);
  if (snapshots.length !== ids.length || new Set(snapshots.map(s => s.player_id)).size !== ids.length
    || new Set(snapshots.map(s => s.user_id)).size !== ids.length
    || new Set(snapshots.map(s => s.username)).size !== ids.length
    || snapshots.some(s => !ids.includes(s.player_id) || !s.user_id || s.is_bot !== false
      || s.game_id !== target.gameId || s.dealer_game_id !== target.dealerGameId || s.hand_number !== round.hand_number)) fail();
  // UUIDs establish identity. The persisted display name is used only to check
  // the rendered caption; distinct fixture names prevent an ambiguous caption.
  const winner = snapshots.find(s => s.player_id === expected.winnerPlayerId);
  if (!winner?.username || result.winner_username !== winner.username) fail();
  return { resultId: result.id as string, winnerPlayerId: expected.winnerPlayerId,
    winnerScore: expected.winnerScore, scores: expected.scores,
    winnerAnnouncement: `${winner.username} wins with ${expected.winnerScore}` };
}
