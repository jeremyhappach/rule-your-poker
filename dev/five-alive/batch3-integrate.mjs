// Builds only qualified v3 artifacts; no network calls or database writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const read=p=>readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const base='server/fiveAlive/',q=JSON.parse(read(base+'answers.v3.qualification.json'));
const review=read(base+'answers.batch3.review.csv'),previous=read(base+'answers.reviewed.v2.txt');
assert.equal(hash(review),q.reviewSha256);assert.equal(hash(previous),q.previousSha256);
assert.equal(q.solvedCases,1608);assert.equal(q.perWord.length,268);
assert.deepEqual(q.poolProof,[{answers:1021,three_word_games_before_repeat:340,first_repeating_game:341,cycles_checked:2,allocations:681,replays:682,boundary_safe:true,prior_versions_preserved:true}]);
const legacy=previous.trim().split(/\r?\n/).map(line=>{const [word,tier]=line.split(' ');return {word,difficulty:Number(tier)};});
const additions=review.trim().split(/\r?\n/).slice(1).map(line=>{const [word,tier,ordinaryMeaning]=line.split(',');return {word,difficulty:Number(tier),ordinaryMeaning};});
for(const a of additions){const p=q.perWord.find(x=>x.word===a.word);assert.ok(p);assert.equal(p.difficulty,a.difficulty);assert.equal(p.ordinaryMeaning,a.ordinaryMeaning);assert.ok(p.esdb.length&&p.legalGuess&&p.soloAsyncParity&&p.privateUntilReveal&&p.duplicateLetterConservation);}
const all=[...legacy,...additions].sort((a,b)=>a.word<b.word?-1:a.word>b.word?1:0);
assert.equal(legacy.length,753);assert.equal(all.length,1021);assert.equal(new Set(all.map(a=>a.word)).size,1021);
const artifact=all.map(a=>`${a.word} ${a.difficulty}`).join('\n')+'\n';assert.equal(hash(artifact),q.candidateSha256);
writeFileSync(base+'answers.reviewed.v3.txt',artifact);
const sql=`-- Follow-up to vocabulary-v2.sql. Qualified words only; admission stays closed.
DO $$ BEGIN
 IF EXISTS(SELECT FROM private.five_alive_release WHERE async_enabled OR async_real_qualified)
 OR EXISTS(SELECT FROM private.arcade_rulesets WHERE game='five-alive' AND enabled) THEN
 RAISE EXCEPTION 'five_alive:v3_requires_closed_admission';END IF;
END $$;
CREATE TEMP TABLE fa_v3_expected(word text PRIMARY KEY,difficulty smallint,legacy boolean) ON COMMIT DROP;
INSERT INTO fa_v3_expected VALUES
${all.map(a=>`('${a.word}',${a.difficulty},${legacy.some(b=>b.word===a.word)})`).join(',\n')};
DO $$ BEGIN
 IF EXISTS((SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/2') EXCEPT (SELECT word,difficulty FROM fa_v3_expected WHERE legacy))
 OR EXISTS((SELECT word,difficulty FROM fa_v3_expected WHERE legacy) EXCEPT (SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/2')) THEN RAISE EXCEPTION 'five_alive:previous_bank_changed';END IF;
 IF EXISTS((SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/3') EXCEPT (SELECT word,difficulty FROM fa_v3_expected)) THEN RAISE EXCEPTION 'five_alive:v3_bank_changed';END IF;
 IF EXISTS(SELECT FROM private.five_alive_pool WHERE version='esdb-five-alive/3')
 AND EXISTS((SELECT word,difficulty FROM fa_v3_expected) EXCEPT (SELECT word,difficulty FROM private.five_alive_answers WHERE version='esdb-five-alive/3')) THEN RAISE EXCEPTION 'five_alive:v3_incomplete_frozen_bank';END IF;
END $$;
INSERT INTO private.five_alive_answers(version,word,difficulty)
 SELECT 'esdb-five-alive/3',e.word,e.difficulty FROM fa_v3_expected e
 WHERE NOT EXISTS(SELECT FROM private.five_alive_answers a WHERE a.version='esdb-five-alive/3' AND a.word=e.word);
INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/3') ON CONFLICT(version) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT 'five-alive/3',game,jsonb_set(config,'{poolVersion}','"esdb-five-alive/3"'),false
 FROM private.arcade_rulesets WHERE id='five-alive/2' AND game='five-alive'
 ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE cfg jsonb;s text;old_i text;new_i text;target regprocedure;BEGIN
 SELECT config INTO STRICT cfg FROM private.arcade_rulesets WHERE id='five-alive/2' AND game='five-alive';
 IF cfg->>'version'<>'five-alive/1' OR cfg->>'poolVersion'<>'esdb-five-alive/2'
 OR NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='five-alive/3' AND game='five-alive' AND NOT enabled AND config=jsonb_set(cfg,'{poolVersion}','"esdb-five-alive/3"')) THEN RAISE EXCEPTION 'five_alive:v3_configuration_changed';END IF;
 -- Frozen offers/configs retain their pool. Only future defaults select v3.
 FOREACH target IN ARRAY ARRAY['public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure,'private.chess_prior_delayed_capabilities()'::regprocedure] LOOP
  s:=pg_get_functiondef(target);old_i:='id=''five-alive/2''';new_i:='id=''five-alive/3''';
  IF strpos(s,new_i)>0 THEN
   IF strpos(s,old_i)>0 OR strpos(substr(s,strpos(s,new_i)+length(new_i)),new_i)>0 THEN RAISE EXCEPTION 'five_alive:v3_ambiguous_registration';END IF;
  ELSE
   IF strpos(s,old_i)=0 OR strpos(substr(s,strpos(s,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:v3_registration_preimage_changed';END IF;
   EXECUTE replace(s,old_i,new_i);
  END IF;
 END LOOP;
END $$;
`;
writeFileSync('supabase/five-alive/vocabulary-v3.sql',sql);
console.log(JSON.stringify({version:'esdb-five-alive/3',added:additions.length,answers:all.length,sha256:hash(artifact),admission:'withheld'}));
