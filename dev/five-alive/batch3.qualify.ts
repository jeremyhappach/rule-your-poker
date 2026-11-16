// Vocabulary qualification only; writes inactive evidence and rollback SQL.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {award,feedback,submitGuess,createSoloGame,submitSoloGuess,soloProjection,createSealedGame,submitSealedGuess,sealedProjection,completedMatchOutcome} from '../../server/fiveAlive/rules.ts';
const read=(p:string)=>readFileSync(p,'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const base='server/fiveAlive/',out='qualification.local/five-alive/hosted/';
const previous=read(base+'answers.reviewed.v2.txt'),review=read(base+'answers.batch3.review.csv');
assert.equal(hash(previous),'5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231');
const guessBytes=read(base+'guesses.esdb.txt');
assert.equal(hash(guessBytes),'d888446d693992e3b19c218ed997209d8e3a2053f0d9bd7027d3a6e2de06058d');
const sourceBytes=read('qualification.local/five-alive/frequency/batch3-source.json'),source=JSON.parse(sourceBytes);
assert.equal(source.revision,'1e5b7d3a72f47a71da5d28686c1dd4b397178485');
const guesses=new Set(guessBytes.trim().split(/\r?\n/));
const previousRows=previous.trim().split(/\r?\n/).map(line=>{const [word,tier]=line.split(' ');return {word,difficulty:Number(tier)};});
const additions=review.trim().split(/\r?\n/).slice(1).map(line=>{const [word,tier,ordinaryMeaning,...extra]=line.split(',');assert.equal(extra.length,0);return {word,difficulty:Number(tier),ordinaryMeaning};});
assert.equal(previousRows.length,753);assert.equal(additions.length,268);
const seen=new Set(previousRows.map(a=>a.word)),perWord=[];let solvedCases=0;
for(const a of additions){
 assert.match(a.word,/^[A-Z]{5}$/);assert.ok(guesses.has(a.word)&&!seen.has(a.word));seen.add(a.word);
 assert.ok(Number.isInteger(a.difficulty)&&a.difficulty>=1&&a.difficulty<=5&&a.ordinaryMeaning.length>5);
 const src=source.candidates.find((x:{word:string})=>x.word===a.word);assert.ok(src?.esdb.length);
 for(const m of src.esdb){assert.equal(m.word,a.word.toLowerCase());assert.equal(m.usage_note,'');assert.ok(m.size<=50);}
 for(let solve=1;solve<=6;solve++){
  let r={answer:a.word,difficulty:a.difficulty,guesses:[],completed:false};
  for(let n=1;n<solve;n++)r=submitGuess(r,'APPLE',w=>guesses.has(w));
  r=submitGuess(r,a.word,w=>guesses.has(w));assert.ok(r.completed);
  assert.deepEqual(r.guesses.at(-1)?.feedback,Array(5).fill('correct'));
  assert.equal(award(r.guesses.length,a.difficulty),award(solve,a.difficulty));solvedCases++;
 }
 for(const guess of ['APPLE','SASSY','ALLEY',a.word]){const colors=feedback(a.word,guess);for(const c of new Set(guess)){
  const admitted=[...guess].filter((x,i)=>x===c&&colors[i]!=='absent').length;
  assert.equal(admitted,Math.min([...guess].filter(x=>x===c).length,[...a.word].filter(x=>x===c).length));
 }}
 const answers=[a,{word:'APPLE',difficulty:1},{word:'STONE',difficulty:2}] as const;
 let solo=createSoloGame(answers),sealed=createSealedGame(['a','b'],answers);
 assert.ok(!JSON.stringify(soloProjection(solo)).includes(a.word));
 for(const answer of answers){solo=submitSoloGuess(solo,answer.word,w=>guesses.has(w));sealed=submitSealedGuess(sealed,'a',answer.word,w=>guesses.has(w));assert.ok(!JSON.stringify(sealedProjection(sealed,'b').current).includes(answer.word));sealed=submitSealedGuess(sealed,'b',answer.word,w=>guesses.has(w));}
 assert.equal(soloProjection(solo).score,sealedProjection(sealed,'a').ownScore);assert.equal(completedMatchOutcome(sealed).reason,'draw');
 perWord.push({...a,esdb:src.esdb,frequency:src.frequency,editorialReview:'familiar ordinary meaning; neutral use; standard American spelling; initial editorial tier',legalGuess:true,solvePositions:6,duplicateLetterConservation:true,soloAsyncParity:true,privateUntilReveal:true});
}
const combined=[...previousRows,...additions].sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:0);
const artifact=combined.map(a=>`${a.word} ${a.difficulty}`).join('\n')+'\n';
writeFileSync(out+'answers-v3.candidate.txt',artifact);
writeFileSync(out+'vocabulary-v3-seed.sql',`INSERT INTO private.five_alive_answers(version,word,difficulty) VALUES\n${combined.map(a=>`('esdb-five-alive/3','${a.word}',${a.difficulty})`).join(',\n')};\nINSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/3');\n`);
const evidence={at:new Date().toISOString(),version:'esdb-five-alive/3',previousAnswers:753,reviewedAdditions:additions.length,combined:combined.length,remainingTo10000:10000-combined.length,solvedCases,sourceRevision:source.revision,sourceScreen:source.screen,frequencyCaveat:'Corpus counts are contextual evidence only; zero means absent from these samples. This batch uses individually reviewed ordinary meanings, not the prior batch frequency threshold. Tiers are editorial, not player calibrated.',sourceEvidenceSha256:hash(sourceBytes),reviewSha256:hash(review),previousSha256:hash(previous),candidateSha256:hash(artifact),qualification:'per-word checks passed; isolated allocator qualification pending; inactive',perWord};
writeFileSync(out+'vocabulary-v3-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({...evidence,perWord:undefined}));
