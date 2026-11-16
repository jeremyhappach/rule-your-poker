// Builds only the already-qualified version-2 artifacts; no service or DB calls.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const read=p=>readFileSync(p,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const records='server/fiveAlive/answers.v2.qualification.json';
const evidence=read(existsSync(records)?records:'qualification.local/five-alive/hosted/vocabulary-v2-evidence.json');
const q=JSON.parse(evidence),review=read('server/fiveAlive/answers.expansion.review.csv');
assert.equal(hash(review),q.reviewSha256);assert.equal(q.solvedCases,1530);
assert.deepEqual(q.poolProof,[{covered_answers:753,allocations:251,exact_replays:251,frozen:true}]);
const additions=review.trim().split(/\r?\n/).slice(1).map(line=>{const [word,tier,meaning]=line.split(',');return {word,difficulty:Number(tier),meaning};});
assert.equal(additions.length,255);assert.equal(q.perWord.length,255);
for(const a of additions){const proof=q.perWord.find(p=>p.word===a.word);assert.ok(proof);assert.equal(proof.difficulty,a.difficulty);assert.equal(proof.ordinaryMeaning,a.meaning);assert.ok(proof.legalGuess&&proof.soloAsyncParity&&proof.privateUntilReveal&&proof.duplicateLetterConservation);}
const legacy=read('server/fiveAlive/answers.reviewed.txt').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(line=>{const [word,tier]=line.split(' ');return {word,difficulty:Number(tier)};});
const all=[...legacy,...additions].sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:0);
assert.equal(legacy.length,498);assert.equal(new Set(all.map(a=>a.word)).size,753);
const artifact=all.map(a=>`${a.word} ${a.difficulty}`).join('\n')+'\n';
assert.equal(hash(artifact),q.candidateSha256);
writeFileSync('server/fiveAlive/answers.reviewed.v2.txt',artifact);
if(!existsSync(records))writeFileSync(records,evidence);
const sql=`-- Follow-up to pool.sql, arcade.sql, async.sql and registration.sql.
-- Qualified vocabulary only. Both modes remain withheld. Legacy rows stay frozen.
DO $$ BEGIN
 IF EXISTS(SELECT FROM private.five_alive_release WHERE async_enabled OR async_real_qualified)
 OR EXISTS(SELECT FROM private.arcade_rulesets WHERE game='five-alive' AND enabled) THEN
 RAISE EXCEPTION 'five_alive:v2_requires_closed_admission';END IF;
END $$;
CREATE TEMP TABLE fa_v2_expected(word text PRIMARY KEY,difficulty smallint,legacy boolean) ON COMMIT DROP;
INSERT INTO fa_v2_expected VALUES\n${all.map(a=>`('${a.word}',${a.difficulty},${legacy.some(b=>b.word===a.word)})`).join(',\n')};
DO $$ BEGIN
 IF EXISTS((SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/1') EXCEPT (SELECT word,difficulty FROM fa_v2_expected WHERE legacy))
 OR EXISTS((SELECT word,difficulty FROM fa_v2_expected WHERE legacy) EXCEPT (SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/1')) THEN RAISE EXCEPTION 'five_alive:legacy_bank_changed';END IF;
 IF EXISTS((SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/2') EXCEPT (SELECT word,difficulty FROM fa_v2_expected)) THEN RAISE EXCEPTION 'five_alive:v2_bank_changed';END IF;
 IF EXISTS(SELECT FROM private.five_alive_pool WHERE version='esdb-five-alive/2')
 AND EXISTS((SELECT word,difficulty FROM fa_v2_expected) EXCEPT (SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/2')) THEN RAISE EXCEPTION 'five_alive:v2_incomplete_frozen_bank';END IF;
END $$;
INSERT INTO private.five_alive_answers(version,word,difficulty)
 SELECT 'esdb-five-alive/2',e.word,e.difficulty FROM fa_v2_expected e
 WHERE NOT EXISTS(SELECT FROM private.five_alive_answers a WHERE a.version='esdb-five-alive/2' AND a.word=e.word);
INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/2') ON CONFLICT(version) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT 'five-alive/2',game,jsonb_set(config,'{poolVersion}','"esdb-five-alive/2"'),false
 FROM private.arcade_rulesets WHERE id='five-alive/1' AND game='five-alive'
 ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE cfg jsonb;s text;old_i text;new_i text;target regprocedure;BEGIN
 SELECT config INTO STRICT cfg FROM private.arcade_rulesets WHERE id='five-alive/1' AND game='five-alive';
 IF cfg->>'version'<>'five-alive/1' OR cfg->>'poolVersion'<>'esdb-five-alive/1'
 OR NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='five-alive/2' AND game='five-alive' AND NOT enabled AND config=jsonb_set(cfg,'{poolVersion}','"esdb-five-alive/2"')) THEN RAISE EXCEPTION 'five_alive:v2_configuration_changed';END IF;
 -- Existing Arcade admission chooses the enabled ruleset; no shared owner change.
 -- Only new Async offers/capabilities select v2. Frozen offers retain their pool.
 FOREACH target IN ARRAY ARRAY['public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure,'private.chess_prior_delayed_capabilities()'::regprocedure] LOOP
  s:=pg_get_functiondef(target);old_i:='id=''five-alive/1''';new_i:='id=''five-alive/2''';
  IF strpos(s,new_i)>0 THEN
   IF strpos(s,old_i)>0 OR strpos(substr(s,strpos(s,new_i)+length(new_i)),new_i)>0 THEN RAISE EXCEPTION 'five_alive:v2_ambiguous_registration';END IF;
  ELSE
   IF strpos(s,old_i)=0 OR strpos(substr(s,strpos(s,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:v2_registration_preimage_changed';END IF;
   EXECUTE replace(s,old_i,new_i);
  END IF;
 END LOOP;
END $$;
`;
writeFileSync('supabase/five-alive/vocabulary-v2.sql',sql);
console.log(JSON.stringify({version:'esdb-five-alive/2',answers:all.length,added:additions.length,sha256:hash(artifact),admission:'withheld'}));
