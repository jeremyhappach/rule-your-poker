-- Exact synthetic identities; no existing session or historical balance is changed.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='2s';
CREATE FUNCTION pg_temp.authority_flags(enabled boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE key text;
BEGIN
 FOREACH key IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write',
   'app.cribbage_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(key,CASE WHEN enabled THEN 'on' ELSE '' END,true);
 END LOOP;
END;
$$;
DO $proof$
DECLARE users uuid[]; g uuid; d uuid; p1 uuid; p2 uuid; kind text; actor uuid;
 r jsonb; before_state jsonb; denied boolean; v integer; n integer; terminal_count integer;
BEGIN
 SELECT array_agg(id ORDER BY id) INTO users FROM (
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.is_active AND NOT public.has_role(p.id,'admin'::public.app_role) ORDER BY p.id LIMIT 3
 ) x;
 IF cardinality(users)<>3 THEN RAISE EXCEPTION 'participation_proof:requires_profiles'; END IF;
 IF has_table_privilege('authenticated','public.session_player_snapshots','INSERT')
 OR has_table_privilege('authenticated','public.session_player_snapshots','UPDATE')
 OR has_table_privilege('authenticated','public.session_player_snapshots','DELETE')
 OR has_function_privilege('authenticated','public.stand_up_and_resolve_postgame(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.session_leave(uuid,uuid,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'participation_proof:alternate_capability';
 END IF;
 FOREACH kind IN ARRAY ARRAY['3-5-7','holm-game','horses','ship-captain-crew','yahtzee','cribbage','gin-rummy'] LOOP
  g:=gen_random_uuid();d:=gen_random_uuid();p1:=gen_random_uuid();p2:=gen_random_uuid();
  PERFORM pg_temp.authority_flags(true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,total_hands,current_round,pot,real_money)
  VALUES(g,'Rollback participation proof','in_progress',kind,d,users[1],1,1,1,0,true);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,users[1],kind);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,auto_fold)
  VALUES(p1,g,users[1],1,10,'active',false,true),(p2,g,users[2],2,-10,'active',false,false);
  PERFORM pg_temp.authority_flags(false);
  FOREACH actor IN ARRAY users LOOP
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   denied:=false;
   BEGIN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips)
    VALUES(g,d,1,p1,users[1],'Forgery',999);
   EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'participation_proof:forged_snapshot'; END IF;
   IF actor<>users[1] THEN
    denied:=false;
    BEGIN PERFORM public.session_leave(g,p1,0); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'participation_proof:foreign_departure'; END IF;
   END IF;
   EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.session_leave(g,p1,0);
  EXECUTE 'RESET ROLE';
  IF r->>'outcome'<>'stand-up-recorded-outside-postgame' THEN RAISE EXCEPTION 'participation_proof:active_leave:%:%',kind,r; END IF;
  IF (SELECT status FROM public.games WHERE id=g)<>'in_progress'
   OR (SELECT current_game_uuid FROM public.games WHERE id=g)<>d
   OR (SELECT chips FROM public.players WHERE id=p1)<>10
   OR (SELECT auto_fold FROM public.players WHERE id=p1)
   OR (SELECT count(*) FROM private.session_departures WHERE game_id=g AND player_id=p1 AND chips=10 AND dealer_game_id=d AND hand_number=1)<>1
   OR EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g) THEN
   RAISE EXCEPTION 'participation_proof:departure_boundary:%',kind;
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.session_leave(g,p1,0);
  IF r->>'outcome'<>'stale-participation' THEN RAISE EXCEPTION 'participation_proof:duplicate_leave'; END IF;
  r:=public.session_take_seat(g,1,p1,1);
  IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'participation_proof:rejoin:%',r; END IF;
  r:=public.session_leave(g,p1,0);
  IF r->>'outcome'<>'stale-participation' THEN RAISE EXCEPTION 'participation_proof:late_leave'; END IF;
  r:=public.session_take_seat(g,3,p1,1);
  IF r->>'outcome'<>'stale-participation' THEN RAISE EXCEPTION 'participation_proof:late_seat'; END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT chips FROM public.players WHERE id=p1)<>10 OR (SELECT status FROM public.players WHERE id=p1)<>'active'
   OR NOT (SELECT sitting_out AND waiting FROM public.players WHERE id=p1)
   OR (SELECT count(*) FROM private.session_departures WHERE game_id=g)<>1 THEN
   RAISE EXCEPTION 'participation_proof:rejoin_balance_or_replay:%',kind;
  END IF;
  -- An occupied seat and a forged expected participant never displace its owner.
  PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[3],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false;
  BEGIN PERFORM public.session_take_seat(g,2,NULL,NULL); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'participation_proof:occupied_seat'; END IF;
  r:=public.session_take_seat(g,3,p1,2);
  IF r->>'outcome'<>'stale-participation' THEN RAISE EXCEPTION 'participation_proof:foreign_seat_identity'; END IF;
  EXECUTE 'RESET ROLE';
  -- Model the existing settlement owner's committed balance/snapshot boundary.
  PERFORM pg_temp.authority_flags(true);
  UPDATE public.games SET status='game_over' WHERE id=g;
  INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,winner_username,pot_won,player_chip_changes)
  VALUES(g,d,1,kind,p1,'Proof',10,jsonb_build_object(p1::text,10,p2::text,-10));
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
  SELECT game_id,d,1,id,user_id,'Proof',chips,is_bot FROM public.players WHERE game_id=g;
  PERFORM pg_temp.authority_flags(false);
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.session_leave(g,p1,2);
  EXECUTE 'RESET ROLE';
  IF r->>'outcome'<>'waiting-insufficient-eligible-participants' THEN RAISE EXCEPTION 'participation_proof:postgame_wait:%:%',kind,r; END IF;
  IF (SELECT status FROM public.games WHERE id=g)<>'waiting' THEN RAISE EXCEPTION 'participation_proof:wait_failed'; END IF;
  -- The departed seat may now be safely reused without deleting its participant.
  PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[3],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.session_take_seat(g,1,NULL,NULL);
  EXECUTE 'RESET ROLE';
  IF r->>'outcome'<>'seated' OR (SELECT chips FROM public.players WHERE id=p1)<>10
   OR (SELECT position FROM public.players WHERE id=p1) IS NOT NULL THEN RAISE EXCEPTION 'participation_proof:seat_reuse'; END IF;
  SELECT participation_version INTO v FROM public.players WHERE id=(r->>'player_id')::uuid;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.session_leave(g,(r->>'player_id')::uuid,v);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r:=public.session_leave(g,p2,0);
  EXECUTE 'RESET ROLE';
  IF r->>'outcome'<>'session-ended-with-results' THEN RAISE EXCEPTION 'participation_proof:terminal:%:%',kind,r; END IF;
  SELECT to_jsonb(row) INTO before_state FROM public.players row WHERE id=p2;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.session_leave(g,p2,0);
  r:=public.session_take_seat(g,2,p2,1);
  EXECUTE 'RESET ROLE';
  IF r->>'outcome'<>'already-session-ended' OR (SELECT to_jsonb(row) FROM public.players row WHERE id=p2) IS DISTINCT FROM before_state
   OR (SELECT count(*) FROM public.player_transactions WHERE source_game_id=g AND transaction_type='SessionResult')<>3
   OR (SELECT sum(chips) FROM public.players WHERE game_id=g)<>0 THEN
   RAISE EXCEPTION 'participation_proof:terminal_replay_or_money:%',kind;
  END IF;
 END LOOP;
END;
$proof$;
ROLLBACK;
