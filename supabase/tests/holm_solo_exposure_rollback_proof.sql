-- Run after the migration, or prepend its body inside this transaction for a
-- pre-deployment proof. All fixtures, history and ledger changes roll back.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION pg_temp.solo_fixture(p_case integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $fixture$
DECLARE u uuid[]; g uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid();
 c jsonb; mode integer:=(p_case-1)%3;
BEGIN
 SELECT array_agg(id ORDER BY id) INTO u FROM (
  SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
  WHERE coalesce(pr.is_active,true) AND NOT coalesce(pr.is_superuser,false)
    AND NOT public.has_role(pr.id,'admin'::public.app_role) ORDER BY pr.id LIMIT 3
 ) users;
 IF cardinality(u)<>3 THEN RAISE EXCEPTION 'solo_proof:three_nonadmin_profiles_required'; END IF;
 INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,
  current_round,total_hands,pot,real_money,is_first_hand,pending_session_end,ante_amount,chucky_cards,pussy_tax_enabled)
 VALUES(g,'Rollback Holm solo exposure','in_progress','holm-game',d,u[1],2,1,1,4,false,false,p_case BETWEEN 4 AND 6,1,4,false);
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,u[1],'holm');
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot,current_decision,decision_locked)
 VALUES(p1,g,u[1],1,98,'active',false,false,NULL,false),(p2,g,u[2],2,98,'active',false,false,NULL,false),
 (p3,g,u[3],3,0,'left',true,false,NULL,false);
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,pot,status,
  community_cards,community_cards_revealed,chucky_cards,current_turn_position,decision_deadline)
 VALUES(r,g,d,1,1,4,4,'betting',
  '[{"rank":"9","suit":"♣"},{"rank":"9","suit":"♦"},{"rank":"9","suit":"♥"},{"rank":"9","suit":"♠"}]',2,
  '[{"rank":"K","suit":"♥"},{"rank":"5","suit":"♣"},{"rank":"6","suit":"♦"},{"rank":"7","suit":"♠"}]',1,clock_timestamp()+interval '5 minutes');
 c:=CASE mode WHEN 0 THEN '[{"rank":"A","suit":"♠"},{"rank":"K","suit":"♣"},{"rank":"Q","suit":"♦"},{"rank":"J","suit":"♥"}]'::jsonb
 WHEN 1 THEN '[{"rank":"Q","suit":"♠"},{"rank":"J","suit":"♣"},{"rank":"10","suit":"♦"},{"rank":"8","suit":"♥"}]'::jsonb
 ELSE '[{"rank":"K","suit":"♠"},{"rank":"Q","suit":"♣"},{"rank":"J","suit":"♦"},{"rank":"10","suit":"♥"}]'::jsonb END;
 INSERT INTO public.player_cards(player_id,round_id,cards) VALUES(p1,r,c),
 (p2,r,'[{"rank":"2","suit":"♣"},{"rank":"3","suit":"♦"},{"rank":"4","suit":"♥"},{"rank":"8","suit":"♠"}]');
 RETURN jsonb_build_object('g',g,'d',d,'r',r,'p1',p1,'p2',p2,'u1',u[1],'u2',u[2],'u3',u[3]);
END $fixture$;

CREATE FUNCTION pg_temp.solo_snapshot(g uuid) RETURNS jsonb LANGUAGE sql AS $snapshot$
 SELECT jsonb_build_object(
 'game',(SELECT to_jsonb(x) FROM public.games x WHERE id=g),
 'players',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.players x WHERE game_id=g),
 'rounds',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.rounds x WHERE game_id=g),
 'cards',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.player_cards x JOIN public.rounds r ON r.id=x.round_id WHERE r.game_id=g),
 'results',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.game_results x WHERE game_id=g),
 'transfers',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.gameplay_transfer_batches x WHERE game_id=g),
 'history',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.hand_id,x.sequence) FROM private.history_events x WHERE round_id IN (SELECT id FROM public.rounds WHERE game_id=g)));
$snapshot$;

DO $proof$
DECLARE f jsonb; g uuid; d uuid; r uuid; p1 uuid; p2 uuid; actor uuid; result jsonb;
 before_state jsonb; denied boolean; n integer; case_number integer; final_status text; next_dealer uuid;
BEGIN
 FOR case_number IN 1..7 LOOP
  f:=pg_temp.solo_fixture(case_number); g:=(f->>'g')::uuid; d:=(f->>'d')::uuid; r:=(f->>'r')::uuid;
  p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
  -- A real authenticated peer cannot read the future tabled hand.
  PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r;
  IF n<>1 THEN RAISE EXCEPTION 'solo_proof:pre_decision_privacy'; END IF;
  denied:=false;
  BEGIN PERFORM public.holm_submit_decision(g,r,p1,'stay'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'solo_proof:foreign_actor_authorized'; END IF;
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=r AND is_public) THEN RAISE EXCEPTION 'solo_proof:rejected_action_exposed_cards'; END IF;
  PERFORM set_config('request.jwt.claim.sub',f->>'u1',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u1','role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.holm_submit_decision(g,r,p1,CASE WHEN case_number=7 THEN 'fold' ELSE 'stay' END);
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=r AND is_public) THEN RAISE EXCEPTION 'solo_proof:premature_exposure'; END IF;
  before_state:=pg_temp.solo_snapshot(g);
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.holm_submit_decision(g,r,p1,'stay');
  EXECUTE 'RESET ROLE';
  IF pg_temp.solo_snapshot(g) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'solo_proof:duplicate_first_action_mutated'; END IF;
  PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.holm_submit_decision(g,r,p2,'fold');
  SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r;
  IF n<>(CASE WHEN case_number=7 THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'solo_proof:folded_viewer_missing_stayer:%:%',case_number,n; END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT status FROM public.rounds WHERE id=r)<>'completed' THEN RAISE EXCEPTION 'solo_proof:hand_not_completed:%',case_number; END IF;
  IF EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=r AND player_id=p2 AND is_public) THEN RAISE EXCEPTION 'solo_proof:folded_cards_exposed'; END IF;
  IF case_number<7 AND NOT EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=r AND player_id=p1 AND is_public) THEN RAISE EXCEPTION 'solo_proof:stayer_exposure_missing'; END IF;
  SELECT count(*) INTO n FROM private.history_events WHERE round_id=r AND actor_id=p1 AND event_type='exposure' AND audience IS NULL;
  IF n<>(CASE WHEN case_number=7 THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'solo_proof:exact_history_exposure_missing:%:%',case_number,n; END IF;
  IF EXISTS(SELECT 1 FROM private.history_events WHERE round_id=r AND actor_id=p2 AND event_type='exposure') THEN RAISE EXCEPTION 'solo_proof:folded_history_exposure'; END IF;
  -- Owner and departed observer exercise RLS too, with no privileged reads.
  FOR actor IN SELECT (f->>'u1')::uuid UNION ALL SELECT (f->>'u3')::uuid LOOP
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r AND player_id=p2;
   IF n<>0 THEN RAISE EXCEPTION 'solo_proof:observer_read_folded_hand'; END IF;
   SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r AND player_id=p1;
   IF n<>(CASE WHEN case_number=7 AND actor=(f->>'u3')::uuid THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'solo_proof:public_stayer_read'; END IF;
   EXECUTE 'RESET ROLE';
  END LOOP;
  final_status:=(SELECT status FROM public.games WHERE id=g);
  -- Last Game ends the session on the final award; a Chucky loss/tie still carries the pot.
  IF case_number=4 AND final_status<>'session_ended' THEN RAISE EXCEPTION 'solo_proof:terminal_disposition:%:%',case_number,final_status; END IF;
  IF case_number=1 AND final_status<>'game_over' THEN RAISE EXCEPTION 'solo_proof:winning_disposition'; END IF;
  IF case_number IN (2,3,5,6,7) AND (final_status<>'in_progress' OR NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g AND hand_number=2)) THEN RAISE EXCEPTION 'solo_proof:continuation_missing:%',case_number; END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=g)+(SELECT pot FROM public.games WHERE id=g)<>200 THEN RAISE EXCEPTION 'solo_proof:financial_conservation:%',case_number; END IF;
  IF case_number=1 AND (SELECT chips FROM public.players WHERE id=p1)<>102 THEN RAISE EXCEPTION 'solo_proof:wrong_winner_amount'; END IF;
  IF case_number IN (2,3,5,6) AND (SELECT chips FROM public.players WHERE id=p1)<>94 THEN RAISE EXCEPTION 'solo_proof:wrong_chucky_loss_or_tie'; END IF;
  before_state:=pg_temp.solo_snapshot(g);
  PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.holm_submit_decision(g,r,p2,'fold');
  EXECUTE 'RESET ROLE';
  IF pg_temp.solo_snapshot(g) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'solo_proof:terminal_replay_mutated'; END IF;
  next_dealer:=gen_random_uuid();
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(next_dealer,g,(f->>'u1')::uuid,'holm');
  UPDATE public.games SET current_game_uuid=next_dealer,status='in_progress',session_ended_at=NULL WHERE id=g;
  before_state:=pg_temp.solo_snapshot(g);
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.holm_submit_decision(g,r,p2,'fold');
  EXECUTE 'RESET ROLE';
  IF pg_temp.solo_snapshot(g) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'solo_proof:late_replay_mutated'; END IF;
 END LOOP;
 RAISE NOTICE 'holm_solo_exposure:PASS seven cases, authorization, visibility, duplicate, replay, late replay, win, loss, tie, all-fold, continuation, terminal, conservation';
END $proof$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
