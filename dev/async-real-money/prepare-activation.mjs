import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
const sha=process.argv[2];if(!/^[0-9a-f]{40}$/.test(sha??''))throw Error('Exact verified production SHA required');
const changed=JSON.parse(read('qualification.local/async-real-money/changed-functions.json'));
const before=JSON.parse(read('dev/async-real-money/evidence/authority-before.json'));
const owners=[...before.filter(f=>!changed.some(c=>c.signature===f.signature)),...changed.map(c=>({signature:c.signature,hash:createHash('md5').update(c.after.replaceAll('\r','')).digest('hex')})),...JSON.parse(read('dev/async-real-money/evidence/rule-hashes.json'))];
const guards=owners.map(f=>`IF md5(replace(pg_get_functiondef('${f.signature}'::regprocedure),chr(13),'')) IS DISTINCT FROM '${f.hash}' THEN RAISE EXCEPTION 'async_real:authority_changed ${f.signature}';END IF;`).join('\n');
const sql=`BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(731907241);
DO $activation$ BEGIN
 IF NOT EXISTS(SELECT FROM public.system_settings WHERE key='release_publication' AND value->>'buildSha'='${sha}') THEN RAISE EXCEPTION 'async_real:publication_not_verified';END IF;
 IF NOT EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version='20261101152430' AND name='async_real_money_admission') THEN RAISE EXCEPTION 'async_real:migration_missing';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR NOT private.delayed_multi_enabled() THEN RAISE EXCEPTION 'async_real:admission_unavailable';END IF;
 IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') OR EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL) THEN RAISE EXCEPTION 'async_real:maintenance_or_incident';END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_words_health WHERE singleton AND enabled AND last_tick>clock_timestamp()-interval '2 minutes') OR EXISTS(SELECT FROM private.delayed_recovery_state WHERE failure IS NOT NULL) THEN RAISE EXCEPTION 'async_real:recovery_unhealthy';END IF;
 IF private.evaluate_real_money_liveness(NULL)->>'outcome' IS DISTINCT FROM 'healthy' THEN RAISE EXCEPTION 'async_real:liveness_unhealthy';END IF;
 ${guards}
 UPDATE private.delayed_release SET real_qualified=true WHERE singleton;
END $activation$;
COMMIT;
SELECT jsonb_build_object('release',(SELECT to_jsonb(r) FROM private.delayed_release r),'published',(SELECT value FROM public.system_settings WHERE key='release_publication'),'health',(SELECT to_jsonb(h) FROM private.delayed_words_health h),'liveness',private.evaluate_real_money_liveness(NULL),'synthetic_profiles_remaining',(SELECT count(*) FROM public.profiles WHERE username LIKE 'Async real proof %' OR username LIKE 'Async real bot %')) evidence;
`;
write('qualification.local/async-real-money/activate.sql',sql);console.log('Prepared guarded activation for',sha,'with',owners.length,'authority fingerprints; nothing executed');
