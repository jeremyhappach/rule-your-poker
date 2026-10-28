-- Isolated rollback fixture: real configure/consent and exact Run Back admission.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()]; ids uuid[];
 g uuid; d uuid; successor uuid; deadline timestamptz; r jsonb; pacing jsonb; mode_i text;
BEGIN
 UPDATE private.canasta_release SET enabled=true,admission_enabled=true;
 UPDATE private.canasta_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 UPDATE cron.job SET active=true WHERE jobname='canasta-recovery';
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed',consecutive_partial_failures=0 WHERE singleton;
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Canasta pacing proof '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH mode_i IN ARRAY ARRAY['beginner','expert'] LOOP
  UPDATE public.game_defaults SET canasta_mode=mode_i,decision_timer_seconds=90 WHERE game_type='canasta';
  pacing:=private.canasta_pacing_defaults();
  ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];g:=gen_random_uuid();deadline:=clock_timestamp()+interval '120 seconds';
  PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline) VALUES(g,'game_selection',false,1,0,false,deadline);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   SELECT ids[i],g,users[i],i,100,false,'active',false,false FROM generate_series(1,2) i;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  r:=public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10,"experience":{"turnMs":1}}',deadline);d:=(r#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.canasta_assert(r#>'{dealer_game,config,experience}'=pacing,'configure freezes trusted defaults, ignoring client pacing');
  UPDATE public.game_defaults SET canasta_mode=CASE WHEN mode_i='beginner' THEN 'expert' ELSE 'beginner' END,decision_timer_seconds=150 WHERE game_type='canasta';
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[2])::text,true);
  r:=public.submit_ante_decision(g,d,ids[2],'ante_up',NULL,NULL);
  PERFORM pg_temp.canasta_assert(r#>>'{phase,outcome}'='advanced','real shared ante dispatcher starts match');
  PERFORM pg_temp.canasta_assert((SELECT state->'config'=pacing FROM private.canasta_matches WHERE dealer_game_id=d),'begin uses admission snapshot after defaults change');
  -- Only the source terminal marker is synthetic here. Financial completion is
  -- exercised separately by proof.sql against the same candidate functions.
  UPDATE private.canasta_matches SET finished=true,settlement='{"qualification":true}' WHERE dealer_game_id=d;
  PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  deadline:=clock_timestamp()+interval '120 seconds';
  UPDATE public.games SET status='game_selection',current_game_uuid=NULL,config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL WHERE id=g;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  BEGIN
   PERFORM public.canasta_configure(g,ids[1],1,'canasta',jsonb_build_object('ante_amount',11,'runBackDealerGameId',d),deadline);
   RAISE EXCEPTION 'missing Run Back stake fence';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:run_back_identity' THEN RAISE;END IF;END;
  BEGIN
   PERFORM public.canasta_configure(g,ids[1],1,'canasta',jsonb_build_object('ante_amount',10,'runBackDealerGameId',gen_random_uuid()),deadline);
   RAISE EXCEPTION 'missing Run Back source fence';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:run_back_identity' THEN RAISE;END IF;END;
  r:=public.canasta_configure(g,ids[1],1,'canasta',jsonb_build_object('ante_amount',10,'runBackDealerGameId',d),deadline);successor:=(r#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.canasta_assert(successor<>d AND r#>'{dealer_game,config,experience}'=pacing,'Run Back preserves exact prior mode and budget');
  PERFORM pg_temp.canasta_assert((SELECT ante_decision IS NULL FROM public.players WHERE id=ids[2]),'Run Back requires fresh opponent consent');
  PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=successor),'Run Back has no match before consent');
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[2])::text,true);
  r:=public.submit_ante_decision(g,successor,ids[2],'ante_up',NULL,NULL);
  PERFORM pg_temp.canasta_assert(r#>>'{phase,outcome}'='advanced' AND (SELECT state->'config'=pacing FROM private.canasta_matches WHERE dealer_game_id=successor),'Run Back consent starts with frozen pacing');
 END LOOP;
 UPDATE private.canasta_release SET admission_enabled=false;
END $$;
SELECT 'Canasta actual admission and Run Back pacing passed' AS proof;
