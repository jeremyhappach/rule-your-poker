// Prepare an exact-package rollback proof; no network connection or installation.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const installed=process.argv.includes('--installed'),users=Array.from({length:3},randomUUID);
const hash=s=>createHash('sha256').update(s).digest('hex');
const packageSql=read('supabase/battle31/release.sql','utf8').replaceAll('\r\n','\n');
const meta=JSON.parse(read('dev/battle31/evidence/release-manifest.json','utf8'));
assert.equal(hash(packageSql),meta.packageSHA256,'Release package changed');
assert.equal(meta.packageSHA256,'2b8ec87378a03cb595dd7ebfc6963844b41eb73021231446077e761c3600de3e');
const array='ARRAY['+users.map(u=>"'"+u+"'::uuid").join(',')+']';
const cases=read('dev/battle31/production-cases.sql','utf8').replace('__USERS__',array);
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE b31_existing_balances ON COMMIT DROP AS SELECT id,chips FROM public.players;
CREATE TEMP TABLE b31_existing_defaults ON COMMIT DROP AS SELECT * FROM public.game_defaults WHERE game_type<>'battle-31';
CREATE TEMP TABLE b31_existing_race_gate ON COMMIT DROP AS SELECT * FROM private.race_poker_release;
CREATE TEMP TABLE b31_existing_owners ON COMMIT DROP AS SELECT oid,pg_get_functiondef(oid) definition,proacl FROM pg_proc WHERE proname LIKE 'race_poker_%' OR proname LIKE 'eleven_up_%' OR proname IN('set_game_paused','set_automatic_play','pause_all_humans_auto_fold','settle_gameplay_chip_transfers','submit_ante_decision');
CREATE TEMP TABLE b31_existing_race_matches ON COMMIT DROP AS SELECT dealer_game_id,md5(to_jsonb(m)::text) hash FROM private.race_poker_matches m;
CREATE TEMP TABLE b31_existing_eleven_matches ON COMMIT DROP AS SELECT dealer_game_id,md5(to_jsonb(m)::text) hash FROM private.eleven_up_matches m;
${packageSql}
${cases}
DO $preserve$ BEGIN
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM b31_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'existing balances unchanged');
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM b31_existing_owners b JOIN pg_proc p ON p.oid=b.oid WHERE pg_get_functiondef(b.oid) IS DISTINCT FROM b.definition OR p.proacl IS DISTINCT FROM b.proacl),'released game authority and ACLs unchanged');
 PERFORM pg_temp.b31_assert(NOT EXISTS((TABLE b31_existing_defaults EXCEPT SELECT * FROM public.game_defaults WHERE game_type<>'battle-31') UNION ALL (SELECT * FROM public.game_defaults WHERE game_type<>'battle-31' EXCEPT TABLE b31_existing_defaults)),'existing defaults unchanged');
 PERFORM pg_temp.b31_assert(NOT EXISTS((TABLE b31_existing_race_gate EXCEPT TABLE private.race_poker_release) UNION ALL (TABLE private.race_poker_release EXCEPT TABLE b31_existing_race_gate)),'Race admission unchanged');
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM b31_existing_race_matches b LEFT JOIN private.race_poker_matches m USING(dealer_game_id) WHERE m.dealer_game_id IS NULL OR md5(to_jsonb(m)::text)<>b.hash),'Race matches unchanged');
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM b31_existing_eleven_matches b LEFT JOIN private.eleven_up_matches m USING(dealer_game_id) WHERE m.dealer_game_id IS NULL OR md5(to_jsonb(m)::text)<>b.hash),'11 Up matches unchanged');
END $preserve$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'installedProof',${installed},'financialCases',6,'existingBalancesAndAuthorityPreserved',true,
 'residualUsers',(SELECT count(*) FROM auth.users WHERE id=ANY(${array})),
 'residualPlayers',(SELECT count(*) FROM public.players WHERE user_id=ANY(${array})),
 'residualProfiles',(SELECT count(*) FROM public.profiles WHERE id=ANY(${array})),
 'residualSnapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE user_id=ANY(${array})),
 'battle31Installed',to_regclass('private.battle31_release') IS NOT NULL,
 'failureTriggerExists',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='b31_hosted_failure')) evidence;`;
assert(!/^\s*COMMIT\s*;/im.test(sql));
assert(!/(?:UPDATE|INSERT\s+INTO)\s+private\.game_recovery_dispatch_state/i.test(sql),'Never manufacture hosted health');
const path='qualification.local/battle31/production-'+(installed?'installed':'candidate')+'.sql';
write(path,sql);write(path+'.json',JSON.stringify({installed,users,packageSHA256:meta.packageSHA256,proofSHA256:hash(sql)},null,2));console.log(path);
