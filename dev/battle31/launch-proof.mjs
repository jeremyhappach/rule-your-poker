import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const users=Array.from({length:3},randomUUID), array='ARRAY['+users.map(u=>`'${u}'::uuid`).join(',')+']';
const installed=process.argv.includes('--installed');
const migration=read('supabase/migrations/20261025192500_battle31_play_money_launch.sql','utf8');
let cases=read('dev/battle31/production-cases.sql','utf8').replace('__USERS__',array)
 .replace('ARRAY[false,true]','ARRAY[false]')
 .replace('fake_qualified=money,real_qualified=NOT money','fake_qualified=false,real_qualified=false')
 .replace('fake_qualified=NOT money,real_qualified=money','fake_qualified=true,real_qualified=false');
cases=cases.replace("PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE enabled OR admission_enabled OR fake_qualified OR real_qualified),'installed admission closed');",'');
const lifecycle=read('dev/battle31/launch-lifecycle.sql','utf8').replace('__USERS__',array);
const preserve=`CREATE TEMP TABLE b31_launch_owners AS SELECT oid,pg_get_functiondef(oid) definition,proacl FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND prokind='f';
CREATE TEMP TABLE b31_launch_players AS SELECT id,to_jsonb(p) data FROM public.players p;
CREATE TEMP TABLE b31_launch_games AS SELECT id,to_jsonb(g) data FROM public.games g;
CREATE TEMP TABLE b31_launch_results AS SELECT id,to_jsonb(r) data FROM public.game_results r;
CREATE TEMP TABLE b31_launch_batches AS SELECT id,to_jsonb(b) data FROM public.gameplay_transfer_batches b;`;
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='90s';
${preserve}
${installed?'':migration}
SAVEPOINT qualified;
${cases}
${lifecycle}
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM b31_launch_players b LEFT JOIN public.players p USING(id) WHERE b.data IS DISTINCT FROM to_jsonb(p)) OR EXISTS(SELECT 1 FROM b31_launch_games b LEFT JOIN public.games g USING(id) WHERE b.data IS DISTINCT FROM to_jsonb(g)) OR EXISTS(SELECT 1 FROM b31_launch_results b LEFT JOIN public.game_results r USING(id) WHERE b.data IS DISTINCT FROM to_jsonb(r)) THEN RAISE EXCEPTION 'launch:historical_data_changed';END IF;
 IF EXISTS(SELECT 1 FROM b31_launch_owners b JOIN pg_proc p USING(oid) WHERE p.oid<>'private.pause_all_humans_auto_fold(uuid)'::regprocedure AND (b.definition<>pg_get_functiondef(p.oid) OR b.proacl IS DISTINCT FROM p.proacl)) THEN RAISE EXCEPTION 'launch:unrelated_owner_changed';END IF;
 IF EXISTS(SELECT 1 FROM b31_launch_batches b LEFT JOIN public.gameplay_transfer_batches t USING(id) WHERE b.data IS DISTINCT FROM to_jsonb(t)) THEN RAISE EXCEPTION 'launch:historical_ledger_changed';END IF;
END $$;
ROLLBACK TO SAVEPOINT qualified;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'installed',${installed},'financialCases',3,'autonomousTopologies',2,'residualUsers',(select count(*) from auth.users where id=ANY(${array}))) evidence;`;
const path='qualification.local/battle31/launch-'+(installed?'installed':'candidate')+'.sql';write(path,sql);
write(path+'.json',JSON.stringify({sha256:createHash('sha256').update(sql).digest('hex'),users},null,2));console.log(path);
