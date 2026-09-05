-- Only generated sessions and transaction-local
-- fixture settings/functions are changed. Never pass a historical session.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION pg_temp.isolation_game(p_type text,p_money boolean)
RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE g uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); u uuid[]; p uuid[];
BEGIN
  SELECT array_agg(id ORDER BY is_superuser DESC,id) INTO u FROM (
    SELECT pr.id,pr.is_superuser FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
    ORDER BY pr.is_superuser DESC,pr.id LIMIT 2
  ) users;
  IF cardinality(u)<>2 THEN RAISE EXCEPTION 'fixture_isolation:requires_two_users'; END IF;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  INSERT INTO public.games(id,name,game_type,status,real_money,current_host,current_game_uuid,
    dealer_position,ante_amount,buy_in,pot,current_round,total_hands,is_first_hand,config_complete,
    chucky_cards,pussy_tax_enabled,pot_max_enabled,pot_max_value)
  VALUES(g,'Rollback Holm/Yahtzee fixture isolation',p_type,'ante_decision',p_money,u[1],d,
    2,3,100,0,NULL,0,true,true,4,false,true,15);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
  VALUES(d,g,u[1],p_type,jsonb_build_object('ante_amount',3));
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
  VALUES(g,u[1],1,100,'active',false,false,'ante_up'),(g,u[2],2,100,'active',false,false,'ante_up');
  SELECT array_agg(id ORDER BY position) INTO p FROM public.players WHERE game_id=g;
  RETURN jsonb_build_object('game',g,'dealer',d,'p1',p[1],'p2',p[2],'u1',u[1],'u2',u[2]);
END;
$fixture$;

DO $proof$
DECLARE mode boolean; money boolean; typ text; profile text; f jsonb; result jsonb; replay jsonb;
  g uuid; d uuid; r uuid; p1 uuid; p2 uuid; original_helper text;
  before_chips jsonb; failed boolean; n integer; count_cases integer:=0; actor integer;
BEGIN
  FOREACH profile IN ARRAY ARRAY[NULL::text,'','none','holm:invalid','yahtzee:invalid','357:multi:unique'] LOOP
    IF private.target_holm_fixture_player_cards(profile,1) IS NOT NULL
       OR private.target_holm_fixture_chucky(profile,4) IS NOT NULL
       OR private.target_yahtzee_fixture_dice(profile) IS NOT NULL
       OR private.target_yahtzee_seed_scores(profile,true) IS NOT NULL THEN
      RAISE EXCEPTION 'fixture_isolation:disabled_profile_returned_data:%',profile;
    END IF;
  END LOOP;

  -- Targeted fake-money Yahtzee fixtures still prepare dice and settle through
  -- the normal authenticated action path, for both a winner and a tie.
  FOREACH profile IN ARRAY ARRAY['yahtzee:terminal:unique','yahtzee:terminal:tie'] LOOP
    f:=pg_temp.isolation_game('yahtzee',false); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
    result:=public.arm_target_rule_branch_harness(g,profile,600);
    IF result->>'outcome'<>'armed' THEN RAISE EXCEPTION 'fixture_isolation:yahtzee_arm_failed:%',result; END IF;
    result:=public.start_yahtzee_round(g,NULL); r:=(result->>'round_id')::uuid;
    FOR actor IN 1..2 LOOP
      PERFORM set_config('request.jwt.claim.sub',f->>('u'||actor),true);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>('u'||actor),'role','authenticated')::text,true);
      result:=public.prepare_yahtzee_rule_branch_turn(g);
      IF result->>'outcome'<>'prepared' THEN RAISE EXCEPTION 'fixture_isolation:yahtzee_prepare_failed:%',result; END IF;
      result:=public.yahtzee_apply_action(r,(f->>('p'||actor))::uuid,'score',NULL,
        result->>'category',NULL,(result#>>'{state,actionSequence}')::integer);
      IF result->>'outcome'<>'applied' THEN RAISE EXCEPTION 'fixture_isolation:yahtzee_score_failed:%',result; END IF;
    END LOOP;
    IF NOT coalesce((result->>'terminal')::boolean,false)
       OR (SELECT count(*) FROM public.game_results WHERE game_id=g AND dealer_game_id=d AND settlement_key='yahtzee_terminal')
         <>(CASE WHEN profile='yahtzee:terminal:tie' THEN 0 ELSE 1 END)
       OR (profile='yahtzee:terminal:tie' AND result#>>'{settlement,terminal_disposition}' IS DISTINCT FROM 'tie_rollover')
       OR (SELECT sum(chips) FROM public.players WHERE game_id=g)+(SELECT pot FROM public.games WHERE id=g)<>200 THEN
      RAISE EXCEPTION 'fixture_isolation:yahtzee_terminal_or_conservation:%',result;
    END IF;
  END LOOP;

  -- Every ordinary constructor is exercised with both master-switch states.
  -- Yahtzee near_win is deliberately selected, including on real-money rows.
  FOREACH mode IN ARRAY ARRAY[false,true] LOOP
    UPDATE public.system_settings SET value=jsonb_set(value,'{enabled}',to_jsonb(mode)) WHERE key='harnesses_mode';
    UPDATE public.game_defaults SET debug_harness='near_win' WHERE game_type='yahtzee';
    FOREACH money IN ARRAY ARRAY[true,false] LOOP
      FOREACH typ IN ARRAY ARRAY['holm-game','yahtzee'] LOOP
        f:=pg_temp.isolation_game(typ,money); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
        p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
        IF typ='holm-game' THEN
          result:=public.start_holm_initial_hand(g,false);
        ELSE result:=public.start_yahtzee_round(g,NULL); END IF;
        IF result->>'outcome'<>'started' THEN RAISE EXCEPTION 'fixture_isolation:start_failed:%',result; END IF;
        r:=(result->>'round_id')::uuid;
        IF typ='holm-game' THEN
          PERFORM private.assert_holm_round_card_integrity(r);
          SELECT count(*) INTO n FROM public.player_cards WHERE round_id=r AND jsonb_array_length(cards)=4;
          IF n<>2 OR (SELECT pot FROM public.games WHERE id=g)<>6
             OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND chips<>97) THEN
            RAISE EXCEPTION 'fixture_isolation:ordinary_holm_deal_or_ante';
          END IF;
          replay:=public.start_holm_initial_hand(g,false);
        ELSE
          SELECT count(*) INTO n FROM jsonb_each(result->'state'->'playerStates') ps
            WHERE ps.value#>'{scorecard,scores}'<>'{}'::jsonb;
          IF n<>(CASE WHEN money IS FALSE AND mode THEN 2 ELSE 0 END) THEN
            RAISE EXCEPTION 'fixture_isolation:yahtzee_scorecard_leak:%/%/%',money,mode,n;
          END IF;
          replay:=public.start_yahtzee_round(g,NULL);
        END IF;
        IF replay->>'round_id' IS DISTINCT FROM r::text OR coalesce((replay->>'deduped')::boolean,false) IS NOT TRUE
           OR (SELECT count(*) FROM public.rounds WHERE game_id=g)<>1 THEN
          RAISE EXCEPTION 'fixture_isolation:start_replay_changed_identity';
        END IF;
        IF typ='holm-game' THEN
          -- The ordinary continuation core also publishes only a valid cohort.
          UPDATE public.games SET awaiting_next_round=true WHERE id=g;
          result:=public.proceed_to_next_holm_hand_core(g,r);
          IF result->>'outcome'<>'started' OR result->>'hand_number'<>'2' THEN
            RAISE EXCEPTION 'fixture_isolation:holm_core_continuation_failed:%',result;
          END IF;
          PERFORM private.assert_holm_round_card_integrity((result->>'round_id')::uuid);
          replay:=public.proceed_to_next_holm_hand_core(g,r);
          IF replay->>'round_id' IS DISTINCT FROM result->>'round_id'
             OR coalesce((replay->>'deduped')::boolean,false) IS NOT TRUE THEN
            RAISE EXCEPTION 'fixture_isolation:holm_core_replay_changed_identity';
          END IF;
        END IF;
        count_cases:=count_cases+1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Same physical card in symbol/word encodings must also be rejected.
  failed:=false;
  BEGIN
    PERFORM private.assert_unique_holm_cards('[{"rank":"Q","suit":"diamonds"},{"rank":"Q","suit":"♦"}]');
  EXCEPTION WHEN check_violation THEN failed:=SQLERRM='holm_card_integrity:duplicate_card'; END;
  IF NOT failed THEN RAISE EXCEPTION 'fixture_isolation:normalized_duplicate_accepted'; END IF;

  -- A valid fake-money Holm fixture still works.
  f:=pg_temp.isolation_game('holm-game',false); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
  result:=public.arm_target_rule_branch_harness(g,'holm:multi:unique',600);
  IF result->>'outcome'<>'armed' THEN RAISE EXCEPTION 'fixture_isolation:fake_arm_failed:%',result; END IF;
  result:=public.start_holm_initial_hand(g,false); r:=(result->>'round_id')::uuid;
  IF (SELECT cards->0->>'rank' FROM public.player_cards WHERE round_id=r AND player_id=(f->>'p1')::uuid)<>'A' THEN
    RAISE EXCEPTION 'fixture_isolation:fake_holm_fixture_lost';
  END IF;
  PERFORM private.assert_holm_round_card_integrity(r);

  -- Force a bad deal only in this rollback transaction. The actual constructor
  -- must reject it and roll back the ante, round, player cards and fixture claim.
  SELECT pg_get_functiondef('private.target_holm_fixture_player_cards(text,integer)'::regprocedure) INTO original_helper;
  f:=pg_temp.isolation_game('holm-game',false); g:=(f->>'game')::uuid;
  result:=public.arm_target_rule_branch_harness(g,'holm:multi:unique',600);
  EXECUTE $override$CREATE OR REPLACE FUNCTION private.target_holm_fixture_player_cards(p_profile text,p_player_index integer)
    RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS
    'SELECT jsonb_build_array(jsonb_build_object(''rank'',''9'',''suit'',chr(9827)))'$override$;
  failed:=false;
  BEGIN PERFORM public.start_holm_initial_hand(g,false);
  EXCEPTION WHEN check_violation THEN failed:=SQLERRM='holm_card_integrity:duplicate_card'; END;
  EXECUTE original_helper;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g)
     OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g)
     OR EXISTS(SELECT 1 FROM public.players WHERE game_id=g AND chips<>100)
     OR (SELECT pot FROM public.games WHERE id=g)<>0 THEN
    RAISE EXCEPTION 'fixture_isolation:bad_deal_was_published_or_charged';
  END IF;

  -- An invalid persisted synthetic cohort cannot be newly settled. Validate
  -- across different player hands as well as within a player/community hand.
  f:=pg_temp.isolation_game('holm-game',true); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid;
  p1:=(f->>'p1')::uuid; p2:=(f->>'p2')::uuid;
  result:=public.start_holm_initial_hand(g,false); r:=(result->>'round_id')::uuid;
  UPDATE public.player_cards SET cards=(SELECT cards FROM public.player_cards WHERE round_id=r AND player_id=p1)
    WHERE round_id=r AND player_id=p2;
  SELECT jsonb_agg(jsonb_build_object('id',id,'chips',chips) ORDER BY id) INTO before_chips FROM public.players WHERE game_id=g;
  failed:=false;
  BEGIN
    PERFORM public.holm_settle_hand(g,d,1,'showdown_final_award',6,true,'invalid',
      jsonb_build_object(p1::text,6,p2::text,-6),'invalid',p1,'invalid',false,6);
  EXCEPTION WHEN check_violation THEN failed:=SQLERRM='holm_card_integrity:duplicate_card'; END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g AND event_kind IS NOT NULL)
     OR (SELECT jsonb_agg(jsonb_build_object('id',id,'chips',chips) ORDER BY id) FROM public.players WHERE game_id=g) IS DISTINCT FROM before_chips THEN
    RAISE EXCEPTION 'fixture_isolation:invalid_settlement_changed_money';
  END IF;
  RAISE NOTICE 'fixture_isolation:passed % constructor cases, disabled/invalid profiles, fake fixture preservation, duplicate rejection, atomic rollback and replay',count_cases;
END;
$proof$;

SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
