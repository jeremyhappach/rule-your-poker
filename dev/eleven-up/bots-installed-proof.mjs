// Build a bounded, rollback-only installed-authority proof; never connects remotely.
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {hash,registeredSql} from './bots-release-package.mjs';
const ids=Array.from({length:9},uuid),array=a=>'ARRAY['+a.map(x=>`'${x}'::uuid`).join(',')+']';
let matrix=read('supabase/multiplayer-money/matrix.sql','utf8').replaceAll('__FAMILY__','eleven_up').replaceAll('__GAME__','eleven-up');
matrix=matrix.replace(/ARRAY\[gen_random_uuid\(\)(?:,gen_random_uuid\(\)){6}\]/,array(ids.slice(0,7))).replace('FOR n IN 2..7 LOOP','FOR n IN 3..3 LOOP').replace("100,'active',false,false,false,true FROM generate_series(1,n)x","100,'active',false,false,x>1 AND NOT real_mode,true FROM generate_series(1,n)x");
const a=matrix.indexOf('  FOR i IN 2..n LOOP'),b=matrix.indexOf('  PERFORM pg_temp.money_assert((SELECT stake=stake_i',a);
if(a<0||b<a)throw Error('Matrix source drift');
matrix=matrix.slice(0,a)+'  IF real_mode THEN\n'+matrix.slice(a,b)+'  ELSE PERFORM public.advance_ante_phase(g,d);END IF;\n'+matrix.slice(b);
matrix=matrix.replace('SELECT * FROM money_evidence;','');
const rollback=read('supabase/eleven-up/rollback-bot-admission.sql','utf8').replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n');
const sql=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE bot_existing_balances ON COMMIT DROP AS SELECT id,chips FROM public.players;
${matrix}
DO $$ DECLARE u uuid:='${ids[7]}';bot uuid:='${ids[8]}';g uuid:=gen_random_uuid();p uuid:=gen_random_uuid();v jsonb;again jsonb;deadline timestamptz:=clock_timestamp()+interval '10 minutes';s jsonb;choice jsonb; BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Bot qualification '||u,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,u,'game_selection',false,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 v:=public.create_session_bot(g,bot,'normal',1,false,false);again:=public.create_session_bot(g,bot,'normal',1,false,false);
 PERFORM pg_temp.money_assert((v#>>'{player,is_bot}')::boolean AND (again->>'deduped')::boolean,'canonical bot and duplicate');
 EXECUTE 'RESET ROLE';
 UPDATE public.games SET real_money=true WHERE id=g;
 BEGIN PERFORM public.eleven_up_configure(g,p,2,'eleven-up','{"ante_amount":7}',deadline);RAISE EXCEPTION 'missing real bot refusal';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'eleven_up:bots_fake_money_only' THEN RAISE;END IF;END;
 UPDATE public.games SET real_money=false WHERE id=g;
 v:=public.eleven_up_configure(g,p,2,'eleven-up','{"ante_amount":7}',deadline);PERFORM public.advance_ante_phase(g,(v#>>'{dealer_game,id}')::uuid);
 SELECT state INTO s FROM private.eleven_up_matches WHERE dealer_game_id=(v#>>'{dealer_game,id}')::uuid;
 s:=private.eleven_up_reduce(s,'tick',NULL,(s->>'deadline')::bigint);
 choice:=private.eleven_up_bot_choice(private.eleven_up_visible(s),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 PERFORM pg_temp.money_assert(choice IS NOT NULL,'legal visible-state decision');
 PERFORM private.eleven_up_reduce(s,choice->>'action',ARRAY(SELECT jsonb_array_elements_text(choice->'items')::integer),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
END $$;
SAVEPOINT admission_rollback;
${rollback}
DO $$ BEGIN
 PERFORM pg_temp.money_assert(position('eleven_up:bots_not_supported' IN pg_get_functiondef('private.megatouch_begin(uuid,uuid)'::regprocedure))>0,'rollback consent guard');
 PERFORM pg_temp.money_assert(position('private.eleven_up_bot_choice' IN pg_get_functiondef('private.eleven_up_recover()'::regprocedure))>0,'rollback preserves bot recovery');
END $$;
ROLLBACK TO admission_rollback;
DO $$ BEGIN
 PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM bot_existing_balances b LEFT JOIN public.players p USING(id) WHERE p.id IS NULL OR p.chips IS DISTINCT FROM b.chips),'existing balances unchanged');
 PERFORM pg_temp.money_assert((SELECT count(*)=6 FROM money_evidence),'six bounded installed financial cases');
END $$;
ROLLBACK;
SELECT jsonb_build_object('passed',true,'financial_cases',6,'existing_balances_unchanged',true,'residual_users',(SELECT count(*) FROM auth.users WHERE id=ANY(${array(ids)})),'residual_profiles',(SELECT count(*) FROM public.profiles WHERE id=ANY(${array(ids)})),'residual_players',(SELECT count(*) FROM public.players WHERE user_id=ANY(${array(ids)})),'residual_snapshots',(SELECT count(*) FROM public.session_player_snapshots WHERE user_id=ANY(${array(ids)}))) evidence;
`;
if(/^\s*COMMIT\s*;/im.test(sql)||/UPDATE private\.(?:game_recovery_dispatch_state|eleven_up_release)/i.test(sql))throw Error('Uncontained proof');
write('qualification.local/eleven-up-bots/installed-proof.sql',sql);console.log({sha256:hash(sql),ids});
if(process.argv.includes('--candidate')){
 const preflight=JSON.parse(read('qualification.local/eleven-up-bots/production-preflight.json','utf8'));
 const guard='DO $guard$ BEGIN '+preflight.functions.map(f=>`IF md5(pg_get_functiondef('${f.signature}'::regprocedure))<>'${f.md5}' THEN RAISE EXCEPTION '11_up_preflight_drift';END IF;`).join('\n')+' END $guard$;';
 const body=registeredSql().replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'\n');
 // A callback preserves SQL $$; a replacement string interprets $$ as one $.
 const candidate=sql.replace('CREATE TEMP TABLE bot_existing_balances',()=>guard+'\n'+body+'\nCREATE TEMP TABLE bot_existing_balances');
 if(!candidate.includes(body)||/^\s*COMMIT\s*;/im.test(candidate))throw Error('Candidate proof assembly changed migration bytes or containment');
 write('qualification.local/eleven-up-bots/candidate-production-proof.sql',candidate);
 console.log({candidateSha256:hash(candidate)});
}
