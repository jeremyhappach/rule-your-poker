import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {award, compareStandings, completedMatchOutcome, createSealedGame, createSoloGame, expiredRoundOutcome, feedback, ownRoundProjection, sealedProjection, soloProjection, submitGuess, submitSealedGuess, submitSoloGuess} from './rules.ts';

test('exact matches take priority over duplicate present letters', () => {
  assert.deepEqual(feedback('APPLE', 'ALLEY'), ['correct', 'present', 'absent', 'present', 'absent']);
  assert.deepEqual(feedback('SASSY', 'ASSAY'), ['present', 'present', 'correct', 'absent', 'correct']);
  assert.throws(() => feedback('APPLE', 'APP1E'), /invalid_word/);
});

test('all difficulty tiers apply to exponential scores with integer rounding', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(tier => award(4, tier)), [274, 343, 412, 480, 549]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(guess => award(guess, 2)), [1000, 700, 490, 343, 240, 168]);
  assert.equal(award(null, 5), 0);
  assert.throws(() => award(0, 1), /invalid_guess_count/);
  assert.throws(() => award(null, 6), /invalid_difficulty/);
});

test('match comparison uses score, solves, then fewest guesses', () => {
  const base = {score: 1000, solved: 2, guesses: 8};
  assert.equal(compareStandings(base, {...base, score: 999, solved: 3, guesses: 1}), 1);
  assert.equal(compareStandings(base, {...base, solved: 3}), -1);
  assert.equal(compareStandings(base, {...base, guesses: 9}), 1);
  assert.equal(compareStandings(base, {...base}), 0);
});

test('invalid guesses preserve state and completed words alone disclose secrets', () => {
  const initial = {answer: 'APPLE', difficulty: 3, guesses: [], completed: false};
  assert.throws(() => submitGuess(initial, 'ZZZZZ', () => false), /invalid_guess/);
  assert.equal(initial.guesses.length, 0);
  const wrong = submitGuess(initial, 'ALLEY', () => true);
  assert.deepEqual(Object.keys(ownRoundProjection(wrong)).sort(), ['completed', 'guesses', 'nextBase']);
  assert.equal(ownRoundProjection(wrong).nextBase, 700);
  const solved = submitGuess(wrong, 'APPLE', () => true);
  assert.deepEqual(ownRoundProjection(solved), {guesses: solved.guesses, completed: true,
    answer: 'APPLE', difficulty: 3, solved: true, score: 840});
  assert.throws(() => submitGuess(solved, 'APPLE', () => true), /round_complete/);
});

test('the sixth incorrect guess ends the round with zero points', () => {
  let round = {answer: 'APPLE', difficulty: 4, guesses: [], completed: false} as import('./rules.ts').RoundState;
  for (let i = 0; i < 6; i++) round = submitGuess(round, 'STONE', () => true);
  assert.equal(round.completed, true);
  assert.equal(ownRoundProjection(round).score, 0);
});

test('each player plays independently and the opposing round stays sealed until both finish', () => {
  const words = [{word:'APPLE', difficulty:1}, {word:'BREAD', difficulty:2}, {word:'CLOUD', difficulty:3}] as const;
  const initial = createSealedGame(['alice', 'bob'], words);
  const alice = submitSealedGuess(initial, 'alice', 'APPLE', () => true);
  const waiting = sealedProjection(alice, 'alice');
  assert.deepEqual(waiting.current, {completed: true, waiting: true});
  assert.equal(waiting.ownScore, 0);
  assert.equal(waiting.ownResult?.answer, 'APPLE');
  const bobView = sealedProjection(alice, 'bob');
  assert.equal(bobView.opponentScore, 0);
  assert.equal(bobView.round, 1);
  assert.equal(JSON.stringify(bobView).includes('APPLE'), false);
  assert.equal(JSON.stringify(bobView).includes('difficulty'), false);
  assert.throws(() => submitSealedGuess(alice, 'alice', 'BREAD', () => true), /round_complete/);
  assert.throws(() => submitSealedGuess(alice, 'eve', 'APPLE', () => true), /forbidden/);
  const both = submitSealedGuess(alice, 'bob', 'APPLE', () => true);
  const view = sealedProjection(both, 'bob');
  assert.equal(view.round, 2);
  assert.equal(view.opponentScore, 800);
  assert.equal(view.revealed[0].opponent.answer, 'APPLE');
  assert.equal(JSON.stringify(view.current).includes('BREAD'), false);
});

test('solo and sealed modes share scoring and exactly three distinct words', () => {
  const words = [{word:'APPLE', difficulty:1}, {word:'BREAD', difficulty:2}, {word:'CLOUD', difficulty:3}] as const;
  assert.throws(() => createSoloGame([words[0], words[0], words[1]]), /invalid_game/);
  let solo = createSoloGame(words);
  assert.equal(JSON.stringify(soloProjection(solo)).includes('APPLE'), false);
  for (const word of words) solo = submitSoloGuess(solo, word.word, () => true);
  assert.equal(soloProjection(solo).score, 3000);
  assert.equal(soloProjection(solo).completed, true);
  assert.throws(() => submitSoloGuess(solo, 'APPLE', () => true), /game_complete/);
});

test('opponent strategy stays redacted after mutual completion, including every failed guess',()=>{
 const words=[{word:'APPLE',difficulty:1},{word:'BREAD',difficulty:2},{word:'CLOUD',difficulty:3}] as const;
 let game=createSealedGame(['alice','bob'],words);
 game=submitSealedGuess(game,'alice','APPLE',()=>true);
 for(let i=0;i<6;i++)game=submitSealedGuess(game,'bob',i===5?'PLANT':'STONE',()=>true);
 const a=sealedProjection(game,'alice'),b=sealedProjection(game,'bob');
 assert.equal(a.revealed[0].opponent.guesses.length,6);
 assert.equal(a.revealed[0].opponent.guesses[0].word,'STONE');
 assert.deepEqual(a.revealed[0].opponent.guesses[0].feedback,Array(5).fill('absent'));
 assert.deepEqual(a.revealed[0].opponent.guesses.slice(1).map(g=>g.word),Array(5).fill(''));
 assert.deepEqual(a.revealed[0].opponent.guesses[5].feedback,feedback('APPLE','PLANT'));
 assert.equal(a.ownFinished,1);assert.equal(a.opponentFinished,1);
 assert.equal(a.revealed[0].opponent.guesses[5].word,'');
 assert.equal(JSON.stringify(a).includes('PLANT'),false);
 assert.equal(b.revealed[0].own.guesses[0].word,'STONE');
 assert.equal(a.revealed[0].opponent.score,0);
});

test('availability expiry resolves a single missing submission as a forfeit and two as a draw', () => {
  const words = [{word:'APPLE', difficulty:1}, {word:'BREAD', difficulty:2}, {word:'CLOUD', difficulty:3}] as const;
  const initial = createSealedGame(['alice', 'bob'], words);
  assert.deepEqual(expiredRoundOutcome(initial), {reason: 'draw', winner: null});
  const alice = submitSealedGuess(initial, 'alice', 'APPLE', () => true);
  assert.deepEqual(expiredRoundOutcome(alice), {reason: 'timeout_forfeit', winner: 'alice'});
  const bob = submitSealedGuess(initial, 'bob', 'APPLE', () => true);
  assert.deepEqual(expiredRoundOutcome(bob), {reason: 'timeout_forfeit', winner: 'bob'});
});

test('a completed match determines its winner from the shared round results', () => {
  const words = [{word:'APPLE', difficulty:1}, {word:'BREAD', difficulty:2}, {word:'CLOUD', difficulty:3}] as const;
  let game = createSealedGame(['alice', 'bob'], words);
  assert.throws(() => completedMatchOutcome(game), /game_incomplete/);
  for (const item of words) {
    game = submitSealedGuess(game, 'alice', item.word, () => true);
    game = submitSealedGuess(game, 'bob', 'STONE', () => true);
    game = submitSealedGuess(game, 'bob', item.word, () => true);
  }
  assert.deepEqual(completedMatchOutcome(game), {reason: 'normal', winner: 'alice'});
  assert.equal(sealedProjection(game, 'alice').completed, true);
  const completed=sealedProjection(game,'alice');
  for(const round of completed.revealed){
    assert.deepEqual(round.opponent.guesses[0],{word:'STONE',feedback:Array(5).fill('absent')});
    assert.equal(round.opponent.guesses[1].word,'');
    assert.deepEqual(round.opponent.guesses[1].feedback,Array(5).fill('correct'));
  }
  assert.equal(JSON.stringify(completed).includes('STONE'),true);
  assert.equal(sealedProjection(game,'bob').revealed[0].own.guesses[0].word,'STONE');
  let tie = createSealedGame(['alice', 'bob'], words);
  for (const item of words) {
    tie = submitSealedGuess(tie, 'alice', item.word, () => true);
    tie = submitSealedGuess(tie, 'bob', item.word, () => true);
  }
  assert.deepEqual(completedMatchOutcome(tie), {reason: 'draw', winner: null});
});
