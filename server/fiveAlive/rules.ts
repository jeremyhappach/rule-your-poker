/** Mode-neutral Five Alive rule primitives. Keep answer data on the server. */
export const FIVE_ALIVE_RULES = Object.freeze({
  version: 'five-alive/1',
  rounds: 3,
  guesses: 6,
  baseScores: Object.freeze([1000, 700, 490, 343, 240, 168]),
  multipliers: Object.freeze([80, 100, 120, 140, 160]),
});

export type LetterFeedback = 'correct' | 'present' | 'absent';

/** Match exact positions first so duplicate guesses cannot consume their letters. */
export function feedback(answer: string, guess: string): LetterFeedback[] {
  if (!/^[A-Z]{5}$/.test(answer) || !/^[A-Z]{5}$/.test(guess)) {
    throw new Error('five_alive:invalid_word');
  }
  const result: LetterFeedback[] = Array(5).fill('absent');
  const remaining = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    if (answer[i] === guess[i]) result[i] = 'correct';
    else remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    const count = remaining.get(guess[i]) ?? 0;
    if (count > 0) {
      result[i] = 'present';
      remaining.set(guess[i], count - 1);
    }
  }
  return result;
}

/** A miss has no solve index and always earns zero. Percentages avoid float drift. */
export function award(solveGuess: number | null, difficulty: number): number {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new Error('five_alive:invalid_difficulty');
  }
  if (solveGuess === null) return 0;
  if (!Number.isInteger(solveGuess) || solveGuess < 1 || solveGuess > 6) {
    throw new Error('five_alive:invalid_guess_count');
  }
  return Math.round(FIVE_ALIVE_RULES.baseScores[solveGuess - 1] * FIVE_ALIVE_RULES.multipliers[difficulty - 1] / 100);
}

export interface MatchStanding { score: number; solved: number; guesses: number }

/** Positive means a wins; negative means b wins; zero is an exact draw. */
export function compareStandings(a: MatchStanding, b: MatchStanding): number {
  return Math.sign(a.score - b.score || a.solved - b.solved || b.guesses - a.guesses);
}

export interface GuessRecord { word: string; feedback: LetterFeedback[] }
export interface RoundState {
  answer: string;
  difficulty: number;
  guesses: GuessRecord[];
  completed: boolean;
}

/** Dictionary admission precedes any change to the authoritative round. */
export function submitGuess(round: RoundState, word: string, isValid: (word: string) => boolean): RoundState {
  if (round.completed || round.guesses.length >= FIVE_ALIVE_RULES.guesses) throw new Error('five_alive:round_complete');
  if (!/^[A-Z]{5}$/.test(word) || !isValid(word)) throw new Error('five_alive:invalid_guess');
  const guesses = [...round.guesses, {word, feedback: feedback(round.answer, word)}];
  return {...round, guesses, completed: word === round.answer || guesses.length === FIVE_ALIVE_RULES.guesses};
}

/** Only a completed round may disclose its answer, tier, or final award. */
export function ownRoundProjection(round: RoundState) {
  const solved = round.completed && round.guesses.at(-1)?.word === round.answer;
  return {
    guesses: round.guesses,
    completed: round.completed,
    ...(!round.completed ? {nextBase: FIVE_ALIVE_RULES.baseScores[round.guesses.length]} : {}),
    ...(round.completed ? {answer: round.answer, difficulty: round.difficulty,
      solved, score: award(solved ? round.guesses.length : null, round.difficulty)} : {}),
  };
}

export interface Answer { word: string; difficulty: number }
export interface SoloGame { rounds: RoundState[]; current: number }

function validateAnswers(answers: readonly Answer[]) {
  if (answers.length !== FIVE_ALIVE_RULES.rounds || new Set(answers.map(a => a.word)).size !== answers.length) {
    throw new Error('five_alive:invalid_game');
  }
  for (const item of answers) {
    if (!/^[A-Z]{5}$/.test(item.word)) throw new Error('five_alive:invalid_word');
    award(null, item.difficulty);
  }
}

const freshRound = (a: Answer): RoundState => ({answer: a.word, difficulty: a.difficulty, guesses: [], completed: false});

export function createSoloGame(answers: readonly Answer[]): SoloGame {
  validateAnswers(answers);
  return {rounds: answers.map(freshRound), current: 0};
}

export function submitSoloGuess(game: SoloGame, word: string, isValid: (word: string) => boolean): SoloGame {
  if (game.current >= FIVE_ALIVE_RULES.rounds) throw new Error('five_alive:game_complete');
  const rounds = game.rounds.slice();
  rounds[game.current] = submitGuess(rounds[game.current], word, isValid);
  return {rounds, current: game.current + (rounds[game.current].completed ? 1 : 0)};
}

export function soloProjection(game: SoloGame) {
  const revealed = game.rounds.slice(0, game.current).map(ownRoundProjection);
  return {
    completed: game.current === FIVE_ALIVE_RULES.rounds,
    round: Math.min(game.current + 1, FIVE_ALIVE_RULES.rounds),
    score: revealed.reduce((sum, round) => sum + (round.score ?? 0), 0),
    current: game.current < FIVE_ALIVE_RULES.rounds ? ownRoundProjection(game.rounds[game.current]) : null,
    revealed,
  };
}

export interface SealedGame {
  players: readonly [string, string];
  answers: readonly [Answer, Answer, Answer];
  rounds: [RoundState[], RoundState[]];
  sharedScores: [number, number];
  current: number;
}

/** This state is private server data; caller owns persistence and locking. */
export function createSealedGame(players: readonly [string, string], answers: readonly [Answer, Answer, Answer]): SealedGame {
  if (!players[0] || !players[1] || players[0] === players[1]) throw new Error('five_alive:invalid_game');
  validateAnswers(answers);
  return {players, answers, rounds: [answers.map(freshRound), answers.map(freshRound)], sharedScores:[0,0], current: 0};
}

/** Serialized caller must guard the game identity and revision around this reducer. */
export function submitSealedGuess(game: SealedGame, player: string, word: string, isValid: (word: string) => boolean): SealedGame {
  const index = game.players.indexOf(player);
  if (index < 0) throw new Error('five_alive:forbidden');
  if (game.current >= FIVE_ALIVE_RULES.rounds) throw new Error('five_alive:game_complete');
  const rounds: [RoundState[], RoundState[]] = [game.rounds[0].slice(), game.rounds[1].slice()];
  rounds[index][game.current] = submitGuess(rounds[index][game.current], word, isValid);
  const current = rounds[0][game.current].completed && rounds[1][game.current].completed
    ? game.current + 1 : game.current;
  const sharedScores:[number,number]=[...game.sharedScores];
  if(current!==game.current){
    for(let i=0;i<2;i++){
      const result=ownRoundProjection(rounds[i][game.current]);
      sharedScores[i]+=result.score??0;
    }
  }
  return {...game, rounds, current, sharedScores};
}

/** Availability expiry is resolved by the existing Async finalizer, not this helper. */
export function expiredRoundOutcome(game: SealedGame): {reason: 'timeout_forfeit' | 'draw'; winner: string | null} {
  if (game.current >= FIVE_ALIVE_RULES.rounds) throw new Error('five_alive:game_complete');
  const submitted = game.rounds.map(rounds => rounds[game.current].completed);
  if (submitted[0] && submitted[1]) throw new Error('five_alive:round_already_completed');
  if (!submitted[0] && !submitted[1]) return {reason: 'draw', winner: null};
  return {reason: 'timeout_forfeit', winner: game.players[submitted[0] ? 0 : 1]};
}

/** Only a mutually completed three-word game can yield a normal outcome. */
export function completedMatchOutcome(game: SealedGame): {reason: 'normal' | 'draw'; winner: string | null} {
  if (game.current !== FIVE_ALIVE_RULES.rounds || game.rounds.some(rounds =>
    rounds.length !== FIVE_ALIVE_RULES.rounds || rounds.some(round => !round.completed))) {
    throw new Error('five_alive:game_incomplete');
  }
  const standings = game.rounds.map(rounds => rounds.reduce((sum, round) => {
    const solved = round.guesses.at(-1)?.word === round.answer;
    return {score: sum.score + award(solved ? round.guesses.length : null, round.difficulty),
      solved: sum.solved + Number(solved), guesses: sum.guesses + round.guesses.length};
  }, {score: 0, solved: 0, guesses: 0}));
  const comparison = compareStandings(standings[0], standings[1]);
  return comparison === 0 ? {reason: 'draw', winner: null} :
    {reason: 'normal', winner: game.players[comparison > 0 ? 0 : 1]};
}

/** No opposing current-round score, guesses, feedback, or tier is projected. */
export function sealedProjection(game: SealedGame, player: string) {
  const index = game.players.indexOf(player);
  if (index < 0) throw new Error('five_alive:forbidden');
  const other = 1 - index;
  const revealed = game.rounds[index].slice(0, game.current).map((round, i) => ({
    own: ownRoundProjection(round), opponent: {
      ...ownRoundProjection(game.rounds[other][i]),
      // Reveal every feedback row, but only the successful guess may carry letters.
      guesses: game.rounds[other][i].guesses.map((guess,j,all)=>({
        word:j===all.length-1&&guess.word===game.rounds[other][i].answer?guess.word:'',
        feedback:guess.feedback,
      })),
    },
  }));
  return {
    completed: game.current === FIVE_ALIVE_RULES.rounds,
    round: Math.min(game.current + 1, FIVE_ALIVE_RULES.rounds),
    ownScore: game.sharedScores[index],
    opponentScore: game.sharedScores[other],
    ownFinished: game.rounds[index].filter(round => round.completed).length,
    opponentFinished: game.rounds[other].filter(round => round.completed).length,
    current: game.current < FIVE_ALIVE_RULES.rounds
      ? game.rounds[index][game.current].completed
        ? {completed: true, waiting: true}
        : ownRoundProjection(game.rounds[index][game.current])
      : null,
    ...(game.current < FIVE_ALIVE_RULES.rounds && game.rounds[index][game.current].completed
      ? {ownResult: ownRoundProjection(game.rounds[index][game.current])} : {}),
    revealed,
  };
}
