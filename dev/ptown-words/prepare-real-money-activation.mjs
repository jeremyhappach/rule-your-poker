import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const sha=process.argv[2];assert.match(sha,/^[0-9a-f]{40}$/);
const response=await fetch('https://holm357.com/build-manifest.json',{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);assert.equal((await response.json()).buildId,sha);
const evidence=JSON.parse(read('dev/ptown-words/evidence/real-money-hosted.json','utf8'));
const preserved=JSON.parse(read('dev/ptown-words/real-money-release-preimage.json','utf8')).functions;
const changed=evidence.installed.functions;
const guards=preserved.map(f=>changed.find(c=>c.signature===f.signature)||f).map(f=>`IF md5(pg_get_functiondef('${f.signature}'::regprocedure)) IS DISTINCT FROM '${f.md5}' THEN RAISE EXCEPTION 'Words activation authority changed: ${f.signature}';END IF;`).join('\n');
const sql=`BEGIN;SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT FROM public.system_settings WHERE key='release_publication' AND value->>'buildSha'='${sha}') THEN RAISE EXCEPTION 'Words exact publication signal missing';END IF;
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261028191408')<>1 OR NOT EXISTS(SELECT FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled AND bots_enabled AND NOT real_qualified) THEN RAISE EXCEPTION 'Words installed closed release required';END IF;
 IF NOT(private.evaluate_real_money_liveness(NULL)->>'admission_allowed')::boolean OR NOT EXISTS(SELECT FROM cron.job WHERE jobname='ptown-words-recovery' AND active) OR private.ptown_words_rules()->>'version'<>'ptown-words/2' THEN RAISE EXCEPTION 'Words recovery/rules precondition';END IF;
 ${guards}
END $guard$;
UPDATE private.ptown_words_release SET real_qualified=true WHERE singleton;
COMMIT;
SELECT jsonb_build_object('release',(SELECT to_jsonb(r) FROM private.ptown_words_release r),'publication',(SELECT value FROM public.system_settings WHERE key='release_publication'),'health',private.evaluate_real_money_liveness(NULL)) evidence;`;
write('qualification.local/ptown-words/real-money/activate.sql',sql);console.log('Prepared exact-publication and authority-guarded live human activation');
