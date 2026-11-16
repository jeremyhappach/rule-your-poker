import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {loadVocabulary,VOCABULARY} from './vocabulary.ts';

test('pinned ESDB candidate and manually selected answers validate together', () => {
  const vocabulary = loadVocabulary();
  assert.equal(vocabulary.version,'esdb-five-alive/3');
  assert.equal(vocabulary.answers.length, 1021);
  assert.equal(new Set(vocabulary.answers.map(answer => answer.word)).size, 1021);
  assert.deepEqual(new Set(vocabulary.answers.map(answer => answer.difficulty)), new Set([1, 2, 3, 4, 5]));
  assert.equal(vocabulary.isValidGuess('APPLE'), true);
  assert.equal(vocabulary.isValidGuess('ZZZZZ'), false);
  assert.equal(vocabulary.answers.every(answer => vocabulary.isValidGuess(answer.word)), true);
});

test('version 2 is exactly the preserved 498 plus 255 qualified records with unchanged tiers',()=>{
 const old=loadVocabulary('esdb-five-alive/1'),current=loadVocabulary('esdb-five-alive/2');
 assert.equal(old.answers.length,498);assert.equal(current.answers.length,753);
 const expected=new Map(old.answers.map(a=>[a.word,a.difficulty]));
 const review=readFileSync(new URL('./answers.expansion.review.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
 assert.equal(review.length,255);
 for(const line of review){const [word,tier,meaning]=line.split(',');assert.ok(meaning);assert.ok(!expected.has(word));expected.set(word,Number(tier));}
 assert.deepEqual(new Map(current.answers.map(a=>[a.word,a.difficulty])),expected);
 assert.throws(()=>loadVocabulary('esdb-five-alive/4'),/unknown_vocabulary/);
 assert.throws(()=>loadVocabulary(null),/unknown_vocabulary/);
});

test('version 3 preserves all 753 prior words and tiers and adds exactly 268 qualified records',()=>{
 const old=loadVocabulary('esdb-five-alive/2'),current=loadVocabulary();
 const expected=new Map(old.answers.map(a=>[a.word,a.difficulty]));
 const review=readFileSync(new URL('./answers.batch3.review.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
 const qualification=JSON.parse(readFileSync(new URL('./answers.v3.qualification.json',import.meta.url),'utf8'));
 assert.equal(review.length,268);assert.equal(qualification.perWord.length,268);assert.equal(qualification.solvedCases,1608);
 for(const line of review){const [word,tier,ordinaryMeaning]=line.split(',');
  assert.ok(!expected.has(word));expected.set(word,Number(tier));
  const p=qualification.perWord.find((x:{word:string})=>x.word===word);
  assert.ok(p);assert.equal(p.difficulty,Number(tier));assert.equal(p.ordinaryMeaning,ordinaryMeaning);
  assert.ok(p.esdb.length&&p.legalGuess&&p.soloAsyncParity&&p.privateUntilReveal&&p.duplicateLetterConservation);
 }
 assert.equal(VOCABULARY.answerCount,1021);
 assert.deepEqual(new Map(current.answers.map(a=>[a.word,a.difficulty])),expected);
});
