-- Qualification only; enrollment is disabled outside synthetic fixtures.
CREATE OR REPLACE FUNCTION public.start_gin_rummy_initial_hand(_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_player_ids uuid[];
  v_dealer_id uuid;
  v_nondealer_id uuid;
  v_dealer_config jsonb;
  v_points integer;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:authentication_required'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:not_gin_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'start_gin_rummy_initial_hand:not_in_session';
  END IF;
  IF v_game.current_game_uuid IS NULL THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:missing_dealer_game'; END IF;

  SELECT * INTO v_round FROM public.rounds
   WHERE game_id=_game_id AND dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
  END IF;

  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong_status','status',v_game.status);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.players p WHERE p.game_id=_game_id
      AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left')
      AND p.ante_decision IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome','rejected','reason','waiting_for_antes','status',v_game.status);
  END IF;
  SELECT array_agg(p.id ORDER BY p.position) INTO v_player_ids
    FROM public.players p WHERE p.game_id=_game_id AND p.ante_decision='ante_up'
      AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left');
  IF coalesce(cardinality(v_player_ids),0)<>2 THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:requires_two_admitted_players'; END IF;

  SELECT config INTO v_dealer_config FROM public.dealer_games
   WHERE id=v_game.current_game_uuid AND session_id=_game_id AND game_type='gin-rummy' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:dealer_game_not_found'; END IF;
  IF coalesce(v_dealer_config->>'points_to_win','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'start_gin_rummy_initial_hand:invalid_config'; END IF;
  v_points := (v_dealer_config->>'points_to_win')::integer;

  SELECT p.id INTO v_dealer_id FROM public.players p
   WHERE p.game_id=_game_id AND p.id=ANY(v_player_ids) AND p.position=v_game.dealer_position LIMIT 1;
  v_dealer_id := coalesce(v_dealer_id,v_player_ids[1]);
  SELECT player_id INTO v_nondealer_id FROM unnest(v_player_ids) player_id WHERE player_id<>v_dealer_id LIMIT 1;
  v_state := private.gin_deal_state(v_game,v_dealer_id,v_nondealer_id,NULL,1,v_points,v_game.ante_amount);

  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  BEGIN
    INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,gin_rummy_state)
    VALUES (_game_id,v_game.current_game_uuid,1,1,10,0,'betting',private.gin_public_state(v_state))
    RETURNING * INTO v_round;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_round FROM public.rounds
     WHERE game_id=_game_id AND dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1 LIMIT 1;
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
  END;
  PERFORM private.gin_publish_state(v_round.id,v_state);
  UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id RETURNING * INTO v_game;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_open_v1(v_game,v_round,v_state,v_dealer_config);
  END IF;
  RETURN jsonb_build_object('outcome','started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
END;
$function$
;
CREATE OR REPLACE FUNCTION private.gin_apply_action_core(_round_id uuid, _player_id uuid, _action text, _card jsonb, _meld_index integer, _expected_action_count bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_replay_before jsonb;
  v_replay_middle jsonb;
  v_replay_context jsonb;
  v_replay_prior_root text := current_setting('app.replay_gin_action_root',true);
  v_hand jsonb;
  v_actual_card jsonb;
  v_top jsonb;
  v_opponent text;
  v_knocker text;
  v_group jsonb;
  v_opponent_group jsonb;
  v_target_meld jsonb;
  v_melds jsonb;
  v_new_meld jsonb;
  v_count bigint;
  v_phase text;
  v_now text := to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_apply_action:round_not_found'; END IF;
  PERFORM private.assert_game_not_paused(v_round.game_id);
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_apply_action:not_gin_game'; END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','state',NULL);
  END IF;
  SELECT state,replay_context_v1 INTO v_state,v_replay_context FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:state_not_found'; END IF;
  IF NOT (v_state->'playerStates' ? _player_id::text) THEN RAISE EXCEPTION 'gin_rummy_apply_action:player_not_in_round'; END IF;
  v_count := coalesce((v_state->>'actionCount')::bigint,0);
  IF _expected_action_count IS NOT NULL AND _expected_action_count IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('outcome','stale_action','state',v_state);
  END IF;

  IF v_game.replay_contract_version=1 THEN v_replay_before := v_state; END IF;

  IF _action='take_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_take'; END IF;
    v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
    IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
    v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_discard','playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action='pass_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_pass'; END IF;
    IF jsonb_array_length(coalesce(v_state->'firstDrawPassed','[]'::jsonb))=0 THEN
      v_state := jsonb_set(v_state,'{firstDrawPassed}',jsonb_build_array(_player_id),true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','pass_first_draw','playerId',_player_id,'timestamp',v_now),true);
    ELSE
      IF v_game.replay_contract_version=1 THEN
        v_replay_middle := jsonb_set(v_state,'{firstDrawPassed}',v_state->'firstDrawPassed'||jsonb_build_array(_player_id),true);
        v_replay_middle := jsonb_set(v_replay_middle,'{lastAction}',jsonb_build_object('type','pass_first_draw','playerId',_player_id,'timestamp',v_now),true);
      END IF;
      v_opponent := v_state->>'nonDealerPlayerId';
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_empty'; END IF;
      v_hand := v_state->'playerStates'->v_opponent->'hand' || jsonb_build_array(v_top);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'hand'],v_hand,true);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_stock','playerId',v_opponent,'card',v_top,'timestamp',v_now),true);
    END IF;

  ELSIF _action IN ('draw_stock','draw_discard') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'draw' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_draw'; END IF;
    IF _action='draw_stock' THEN
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_exhausted'; END IF;
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
    ELSE
      IF jsonb_array_length(v_state->'discardPile')=0 THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
      v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
      v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type',_action,'playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action IN ('discard','knock') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'discard' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_discard'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    IF v_actual_card IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:card_not_in_hand'; END IF;
    IF v_state->>'drawSource'='discard'
       AND private.gin_card_key(v_state->'lastAction'->'card')=private.gin_card_key(v_actual_card) THEN
      RAISE EXCEPTION 'gin_rummy_apply_action:cannot_rediscard_picked_discard';
    END IF;
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',v_state->'discardPile'||jsonb_build_array(v_actual_card),true);
    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type','card_discarded','state',v_state)); END IF;
    v_opponent := CASE WHEN _player_id::text=v_state->>'dealerPlayerId' THEN v_state->>'nonDealerPlayerId' ELSE v_state->>'dealerPlayerId' END;
    IF _action='discard' THEN
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"draw"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','discard','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN
        v_state := jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
        v_state := jsonb_set(v_state,'{knockResult}','null'::jsonb,true);
        v_state := jsonb_set(v_state,'{completeDueAt}',to_jsonb(to_char((clock_timestamp()+interval '2 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
      END IF;
    ELSE
      v_group := private.gin_optimal_grouping(v_hand);
      IF (v_group->>'deadwoodValue')::integer>10 THEN RAISE EXCEPTION 'gin_rummy_apply_action:deadwood_exceeds_knock_limit'; END IF;
      v_opponent_group := private.gin_optimal_grouping(v_state->'playerStates'->v_opponent->'hand');
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasKnocked'],'true'::jsonb,true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasGin'],to_jsonb((v_group->>'deadwoodValue')::integer=0),true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'melds'],v_opponent_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwood'],v_opponent_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwoodValue'],v_opponent_group->'deadwoodValue',true);
      IF (v_group->>'deadwoodValue')::integer=0 THEN
        v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
        v_state := jsonb_set(v_state,'{scoringDueAt}',to_jsonb(to_char((clock_timestamp()+interval '4 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','gin','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      ELSE
        v_state := jsonb_set(v_state,'{phase}','"knocking"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','knock','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      END IF;
    END IF;

  ELSIF _action='lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text OR coalesce((v_state->'playerStates'->v_knocker->>'hasGin')::boolean,false) THEN RAISE EXCEPTION 'gin_rummy_apply_action:layoff_not_allowed'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    v_melds := v_state->'playerStates'->v_knocker->'melds';
    v_target_meld := v_melds->_meld_index;
    IF v_actual_card IS NULL OR v_target_meld IS NULL OR NOT private.gin_can_lay_off(v_actual_card,v_target_meld) THEN RAISE EXCEPTION 'gin_rummy_apply_action:invalid_layoff'; END IF;
    v_new_meld := jsonb_set(v_target_meld,'{cards}',v_target_meld->'cards'||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',v_knocker,'melds',_meld_index::text],v_new_meld,true);
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_group := private.gin_optimal_grouping(v_hand);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type','card_laid_off','state',v_state)); END IF;
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'laidOffCards'],coalesce(v_state->'playerStates'->_player_id::text->'laidOffCards','[]'::jsonb)||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,'{phase}','"laying_off"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','lay_off','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);

  ELSIF _action='finish_lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','decline_lay_off','playerId',_player_id,'timestamp',v_now),true);

  ELSIF _action='finalize_scoring' THEN
    IF v_state->>'phase'<>'scoring' THEN
      RETURN jsonb_build_object('outcome','already_advanced','state',v_state);
    END IF;
  ELSE
    RAISE EXCEPTION 'gin_rummy_apply_action:unknown_action:%',_action;
  END IF;

  IF _action IN ('finish_lay_off','finalize_scoring') THEN
    IF v_game.replay_contract_version=1 THEN v_replay_middle:=jsonb_build_array(jsonb_build_object('type',_action,'state',v_state)); END IF;
    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);
  ELSE
    v_state := jsonb_set(v_state,'{actionCount}',to_jsonb(v_count+1),true);
    v_state := jsonb_set(v_state,'{botActionDueAt}',to_jsonb(to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  END IF;

  IF v_game.replay_contract_version=1 THEN
    PERFORM set_config('app.replay_gin_edges','',true);
    PERFORM set_config('app.replay_gin_action_root',_round_id::text,true);
  END IF;
  PERFORM private.gin_publish_state(_round_id,v_state);
  v_phase := v_state->>'phase';
  IF v_phase='complete' THEN
    IF nullif(v_state->>'winnerPlayerId','') IS NULL THEN
      PERFORM private.gin_record_hand_result(v_round,v_state);
    ELSE
      PERFORM public.gin_rummy_settle_game(v_round.game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number);
    END IF;
  END IF;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_transition_v1(v_replay_context,v_replay_before,v_state,_player_id,_action,coalesce(v_actual_card,_card),_meld_index,v_replay_middle);
    PERFORM set_config('app.replay_gin_action_root',coalesce(v_replay_prior_root,''),true);
  END IF;
  RETURN jsonb_build_object('outcome','applied','state',v_state);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.gin_rummy_settle_game_legacy(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_replay_standalone_context jsonb; v_replay_standalone_state jsonb;
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_dealer_config jsonb;
  v_state jsonb;
  v_knock_result jsonb;
  v_match_scores jsonb;
  v_winner_id uuid;
  v_loser_id uuid;
  v_hand_winner_id uuid;
  v_winner_score integer;
  v_loser_score integer;
  v_points_to_win integer;
  v_ante_amount integer;
  v_per_point_value integer;
  v_payout_amount integer;
  v_hand_points integer;
  v_knocker_deadwood integer;
  v_opponent_deadwood integer;
  v_winner_username text;
  v_hand_description text;
  v_terminal_description text;
  v_chip_changes jsonb;
  v_hand_chip_changes jsonb;
  v_existing_terminal public.game_results%ROWTYPE;
  v_existing_hand public.game_results%ROWTYPE;
  v_existing_hand_count integer;
  v_result_id uuid;
  v_end_session boolean;
  v_disposition text;
  v_updated_player_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_not_found:%', p_round_id;
  END IF;

  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:game_not_found:%', p_game_id;
  END IF;

  -- A service-role/database proof has auth.uid() = NULL. Every browser caller
  -- must otherwise be a participant in this session or an administrator.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:caller_not_in_session';
  END IF;

  SELECT config INTO v_dealer_config
    FROM public.dealer_games
   WHERE id = p_dealer_game_id
     AND session_id = p_game_id
     AND game_type = 'gin-rummy';
  IF NOT FOUND OR jsonb_typeof(v_dealer_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:dealer_game_not_found';
  END IF;

  v_state := v_round.gin_rummy_state;
  IF jsonb_typeof(v_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_state';
  END IF;
  IF v_state->>'phase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_not_complete:%',
      COALESCE(v_state->>'phase', 'null');
  END IF;
  IF jsonb_typeof(v_state->'playerStates') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(v_state->'playerStates')) <> 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_player_roster';
  END IF;
  IF jsonb_typeof(v_state->'matchScores') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(v_state->'matchScores')) <> 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_match_scores';
  END IF;

  BEGIN
    v_winner_id := NULLIF(v_state->>'winnerPlayerId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_winner';
  END;
  IF v_winner_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:tie_not_terminal';
  END IF;
  IF NOT (v_state->'playerStates' ? v_winner_id::text) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:winner_not_in_roster';
  END IF;

  BEGIN
    SELECT key::uuid INTO v_loser_id
      FROM jsonb_object_keys(v_state->'playerStates') AS key
     WHERE key::uuid <> v_winner_id
     LIMIT 1;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_player_identity';
  END;
  IF v_loser_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_player_roster';
  END IF;

  IF COALESCE(v_dealer_config->>'points_to_win', '') !~ '^[1-9][0-9]*$'
     OR COALESCE(v_dealer_config->>'per_point_value', '0') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_dealer_config';
  END IF;
  BEGIN
    v_points_to_win := (v_dealer_config->>'points_to_win')::integer;
    v_per_point_value := COALESCE((v_dealer_config->>'per_point_value')::integer, 0);
    v_ante_amount := (v_state->>'anteAmount')::integer;
    v_winner_score := (v_state->'matchScores'->>v_winner_id::text)::integer;
    v_loser_score := (v_state->'matchScores'->>v_loser_id::text)::integer;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_terminal_state';
  END;
  IF v_points_to_win <= 0 OR v_per_point_value < 0
     OR v_ante_amount < 0 OR v_winner_score < 0 OR v_loser_score < 0
     OR v_ante_amount IS DISTINCT FROM v_game.ante_amount
     OR (v_state->>'pointsToWin') IS DISTINCT FROM v_points_to_win::text
     OR v_winner_score < v_points_to_win
     OR v_winner_score <= v_loser_score THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_terminal_scores';
  END IF;

  v_knock_result := v_state->'knockResult';
  IF jsonb_typeof(v_knock_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_hand_result';
  END IF;
  BEGIN
    v_hand_winner_id := (v_knock_result->>'winnerId')::uuid;
    v_hand_points := (v_knock_result->>'pointsAwarded')::integer;
    v_knocker_deadwood := (v_knock_result->>'knockerDeadwood')::integer;
    v_opponent_deadwood := (v_knock_result->>'opponentDeadwood')::integer;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_hand_result';
  END;
  IF v_hand_winner_id IS DISTINCT FROM v_winner_id
     OR v_hand_points <= 0
     OR v_knocker_deadwood < 0
     OR v_opponent_deadwood < 0
     OR jsonb_typeof(v_knock_result->'isGin') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_knock_result->'isUndercut') IS DISTINCT FROM 'boolean'
     OR ((v_knock_result->>'isGin')::boolean AND (v_knock_result->>'isUndercut')::boolean) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_hand_result';
  END IF;

  SELECT COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         )
    INTO v_winner_username
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.id = v_winner_id
     AND p.game_id = p_game_id;
  IF v_winner_username IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:winner_not_in_session';
  END IF;

  v_payout_amount := v_ante_amount
    + ((v_winner_score - v_loser_score) * v_per_point_value);
  v_chip_changes := jsonb_build_object(
    v_winner_id::text, v_payout_amount,
    v_loser_id::text, -v_payout_amount
  );
  v_hand_chip_changes := jsonb_build_object(
    v_winner_id::text, v_ante_amount,
    v_loser_id::text, -v_ante_amount
  );
  v_hand_description := CASE
    WHEN (v_knock_result->>'isGin')::boolean
      THEN 'Gin! +' || v_hand_points::text || ' pts'
    WHEN (v_knock_result->>'isUndercut')::boolean
      THEN 'Undercut! +' || v_hand_points::text || ' pts'
    ELSE 'Knock (' || v_knocker_deadwood::text || ' vs '
      || v_opponent_deadwood::text || ') +' || v_hand_points::text || ' pts'
  END;
  v_terminal_description := v_winner_username || ' wins '
    || v_winner_score::text || '-' || v_loser_score::text
    || ' +$' || v_payout_amount::text;

  -- An existing durable claim is a valid replay even after ordinary lifecycle
  -- progression moved this session to a different dealer game.
  SELECT * INTO v_existing_terminal
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'gin_rummy_terminal'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_terminal.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_terminal.pot_won IS DISTINCT FROM v_payout_amount
       OR v_existing_terminal.player_chip_changes IS DISTINCT FROM v_chip_changes
       OR v_existing_terminal.winning_hand_description IS DISTINCT FROM v_terminal_description
       OR v_existing_terminal.game_type IS DISTINCT FROM 'gin-rummy'
       OR v_existing_terminal.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'gin_rummy_settle_game:authoritative_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_terminal.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_winner_id,
      'payout_amount', v_payout_amount,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END
    );
  END IF;

  IF v_game.game_type IS DISTINCT FROM 'gin-rummy'
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_round.status = 'completed' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:game_not_settleable';
  END IF;

  -- A pre-cutover browser can only have written one non-financial final hand
  -- record. Accept an exact match; reject every ambiguous legacy partial.
  SELECT count(*) INTO v_existing_hand_count
    FROM public.game_results
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = 'gin-rummy'
     AND settlement_key IS NULL;
  IF v_existing_hand_count > 1 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_existing_hand_count = 1 THEN
    SELECT * INTO v_existing_hand
      FROM public.game_results
     WHERE game_id = p_game_id
       AND dealer_game_id = p_dealer_game_id
       AND hand_number = p_hand_number
       AND game_type = 'gin-rummy'
       AND settlement_key IS NULL
     LIMIT 1;
    IF v_existing_hand.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_hand.pot_won IS DISTINCT FROM v_ante_amount
       OR v_existing_hand.player_chip_changes IS DISTINCT FROM v_hand_chip_changes
       OR v_existing_hand.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'gin_rummy_settle_game:legacy_hand_result_mismatch_requires_review';
    END IF;
  ELSE
    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, settlement_key, game_type,
      winner_player_id, winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped
    ) VALUES (
      p_game_id, p_dealer_game_id, p_hand_number, 'gin_rummy_hand_history', 'gin-rummy',
      v_winner_id, v_winner_username, v_winner_username || ': ' || v_hand_description,
      v_ante_amount, v_hand_chip_changes, false
    );
  END IF;

  -- The durable terminal result is the claim. Any later failure rolls it back
  -- with the transfer, snapshot batch, and disposition, so replay starts clean.
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'gin_rummy_terminal', 'gin-rummy',
    v_winner_id, v_winner_username, v_terminal_description,
    v_payout_amount, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  UPDATE public.players p
     SET chips = p.chips + CASE
       WHEN p.id = v_winner_id THEN v_payout_amount
       WHEN p.id = v_loser_id THEN -v_payout_amount
       ELSE 0
     END
   WHERE p.game_id = p_game_id
     AND p.id IN (v_winner_id, v_loser_id);
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  PERFORM private.replay_gin_note_transfer_v1(v_game,v_loser_id,v_winner_id,v_payout_amount,v_result_id);
  IF v_updated_player_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:payout_roster_changed';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  -- Snapshot after payout and before terminal status fires SessionResult.
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
         COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         ),
         p.chips, p.is_bot, p_hand_number
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.game_id = p_game_id
  ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    username = EXCLUDED.username,
    chips = EXCLUDED.chips,
    is_bot = EXCLUDED.is_bot,
    created_at = EXCLUDED.created_at;

  v_end_session := COALESCE(v_game.pending_session_end, false);
  v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;

  -- Last: `record_session_results` reads the post-payout snapshot batch.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         awaiting_next_round = false,
         last_round_result = v_terminal_description,
         game_over_at = COALESCE(game_over_at, v_now),
         session_ended_at = CASE
           WHEN v_end_session THEN COALESCE(session_ended_at, v_now)
           ELSE session_ended_at
         END,
         pending_session_end = CASE
           WHEN v_end_session THEN false
           ELSE pending_session_end
         END
   WHERE id = p_game_id;

  IF v_game.replay_contract_version=1 AND coalesce(current_setting('app.replay_gin_action_root',true),'')<>p_round_id::text AND coalesce(current_setting('app.replay_gin_settlement_root',true),'')<>p_round_id::text THEN
    SELECT state,replay_context_v1 INTO v_replay_standalone_state,v_replay_standalone_context FROM private.gin_rummy_round_states WHERE round_id=p_round_id;
    PERFORM private.replay_gin_transition_v1(v_replay_standalone_context,v_replay_standalone_state,v_replay_standalone_state,NULL,'settlement',NULL,NULL);
  END IF;
  RETURN jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'hand_number', p_hand_number,
    'winner_player_id', v_winner_id,
    'payout_amount', v_payout_amount,
    'terminal_disposition', v_disposition
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.gin_rummy_settle_game(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_replay_context jsonb;
  v_replay_prior_settlement text:=current_setting('app.replay_gin_settlement_root',true);
  v_result jsonb;
  v_winner uuid;
  v_loser uuid;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_internal boolean := coalesce(current_setting('app.gin_rummy_authoritative_write',true),'')='on';
BEGIN
  IF v_actor IS NULL AND NOT v_service AND NOT v_internal THEN RAISE EXCEPTION 'gin_rummy_settle_game:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_identity_mismatch';
  END IF;
  IF NOT v_service AND NOT v_internal AND NOT public.user_is_in_game(p_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:not_in_session';
  END IF;
  SELECT state,replay_context_v1 INTO v_state,v_replay_context FROM private.gin_rummy_round_states WHERE round_id=p_round_id FOR UPDATE;
  IF v_state IS NULL OR v_state->>'phase'<>'complete' OR nullif(v_state->>'winnerPlayerId','') IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:private_state_not_terminal';
  END IF;
  v_winner := (v_state->>'winnerPlayerId')::uuid;
  SELECT key::uuid INTO v_loser FROM jsonb_object_keys(v_state->'playerStates') key WHERE key::uuid<>v_winner LIMIT 1;
  IF v_loser IS NULL THEN RAISE EXCEPTION 'gin_rummy_settle_game:invalid_private_roster'; END IF;
  IF v_round.gin_rummy_state IS DISTINCT FROM private.gin_public_state(v_state) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:projection_mismatch';
  END IF;
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  IF v_replay_context IS NOT NULL THEN PERFORM set_config('app.replay_gin_settlement_root',p_round_id::text,true); END IF;
  v_result := public.gin_rummy_settle_game_legacy(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);
  IF v_replay_context IS NOT NULL THEN PERFORM set_config('app.replay_gin_settlement_root',coalesce(v_replay_prior_settlement,''),true); END IF;
  UPDATE public.game_results
     SET pot_won=0,
         player_chip_changes=jsonb_build_object(v_winner::text,0,v_loser::text,0)
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
     AND hand_number=p_hand_number AND settlement_key='gin_rummy_hand_history';
  IF v_replay_context IS NOT NULL AND v_result->>'status'='settled' AND coalesce(current_setting('app.replay_gin_action_root',true),'')<>p_round_id::text THEN
    PERFORM private.replay_gin_transition_v1(v_replay_context,v_state,v_state,NULL,'settlement',NULL,NULL);
  END IF;
  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.gin_start_next_hand_core(_predecessor_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_previous public.rounds%ROWTYPE;
  v_next public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_next_state jsonb;
  v_hand_number integer;
  v_next_dealer uuid;
  v_next_nondealer uuid;
BEGIN
  SELECT * INTO v_previous FROM public.rounds WHERE id=_predecessor_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_previous.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:not_gin_game'; END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_predecessor_round_id FOR UPDATE;
  IF v_state IS NULL OR v_state->>'phase'<>'complete' OR nullif(v_state->>'winnerPlayerId','') IS NOT NULL THEN
    RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_continuable';
  END IF;
  v_hand_number := v_previous.hand_number+1;
  SELECT * INTO v_next FROM public.rounds
   WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_previous.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_previous.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status,'state',NULL);
  END IF;
  v_next_dealer := (v_state->>'nonDealerPlayerId')::uuid;
  v_next_nondealer := (v_state->>'dealerPlayerId')::uuid;
  v_next_state := private.gin_deal_state(
    v_game,v_next_dealer,v_next_nondealer,v_state->'matchScores',v_hand_number,
    (v_state->>'pointsToWin')::integer,(v_state->>'anteAmount')::integer
  );
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  BEGIN
    INSERT INTO public.rounds(
      game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,gin_rummy_state,predecessor_round_id
    ) VALUES (
      v_previous.game_id,v_previous.dealer_game_id,1,v_hand_number,10,0,'betting',
      private.gin_public_state(v_next_state),v_previous.id
    ) RETURNING * INTO v_next;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_next FROM public.rounds
     WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1 LIMIT 1;
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END;
  PERFORM private.gin_publish_state(v_next.id,v_next_state);
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=v_previous.id;
  UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id RETURNING * INTO v_game;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_open_v1(v_game,v_next,v_next_state,(SELECT config FROM public.dealer_games WHERE id=v_next.dealer_game_id));
  END IF;
  RETURN jsonb_build_object('outcome','started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.gin_rummy_advance_postgame(_game_id uuid, _round_id uuid, _dealer_game_id uuid, _hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_claim private.gin_rummy_postgame_advances%ROWTYPE;
  v_winner public.players%ROWTYPE;
  v_winner_id uuid;
  v_settlement_count integer;
  v_active_count integer;
  v_active_humans integer;
  v_allow_bot_dealers boolean := false;
  v_make_it_take_it boolean := false;
  v_positions integer[];
  v_human_count integer;
  v_single_human_position integer;
  v_index integer;
  v_next_dealer integer;
  v_target text;
  v_deadline timestamptz;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_prior_authority text;
BEGIN
  IF _game_id IS NULL OR _round_id IS NULL OR _dealer_game_id IS NULL OR coalesce(_hand_number,0)<1 THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:missing_identity';
  END IF;
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_found'; END IF;
  IF v_round.game_id IS DISTINCT FROM _game_id OR v_round.dealer_game_id IS DISTINCT FROM _dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM _hand_number THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_gin_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_in_session'; END IF;

  SELECT * INTO v_claim FROM private.gin_rummy_postgame_advances claim
   WHERE claim.game_id=_game_id AND claim.dealer_game_id=_dealer_game_id
     AND claim.round_id=_round_id AND claim.hand_number=_hand_number;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','already_advanced','deduped',true,'status',v_claim.target_status,
      'dealer_position',v_claim.dealer_position,'config_deadline',v_claim.config_deadline);
  END IF;
  IF v_game.status IS DISTINCT FROM 'game_over' OR v_game.current_game_uuid IS DISTINCT FROM _dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM _hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,'current_hand_number',v_game.total_hands);
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  BEGIN v_winner_id:=nullif(v_state->>'winnerPlayerId','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:malformed_winner'; END;
  IF v_round.status IS DISTINCT FROM 'completed' OR v_state->>'phase'<>'complete' OR v_winner_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_terminal';
  END IF;
  SELECT count(*) INTO v_settlement_count FROM public.game_results result
   WHERE result.game_id=_game_id AND result.dealer_game_id=_dealer_game_id
     AND result.hand_number=_hand_number AND result.settlement_key='gin_rummy_terminal'
     AND result.winner_player_id=v_winner_id;
  IF v_settlement_count<>1 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:settlement_not_committed:%',v_settlement_count; END IF;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:winner_not_in_session'; END IF;

  v_prior_authority:=current_setting('app.gin_rummy_authoritative_write',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM 1 FROM public.players WHERE game_id=_game_id ORDER BY id FOR UPDATE;
  UPDATE public.players player SET
    status=CASE WHEN coalesce(player.stand_up_next_hand,false) THEN 'left' ELSE player.status END,
    sitting_out=CASE
      WHEN coalesce(player.stand_up_next_hand,false) OR coalesce(player.sit_out_next_hand,false) THEN true
      WHEN coalesce(player.waiting,false) THEN false ELSE player.sitting_out END,
    waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,
    auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,
    ante_decision=NULL,auto_ante=false,auto_ante_runback=false
   WHERE player.game_id=_game_id;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=_game_id;

  SELECT count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL),
         count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL AND NOT coalesce(p.is_bot,false))
    INTO v_active_count,v_active_humans FROM public.players p WHERE p.game_id=_game_id;
  IF coalesce(v_game.pending_session_end,false) OR v_active_humans=0 THEN
    v_target:='session_ended';
  ELSIF v_active_count<2 THEN
    v_target:='waiting';
  END IF;

  IF v_target IS NULL THEN
    SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot_dealers
      FROM public.game_defaults defaults WHERE defaults.game_type='holm' LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_make_it_take_it
      FROM public.system_settings setting WHERE setting.key='make_it_take_it' LIMIT 1;
    IF coalesce(v_make_it_take_it,false) THEN
      IF NOT coalesce(v_winner.is_bot,false) AND NOT coalesce(v_winner.sitting_out,false)
         AND v_winner.status NOT IN ('observer','left') THEN
        v_next_dealer:=v_winner.position;
      ELSE
        SELECT count(*),min(p.position) INTO v_human_count,v_single_human_position
          FROM public.players p WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false)
            AND p.status NOT IN ('observer','left') AND NOT coalesce(p.is_bot,false);
        IF v_human_count=1 THEN v_next_dealer:=v_single_human_position;
        ELSIF v_human_count>1 THEN v_target:='dealer_selection'; END IF;
      END IF;
    END IF;
    IF v_target IS NULL AND v_next_dealer IS NULL THEN
      SELECT array_agg(p.position ORDER BY p.position) INTO v_positions FROM public.players p
       WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left')
         AND (coalesce(v_allow_bot_dealers,false) OR NOT coalesce(p.is_bot,false));
      IF coalesce(cardinality(v_positions),0)=0 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:no_eligible_dealer'; END IF;
      v_index:=array_position(v_positions,coalesce(v_game.dealer_position,1));
      v_next_dealer:=CASE WHEN v_index IS NULL THEN v_positions[1]
        ELSE v_positions[(v_index%cardinality(v_positions))+1] END;
    END IF;
    IF v_target IS NULL THEN
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30)));
    END IF;
  END IF;

  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL
   WHERE game_id=_game_id AND dealer_game_id=_dealer_game_id;
  UPDATE public.games SET
    status=v_target,config_complete=false,config_deadline=v_deadline,ante_decision_deadline=NULL,last_round_result=NULL,current_round=NULL,
    awaiting_next_round=false,next_round_number=NULL,pot=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
    game_over_at=CASE WHEN v_target='session_ended' THEN game_over_at ELSE NULL END,buck_position=NULL,total_hands=0,
    is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
    dealer_position=CASE WHEN v_target='game_selection' THEN v_next_dealer ELSE dealer_position END,
    session_ended_at=CASE WHEN v_target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END,
    pending_session_end=CASE WHEN v_target='session_ended' THEN false ELSE pending_session_end END
   WHERE id=_game_id;
  INSERT INTO private.gin_rummy_postgame_advances(
    game_id,dealer_game_id,round_id,hand_number,winner_player_id,target_status,dealer_position,config_deadline
  ) VALUES (_game_id,_dealer_game_id,_round_id,_hand_number,v_winner_id,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_dealer END,v_deadline);
  PERFORM set_config('app.gin_rummy_authoritative_write',coalesce(v_prior_authority,''),true);
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_postgame_v1(_game_id,_round_id,jsonb_build_object('status',v_target,'dealerPosition',v_next_dealer));
  END IF;
  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_dealer END,'config_deadline',v_deadline);
END;
$function$
;
