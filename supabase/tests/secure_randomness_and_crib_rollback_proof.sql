BEGIN;
DO $proof$
DECLARE users uuid[]; pids uuid[]; g public.games; dg uuid; rd uuid; state jsonb; after_state jsonb; s jsonb; cards jsonb;
 n integer; i integer; j integer; mode boolean; draw integer; a bytea; b bytea; denied boolean; first_crib jsonb; first_cut jsonb;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users au ON au.id=pr.id WHERE pr.is_active ORDER BY pr.id LIMIT 4) x;
 IF cardinality(users)<4 THEN RAISE EXCEPTION 'proof:four_profiles'; END IF;
 IF has_function_privilege('authenticated','private.secure_random_int(integer)','EXECUTE') THEN RAISE EXCEPTION 'proof:private_entropy_api'; END IF;
 denied:=false; BEGIN PERFORM private.secure_random_int(0); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:zero_random_bound'; END IF;
 FOREACH n IN ARRAY ARRAY[1,3,6,7,52,2147483647] LOOP
  FOR i IN 1..100 LOOP draw:=private.secure_random_int(n); IF draw<0 OR draw>=n THEN RAISE EXCEPTION 'proof:random_bound'; END IF; END LOOP;
 END LOOP;
 PERFORM setseed(0.25);a:=private.secure_shuffle_key();
 PERFORM setseed(0.25);b:=private.secure_shuffle_key();
 IF a=b OR octet_length(a)<>16 THEN RAISE EXCEPTION 'proof:seed_controls_entropy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname IN ('public','private')
 AND p.prokind='f' AND p.proname NOT IN ('secure_random_int','secure_random_unit','secure_shuffle_key')
 AND pg_get_functiondef(p.oid) ~ '\mrandom\s*\(') THEN RAISE EXCEPTION 'proof:seeded_gameplay_rng_remains'; END IF;
 FOREACH mode IN ARRAY ARRAY[false,true] LOOP
 FOR n IN 2..4 LOOP
  pids:=ARRAY[]::uuid[];
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  INSERT INTO public.games(name,game_type,status,real_money,current_host,total_hands,current_round,points_to_win,pot)
  VALUES('Rollback four-card crib','cribbage','in_progress',mode,users[1],1,1,121,0) RETURNING * INTO g;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g.id,users[1],'cribbage') RETURNING id INTO dg;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g.id RETURNING * INTO g;
  FOR i IN 1..n LOOP
   INSERT INTO public.players(game_id,user_id,position,chips,status,ante_decision) VALUES(g.id,users[i],i,0,'active','ante_up') RETURNING id INTO rd;
   pids:=array_append(pids,rd);
  END LOOP;
  state:=private.cribbage_initial_state(g,pids,pids[1],private.cribbage_new_deck());
  INSERT INTO public.rounds(game_id,dealer_game_id,hand_number,round_number,cards_dealt,pot,status,cribbage_state)
  VALUES(g.id,dg,1,1,CASE WHEN n=2 THEN 6 ELSE 5 END,0,'betting',private.cribbage_public_state(state)) RETURNING id INTO rd;
  PERFORM private.cribbage_publish_state(rd,state);
  FOR i IN 1..n LOOP
   PERFORM set_config('request.jwt.claim.sub',users[i]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   PERFORM public.cribbage_apply_discard(rd,pids[i],CASE WHEN n=2 THEN ARRAY[0,1] ELSE ARRAY[0] END);
   EXECUTE 'RESET ROLE';
  END LOOP;
  SELECT authority.state INTO state FROM private.cribbage_round_states authority WHERE round_id=rd;
  IF jsonb_array_length(state->'crib')<>4 OR state->>'phase'<>'pegging' THEN RAISE EXCEPTION 'proof:four_card_crib:%:%:%',n,mode,state; END IF;
  cards:=state->'crib'||jsonb_build_array(state->'cutCard');
  FOR s IN SELECT value FROM jsonb_each(state->'playerStates') LOOP
   IF jsonb_array_length(s->'hand')<>4 THEN RAISE EXCEPTION 'proof:four_card_hand'; END IF;
   cards:=cards||(s->'hand');
  END LOOP;
  IF (SELECT count(DISTINCT (c->>'rank',c->>'suit')) FROM jsonb_array_elements(cards) c)<>n*4+5 THEN RAISE EXCEPTION 'proof:starter_or_crib_duplicate'; END IF;
  -- Identical delayed/repeated calls cannot draw another extra card or starter.
  first_crib:=state->'crib';first_cut:=state->'cutCard';
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.cribbage_apply_discard(rd,pids[n],CASE WHEN n=2 THEN ARRAY[0,1] ELSE ARRAY[0] END); EXCEPTION WHEN OTHERS THEN NULL; END;
  EXECUTE 'RESET ROLE';
  SELECT authority.state INTO after_state FROM private.cribbage_round_states authority WHERE round_id=rd;
  IF after_state<>state OR private.cribbage_finish_discard(state,g.id)<>state THEN RAISE EXCEPTION 'proof:duplicate_discard_redrew'; END IF;
  IF (SELECT pot FROM public.games WHERE id=g.id)<>0 OR (SELECT sum(chips) FROM public.players WHERE game_id=g.id)<>0 THEN RAISE EXCEPTION 'proof:discard_chip_movement'; END IF;
 END LOOP;
 END LOOP;
 IF (private.cribbage_hand_score('[{"rank":"5","suit":"hearts","value":5},{"rank":"5","suit":"diamonds","value":5},{"rank":"5","suit":"clubs","value":5},{"rank":"J","suit":"spades","value":10}]','{"rank":"5","suit":"spades","value":5}',true)->>'total')::integer<>29 THEN RAISE EXCEPTION 'proof:four_card_crib_scoring'; END IF;
END $proof$;
ROLLBACK;
