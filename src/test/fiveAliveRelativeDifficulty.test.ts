import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveRelativeDifficulty,RELATIVE_DIFFICULTY_VERSION} from '../../server/fiveAlive/relativeDifficulty';
import {award,createSoloGame,submitSoloGuess,soloProjection,createSealedGame,submitSealedGuess,completedMatchOutcome,sealedProjection,FIVE_ALIVE_RULES,type Answer} from '../../server/fiveAlive/rules';
import review from '../../server/fiveAlive/difficulty.relative.review.json';
const contents=(name:string)=>readFileSync('server/fiveAlive/'+name,'utf8');
const baseline=contents('answers.reviewed.v3.txt');
const approved=baseline.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const [word,tier]=l.split(/\s+/);return {word,difficulty:Number(tier)};});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const result=resolveRelativeDifficulty(review.words,approved.map(a=>a.word));
const proposed=new Map(result.answers.map(a=>[a.word,a.difficulty]));
const changed=approved.filter(a=>a.difficulty!==proposed.get(a.word));
describe('Five Alive relative difficulty version',()=>{
 it('represents the exact approved 1,021 answers once, with valid tiers',()=>{
  expect(result.version).toBe('five-alive-relative/1');expect(result.answers).toHaveLength(1021);
  expect(result.answers.map(a=>a.word)).toEqual(approved.map(a=>a.word).sort());
  expect(new Set(result.answers.map(a=>a.word)).size).toBe(1021);
  expect(result.answers.every(a=>Number.isInteger(a.difficulty)&&a.difficulty>=1&&a.difficulty<=5)).toBe(true);
  expect(result.answers.map(a=>a.word+' '+a.difficulty+'\n').join('')).toBe(contents('difficulty.relative.v1.txt'));
  expect(hash(contents('difficulty.relative.v1.txt'))).toBe('f7b8d5a9eadc2cb40a4f7e6847afa88afaf669b59c628b8fd76b70d5ccee2670');
 });
 it('uses approximate bell-shaped bands and preserves tied scores',()=>{
  expect(result.counts).toEqual([101,204,410,202,104]);expect(result.boundaries).toEqual([15.75,32.25,64.75,80.75]);
  [.1,.2,.4,.2,.1].forEach((p,i)=>expect(Math.abs(result.counts[i]/1021-p)).toBeLessThan(.03));
  expect(result.counts).not.toEqual([102,204,409,204,102]);
  const scores=new Map<number,number>();for(const row of review.words){const tier=proposed.get(row.word)!;if(scores.has(row.score))expect(tier).toBe(scores.get(row.score));scores.set(row.score,tier);}
 });
 it('reproduces every approved proposed tier from scoring evidence',()=>{
  for(const row of review.words)expect(proposed.get(row.word),row.word).toBe(row.reviewedTier);
  expect(changed).toHaveLength(784);
 });
 it('resolves all 367 variant disagreements by primary evidence, independent of input order or variant votes',()=>{
  const sensitive=review.words.filter(row=>new Set(Object.values(row.sensitivity).map(v=>v.tier)).size>1);expect(sensitive).toHaveLength(367);
  const reversed=review.words.slice().reverse().map(row=>({...row,sensitivity:Object.fromEntries(Object.keys(row.sensitivity).map(k=>[k,{score:100,tier:5}]))}));
  expect(resolveRelativeDifficulty(reversed,approved.map(a=>a.word))).toEqual(result);
 });
 it('rejects duplicate, omitted, unapproved and corrupted scoring rows',()=>{
  const names=approved.map(a=>a.word);
  expect(()=>resolveRelativeDifficulty(review.words.slice(1),names)).toThrow();
  expect(()=>resolveRelativeDifficulty([review.words[1],...review.words.slice(1)],names)).toThrow();
  expect(()=>resolveRelativeDifficulty([{...review.words[0],word:'ZZZZZ'},...review.words.slice(1)],names)).toThrow();
  expect(()=>resolveRelativeDifficulty([{...review.words[0],score:99},...review.words.slice(1)],names)).toThrow();
 });
 it('retains the familiarity gate, exclusion records, original answers and separate guess dictionary',()=>{
  expect(hash(baseline)).toBe(review.baselineAnswersSha256);
  expect(hash(contents('guesses.esdb.txt'))).toBe(review.legalGuessesSha256);
  expect(new Set(review.words.map(w=>w.eligibility))).toEqual(new Set(['Prior approved eligibility retained; no new exclusion evidence','Prior approval retained; audience familiarity review requested']));
  expect(review.words.filter(w=>w.eligibility==='Prior approval retained; audience familiarity review requested')).toHaveLength(8);
  expect(hash(contents('answers.expansion.review.csv'))).toBe('241cc52875793a67c2ed2bcf169764dadf99e7c309b2c278d1bad7de074b768b');
  expect(hash(contents('answers.batch3.review.csv'))).toBe('784a393b1d4e3c5b6dc9fa8b1f8c2236b298528cd881bf4f20dcba3fc411017a');
  const guesses=contents('guesses.esdb.txt').split(/\r?\n/).filter(l=>l&&!l.startsWith('#'));
  expect(guesses).toHaveLength(11204);expect(guesses.length).toBeGreaterThan(result.answers.length);
 });
 it('keeps every changed legacy award at every solve count, including misses',()=>{
  expect(FIVE_ALIVE_RULES.multipliers).toEqual([80,100,120,140,160]);
  for(const a of changed)for(let n=1;n<=6;n++)expect(award(n,a.difficulty)).toBe(Math.round(FIVE_ALIVE_RULES.baseScores[n-1]*(60+20*a.difficulty)/100));
  for(const a of approved)expect(award(null,a.difficulty)).toBe(0);
 });
 it('keeps active and completed Arcade rounds frozen across tier publication',()=>{
  const answers=changed.slice(0,3),frozen=structuredClone(answers);let game=createSoloGame(answers);
  game=submitSoloGuess(game,answers[0].word,()=>true);const active=structuredClone(game);
  resolveRelativeDifficulty(review.words,approved.map(a=>a.word));expect(game).toEqual(active);
  for(const answer of answers.slice(1))game=submitSoloGuess(game,answer.word,()=>true);
  expect(game.rounds.map(r=>r.difficulty)).toEqual(frozen.map(a=>a.difficulty));
  const complete=soloProjection(game);expect(complete.score).toBe(answers.reduce((s,a)=>s+award(1,a.difficulty),0));
  expect(soloProjection(structuredClone(game))).toEqual(complete);
 });
 it.each(['winner','tie'] as const)('keeps Async active/completed scores and %s outcome frozen',kind=>{
  const answers=changed.slice(0,3) as [Answer,Answer,Answer];let game=createSealedGame(['a','b'],answers);
  game=submitSealedGuess(game,'a',answers[0].word,()=>true);const active=structuredClone(game);
  resolveRelativeDifficulty(review.words,approved.map(a=>a.word));expect(game).toEqual(active);
  for(let i=0;i<3;i++){if(i>0)game=submitSealedGuess(game,'a',answers[i].word,()=>true);if(kind==='winner')game=submitSealedGuess(game,'b',answers[i].word==='STONE'?'BREAD':'STONE',()=>true);game=submitSealedGuess(game,'b',answers[i].word,()=>true);}
  expect(game.answers).toEqual(answers);expect(game.sharedScores[0]).toBe(answers.reduce((s,a)=>s+award(1,a.difficulty),0));
  expect(game.sharedScores[1]).toBe(answers.reduce((s,a)=>s+award(kind==='winner'?2:1,a.difficulty),0));
  expect(completedMatchOutcome(game).winner).toBe(kind==='winner'?'a':null);
  expect(sealedProjection(structuredClone(game),'a')).toEqual(sealedProjection(game,'a'));
 });
 it('uses the new tier for newly assigned rounds while old states retain the old award',()=>{
  const answers=changed.slice(0,3),newAnswers=answers.map(a=>({...a,difficulty:proposed.get(a.word)!}));
  let game=createSoloGame(newAnswers);for(const a of newAnswers)game=submitSoloGuess(game,a.word,()=>true);
  expect(soloProjection(game).score).toBe(newAnswers.reduce((s,a)=>s+award(1,a.difficulty),0));
  expect(game.rounds.map(r=>r.difficulty)).toEqual(newAnswers.map(a=>a.difficulty));expect(RELATIVE_DIFFICULTY_VERSION).toBe(review.version);
 });
});
