-- Run after the proposed migration inside the caller's transaction; always roll back.
-- Auth/profile and player setup follows the repository's rollback fixture convention.
DO $proof$
DECLARE
  u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
  g uuid; r jsonb; before_state jsonb; generation bigint; started timestamptz;
  bot boolean; elapsed numeric; host_position integer;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (u1,'sole-dealer-'||u1||'@example.invalid',jsonb_build_object('username','sole-'||u1)),
    (u2,'sole-dealer-'||u2||'@example.invalid',jsonb_build_object('username','sole-'||u2));
  INSERT INTO public.profiles(id,username,is_active) VALUES(u1,'sole-'||u1,true),(u2,'sole-'||u2,true)
    ON CONFLICT(id) DO UPDATE SET is_active=true;
  -- A disposable admin fixture can create its fake-money session during local maintenance.
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'admin');
  FOREACH bot IN ARRAY ARRAY[true,false] LOOP
    PERFORM set_config('request.jwt.claim.sub',u1::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    r:=public.create_session(gen_random_uuid(),'Run21 sole-dealer rollback proof',false,1);
    g:=(r->>'game_id')::uuid;
    EXECUTE 'RESET ROLE';
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,is_bot)
      VALUES(g,u2,4,0,'active',false,true,bot);
    -- Another participant cannot start the host's session.
    PERFORM set_config('request.jwt.claim.sub',u2::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    r:=public.begin_session_dealer_selection(g);
    IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'sole_proof:outsider_started:%',r; END IF;
    PERFORM set_config('request.jwt.claim.sub',u1::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
    started:=clock_timestamp();
    r:=public.begin_session_dealer_selection(g);
    elapsed:=extract(epoch FROM clock_timestamp()-started)*1000;
    EXECUTE 'RESET ROLE';
    SELECT timer_generation,dealer_selection_state INTO generation,before_state FROM public.games WHERE id=g;
    IF r->>'outcome'<>'started' THEN RAISE EXCEPTION 'sole_proof:start:%',r; END IF;
    IF bot THEN
      SELECT position INTO host_position FROM public.players WHERE game_id=g AND user_id=u1;
      IF r->>'status'<>'game_selection' OR elapsed>=500
        OR (SELECT dealer_position FROM public.games WHERE id=g)<>host_position
        OR before_state->'cards'<>'[]'::jsonb THEN
        RAISE EXCEPTION 'sole_proof:not_immediate:%,%ms',r,elapsed;
      END IF;
      RAISE NOTICE 'sole_dealer_ms=%',elapsed;
      r:=public.begin_session_dealer_selection(g);
      IF r->>'outcome'<>'not_startable' OR (SELECT dealer_selection_state FROM public.games WHERE id=g) IS DISTINCT FROM before_state THEN
        RAISE EXCEPTION 'sole_proof:duplicate_mutated';
      END IF;
    ELSE
      IF r->>'status'<>'dealer_selection' OR before_state IS NOT NULL THEN RAISE EXCEPTION 'sole_proof:multi_changed:%',r; END IF;
      r:=private.prepare_session_dealer_selection(g,generation);
      IF r->>'outcome'<>'prepared' OR jsonb_array_length(r->'state'->'cards')<2 THEN RAISE EXCEPTION 'sole_proof:multi_draw:%',r; END IF;
      r:=private.complete_session_dealer_selection(g,generation);
      IF r->>'outcome'<>'presentation_pending' THEN RAISE EXCEPTION 'sole_proof:multi_hold:%',r; END IF;
      r:=private.complete_session_dealer_selection(g,generation-1);
      IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'sole_proof:stale_generation:%',r; END IF;
      PERFORM pg_sleep(3.05);
      r:=private.complete_session_dealer_selection(g,generation);
      IF r->>'outcome'<>'advanced' THEN RAISE EXCEPTION 'sole_proof:multi_continuation:%',r; END IF;
    END IF;
    IF (SELECT pot FROM public.games WHERE id=g)<>0 OR (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 THEN
      RAISE EXCEPTION 'sole_proof:money_changed';
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: sole immediate; multiple draw and three-second hold; host auth; duplicate; stale identity; continuation; zero balances';
END;
$proof$;
