// Build a closed production installation from qualified sources and fresh catalogs.
// Does not contact any service. The proof and installation use the same SQL bytes.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const read=p=>readFileSync(p,'utf8').replace(/\r/g,'');
const hash=(s,kind='sha256')=>createHash(kind).update(s).digest('hex');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const dir='qualification.local/five-alive/hosted/';
const before=JSON.parse(read(dir+'release-production-preimage-20261116.json'));
const qualified=JSON.parse(read(dir+'release-qualified-definitions-20261116.json'));
assert.equal(before.fiveAliveAbsent,true);assert.equal(Object.keys(qualified).length,17);
const original=read('server/fiveAlive/answers.reviewed.txt');
assert.equal(hash(original),'f6122ac580ff89c0299286c817a1fee26c8690a1eefbd9f9219a4140deec778c');
const rows=original.split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>x.split(' '));assert.equal(rows.length,498);
const current=read('server/fiveAlive/answers.reviewed.v3.txt');
assert.equal(hash(current),'56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed');
const guards=Object.entries(before.functions).map(([sig,body])=>`IF md5(replace(pg_get_functiondef(${literal(sig)}::regprocedure),chr(13),''))<>${literal(hash(body.replace(/\r/g,''),'md5'))} THEN RAISE EXCEPTION 'five_alive:release_preimage_changed %',${literal(sig)};END IF;`).join('\n');
const artwork=before.constraints.find(c=>c.table==='arcade_game_artwork'&&c.name==='arcade_game_artwork_game_check');assert.ok(artwork);
const shared=[`-- Qualified Five Alive /3 installation. All admission remains closed.
DO $$ BEGIN
 IF to_regclass('private.five_alive_release') IS NOT NULL THEN RAISE EXCEPTION 'five_alive:already_installed';END IF;
 ${guards}
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.arcade_game_artwork'::regclass AND conname='arcade_game_artwork_game_check') IS DISTINCT FROM ${literal(artwork.definition)} THEN RAISE EXCEPTION 'five_alive:artwork_preimage_changed';END IF;
END $$;`];
for(const name of ['pool','arcade','async','notifications','registration'])shared.push(read(`supabase/five-alive/${name}.sql`));
shared.push(`INSERT INTO private.five_alive_answers(version,word,difficulty) VALUES
${rows.map(([word,tier])=>`('esdb-five-alive/1',${literal(word)},${Number(tier)})`).join(',\n')};
INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/1');`);
for(const name of ['vocabulary-v2','vocabulary-v3'])shared.push(read(`supabase/five-alive/${name}.sql`));
shared.push(`-- Extend only the catalog artwork allowlist; preserve existing rows and order.
ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check
 CHECK(game IN ('ship-cap-voyage','horses-blitz','357-drop','chucky-showdown','crib-lab','run21','tri-towers','yahtzee','trip-flip','five-alive'));
INSERT INTO public.arcade_game_artwork(game) VALUES('five-alive') ON CONFLICT(game) DO NOTHING;
INSERT INTO public.game_defaults(game_type) VALUES('five-alive') ON CONFLICT(game_type) DO NOTHING;
`);
const verify=`DO $$ DECLARE obj regclass;sig regprocedure;BEGIN
 ${Object.entries(qualified).map(([sig,body])=>`IF md5(replace(pg_get_functiondef(${literal(sig)}::regprocedure),chr(13),''))<>${literal(hash(body.replace(/\r/g,''),'md5'))} THEN RAISE EXCEPTION 'five_alive:qualified_definition_mismatch %',${literal(sig)};END IF;`).join('\n')}
 IF EXISTS(SELECT FROM private.five_alive_release WHERE async_enabled OR async_real_qualified)
 OR EXISTS(SELECT FROM private.arcade_rulesets WHERE game='five-alive' AND enabled) THEN RAISE EXCEPTION 'five_alive:release_opened_early';END IF;
 IF (SELECT count(*) FROM private.five_alive_answers WHERE version='esdb-five-alive/3')<>1021
 OR (SELECT md5(string_agg(word||' '||difficulty,E'\n' ORDER BY word COLLATE "C")||E'\n') FROM private.five_alive_answers WHERE version='esdb-five-alive/3')<>${literal(hash(current,'md5'))} THEN RAISE EXCEPTION 'five_alive:release_bank_mismatch';END IF;
 IF EXISTS(SELECT FROM private.five_alive_pool WHERE epoch<>0 OR cursor<>0) OR EXISTS(SELECT FROM private.five_alive_allocations) THEN RAISE EXCEPTION 'five_alive:release_pool_used';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='five-alive/3' AND config->>'version'='five-alive/1' AND config->>'poolVersion'='esdb-five-alive/3') THEN RAISE EXCEPTION 'five_alive:release_config';END IF;
 FOREACH obj IN ARRAY ARRAY['private.five_alive_answers'::regclass,'private.five_alive_pool'::regclass,'private.five_alive_shuffle'::regclass,'private.five_alive_allocations'::regclass,'private.five_alive_release'::regclass] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=obj) OR has_table_privilege('anon',obj,'SELECT') OR has_table_privilege('authenticated',obj,'SELECT') OR has_table_privilege('service_role',obj,'SELECT') THEN RAISE EXCEPTION 'five_alive:private_table_access %',obj;END IF;
 END LOOP;
 FOR sig IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname LIKE '%five_alive%' LOOP
  IF has_function_privilege('anon',sig,'EXECUTE') OR has_function_privilege('authenticated',sig,'EXECUTE') THEN RAISE EXCEPTION 'five_alive:public_secret_rpc %',sig;END IF;
 END LOOP;
END $$;
SELECT 17 qualified_definitions,1021 qualified_answers,true admission_closed,true private_access_checked;`;
const installation=shared.join('\n')+'\n'+verify+'\n';
writeFileSync('supabase/five-alive/release.sql',installation);
writeFileSync(dir+'release-installation-proof.sql','BEGIN;\n'+installation+'\nROLLBACK;\n');
writeFileSync(dir+'release-installation-verify.sql',verify);
console.log(JSON.stringify({bytes:installation.length,sha256:hash(installation),definitions:17,answers:1021,admission:'closed'}));
