// Prepare reviewable rollback-only payloads. This script never contacts production.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const installed=process.argv.includes('--installed'),ids=Array.from({length:6},randomUUID);
const source=n=>read('supabase/race-poker/'+n+'.sql','utf8');
const array=xs=>'ARRAY['+xs.map(x=>"'"+x+"'::uuid").join(',')+']';
const fixture=(name,users)=>source(name).replace('ARRAY[gen_random_uuid(),gen_random_uuid()]',array(users));
const seed=" UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';";
const financial=fixture('financial-proof',ids.slice(0,2));
if(financial.split(seed).length!==2)throw Error('Unexpected heartbeat fixture');
const migration=read('supabase/migrations/20261021143000_race_poker_timeout_controls.sql','utf8');
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM private.race_poker_matches WHERE NOT finished) THEN RAISE EXCEPTION 'race_v2_proof:live_match';END IF;END $$;
CREATE TEMP TABLE race_existing_balances ON COMMIT DROP AS SELECT id,chips FROM public.players;
CREATE TEMP TABLE race_existing_matches ON COMMIT DROP AS SELECT dealer_game_id,md5(state::text) hash FROM private.race_poker_matches;
${installed?'':migration}
${source('core-proof')}
${financial.replace(seed,' -- Use actual production scheduler health.')}
${fixture('rollback-failure-proof',ids.slice(2,4))}
${fixture('v2-controls-proof',ids.slice(4))}
DO $$ BEGIN
 PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM race_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'existing balances unchanged');
 PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM race_existing_matches b LEFT JOIN private.race_poker_matches m USING(dealer_game_id) WHERE m.dealer_game_id IS NULL OR md5(m.state::text)<>b.hash),'existing v1 matches unchanged');
 PERFORM pg_temp.race_assert(NOT has_function_privilege('authenticated','private.race_poker_rules_v1()','EXECUTE') AND NOT has_function_privilege('authenticated','private.race_poker_participation_changed()','EXECUTE'),'new helpers private');
END $$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'money_modes',jsonb_build_array('fake','real'),'controls',true,'existing_balances_and_matches_unchanged',true,
 'residual_users',(SELECT count(*) FROM auth.users WHERE id=ANY(${array(ids)})),
 'residual_players',(SELECT count(*) FROM public.players WHERE user_id=ANY(${array(ids)})),
 'residual_profiles',(SELECT count(*) FROM public.profiles WHERE id=ANY(${array(ids)})),
 'residual_snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE user_id=ANY(${array(ids)})),
 'release',(SELECT to_jsonb(r) FROM private.race_poker_release r),
 'injection_trigger_exists',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='race_proof_failure')) evidence;`;
if(/^\s*COMMIT\s*;/im.test(sql)||/(?:UPDATE|INSERT\s+INTO)\s+private\.game_recovery_dispatch_state/i.test(sql))throw Error('Unsafe production proof');
const path='qualification.local/race-poker/v2-production-'+(installed?'installed':'candidate')+'.sql';
write(path,sql);write(path+'.manifest.json',JSON.stringify({installed,ids,sha256:createHash('sha256').update(sql).digest('hex')}));console.log(path);
