import {readFileSync,writeFileSync} from 'node:fs';import {connect,database,dir} from './local.mjs';
const sha=process.argv[2];if(!/^[0-9a-f]{40}$/.test(sha??''))throw Error('Exact verified production SHA required');
const db=await connect(database());
const names=JSON.parse(readFileSync('qualification.local/async-take-two/updates.json')).map(f=>f.name).concat(['delayed_take_two_core','take_two_board_from_deck','delayed_take_two_review_allowed','take_two_board_reduce','take_two_board_finish','take_two_visible']);
const owners=(await db.query("SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,md5(replace(pg_get_functiondef(p.oid),chr(13),'')) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname=ANY($1)",[names])).rows;await db.end();
const guards=owners.map(f=>`IF md5(replace(pg_get_functiondef('${f.signature}'::regprocedure),chr(13),'')) IS DISTINCT FROM '${f.hash}' THEN RAISE EXCEPTION 'take_two:authority_changed ${f.signature}';END IF;`).join('\n');
writeFileSync(dir+'/activate.sql',`BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(731907241);
DO $activation$ BEGIN
 IF NOT EXISTS(SELECT FROM public.system_settings WHERE key='release_publication' AND value->>'buildSha'='${sha}') THEN RAISE EXCEPTION 'take_two:publication_not_verified';END IF;
 IF NOT EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version='20261105011042' AND name='async_take_two_identical_deals') THEN RAISE EXCEPTION 'take_two:migration_missing';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled AND real_qualified) OR NOT private.delayed_multi_enabled() THEN RAISE EXCEPTION 'take_two:admission_unavailable';END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') OR EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL) THEN RAISE EXCEPTION 'take_two:maintenance_or_incident';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_words_health WHERE singleton AND enabled AND last_tick>clock_timestamp()-interval '2 minutes') OR EXISTS(SELECT FROM private.delayed_recovery_state WHERE failure IS NOT NULL) THEN RAISE EXCEPTION 'take_two:recovery_unhealthy';END IF;
 IF private.evaluate_real_money_liveness(NULL)->>'outcome' IS DISTINCT FROM 'healthy' THEN RAISE EXCEPTION 'take_two:liveness_unhealthy';END IF;
 ${guards}
 UPDATE private.delayed_take_two_release SET enabled=true WHERE singleton;
END $activation$;COMMIT;
SELECT jsonb_build_object('takeTwo',(SELECT to_jsonb(r) FROM private.delayed_take_two_release r),'published',(SELECT value FROM public.system_settings WHERE key='release_publication'),'health',(SELECT to_jsonb(h) FROM private.delayed_words_health h),'liveness',private.evaluate_real_money_liveness(NULL)) evidence;
`);console.log('Prepared guarded activation for',sha,'with',owners.length,'authority fingerprints; not executed');
