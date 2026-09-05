-- Holm private-card and settlement proof. Real database roles and fake-money fixtures.
-- No shared settings or historical sessions are modified.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.holm_boundary_fixture(p_name text, p_tie boolean, p_end boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fixture$
DECLARE
  u uuid[]; g uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
  r uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid();
  p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); board jsonb;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO u FROM (
    SELECT id FROM public.profiles
     WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id=profiles.id) AND coalesce(is_active,true) AND NOT coalesce(is_superuser,false)
       AND NOT public.has_role(id,'admin'::public.app_role)
     ORDER BY id LIMIT 3
  ) users;
  IF coalesce(cardinality(u),0)<>3 THEN RAISE EXCEPTION 'holm_boundary:requires_three_nonadmin_profiles'; END IF;
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,
    dealer_position,current_round,total_hands,pot,real_money,is_first_hand,pending_session_end,
    ante_amount,chucky_cards,pussy_tax_enabled)
  VALUES(g,'Rollback proof: '||p_name,'in_progress','holm-game',d,u[1],
    2,1,1,4,false,false,p_end,1,4,false);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
  VALUES(d,g,u[1],'holm');
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot,
    current_decision,decision_locked)
  VALUES(p1,g,u[1],1,98,'active',false,false,NULL,false),
        (p2,g,u[2],2,98,'active',false,false,NULL,false),
        (p3,g,u[3],3,0,'left',true,false,NULL,false);
  board:=CASE WHEN p_tie THEN
    '[{"rank":"7","suit":"♥"},{"rank":"7","suit":"♦"},{"rank":"7","suit":"♠"},{"rank":"7","suit":"♣"}]'::jsonb
  ELSE
    '[{"rank":"2","suit":"♥"},{"rank":"3","suit":"♦"},{"rank":"7","suit":"♠"},{"rank":"9","suit":"♣"}]'::jsonb END;
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,
    pot,status,community_cards,community_cards_revealed,chucky_cards,current_turn_position,
    decision_deadline)
  VALUES(r,g,d,1,1,4,4,'betting',board,2,
    '[{"rank":"2","suit":"♣"},{"rank":"3","suit":"♥"},{"rank":"4","suit":"♠"},{"rank":"5","suit":"♦"}]'::jsonb,
    1,clock_timestamp()+interval '5 minutes');
  INSERT INTO public.player_cards(player_id,round_id,cards) VALUES
  (p1,r,CASE WHEN p_tie THEN
    '[{"rank":"A","suit":"♥"},{"rank":"8","suit":"♦"},{"rank":"9","suit":"♦"},{"rank":"10","suit":"♠"}]'::jsonb
    ELSE '[{"rank":"A","suit":"♥"},{"rank":"A","suit":"♦"},{"rank":"K","suit":"♠"},{"rank":"Q","suit":"♥"}]'::jsonb END),
  (p2,r,CASE WHEN p_tie THEN
    '[{"rank":"A","suit":"♦"},{"rank":"8","suit":"♣"},{"rank":"9","suit":"♥"},{"rank":"10","suit":"♥"}]'::jsonb
    ELSE '[{"rank":"K","suit":"♥"},{"rank":"K","suit":"♦"},{"rank":"Q","suit":"♠"},{"rank":"J","suit":"♥"}]'::jsonb END);
  RETURN jsonb_build_object('game',g,'dealer',d,'round',r,'p1',p1,'p2',p2,'p3',p3,
    'u1',u[1],'u2',u[2],'u3',u[3]);
END;
$fixture$;

CREATE OR REPLACE FUNCTION pg_temp.holm_boundary_snapshot(p_game uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $snapshot$
 SELECT jsonb_build_object(
  'game',(SELECT to_jsonb(g) FROM public.games g WHERE id=p_game),
  'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p WHERE game_id=p_game),
  'rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rounds r WHERE game_id=p_game),
  'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.game_results r WHERE game_id=p_game),
  'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.session_player_snapshots s WHERE game_id=p_game)
 );
$snapshot$;

DO $proof$
DECLARE
 f jsonb; g uuid; d uuid; r uuid; p1 uuid; p2 uuid; actor uuid;
 role_name text; denied boolean; affected integer; result jsonb; before_state jsonb;
 case_number integer; next_dealer uuid; expected_kind public.holm_event_kind;
 signature text:='public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)';
BEGIN
 IF has_function_privilege('anon',signature,'EXECUTE')
    OR has_function_privilege('authenticated',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'holm_boundary:client_settlement_privilege_remains';
 END IF;

 FOR case_number IN 1..3 LOOP
   f:=pg_temp.holm_boundary_fixture('case '||case_number,case_number>1,case_number=3);
   g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
   p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
   IF jsonb_array_length((SELECT community_cards FROM public.rounds WHERE id=r))<>4
      OR (SELECT community_cards->2->>'masked' FROM public.rounds WHERE id=r) IS DISTINCT FROM 'true'
      OR (SELECT community_cards->3->>'rank' FROM public.rounds WHERE id=r) IS DISTINCT FROM '?'
      OR (SELECT chucky_cards->0->>'masked' FROM public.rounds WHERE id=r) IS DISTINCT FROM 'true'
      OR (SELECT community_cards->2->>'rank' FROM private.holm_round_cards WHERE round_id=r)='?' THEN
     RAISE EXCEPTION 'holm_privacy:projection_invalid';
   END IF;
   IF case_number=1 THEN
     -- Anonymous, owner, peer and departed observer cannot invoke the helper.
     FOR actor,role_name IN
       SELECT NULL::uuid,'anon'::text
       UNION ALL SELECT (f->>'u1')::uuid,'authenticated'
       UNION ALL SELECT (f->>'u2')::uuid,'authenticated'
       UNION ALL SELECT (f->>'u3')::uuid,'authenticated'
     LOOP
       PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',role_name)::text,true);
       PERFORM set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
       PERFORM set_config('request.jwt.claim.role',role_name,true);
       EXECUTE format('SET LOCAL ROLE %I',role_name);
       IF current_user<>role_name THEN RAISE EXCEPTION 'holm_boundary:wrong_test_role'; END IF;
       denied:=false;
       BEGIN
         PERFORM public.holm_settle_hand(g,d,1,'chucky_final_award',0,false,'forged',
           jsonb_build_object(p1::text,999),'forged',p1,'forged',false,999);
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_boundary:forged_settlement_accepted'; END IF;
       denied:=false;
       BEGIN
         INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,
           event_kind,winning_hand_description,pot_won,player_chip_changes)
         VALUES(g,d,1,'holm','chucky_final_award','forged',999,jsonb_build_object(p1::text,999));
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_boundary:forged_claim_accepted'; END IF;
       denied:=false;
       BEGIN PERFORM community_cards FROM private.holm_round_cards WHERE round_id=r;
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_privacy:private_read'; END IF;
       denied:=false;
       BEGIN UPDATE public.rounds SET community_cards_revealed=4 WHERE id=r;
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_privacy:premature_reveal'; END IF;
       denied:=false;
       affected:=0;
       BEGIN
         DELETE FROM public.player_cards WHERE round_id=r;
         GET DIAGNOSTICS affected=ROW_COUNT;
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied AND affected<>0 THEN RAISE EXCEPTION 'holm_privacy:private_hand_deleted'; END IF;
       denied:=false;
       BEGIN INSERT INTO public.player_cards(player_id,round_id,cards) VALUES(p1,r,'[]'::jsonb);
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_privacy:private_hand_forged'; END IF;
       IF (SELECT community_cards->3->>'rank' FROM public.rounds WHERE id=r) IS DISTINCT FROM '?' THEN
         RAISE EXCEPTION 'holm_privacy:future_board_visible';
       END IF;
       -- Mislabeling the game cannot bypass terminal-event protection.
       denied:=false;
       BEGIN
         INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,event_kind,pot_won)
         VALUES(g,d,1,'gin-rummy','chucky_final_award',999);
       EXCEPTION WHEN insufficient_privilege THEN denied:=true;
       END;
       IF NOT denied THEN RAISE EXCEPTION 'holm_boundary:mislabeled_claim_accepted'; END IF;
       -- Non-financial history remains compatible.
       INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,
         winning_hand_description,pot_won)
       VALUES(g,d,1,'gin-rummy','nonfinancial boundary proof',0);
       EXECUTE 'RESET ROLE';
       IF (SELECT count(*) FROM public.player_cards WHERE round_id=r)<>2 THEN
         RAISE EXCEPTION 'holm_privacy:private_hand_count_changed';
       END IF;
     END LOOP;
   END IF;

   -- The real authenticated action path still computes/settles the outcome.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u1','role','authenticated')::text,true);
   PERFORM set_config('request.jwt.claim.sub',f->>'u1',true);
   PERFORM set_config('request.jwt.claim.role','authenticated',true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   result:=public.holm_submit_decision(g,r,p1,'stay');
   EXECUTE 'RESET ROLE';
   IF (SELECT status FROM public.rounds WHERE id=r)<>'betting' THEN
     RAISE EXCEPTION 'holm_boundary:first_action_resolved_early';
   END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'u2','role','authenticated')::text,true);
   PERFORM set_config('request.jwt.claim.sub',f->>'u2',true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   result:=public.holm_submit_decision(g,r,p2,'stay');
   EXECUTE 'RESET ROLE';

   expected_kind:=CASE WHEN case_number=1 THEN 'showdown_final_award' ELSE 'chucky_final_award' END;
   IF (SELECT count(*) FROM public.game_results WHERE game_id=g AND event_kind=expected_kind)<>1
      OR (SELECT status FROM public.rounds WHERE id=r)<>'completed' THEN
     RAISE EXCEPTION 'holm_boundary:missing_outcome:%:%',case_number,result;
   END IF;
   IF (SELECT sum(chips) FROM public.players WHERE game_id=g)+(SELECT pot FROM public.games WHERE id=g)<>200 THEN
     RAISE EXCEPTION 'holm_boundary:value_not_conserved:%',case_number;
   END IF;
   IF (SELECT chips FROM public.players WHERE id=p1) IS DISTINCT FROM (CASE WHEN case_number=1 THEN 102 ELSE 100 END)
      OR (SELECT chips FROM public.players WHERE id=p2) IS DISTINCT FROM (CASE WHEN case_number=1 THEN 94 ELSE 100 END)
      OR (SELECT pot FROM public.games WHERE id=g) IS DISTINCT FROM (CASE WHEN case_number=1 THEN 4 ELSE 0 END) THEN
     RAISE EXCEPTION 'holm_boundary:wrong_payout:%',case_number;
   END IF;
   IF (SELECT status FROM public.players WHERE id=(f->>'p3')::uuid)<>'left' THEN
     RAISE EXCEPTION 'holm_boundary:departed_player_revived';
   END IF;
   IF case_number=1 AND (SELECT count(*) FROM public.rounds WHERE holm_predecessor_round_id=r
       AND status IN ('dealing','prepared'))<>1 THEN
     RAISE EXCEPTION 'holm_boundary:continuation_missing';
   END IF;
   IF case_number=2 AND (SELECT status FROM public.games WHERE id=g)<>'game_over' THEN
     RAISE EXCEPTION 'holm_boundary:ordinary_terminal_missing';
   END IF;
   IF case_number=3 AND (SELECT status FROM public.games WHERE id=g)<>'session_ended' THEN
     RAISE EXCEPTION 'holm_boundary:session_terminal_missing';
   END IF;

   IF (SELECT community_cards FROM public.rounds WHERE id=r) IS DISTINCT FROM
      (SELECT community_cards FROM private.holm_round_cards WHERE round_id=r) THEN
     RAISE EXCEPTION 'holm_privacy:completed_reveal_missing';
   END IF;
   before_state:=pg_temp.holm_boundary_snapshot(g);
   result:=public.holm_settle_hand(g,d,1,expected_kind,0,false,'ignored replay',
     '{}'::jsonb,'ignored',NULL,NULL,false,0);
   IF result->>'status'<>'already_settled' OR pg_temp.holm_boundary_snapshot(g) IS DISTINCT FROM before_state THEN
     RAISE EXCEPTION 'holm_boundary:duplicate_mutated_state:%',case_number;
   END IF;

   -- Simulate a legitimate later dealer-game only on this synthetic session.
   next_dealer:=gen_random_uuid();
   INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
   VALUES(next_dealer,g,(f->>'u1')::uuid,'holm');
   UPDATE public.games SET current_game_uuid=next_dealer,total_hands=1,current_round=1,
     status='in_progress',pending_session_end=true,session_ended_at=NULL WHERE id=g;
   before_state:=pg_temp.holm_boundary_snapshot(g);
   result:=public.holm_settle_hand(g,d,1,expected_kind,0,false,'ignored late replay',
     '{}'::jsonb,'ignored',NULL,NULL,false,0);
   IF result->>'status'<>'already_settled' OR pg_temp.holm_boundary_snapshot(g) IS DISTINCT FROM before_state THEN
     RAISE EXCEPTION 'holm_boundary:late_replay_mutated_successor:%',case_number;
   END IF;
 END LOOP;
 RAISE NOTICE 'holm_boundary:passed authorization, claim denial, winner, tie, duplicate, replay, late replay, continuation, terminal and conservation';
END;
$proof$;

DO $compat$
DECLARE g uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); u uuid;
BEGIN
 SELECT id INTO u FROM auth.users ORDER BY created_at LIMIT 1;
 INSERT INTO public.games(id,name,status,game_type,real_money,current_host)
 VALUES(g,'Rollback unrelated round compatibility','waiting','horses',false,u);
 INSERT INTO public.rounds(id,game_id,round_number,cards_dealt,status,pot) VALUES(r,g,1,0,'betting',0);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 UPDATE public.rounds SET pot=1 WHERE id=r;
 IF NOT FOUND THEN RAISE EXCEPTION 'holm_privacy:unrelated_round_blocked'; END IF;
 EXECUTE 'RESET ROLE';
END;
$compat$;

-- Exercise deferred transfer-journal constraints before discarding fixtures.
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
