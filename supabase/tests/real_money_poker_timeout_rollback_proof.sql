-- Composed inside BEGIN/ROLLBACK by build-real-money-poker-timeout-proof.mjs.
-- Only generated fixtures are changed, including temporary real-money mode.
DO $proof$
DECLARE f jsonb; g uuid; d uuid; r uuid; p uuid; result jsonb; before_money jsonb;
 version bigint; kind text; before_context jsonb;
BEGIN
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
