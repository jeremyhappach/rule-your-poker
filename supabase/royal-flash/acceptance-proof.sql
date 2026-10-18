-- Append to proof.sql inside BEGIN/ROLLBACK. Synthetic identities only.
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 p uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';
 v jsonb;s jsonb;history jsonb;rev bigint;i integer;j integer;steps integer:=0;before_records jsonb;
BEGIN
 SELECT jsonb_build_array(
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY run_id),'[]') FROM private.arcade_results r WHERE game<>'royal-flash'),
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY dealer_game_id,player_id),'[]') FROM private.multiplayer_score_results r WHERE game<>'royal-flash')) INTO before_records;
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(u[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Royal acceptance '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,offer,0,false,false);
 FOR i IN 1..2 LOOP
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,ante_decision) VALUES(p[i],g,u[i],3-i,100,false,'ante_up');
 END LOOP;
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,sitting_out) VALUES(p[3],g,u[3],NULL,0,false,true);
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 v:=public.royal_flash_configure(g,p[1],2,'royal-flash','{"ante_amount":9}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.royal_assert((SELECT ante_decision IS NULL FROM public.players WHERE id=p[2]),'new stake offer clears old consent');
 PERFORM public.advance_ante_phase(g,d);
 PERFORM pg_temp.royal_assert(NOT EXISTS(SELECT 1 FROM private.royal_flash_matches WHERE dealer_game_id=d),'human must explicitly accept current offer');
 BEGIN PERFORM public.royal_flash_configure(g,p[1],2,'royal-flash','{"ante_amount":10}',offer);RAISE EXCEPTION 'changed offer accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'royal_flash:setup_replay_conflict' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',u[2]::text,true);
 PERFORM public.submit_ante_decision(g,d,p[2],'ante_up');PERFORM public.advance_ante_phase(g,d);
 PERFORM pg_temp.royal_assert((SELECT stake=9 AND state#>>'{rules,version}'='royal-flash/1' FROM private.royal_flash_matches WHERE dealer_game_id=d),'accepted frozen stake and version');
 PERFORM set_config('request.jwt.claim.sub',u[3]::text,true);
 v:=public.royal_flash_snapshot(d);
 PERFORM pg_temp.royal_assert(NOT (v->>'canAct')::boolean AND NOT(v?'deck') AND NOT(v?'cursor'),'spectator sees only public board without actions');
 BEGIN PERFORM public.royal_flash_action(d,gen_random_uuid(),(v->>'revision')::bigint,'place',ARRAY[0]);RAISE EXCEPTION 'spectator acted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 LOOP
  SELECT state,revision INTO s,rev FROM private.royal_flash_matches WHERE dealer_game_id=d;
  EXIT WHEN s->>'phase'='complete';steps:=steps+1;IF steps>12 THEN RAISE EXCEPTION 'progression stuck';END IF;
  PERFORM set_config('request.jwt.claim.sub',s->'players'->(s->>'turnIndex')::integer->>'userId',true);
  -- Advance only synthetic clocks; actions and scoring still use the actual RPC/core.
  IF s->>'phase'='stage_complete' THEN
   UPDATE private.royal_flash_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=d;
   PERFORM public.royal_flash_action(d,gen_random_uuid(),rev,'continue');
  ELSE
   UPDATE private.royal_flash_matches SET state=state||jsonb_build_object('phase','ready','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+20000) WHERE dealer_game_id=d;
   FOR j IN 0..CASE WHEN s->>'stage'='1' THEN 24 ELSE 0 END LOOP
    v:=public.royal_flash_action(d,gen_random_uuid(),rev,'place',ARRAY[j]);rev:=(v->>'revision')::bigint;
   END LOOP;
   PERFORM public.royal_flash_action(d,gen_random_uuid(),rev,'take_score');
  END IF;
 END LOOP;
 PERFORM pg_temp.royal_assert((SELECT count(*)=2 FROM private.multiplayer_score_results WHERE dealer_game_id=d AND ruleset='royal-flash/1'),'exactly one v1 record per human participant');
 PERFORM pg_temp.royal_assert(NOT EXISTS(SELECT 1 FROM private.multiplayer_score_results r WHERE dealer_game_id=d AND score IS DISTINCT FROM (s->'scores'->>player_id::text)::bigint),'final cumulative score recorded once');
 PERFORM pg_temp.royal_assert(NOT EXISTS(SELECT 1 FROM private.multiplayer_score_results r WHERE dealer_game_id=d AND score IS DISTINCT FROM (SELECT sum((x->>'stageScore')::bigint) FROM jsonb_array_elements(s->'stages')x WHERE x->>'playerId'=r.player_id::text)),'record equals sum of round contributions, not cumulative totals');
 PERFORM private.royal_flash_record_scores(d);
 PERFORM pg_temp.royal_assert((SELECT count(*)=2 FROM private.multiplayer_score_results WHERE dealer_game_id=d),'record replay immutable');
 PERFORM set_config('request.jwt.claim.sub',u[3]::text,true);history:=public.royal_flash_history(d);
 PERFORM pg_temp.royal_assert(jsonb_array_length(history)>4 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(history)x WHERE x->'frame'?'deck' OR x->'frame'?'cursor'),'spectator history is persisted and private stock stays hidden');
 PERFORM pg_temp.royal_assert(before_records=jsonb_build_array(
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY run_id),'[]') FROM private.arcade_results r WHERE game<>'royal-flash'),
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY dealer_game_id,player_id),'[]') FROM private.multiplayer_score_results r WHERE game<>'royal-flash')),'all other games records unchanged');
END $$;
SELECT 'Royal Flash consent, observer, history and record acceptance proof passed' AS proof;
