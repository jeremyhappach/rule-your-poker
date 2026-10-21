// Build auditable rollback-only payloads. No remote connections or persisted fixtures.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const base='qualification.local/eleven-up-bots/';
const original=read('supabase/migrations/20261021002901_eleven_up_bots.sql','utf8');
const forward=read('supabase/migrations/20261021181947_eleven_up_human_ready.sql','utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(original),'dcea1133d1df64b755b5c492ea8923d74bdea38ba050184f1463e5c9da22387d');
assert.equal(hash(forward),'6a17ff25e9bf8f611d4f969ec9f5c1fd9d8d677032582a5b33ef21750552e507');
const body=s=>s.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const ids=Array.from({length:6},randomUUID),array="ARRAY["+ids.map(x=>`'${x}'::uuid`).join(',')+"]";
const controls=`DO $controls$
DECLARE real_mode boolean; u uuid[]:=${array}; people uuid[]; g uuid; d uuid; p uuid; who uuid;
 m private.eleven_up_matches; before_state jsonb; old_revision bigint; deadline timestamptz; v jsonb; i integer; offset_i integer;
BEGIN
 FOREACH real_mode IN ARRAY ARRAY[true,false] LOOP
  offset_i:=CASE WHEN real_mode THEN 0 ELSE 3 END; g:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  FOR i IN 1..3 LOOP
   INSERT INTO auth.users(id) VALUES(u[offset_i+i]);
   INSERT INTO public.profiles(id,username,is_active) VALUES(u[offset_i+i],'Ready qualification '||u[offset_i+i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
  END LOOP;
  deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
  VALUES(g,u[offset_i+1],'game_selection',real_mode,3,deadline,0,false,false);
  FOR i IN 1..3 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   VALUES(people[i],g,u[offset_i+i],4-i,100,false,'active',false,false);END LOOP;
  PERFORM set_config('request.jwt.claim.sub',u[offset_i+1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[offset_i+1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v:=public.eleven_up_configure(g,people[1],3,'eleven-up','{"ante_amount":7}',deadline);d:=(v#>>'{dealer_game,id}')::uuid;
  EXECUTE 'RESET ROLE';
  FOR i IN 2..3 LOOP
   PERFORM set_config('request.jwt.claim.sub',u[offset_i+i]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[offset_i+i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(g,d,people[i],'ante_up');EXECUTE 'RESET ROLE';
  END LOOP;
  UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;
  UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-100)),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  p:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;SELECT user_id INTO who FROM public.players WHERE id=p;
  PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;PERFORM 1 FROM public.games WHERE id=g FOR UPDATE;
  PERFORM 1 FROM private.eleven_up_matches WHERE dealer_game_id=d FOR UPDATE;
  PERFORM pg_temp.money_assert(private.eleven_up_ready_timeout(d),'Ready timeout handled');
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert((SELECT is_paused=real_mode FROM public.games WHERE id=g),'money mode pause distinction');
  PERFORM pg_temp.money_assert(m.state->>'phase'=CASE WHEN real_mode THEN 'ready' ELSE 'playing' END,'Ready preserves real / fake strategic first move');
  IF NOT real_mode THEN
   PERFORM pg_temp.money_assert((SELECT auto_fold AND sit_out_next_hand AND NOT sitting_out FROM public.players WHERE id=p),'persistent flags');
   before_state:=m.state;old_revision:=m.revision;
   UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
   PERFORM pg_temp.money_assert(NOT private.pause_all_humans_auto_fold(g),'all-human inactivity cannot pause scoring');
   SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
   PERFORM set_config('request.jwt.claim.sub',who::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.eleven_up_reclaim(d,m.revision);EXECUTE 'RESET ROLE';
   SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.money_assert(m.state=before_state AND m.bot_due_at IS NULL AND m.revision>old_revision,'reclaim invalidates bot work without clock/state change');
   PERFORM pg_temp.money_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=p),'reclaim clears both flags');
   -- Reach the next canonical Ready boundary with the unchanged rule reducer.
   FOR i IN 1..3 LOOP UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;END LOOP;
   UPDATE public.games SET timeout_enforcement_enabled=false,timeout_action='none' WHERE id=g;
   UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
   PERFORM pg_temp.money_assert(private.pause_all_humans_auto_fold(g),'false/none all-human Ready safeguard');
  END IF;
 END LOOP;
END $controls$;
`;
const preflight=JSON.parse(read(base+'production-preflight.json','utf8'));
const guard='DO $parity$ BEGIN '+[...preflight.functions,...preflight.ready_dependencies].map(f=>`IF md5(pg_get_functiondef('${f.signature}'::regprocedure))<>'${f.md5}' THEN RAISE EXCEPTION 'combined_preflight_drift';END IF;`).join('\n')+' END $parity$;';
const preservation=`CREATE TEMP TABLE combined_preserved ON COMMIT DROP AS SELECT oid,pg_get_functiondef(oid) definition FROM pg_proc WHERE proname LIKE 'race_poker%';
CREATE TEMP TABLE combined_defaults ON COMMIT DROP AS SELECT * FROM public.game_defaults;
CREATE TEMP TABLE combined_race_admission ON COMMIT DROP AS SELECT * FROM private.race_poker_release;
`;
const check=`DO $preserve$ BEGIN
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM combined_preserved WHERE pg_get_functiondef(oid) IS DISTINCT FROM definition),'Race authority unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS((TABLE public.game_defaults EXCEPT TABLE combined_defaults) UNION ALL (TABLE combined_defaults EXCEPT TABLE public.game_defaults)),'global defaults unchanged');
 PERFORM pg_temp.money_assert(NOT EXISTS((TABLE private.race_poker_release EXCEPT TABLE combined_race_admission) UNION ALL (TABLE combined_race_admission EXCEPT TABLE private.race_poker_release)),'Race admission unchanged');END $preserve$;
`;
let installed=read(base+'installed-proof.sql','utf8').replace('CREATE TEMP TABLE bot_existing_balances',()=>preservation+'CREATE TEMP TABLE bot_existing_balances').replace('SAVEPOINT admission_rollback;',()=>controls+check+'SAVEPOINT admission_rollback;');
installed+=`\nSELECT jsonb_build_object('ready_controls_passed',true,'residual_ready_users',(SELECT count(*) FROM auth.users WHERE id=ANY(${array})),'residual_ready_profiles',(SELECT count(*) FROM public.profiles WHERE id=ANY(${array})),'residual_ready_players',(SELECT count(*) FROM public.players WHERE user_id=ANY(${array}))) ready_evidence;\n`;
const candidate=installed.replace('CREATE TEMP TABLE bot_existing_balances',()=>guard+'\n'+body(original)+'\n'+body(forward)+'\nCREATE TEMP TABLE bot_existing_balances');
// The rollout closes admission. Enable it only in this rollback transaction so
// synthetic configure calls exercise the installed owner; other sessions still
// see the committed closed gate. Never commit this fixture allowance.
installed=installed.replace('CREATE TEMP TABLE bot_existing_balances',()=>"UPDATE private.eleven_up_release SET admission_enabled=true WHERE singleton;\nCREATE TEMP TABLE bot_existing_balances");
for(const [name,sql] of [['combined-candidate',candidate],['combined-installed',installed]]){
 assert(!/^\s*COMMIT\s*;/im.test(sql));write(base+name+'.sql',sql);console.log({name,sha256:hash(sql)});
}
