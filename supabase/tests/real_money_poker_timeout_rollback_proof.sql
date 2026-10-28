-- Composed inside BEGIN/ROLLBACK by build-real-money-poker-timeout-proof.mjs.
-- Only generated fixtures are changed, including temporary real-money mode.
-- Three-human fixtures distinguish first timeout from last-present-human pause.
CREATE OR REPLACE FUNCTION pg_temp.three_human_timeout_fixture(kind text)
RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE f jsonb; g uuid; d uuid; r uuid; u uuid[]; p uuid; result jsonb; i integer;
BEGIN
 IF kind='holm' THEN
  f:=pg_temp.auto_fold_fixture(kind);
  UPDATE public.players SET status='active',sitting_out=false
   WHERE id=(f->>'p3')::uuid;
  INSERT INTO public.player_cards(player_id,round_id,cards)
   VALUES((f->>'p3')::uuid,(f->>'round')::uuid,
    '[{"rank":"6","suit":"♣"},{"rank":"6","suit":"♥"},{"rank":"8","suit":"♠"},{"rank":"10","suit":"♦"}]'::jsonb);
  RETURN f;
 END IF;
 SELECT array_agg(id ORDER BY id) INTO u FROM (
  SELECT id FROM public.profiles WHERE EXISTS(SELECT 1 FROM auth.users a WHERE a.id=profiles.id)
   AND coalesce(is_active,true) AND NOT coalesce(is_superuser,false)
   AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 3) q;
 g:=gen_random_uuid(); d:=gen_random_uuid();
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);
 INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,
  ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,current_round,pot,real_money,
  timeout_enforcement_enabled,timeout_action)
 VALUES(g,'Rollback proof: three-human timeout','ante_decision','3-5-7',d,u[1],1,1,1,1,3,0,NULL,0,false,true,'auto_fold');
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,u[1],'3-5-7');
 f:=jsonb_build_object('game',g,'dealer',d);
 FOR i IN 1..3 LOOP
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
   VALUES(g,u[i],i,100,'active',false,false,'ante_up') RETURNING id INTO p;
  f:=f||jsonb_build_object('p'||i,p,'u'||i,u[i]);
 END LOOP;
 result:=public.three_five_seven_begin_game(g); r:=(result->>'round_id')::uuid;
 PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
 RETURN f||jsonb_build_object('round',r);
END $fixture$;

DO $proof$
DECLARE f jsonb; g uuid; d uuid; r uuid; p uuid; result jsonb; before_money jsonb;
 version bigint; kind text; before_context jsonb;
BEGIN
 -- First timeout among three humans must enable auto-fold and continue.
 FOREACH kind IN ARRAY ARRAY['holm','357'] LOOP
  f:=pg_temp.three_human_timeout_fixture(kind); g:=(f->>'game')::uuid;
  d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid; p:=(f->>'p1')::uuid;
  UPDATE public.games SET real_money=true WHERE id=g;
  IF kind='357' THEN
   -- Deliberate folds count as present; only p1 has no decision at expiry.
   PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
   result:=public.three_five_seven_submit_decision(g,r,d,1,1,(f->>'p2')::uuid,'fold');
   PERFORM set_config('request.jwt.claim.sub',f->>'u3',true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u3','role','authenticated')::text,true);
   result:=public.three_five_seven_submit_decision(g,r,d,1,1,(f->>'p3')::uuid,'fold');
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
  IF kind='holm' THEN result:=public.holm_apply_deadline_decision(g,r,p,'fold',true);
  ELSE result:=private.three_five_seven_recover_game(g); END IF;
  IF (SELECT is_paused FROM public.games WHERE id=g)
   OR NOT (SELECT auto_fold FROM public.players WHERE id=p)
   OR (SELECT count(*) FROM public.players WHERE game_id=g AND auto_fold)<>1
   OR NOT EXISTS(SELECT 1 FROM public.player_actions WHERE round_id=r AND player_id=p)
  THEN RAISE EXCEPTION 'three_humans:first_timeout_must_continue:%:%',kind,result; END IF;
 END LOOP;
 -- Threshold applies equally to explicit automatic play and recovery.
 -- A host resume cannot bypass the next authoritative guard; reclaim to two
 -- permits progression. Preserve the existing versioned host-resume owner.
 FOREACH kind IN ARRAY ARRAY['holm','357'] LOOP
  f:=pg_temp.three_human_timeout_fixture(kind); g:=(f->>'game')::uuid;
  d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  UPDATE public.games SET real_money=true WHERE id=g;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET auto_fold=true WHERE id=(f->>'p1')::uuid;
  IF private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'threshold:two_present:%',kind; END IF;
  UPDATE public.players SET auto_fold=true WHERE id=(f->>'p2')::uuid;
  before_money:=pg_temp.auto_fold_money(g);
  result:=jsonb_build_object('paused',private.pause_all_humans_auto_fold(g));
  IF NOT (result->>'paused')::boolean OR NOT (SELECT is_paused FROM public.games WHERE id=g)
   OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money
  THEN RAISE EXCEPTION 'threshold:one_present:%',kind; END IF;
  PERFORM set_config('request.jwt.claim.sub',f->>'u1',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u1','role','authenticated')::text,true);
  result:=public.set_game_paused(g,false,d,1);
  IF NOT private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'threshold:resume_bypasses_guard:%:%',kind,result; END IF;
  SELECT intent_version INTO version FROM public.players WHERE id=(f->>'p1')::uuid;
  result:=public.set_automatic_play(g,r,d,(f->>'p1')::uuid,version,false);
  IF result->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'threshold:reclaim:%:%',kind,result; END IF;
  SELECT pause_version INTO version FROM public.games WHERE id=g;
  result:=public.set_game_paused(g,false,d,version);
  IF result->>'outcome'<>'resumed' THEN RAISE EXCEPTION 'threshold:resume:%:%',kind,result; END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET auto_fold=true WHERE game_id=g;
  IF NOT private.pause_all_humans_auto_fold(g) THEN RAISE EXCEPTION 'threshold:zero_present:%',kind; END IF;
 END LOOP;
 -- With two humans, the first timeout leaves only one present.
 FOREACH kind IN ARRAY ARRAY['holm','357'] LOOP
  f:=pg_temp.auto_fold_fixture(kind); g:=(f->>'game')::uuid;
  d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  p:=(f->>CASE WHEN kind='holm' THEN 'p1' ELSE 'p2' END)::uuid;
  UPDATE public.games SET real_money=true WHERE id=g;
  IF kind='357' THEN
   -- One player already made a deliberate choice. Only the other times out.
   result:=public.three_five_seven_submit_decision(g,r,d,1,1,(f->>'p1')::uuid,'fold');
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=r;
  before_money:=pg_temp.auto_fold_money(g);
  IF kind='holm' THEN result:=public.holm_apply_deadline_decision(g,r,p,'fold',true);
  ELSE result:=private.three_five_seven_recover_game(g); END IF;
  IF result->>'outcome'<>'paused' OR NOT (SELECT is_paused AND pause_version=1 FROM public.games WHERE id=g)
   OR NOT (SELECT auto_fold AND sit_out_next_hand AND NOT decision_locked FROM public.players WHERE id=p)
   OR (SELECT count(*) FROM public.players WHERE game_id=g AND auto_fold)<>1
   OR (SELECT decision_deadline FROM public.rounds WHERE id=r)<=clock_timestamp()
   OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money
  THEN RAISE EXCEPTION 'first_real_timeout:pause_before_action:%:%',kind,result; END IF;
  -- Repeated scheduler delivery cannot fold, advance or settle while paused.
  IF kind='holm' THEN result:=public.holm_apply_deadline_decision(g,r,p,'fold',true);
  ELSE result:=private.three_five_seven_recover_game(g); END IF;
  IF pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money
   OR (SELECT pause_version FROM public.games WHERE id=g)<>1 THEN RAISE EXCEPTION 'first_real_timeout:duplicate:%',kind; END IF;
  -- Another player cannot reclaim this human's participation.
  PERFORM set_config('request.jwt.claim.sub',f->>CASE WHEN kind='holm' THEN 'u2' ELSE 'u1' END,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>CASE WHEN kind='holm' THEN 'u2' ELSE 'u1' END)::text,true);
  SELECT intent_version INTO version FROM public.players WHERE id=p;
  BEGIN
   result:=public.set_automatic_play(g,r,d,p,version,false);
   RAISE EXCEPTION 'first_real_timeout:unauthorized_reclaim';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',f->>CASE WHEN kind='holm' THEN 'u1' ELSE 'u2' END,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>CASE WHEN kind='holm' THEN 'u1' ELSE 'u2' END)::text,true);
  result:=public.set_automatic_play(g,r,d,p,version-1,false);
  IF result->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'first_real_timeout:stale_cas'; END IF;
  result:=public.set_automatic_play(g,r,d,p,version,false);
  IF result->>'outcome'<>'accepted' OR (SELECT auto_fold OR sit_out_next_hand FROM public.players WHERE id=p)
   OR NOT (SELECT is_paused FROM public.games WHERE id=g) THEN RAISE EXCEPTION 'first_real_timeout:reclaim'; END IF;
  -- Reclaim itself never resumes a financial session; the host must do so.
  PERFORM set_config('request.jwt.claim.sub',f->>'u1',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f->>'u1')::text,true);
  result:=public.set_game_paused(g,false,d,0);
  IF result->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'first_real_timeout:stale_resume'; END IF;
  result:=public.set_game_paused(g,false,d,1);
  IF result->>'outcome'<>'resumed' THEN RAISE EXCEPTION 'first_real_timeout:resume:%',result; END IF;
  IF kind='holm' THEN result:=public.holm_apply_deadline_decision(g,r,p,'fold',true);
  ELSE result:=public.three_five_seven_expire_round(g,r,d,1,1); END IF;
  IF result->>'outcome' NOT IN ('not_due','deadline_not_expired')
   OR pg_temp.auto_fold_money(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'first_real_timeout:late_replay:%',kind; END IF;
 END LOOP;
 -- Keep the all-human policy for fake money and dice even if the session
 -- explicitly opts into the same auto_fold policy for this guard.
 FOREACH kind IN ARRAY ARRAY['horses','ship-captain-crew'] LOOP
  f:=pg_temp.auto_fold_fixture('holm'); g:=(f->>'game')::uuid;
  UPDATE public.games SET game_type=kind,real_money=true WHERE id=g;
  UPDATE public.players SET auto_fold=true WHERE id=(f->>'p1')::uuid;
  before_context:=private.capture_recovery_context();
  IF private.pause_all_humans_auto_fold(g) OR private.capture_recovery_context() IS DISTINCT FROM before_context
  THEN RAISE EXCEPTION 'first_real_timeout:dice_policy:%',kind; END IF;
 END LOOP;
END $proof$;
