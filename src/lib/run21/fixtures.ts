/** Offline lab/test fixtures only. Not imported by the production route or server shuffle. */
import { type Card, type Config, DEFAULT_CONFIG, type Match, type Intent, type DeckEvidence } from './model';
import { applyCommand, createMatch, prepareRound, project } from './engine';
import { cardKey, standardDeck } from './rules';
import { chooseAction, seededRandom } from './bot';
export const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const PLAYERS = [{id: uuid(1), seat: 4, name: 'You', kind:'human' as const}, {id: uuid(2), seat: 1, name: 'Run21 bot',kind:'bot' as const}];
export const IDENTITY = {sessionId: uuid(10), dealerGameId: uuid(11), handNumber: 1};
export function fixtureDeck(prefix: Card[] = [], seed = 21): DeckEvidence {
  const used = new Set(prefix.map(cardKey));
  const rest = standardDeck().filter(c => !used.has(cardKey(c)));
  const rng = seededRandom(seed);
  for (let i = rest.length - 1; i > 0; i--) {const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]];}
  // Deliberately marked synthetic evidence: a fixture is never production shuffle evidence.
  return {cards: [...prefix, ...rest], salt: '0'.repeat(64), commitment: 'f'.repeat(64)};
}
export function fixtureMatch(config: Config = DEFAULT_CONFIG, prefix: Card[] = [], seed = 21, stake = 10): Match {
  return prepareRound(createMatch(IDENTITY, PLAYERS, stake, config, 0), uuid(100), null, fixtureDeck(prefix, seed), 0);
}
export function act(match: Match, playerId: string, intent: Intent, at: number): Match {
  const round = match.rounds.at(-1)!;
  const result = applyCommand(match, {identity: match.identity, roundId: round.id, playerId,
    requestId: uuid(1000 + match.events.length), revision: round.boards[playerId].revision, intent},
    intent.type === 'expire' ? {kind: 'service'} : {kind: 'player', playerId}, at);
  if (result.status !== 'accepted') throw new Error(`fixture_action:${result.reason}`);
  return result.state;
}
/** Deterministic sequential scheduler using only the active player's projection. */
export function simulateRound(input: Match, seed = 21): Match {
  let match = input;
  const first = match.rounds.at(-1)!.active_player_id;
  if (first && !match.rounds.at(-1)!.boards[first].presented.length) match = act(match, first, {type: 'ready'}, match.updatedAt);
  for (let safety = 0; safety < 110; safety++) {
    const round = match.rounds.at(-1)!;
    if (round.revealed) return match;
    const playerId = round.active_player_id!, board = round.boards[playerId];
    const choice = chooseAction(project(match, playerId), match.updatedAt, {seed, minActionMs: 220, maxActionMs: 420})!;
    match = act(match, playerId, choice.intent, Math.min(board.deadline!, match.updatedAt + choice.delayMs));
  }
  throw new Error('simulation_did_not_terminate');
}
