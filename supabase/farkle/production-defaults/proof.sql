-- Run in BEGIN/ROLLBACK after the candidate seed; never commit these fixtures.
CREATE TEMP TABLE farkle_defaults_proof_log(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.check_farkle_defaults(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_defaults_proof:%',label; END IF;
INSERT INTO farkle_defaults_proof_log VALUES(label); END $f$;
DO $proof$
DECLARE r jsonb; d public.game_defaults; cfg jsonb; state jsonb; n integer; face integer; expected integer; delay numeric;
admin_id uuid; peer_id uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
deadline timestamptz:=clock_timestamp()+interval '15 minutes'; response jsonb; dg uuid; denied boolean; g public.games;
BEGIN
 SELECT * INTO STRICT d FROM public.game_defaults WHERE game_type='farkle'; r:=d.farkle_rules->'scoring';
 PERFORM pg_temp.check_farkle_defaults(d.points_to_win=10000 AND d.farkle_rules='{"scoring":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500},"endgame":"equal_turns","botPolicy":"balanced","botBankThreshold":500}'::jsonb,'all approved defaults exact');
 PERFORM pg_temp.check_farkle_defaults(d.decision_timer_seconds=10 AND d.bot_decision_delay_seconds=2,'inherited platform timing');
 PERFORM pg_temp.check_farkle_defaults((SELECT admin_only AND creation_enabled AND production_defaults_approved FROM private.farkle_release),'admin only release');
 PERFORM private.farkle_validate_rules_v1(r);
 FOR face IN 1..6 LOOP
   FOR n IN 3..6 LOOP
     expected:=(r->'ofAKind'->n::text->>(face-1))::integer;
     IF face=1 AND n=4 THEN expected:=1100; END IF;
     PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(array_fill(face,ARRAY[n]),r)=expected,n||' kind face '||face);
   END LOOP;
 END LOOP;
 PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(ARRAY[1],r)=100 AND private.farkle_score_v1(ARRAY[5],r)=50,'singles');
 PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(ARRAY[1,2,3,4,5,6],r)=1500,'straight');
 PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(ARRAY[2,2,3,3,4,4],r)=1500,'three pairs');
 PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(ARRAY[2,2,2,3,3,3],r)=2500,'two triplets');
 PERFORM pg_temp.check_farkle_defaults(private.farkle_score_v1(ARRAY[2,2,2,2,3,3],r)=1500,'four plus pair');
 SELECT user_id INTO STRICT admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO STRICT peer_id FROM public.profiles WHERE NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO public.games(id,name,status,game_type,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: approved Farkle defaults proof','game_selection',NULL,admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false,false),(b,gid,peer_id,3,100,'active',false,false);
 SELECT * INTO g FROM public.games WHERE id=gid;
 FOREACH delay IN ARRAY ARRAY[0.1,2.0,2.5,99.9]::numeric[] LOOP
   UPDATE public.game_defaults SET bot_decision_delay_seconds=delay WHERE game_type='farkle';
   cfg:=private.farkle_resolve_config_v1(g,'{"ante_amount":1,"targetScore":10000,"endgame":"equal_turns"}');
   PERFORM pg_temp.check_farkle_defaults((cfg->>'botDelayMs') ~ '^[1-9][0-9]*$'
     AND (cfg->>'botDelayMs')::numeric=delay*1000,'exact integer milliseconds for '||delay);
 END LOOP;
 UPDATE public.game_defaults SET bot_decision_delay_seconds=d.bot_decision_delay_seconds WHERE game_type='farkle';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peer_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',peer_id::text,true);
 UPDATE public.games SET dealer_position=3 WHERE id=gid;
 denied:=false; BEGIN
 PERFORM public.configure_dealer_game(gid,b,3,'farkle','{"ante_amount":1,"targetScore":10000,"endgame":"equal_turns"}',deadline);
 EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:admin_only'; END;
 PERFORM pg_temp.check_farkle_defaults(denied,'nonadmin dealer rejected by canonical RPC');
 UPDATE public.games SET dealer_position=4 WHERE id=gid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 response:=public.configure_dealer_game(gid,a,4,'farkle','{"ante_amount":1,"targetScore":10000,"endgame":"equal_turns"}',deadline);
 dg:=(response->'dealer_game'->>'id')::uuid;
 SELECT config INTO STRICT cfg FROM public.dealer_games WHERE id=dg;
 PERFORM pg_temp.check_farkle_defaults(cfg->'rules'=r AND cfg->>'testOnly'='false' AND cfg->>'targetScore'='10000' AND cfg->>'endgame'='equal_turns'
 AND cfg->>'botPolicy'='balanced' AND cfg->>'botBankThreshold'='500' AND cfg->>'turnSeconds'='10' AND (cfg->>'botDelayMs')::numeric=2000,'canonical production snapshot exact');
 response:=public.configure_dealer_game(gid,a,4,'farkle','{"ante_amount":1,"targetScore":10000,"endgame":"equal_turns"}',deadline);
 PERFORM pg_temp.check_farkle_defaults(response->>'deduped'='true','duplicate configuration harmless');
 denied:=false; BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{rules,singles,1}','999') WHERE id=dg;
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.check_farkle_defaults(denied,'snapshot immutable');
 UPDATE public.game_defaults SET farkle_rules=jsonb_set(farkle_rules,'{scoring,singles,1}','999') WHERE game_type='farkle';
 PERFORM pg_temp.check_farkle_defaults((SELECT config=cfg FROM public.dealer_games WHERE id=dg),'later defaults cannot change frozen rules');
 UPDATE public.game_defaults SET farkle_rules=d.farkle_rules WHERE game_type='farkle';
 PERFORM pg_temp.check_farkle_defaults(private.farkle_resolve_config_v1(g,jsonb_build_object('ante_amount',1,'runBackDealerGameId',dg))=cfg,'run back uses exact frozen snapshot');
 state:=private.farkle_new_state_v1(jsonb_build_array(a,b),cfg,gen_random_uuid());
 state:=private.farkle_reduce_v1(state,'roll','[]',ARRAY[1,2,3,4,6,2]);
 state:=private.farkle_reduce_v1(state,'hold','[0]');
 state:=private.farkle_reduce_v1(state,'roll','[]',ARRAY[1,1,2,3,4]);
 denied:=false; BEGIN PERFORM private.farkle_reduce_v1(state,'hold','[0,1,2]'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:non_scoring_selection'; END;
 PERFORM pg_temp.check_farkle_defaults(denied,'prior roll cannot join current selection');
 state:=private.farkle_reduce_v1(state,'hold','[1,2]');
 PERFORM pg_temp.check_farkle_defaults(state->>'thisTurn'='300','ones across rolls remain singles');
 state:=private.farkle_reduce_v1(state,'bank','[]');
 PERFORM pg_temp.check_farkle_defaults(state->'playerStates'->a::text->>'banked'='300','no entry minimum');
END $proof$;
SELECT count(*) AS assertions,jsonb_agg(label ORDER BY label) AS passed FROM farkle_defaults_proof_log;
