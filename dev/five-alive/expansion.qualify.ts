// Qualification artifacts only. Never changes the active vocabulary or pool.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {award,feedback,submitGuess,createSoloGame,submitSoloGuess,soloProjection,createSealedGame,submitSealedGuess,sealedProjection,completedMatchOutcome} from '../../server/fiveAlive/rules.ts';
const root='qualification.local/five-alive/hosted/';
const read=(p:string)=>readFileSync(p,'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const original=read('server/fiveAlive/answers.reviewed.txt');
const reviewed=read('server/fiveAlive/answers.expansion.review.csv');
const guesses=new Set(read('server/fiveAlive/guesses.esdb.txt').trim().split(/\r?\n/));
const existing=original.split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(line=>{const [word,tier]=line.split(' ');return {word,difficulty:Number(tier)};});
const frequency=new Map(read('qualification.local/five-alive/frequency/candidate-evidence.csv').trim().split(/\r?\n/).slice(1).map(line=>{const [word,written,genres,spoken]=line.split(',');return [word.toUpperCase(),{written:Number(written),genres:Number(genres),spoken:Number(spoken)}];}));
const additions=reviewed.trim().split(/\r?\n/).slice(1).map(line=>{const [word,tier,ordinaryMeaning,...extra]=line.split(',');assert.equal(extra.length,0);return {word,difficulty:Number(tier),ordinaryMeaning};});
assert.equal(existing.length,498);assert.equal(additions.length,255);
const seen=new Set(existing.map(a=>a.word));let solvedCases=0;
const perWord=[];
for(const a of additions){
 assert.match(a.word,/^[A-Z]{5}$/);assert.ok(guesses.has(a.word)&&!seen.has(a.word));seen.add(a.word);
 assert.ok(Number.isInteger(a.difficulty)&&a.difficulty>=1&&a.difficulty<=5&&a.ordinaryMeaning.length>1);
 const f=frequency.get(a.word)!;assert.ok(f&&f.written>=10&&f.genres>=2&&f.spoken>=5);
 for(let solve=1;solve<=6;solve++){
  let r={answer:a.word,difficulty:a.difficulty,guesses:[],completed:false};
  for(let n=1;n<solve;n++)r=submitGuess(r,'APPLE',w=>guesses.has(w));
  r=submitGuess(r,a.word,w=>guesses.has(w));assert.ok(r.completed);assert.deepEqual(r.guesses.at(-1)?.feedback,Array(5).fill('correct'));assert.equal(award(r.guesses.length,a.difficulty),award(solve,a.difficulty));solvedCases++;
 }
 // Duplicate-letter allocation conserves exact occurrences for every letter.
 for(const guess of ['APPLE','SASSY','ALLEY',a.word]){const colors=feedback(a.word,guess);for(const c of new Set(guess)){const admitted=[...guess].filter((x,i)=>x===c&&colors[i]!=='absent').length;assert.equal(admitted,Math.min([...guess].filter(x=>x===c).length,[...a.word].filter(x=>x===c).length));}}
 const answers=[a,{word:'APPLE',difficulty:1},{word:'STONE',difficulty:2}] as const;
 let solo=createSoloGame(answers),sealed=createSealedGame(['a','b'],answers);
 assert.ok(!JSON.stringify(soloProjection(solo)).includes(a.word));
 for(const answer of answers){solo=submitSoloGuess(solo,answer.word,w=>guesses.has(w));sealed=submitSealedGuess(sealed,'a',answer.word,w=>guesses.has(w));assert.ok(!JSON.stringify(sealedProjection(sealed,'b').current).includes(answer.word));sealed=submitSealedGuess(sealed,'b',answer.word,w=>guesses.has(w));}
 assert.equal(soloProjection(solo).score,sealedProjection(sealed,'a').ownScore);assert.equal(completedMatchOutcome(sealed).reason,'draw');
 perWord.push({...a,frequency:f,legalGuess:true,solvePositions:6,duplicateLetterConservation:true,soloAsyncParity:true,privateUntilReveal:true});
}
const combined=[...existing,...additions].sort((a,b)=>a.word.localeCompare(b.word));
const artifact=combined.map(a=>`${a.word} ${a.difficulty}`).join('\n')+'\n';
writeFileSync(root+'answers-v2.candidate.txt',artifact);
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const version='esdb-five-alive/2-qualification';
const sql=`BEGIN;
INSERT INTO private.five_alive_answers(version,word,difficulty) VALUES\n${combined.map(a=>`(${q(version)},${q(a.word)},${a.difficulty})`).join(',\n')};
INSERT INTO private.five_alive_pool(version) VALUES(${q(version)});
CREATE TEMP TABLE fa_seen(word text PRIMARY KEY);
DO $$ DECLARE owner uuid;got jsonb;again jsonb;cursor_i integer;BEGIN
FOR i IN 1..251 LOOP owner:=gen_random_uuid();got:=private.five_alive_allocate(CASE WHEN i%2=0 THEN 'arcade' ELSE 'async' END,owner,${q(version)});
INSERT INTO fa_seen SELECT a->>'word' FROM jsonb_array_elements(got) a;
SELECT cursor INTO cursor_i FROM private.five_alive_pool WHERE version=${q(version)};
again:=private.five_alive_allocate(CASE WHEN i%2=0 THEN 'arcade' ELSE 'async' END,owner,${q(version)});
IF got<>again OR cursor_i<>(SELECT cursor FROM private.five_alive_pool WHERE version=${q(version)}) THEN RAISE EXCEPTION 'qualification:allocation_replay';END IF;END LOOP;
IF (SELECT count(*) FROM fa_seen)<>753 THEN RAISE EXCEPTION 'qualification:pool_coverage';END IF;
BEGIN UPDATE private.five_alive_answers SET difficulty=5 WHERE version=${q(version)} AND word='ABOUT';RAISE EXCEPTION 'qualification:mutable_bank';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'five_alive:answers_frozen' THEN RAISE;END IF;END;
END $$;
SELECT 753 covered_answers,251 allocations,251 exact_replays,true frozen;
ROLLBACK;`;
writeFileSync(root+'vocabulary-v2-pool.sql',sql);
const evidence={at:new Date().toISOString(),runtimeVersionUnchanged:'esdb-five-alive/1',activeAnswers:498,reviewedAdditions:additions.length,combined:combined.length,remainingTo10000:10000-combined.length,solvedCases,reviewSha256:hash(reviewed),candidateSha256:hash(artifact),qualification:'source/editorial and shared-reducer checks passed; isolated pool proof pending; inactive candidate only',perWord};
writeFileSync(root+'vocabulary-v2-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({...evidence,perWord:undefined}));
