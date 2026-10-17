-- Rollback-contained production proof, synthetic UUIDs only; real triggers stay enabled.
DO $$
DECLARE a uuid;b uuid;pa uuid;pb uuid;g uuid;d uuid;dealer_player uuid;dealer_user uuid;dealer_seat integer;outsider uuid:=gen_random_uuid();setup jsonb;s jsonb;v jsonb;req uuid;rev bigint;case_i integer;expected_a integer;expected_b integer;deadline timestamptz;score_a integer;score_b integer;
BEGIN
 UPDATE private.tri_towers_release SET celebration_enabled=true WHERE singleton;
 FOR case_i IN 1..3 LOOP
  SET CONSTRAINTS ALL DEFERRED;
  a:=gen_random_uuid();b:=gen_random_uuid();pa:=gen_random_uuid();pb:=gen_random_uuid();g:=gen_random_uuid();req:=gen_random_uuid();deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO auth.users(id) VALUES(a),(b);
  INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Tri proof '||a::text,true),(b,'Tri proof '||b::text,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(pa,g,a,2,100,false),(pb,g,b,1,110,false);
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  setup:=public.tri_towers_configure(g,pa,2,'tri-towers','{"ante_amount":5}',deadline);d:=(setup#>>'{dealer_game,id}')::uuid;
  ASSERT (public.tri_towers_configure(g,pa,2,'tri-towers','{"ante_amount":5}',deadline)->>'deduped')::boolean,'setup duplicate';
  BEGIN PERFORM public.tri_towers_close(d);RAISE EXCEPTION 'early close accepted';EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='tri_towers:close_denied';END;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN PERFORM public.tri_towers_present_celebration(d);RAISE EXCEPTION 'outsider read accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  BEGIN PERFORM public.tri_towers_present_scene(d);RAISE EXCEPTION 'old scene admitted v4';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='TriTowers updated. Refresh to continue.';END;
  -- Only this synthetic match is positioned at Ready for immutable command receipt checks.
  UPDATE private.tri_towers_matches SET state=jsonb_set(jsonb_set(state,'{phase}','"ready"'),'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+30000)) WHERE dealer_game_id=d;
  SELECT revision INTO rev FROM private.tri_towers_matches WHERE dealer_game_id=d;
  v:=public.tri_towers_present_celebration(d,req,rev,'draw');
  ASSERT public.tri_towers_present_celebration(d,req,rev,'draw')->>'revision'=v->>'revision','duplicate command';
  BEGIN PERFORM public.tri_towers_present_celebration(d,req,rev,'take_score');RAISE EXCEPTION 'conflicting receipt';EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='tri_towers:replay_conflict';END;
  SELECT state INTO s FROM private.tri_towers_matches WHERE dealer_game_id=d;
  score_a:=CASE WHEN case_i=2 THEN 10 ELSE 30 END;score_b:=CASE WHEN case_i=1 THEN 10 ELSE 30 END;
  expected_a:=CASE case_i WHEN 1 THEN 105 WHEN 2 THEN 95 ELSE 100 END;expected_b:=210-expected_a;
  UPDATE public.games SET pending_session_end=(case_i=3) WHERE id=g;
  UPDATE private.tri_towers_matches SET state=s||jsonb_build_object('phase','complete','turnIndex',2,'deadline',0,'scores',jsonb_build_object(pa::text,score_a,pb::text,score_b)) WHERE dealer_game_id=d;
  PERFORM private.tri_towers_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
  ASSERT (SELECT chips FROM public.players WHERE id=pa)=expected_a AND (SELECT chips FROM public.players WHERE id=pb)=expected_b,'exact canonical chip deltas';
  ASSERT (SELECT count(*) FROM public.game_results WHERE dealer_game_id=d)=1,'one immutable result';
  ASSERT (SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id=d)=2,'both final snapshots';
  ASSERT NOT EXISTS(SELECT 1 FROM public.session_player_snapshots x JOIN public.players p ON p.id=x.player_id WHERE x.dealer_game_id=d AND x.chips<>p.chips),'snapshots equal canonical chips';
  ASSERT (SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id=d)=CASE WHEN case_i=3 THEN 0 ELSE 1 END,'one balanced transfer or tied zero';
  ASSERT NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d AND unmatched_deltas<>'{}'::jsonb),'balanced ledger';
  PERFORM private.tri_towers_settle(d);PERFORM private.tri_towers_settle(d);
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  PERFORM public.tri_towers_close(d);PERFORM public.tri_towers_close(d);
  ASSERT (SELECT status FROM public.games WHERE id=g)=CASE WHEN case_i=3 THEN 'session_ended' ELSE 'game_selection' END,'continuation/terminal disposition';
  IF case_i<>3 THEN
   SELECT p.id,p.user_id,p.position INTO dealer_player,dealer_user,dealer_seat FROM public.players p JOIN public.games x ON x.id=p.game_id WHERE x.id=g AND p.position=x.dealer_position;
   PERFORM set_config('request.jwt.claim.sub',dealer_user::text,true);
   setup:=public.tri_towers_configure(g,dealer_player,dealer_seat,'tri-towers','{"ante_amount":5}',(SELECT config_deadline FROM public.games WHERE id=g));
   ASSERT setup#>>'{dealer_game,id}'<>d::text,'successor identity';
  END IF;
  PERFORM private.tri_towers_settle(d);PERFORM public.tri_towers_close(d);
  ASSERT (SELECT chips FROM public.players WHERE id=pa)=expected_a AND (SELECT chips FROM public.players WHERE id=pb)=expected_b,'late replay cannot pay again';
  ASSERT (SELECT count(*) FROM public.game_results WHERE dealer_game_id=d)=1,'late replay one result';
 END LOOP;
END $$;
