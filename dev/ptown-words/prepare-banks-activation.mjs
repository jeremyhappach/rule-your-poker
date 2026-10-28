import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const sha=process.argv[2];assert.match(sha,/^[0-9a-f]{40}$/);
const response=await fetch('https://holm357.com/build-manifest.json',{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);
assert.equal((await response.json()).buildId,sha,'Exact production manifest required');
const pre=JSON.parse(readFileSync('dev/ptown-words/banks-release-preimage.json','utf8'));
const preserved=['ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)','ptown_words_capabilities(uuid)','private.ptown_words_settle(uuid)','set_game_paused(uuid,boolean,uuid,bigint)'];
const guards=preserved.map(signature=>`IF md5(pg_get_functiondef('${signature}'::regprocedure)) IS DISTINCT FROM '${pre.functions.find(f=>f.signature===signature).md5}' THEN RAISE EXCEPTION 'Words preserved authority changed: ${signature}';END IF;`).join('\n');
const sql=`BEGIN;SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.system_settings WHERE key='release_publication' AND value->>'buildSha'='${sha}') THEN RAISE EXCEPTION 'Words exact publication signal missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND NOT admission_enabled AND NOT bots_enabled)
 OR private.ptown_words_rules()->>'version'<>'ptown-words/2'
 OR (SELECT count(*) FROM private.ptown_words_lexicon WHERE version='enable2k/1')<>173528
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='ptown-words-recovery' AND active)
 OR position('ptown_words:cancel_request_target' IN pg_get_functiondef('public.ptown_words_action(uuid,uuid,bigint,text,jsonb)'::regprocedure))=0 THEN RAISE EXCEPTION 'Words activation preconditions';END IF;
 ${guards}
END $guard$;
UPDATE private.ptown_words_release SET admission_enabled=true,bots_enabled=true WHERE singleton;
COMMIT;
SELECT jsonb_build_object('release',(SELECT to_jsonb(r) FROM private.ptown_words_release r),'rules',private.ptown_words_rules(),'publication',(SELECT value FROM public.system_settings WHERE key='release_publication')) activated;`;
writeFileSync('qualification.local/ptown-words/banks-release-activate.sql',sql);console.log('Exact-manifest guarded activation SQL prepared for '+sha);
