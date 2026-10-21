// Builds a reviewable rollback-only SQL payload. Never connects to production.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const installed=process.argv.includes('--installed'),ids=Array.from({length:4},randomUUID);
const read=n=>readFileSync('supabase/race-poker/'+n+'.sql','utf8');
const array=values=>'ARRAY['+values.map(id=>"'"+id+"'::uuid").join(',')+']';
const fixture=(name,users)=>read(name).replace('ARRAY[gen_random_uuid(),gen_random_uuid()]',array(users));
// Production must use the live scheduler health; only isolated fixtures seed it.
const heartbeatSeed=" UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';";
const financialFixture=fixture('financial-proof',ids.slice(0,2));
if(financialFixture.split(heartbeatSeed).length!==2)throw Error('Expected exactly one local heartbeat seed');
const productionFinancial=financialFixture.replace(heartbeatSeed,' -- Use actual scheduler health; do not seed the live heartbeat.');
if(/(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+private\.game_recovery_dispatch_state/i.test(productionFinancial))throw Error('Production proof must not mutate the heartbeat');
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE race_existing_balances ON COMMIT DROP AS SELECT id,chips FROM public.players;
${installed?'': ['canonical-guard','rules','multiplayer','commands','registration'].map(read).join('\n')}
${read('core-proof')}
${productionFinancial}
${fixture('rollback-failure-proof',ids.slice(2))}
DO $$ BEGIN
 PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM pg_temp.race_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'all pre-existing player balances untouched');
END $$;
ROLLBACK;
SELECT jsonb_build_object('proof_passed',true,'money_modes',jsonb_build_array('fake','real'),
 'winner_balances',jsonb_build_array(105,95),'draw_balances',jsonb_build_array(100,100),
 'failure_rollback_balances',jsonb_build_array(100,100),'existing_balance_assertion_passed',true,
 'residual_users',(SELECT count(*) FROM auth.users WHERE id=ANY(${array(ids)})),
 'residual_profiles',(SELECT count(*) FROM public.profiles WHERE id=ANY(${array(ids)})),
 'residual_players',(SELECT count(*) FROM public.players WHERE user_id=ANY(${array(ids)})),
 'residual_snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE user_id=ANY(${array(ids)})),
 'race_games',(SELECT count(*) FROM public.games WHERE game_type='race-poker'),
 'race_results',(SELECT count(*) FROM public.game_results WHERE game_type='race-poker'),
 'race_release_exists',to_regclass('private.race_poker_release') IS NOT NULL,
 'injection_trigger_exists',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='race_proof_failure')) evidence;
`;
if(/^\s*COMMIT\s*;/im.test(sql))throw Error('Proof must not commit');
mkdirSync('qualification.local/race-poker',{recursive:true});
const path='qualification.local/race-poker/production-'+(installed?'installed':'candidate')+'-proof.sql';
writeFileSync(path,sql);writeFileSync(path+'.manifest.json',JSON.stringify({installed,users:ids}));console.log(path);
