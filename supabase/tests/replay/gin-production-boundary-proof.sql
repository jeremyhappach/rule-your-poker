DO $proof$ DECLARE f jsonb;result jsonb;new_start text;g public.games;n bigint;body_before jsonb;game_type_other text;BEGIN
 BEGIN
  SELECT pg_get_functiondef('public.start_gin_rummy_initial_hand(uuid)'::regprocedure) INTO new_start;
  EXECUTE $original$CREATE OR REPLACE FUNCTION public.start_gin_rummy_initial_hand(_game_id uuid)
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
  UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
END;
$function$
$original$;
  f:=private.replay_gin_benchmark_prepare(false,'ordinary');
  EXECUTE new_start;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
  result:=public.gin_rummy_apply_action((f->>'round')::uuid,(f->>'actor')::uuid,f->>'action',NULL,NULL,(f->>'count')::bigint);
  IF result->>'outcome'<>'applied' OR EXISTS(SELECT 1 FROM private.replay_steps WHERE session_id=(f->>'game')::uuid) THEN RAISE EXCEPTION 'legacy hand was enrolled';END IF;
  f:=private.replay_gin_benchmark_prepare(true,'ordinary');
  SELECT * INTO g FROM public.games WHERE id=(f->>'game')::uuid;
  IF g.replay_contract_version<>1 OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>1 THEN RAISE EXCEPTION 'new opening not captured atomically';END IF;
  SELECT game_type INTO game_type_other FROM public.game_defaults WHERE game_type<>'gin-rummy' LIMIT 1;
  UPDATE public.games SET game_type=game_type_other WHERE id=g.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
  PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
  IF (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>1 THEN RAISE EXCEPTION 'other game captured';END IF;
  f:=private.replay_gin_benchmark_prepare(true,'reveal_void');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
  result:=public.gin_rummy_apply_action((f->>'round')::uuid,(f->>'actor')::uuid,f->>'action',nullif(f->'card','null'::jsonb),NULL,(f->>'count')::bigint);
  IF public.export_gin_replay_v1((f->>'game')::uuid,(f->>'round')::uuid,true)#>>'{seal,completeness}'<>'complete' THEN RAISE EXCEPTION 'pre-recovery seal not complete';END IF;
  SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=(f->>'game')::uuid;
  SELECT body INTO body_before FROM private.replay_steps WHERE session_id=(f->>'game')::uuid ORDER BY sequence LIMIT 1;
  EXECUTE $recovery_sql$-- Emergency recovery: atomic, non-destructive, keeps all replay rows/exporter.
-- Restore original gameplay owners and append an explicit partial tail before
-- disabling enrollment. Run as one transaction during a controlled recovery.
SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=false;
DO $recovery$ DECLARE g record;last_step jsonb;pause_guard text:=coalesce(current_setting('app.session_pause_write',true),'');BEGIN
 FOR g IN SELECT id FROM public.games WHERE replay_contract_version=1 ORDER BY id FOR UPDATE LOOP
  SELECT body INTO last_step FROM private.replay_steps WHERE session_id=g.id ORDER BY sequence DESC LIMIT 1;
  IF last_step IS NOT NULL THEN
   PERFORM private.replay_append_v1(g.id,'capture-suspended:'||gen_random_uuid(),last_step->'identity',NULL,
    jsonb_build_array(jsonb_build_object('type','capture.suspended','source','gin-replay-production-recovery','actorId',NULL,'targets','[]'::jsonb,'origin','recovery','operands','{}'::jsonb,'delta','[]'::jsonb,'scores','[]'::jsonb,'transfers','[]'::jsonb)));
  END IF;
 END LOOP;
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.session_pause_write','on',true);
 UPDATE public.games SET replay_contract_version=NULL WHERE replay_contract_version=1;
 PERFORM set_config('app.session_pause_write',pause_guard,true);
END $recovery$;
CREATE OR REPLACE FUNCTION private.complete_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_winner_position integer;
  v_prepared_at timestamptz;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;
  BEGIN
    v_winner_position := nullif(v_game.dealer_selection_state->>'winnerPosition','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_winner';
  END;
  IF v_winner_position IS NULL THEN
    RETURN jsonb_build_object('outcome','not_prepared');
  END IF;
  BEGIN
    v_prepared_at:=nullif(v_game.dealer_selection_state->>'preparedAt','')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_prepared_at';
  END;
  IF v_prepared_at IS NULL OR v_prepared_at+interval '3 seconds'>clock_timestamp() THEN
    RETURN jsonb_build_object(
      'outcome','presentation_pending','prepared_at',v_prepared_at
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.position = v_winner_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  ) THEN
    RETURN jsonb_build_object('outcome','winner_ineligible');
  END IF;

  v_deadline := clock_timestamp() + make_interval(
    secs => greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
  );
  UPDATE public.games
     SET status = 'game_selection',
         dealer_position = v_winner_position,
         config_complete = false,
         config_deadline = v_deadline,
         current_game_uuid = NULL
   WHERE id = p_game_id;
  RETURN jsonb_build_object(
    'outcome','advanced','status','game_selection',
    'dealer_position',v_winner_position,'config_deadline',v_deadline
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION private.finalize_settled_session_if_no_active_humans(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_result_count integer := 0;
  v_snapshot_count integer := 0;
  v_missing_or_stale_snapshot boolean := false;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF NOT COALESCE(v_game.real_money, false) THEN
    RETURN 'ineligible-state';
  END IF;

  IF v_game.status = 'session_ended' THEN
    RETURN 'already-session-ended';
  END IF;

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    RETURN 'active-humans';
  END IF;

  SELECT count(*) INTO v_result_count
    FROM public.game_results
   WHERE game_id = p_game_id;

  IF v_result_count = 0 THEN
    RETURN 'no-settled-results';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_snapshot_count
    FROM public.session_player_snapshots
   WHERE game_id = p_game_id
     AND is_bot = false;

  SELECT EXISTS (
    SELECT 1
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.is_bot = false
       AND player.status <> 'observer'
       AND NOT EXISTS (
         SELECT 1
           FROM (
             SELECT DISTINCT ON (snapshot.user_id)
                    snapshot.user_id,
                    snapshot.chips
               FROM public.session_player_snapshots AS snapshot
              WHERE snapshot.game_id = p_game_id
                AND snapshot.is_bot = false
              ORDER BY snapshot.user_id, snapshot.created_at DESC, snapshot.id DESC
           ) AS latest
          WHERE latest.user_id = player.user_id
            AND latest.chips = player.chips
       )
  ) INTO v_missing_or_stale_snapshot;

  IF v_snapshot_count = 0 OR v_missing_or_stale_snapshot THEN
    RETURN 'blocked-incomplete-final-snapshots';
  END IF;

  -- The existing games-status trigger mints SessionResult rows from the
  -- already-final snapshots. Its unique key keeps a repeated call idempotent.
  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;

  RETURN 'session-ended-with-results';
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
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:state_not_found'; END IF;
  IF NOT (v_state->'playerStates' ? _player_id::text) THEN RAISE EXCEPTION 'gin_rummy_apply_action:player_not_in_round'; END IF;
  v_count := coalesce((v_state->>'actionCount')::bigint,0);
  IF _expected_action_count IS NOT NULL AND _expected_action_count IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('outcome','stale_action','state',v_state);
  END IF;

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
    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);
  ELSE
    v_state := jsonb_set(v_state,'{actionCount}',to_jsonb(v_count+1),true);
    v_state := jsonb_set(v_state,'{botActionDueAt}',to_jsonb(to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
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
  RETURN jsonb_build_object('outcome','applied','state',v_state);
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
  UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false WHERE id=v_previous.game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.prepare_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_allow_bot boolean := false;
  v_remaining uuid[];
  v_winners uuid[];
  v_player_id uuid;
  v_position integer;
  v_deck jsonb;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_round integer := 0;
  v_deck_index integer := 0;
  v_rank_value integer;
  v_highest integer;
  v_prepared_at timestamptz := clock_timestamp();
  v_winner_position integer;
  v_state jsonb;
  v_harness_value jsonb;
  v_harness_expires_at timestamptz;
  v_harness_applied boolean := false;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;

  IF coalesce((v_game.dealer_selection_state->>'isComplete')::boolean,false)
     AND (v_game.dealer_selection_state->>'winnerPosition') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome','already_prepared','state',v_game.dealer_selection_state
    );
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm')
   LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);

  SELECT array_agg(player.id ORDER BY player.position)
    INTO v_remaining
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false));

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    SELECT array_agg(player.id ORDER BY player.position)
      INTO v_remaining
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND NOT coalesce(player.sitting_out,false)
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left');
  END IF;

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    RETURN jsonb_build_object('outcome','no_eligible_players');
  END IF;

  -- Lock the single request before testing it. A second concurrent dealer draw
  -- sees the consumed value after this transaction commits, so the fixture can
  -- never leak into two sessions.
  SELECT setting.value
    INTO v_harness_value
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness'
   FOR UPDATE;

  BEGIN
    v_harness_expires_at := nullif(v_harness_value->>'expiresAt', '')::timestamptz;
    v_harness_applied := cardinality(v_remaining) > 1
      AND coalesce((v_harness_value->>'armed')::boolean, false)
      AND nullif(v_harness_value->>'armedBy', '')::uuid = v_game.current_host
      AND v_harness_expires_at > clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN
    v_harness_applied := false;
  END;

  IF v_harness_applied THEN
    -- First two seats receive equal aces; every other eligible seat receives a
    -- lower unique card. The tied seats then receive K/Q, guaranteeing a real
    -- second draw with one winner while preserving deck uniqueness.
    WITH all_cards AS (
      SELECT rank, suit,
        CASE rank
          WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
          ELSE rank::integer
        END AS rank_value
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit
    ), first_round_fill AS (
      SELECT row_number() OVER (ORDER BY card.rank_value DESC, card.suit) + 2 AS sequence,
             card.rank,
             card.suit
        FROM all_cards card
       WHERE card.rank_value <= 11
       ORDER BY card.rank_value DESC, card.suit
       LIMIT greatest(cardinality(v_remaining) - 2, 0)
    ), forced_cards AS (
      SELECT 1::bigint AS sequence, 'A'::text AS rank, '♠'::text AS suit
      UNION ALL SELECT 2, 'A', '♥'
      UNION ALL SELECT fill.sequence, fill.rank, fill.suit FROM first_round_fill fill
      UNION ALL SELECT cardinality(v_remaining) + 1, 'K', '♠'
      UNION ALL SELECT cardinality(v_remaining) + 2, 'Q', '♠'
    ), remaining_cards AS (
      SELECT card.rank, card.suit, private.secure_shuffle_key() AS random_order
        FROM all_cards card
       WHERE NOT EXISTS (
         SELECT 1 FROM forced_cards forced
          WHERE forced.rank = card.rank AND forced.suit = card.suit
       )
    ), ordered_cards AS (
      SELECT 0 AS section, forced.sequence::double precision AS sequence,
             forced.rank, forced.suit
        FROM forced_cards forced
      UNION ALL
      SELECT 1, remaining.random_order, remaining.rank, remaining.suit
        FROM remaining_cards remaining
    )
    SELECT jsonb_agg(
             jsonb_build_object('rank', deck.rank, 'suit', deck.suit)
             ORDER BY deck.section, deck.sequence
           )
      INTO v_deck
      FROM ordered_cards deck;

    UPDATE public.system_settings
       SET value = v_harness_value || jsonb_build_object(
             'armed', false,
             'consumedAt', clock_timestamp(),
             'consumedGameId', p_game_id
           ),
           updated_at = clock_timestamp()
     WHERE key = 'session_dealer_draw_tie_harness';
  ELSE
    SELECT jsonb_agg(
             jsonb_build_object('rank',rank,'suit',suit)
             ORDER BY private.secure_shuffle_key()
           )
      INTO v_deck
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit;
  END IF;

  WHILE cardinality(v_remaining) > 1 LOOP
    v_round := v_round + 1;
    v_highest := 0;
    v_winners := ARRAY[]::uuid[];
    FOREACH v_player_id IN ARRAY v_remaining LOOP
      v_card := v_deck -> v_deck_index;
      v_deck_index := v_deck_index + 1;
      SELECT player.position INTO v_position
        FROM public.players player WHERE player.id = v_player_id;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_highest THEN
        v_highest := v_rank_value;
        v_winners := ARRAY[v_player_id];
      ELSIF v_rank_value = v_highest THEN
        v_winners := array_append(v_winners,v_player_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId',v_player_id,'position',v_position,'card',v_card,
        'isRevealed',true,'isWinner',false,'isDimmed',false,
        'roundNumber',v_round
      ));
    END LOOP;

    SELECT coalesce(jsonb_agg(
      CASE WHEN (entry.value->>'roundNumber')::integer = v_round THEN
        entry.value || jsonb_build_object(
          'isWinner',(entry.value->>'playerId')::uuid = ANY(v_winners),
          'isDimmed',NOT ((entry.value->>'playerId')::uuid = ANY(v_winners))
        ) ELSE entry.value END
      ORDER BY entry.ordinality
    ),'[]'::jsonb) INTO v_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS entry(value,ordinality);

    v_remaining := v_winners;
  END LOOP;

  v_player_id := v_remaining[1];
  SELECT player.position INTO v_winner_position
    FROM public.players player WHERE player.id = v_player_id;

  IF jsonb_array_length(v_cards) = 0 THEN
    v_state := jsonb_build_object(
      'cards','[]'::jsonb,
      'announcement','Only eligible player wins the deal',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
  ELSE
    v_state := jsonb_build_object(
      'cards',v_cards,
      'announcement','Seat ' || v_winner_position::text || ' wins the deal!',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
    IF v_harness_applied THEN
      v_state := v_state || jsonb_build_object(
        'harnessApplied', 'force_first_round_tie_once'
      );
    END IF;
  END IF;

  UPDATE public.games
     SET dealer_selection_state = v_state
   WHERE id = p_game_id;

  PERFORM private.register_game_timer(
    p_game_id, 'dealer_selection_complete', p_timer_generation::text,
    'canonical_timers', v_prepared_at + interval '3 seconds',
    NULL, NULL, NULL, v_player_id, 'dealer_selection',
    jsonb_build_object(
      'timer_generation',p_timer_generation,
      'winner_position',v_winner_position,
      'prepared_at',v_prepared_at
    )
  );

  RETURN jsonb_build_object('outcome','prepared','state',v_state);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.request_session_end(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; ctx text; prior jsonb:='{}'; target text; terminal_key text; settled boolean:=false; result jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true); END IF;
 IF g.status IN ('session_ended','completed') THEN
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','session_ended','already_terminal',true); END IF;
 IF g.status='game_over' THEN
  terminal_key:=CASE g.game_type WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN '3-5-7-game' THEN 'three_five_seven_terminal'
   WHEN '357' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal'
   WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  SELECT coalesce(g.pot,0)=0 AND EXISTS(SELECT 1 FROM public.game_results r WHERE r.game_id=g.id
   AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands
   AND ((g.game_type IN ('holm','holm-game') AND r.event_kind='chucky_final_award') OR r.settlement_key=terminal_key))
   INTO settled;
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF (g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0 AND g.status IN ('waiting','dealer_selection','game_selection','configuring')) OR settled THEN
  IF g.real_money IS FALSE AND g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0
   AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND chips<>0)
   AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g.id) THEN
   DELETE FROM public.games WHERE id=g.id; target:='deleted';
  ELSE
   UPDATE public.games SET status='session_ended',session_ended_at=coalesce(session_ended_at,clock_timestamp()),
    pending_session_end=false,config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=g.id;
   target:='session_ended';
  END IF;
 ELSE
  -- Rule engines consume the request at their financial completion boundary.
  UPDATE public.games SET pending_session_end=true WHERE id=g.id;
  target:='pending_session_end';
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition',target,'already_terminal',false);
END $function$
;
CREATE OR REPLACE FUNCTION public.begin_session_dealer_selection(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_host public.players%ROWTYPE;
  v_other public.players%ROWTYPE;
  v_occupant public.players%ROWTYPE;
  v_eligible_count integer := 0;
  v_target_position integer;
  v_old_other_position integer;
  v_new_dealer_position integer;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF NOT v_service AND auth.uid() IS NULL THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
  IF v_game.status = 'dealer_selection' THEN
    RETURN jsonb_build_object('outcome','already_started','status',v_game.status,'timer_generation',v_game.timer_generation,'dealer_selection_state',v_game.dealer_selection_state);
  END IF;
  IF v_game.status <> 'waiting' THEN
    RETURN jsonb_build_object('outcome','not_startable','status',v_game.status);
  END IF;
  PERFORM 1 FROM public.players player WHERE player.game_id = p_game_id FOR UPDATE;
  SELECT count(*) INTO v_eligible_count
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false));
  IF v_eligible_count < 2 THEN
    RETURN jsonb_build_object('outcome','not_ready','eligible_players',v_eligible_count);
  END IF;
  SELECT player.* INTO v_host
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     AND NOT coalesce(player.is_bot,false)
   ORDER BY CASE WHEN player.user_id = v_game.current_host THEN 0 ELSE 1 END,
            player.created_at NULLS LAST, player.id
   LIMIT 1;
  IF NOT FOUND THEN
    SELECT player.* INTO v_host
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     ORDER BY player.created_at NULLS LAST, player.id
     LIMIT 1;
  END IF;
  IF NOT v_service AND v_host.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  IF v_eligible_count = 2 THEN
    SELECT player.* INTO v_other
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.id <> v_host.id
       AND player.position IS NOT NULL AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     LIMIT 1;
    v_target_position := ((v_host.position - 1 + 3) % 7) + 1;
    v_old_other_position := v_other.position;
    IF least(abs(v_host.position - v_other.position),7 - abs(v_host.position - v_other.position)) <> 3 THEN
      SELECT player.* INTO v_occupant FROM public.players player
       WHERE player.game_id = p_game_id AND player.id <> v_other.id
         AND player.position = v_target_position LIMIT 1;
      IF FOUND THEN UPDATE public.players SET position = NULL WHERE id = v_occupant.id; END IF;
      UPDATE public.players SET position = v_target_position WHERE id = v_other.id;
      IF v_occupant.id IS NOT NULL THEN
        UPDATE public.players SET position = v_old_other_position WHERE id = v_occupant.id;
      END IF;
      v_new_dealer_position := v_game.dealer_position;
      IF v_new_dealer_position = v_old_other_position THEN
        v_new_dealer_position := v_target_position;
      ELSIF v_occupant.id IS NOT NULL AND v_new_dealer_position = v_target_position THEN
        v_new_dealer_position := v_old_other_position;
      END IF;
      IF v_new_dealer_position IS DISTINCT FROM v_game.dealer_position THEN
        UPDATE public.games SET dealer_position = v_new_dealer_position WHERE id = p_game_id;
      END IF;
    END IF;
  END IF;
  UPDATE public.players SET status = 'active', sitting_out = false, waiting = false
   WHERE game_id = p_game_id AND position IS NOT NULL AND status NOT IN ('observer','left')
     AND (coalesce(waiting,false) OR NOT coalesce(sitting_out,false));
  UPDATE public.games
     SET status = 'dealer_selection', dealer_selection_state = NULL, current_game_uuid = NULL,
         config_deadline = NULL, config_complete = false, awaiting_next_round = false, last_round_result = NULL
   WHERE id = p_game_id
   RETURNING * INTO v_game;
  RETURN jsonb_build_object('outcome','started','status',v_game.status,'timer_generation',v_game.timer_generation);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_session_bot(_game_id uuid, _bot_id uuid, _aggression_level text, _position integer, _sitting_out boolean DEFAULT false, _waiting boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 _next integer; _name text; _suffix text; _player public.players;
 _game public.games; _actor uuid:=auth.uid();
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'create_session_bot:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO _game FROM public.games WHERE id=_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'create_session_bot:game_not_found'; END IF;
 IF _game.current_host IS DISTINCT FROM _actor AND NOT public.has_role(_actor,'admin'::public.app_role) THEN
   RAISE EXCEPTION 'create_session_bot:host_required' USING ERRCODE='42501';
 END IF;
 IF _game.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'create_session_bot:fake_money_only' USING ERRCODE='42501'; END IF;
 IF _game.status IN ('completed','session_ended','game_over') THEN RAISE EXCEPTION 'create_session_bot:terminal_game'; END IF;
 IF _bot_id IS NULL OR _position IS NULL OR _position NOT BETWEEN 1 AND 7
    OR coalesce(_aggression_level,'normal') NOT IN ('very_conservative','conservative','normal','aggressive','very_aggressive') THEN
   RAISE EXCEPTION 'create_session_bot:invalid_request';
 END IF;
 -- The caller's UUID is an operation identity, never a replacement identity.
 SELECT * INTO _player FROM public.players WHERE game_id=_game_id AND user_id=_bot_id;
 IF FOUND THEN
   IF NOT _player.is_bot THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
   SELECT username INTO _name FROM public.profiles WHERE id=_bot_id;
   SELECT (event_data->>'bot_alias_ordinal')::integer INTO _next FROM public.session_events
    WHERE game_id=_game_id AND event_type='bot_added' AND event_data->>'bot_id'=_bot_id::text LIMIT 1;
   RETURN jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_bot_id) THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=_game_id AND position=_position) THEN
   RAISE EXCEPTION 'Seat % is already occupied',_position;
 END IF;
 _next:=public.allocate_bot_alias_number(_game_id);
 _name:='Bot '||_next::text;
 _suffix:=substr(replace(_bot_id::text,'-',''),1,6);
 IF EXISTS(SELECT 1 FROM public.profiles WHERE username=_name) THEN _name:=_name||'-'||_suffix; END IF;
 INSERT INTO public.profiles(id,username,aggression_level)
 VALUES(_bot_id,_name,coalesce(_aggression_level,'normal'));
 INSERT INTO public.players(user_id,game_id,position,chips,is_bot,status,sitting_out,waiting)
 VALUES(_bot_id,_game_id,_position,0,true,'active',
   _game.status='in_progress' OR coalesce(_sitting_out,false),
   _game.status='in_progress' OR coalesce(_waiting,false))
 RETURNING * INTO _player;
 INSERT INTO public.session_events(game_id,event_type,event_data,user_id)
 VALUES(_game_id,'bot_added',jsonb_build_object('position',_position,'bot_username',_name,
   'bot_alias_ordinal',_next,'bot_id',_bot_id),_actor);
 RETURN jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',false);
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
  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_dealer END,'config_deadline',v_deadline);
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
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=p_round_id FOR UPDATE;
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
  v_result := public.gin_rummy_settle_game_legacy(p_game_id,p_round_id,p_dealer_game_id,p_hand_number);
  UPDATE public.game_results
     SET pot_won=0,
         player_chip_changes=jsonb_build_object(v_winner::text,0,v_loser::text,0)
   WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
     AND hand_number=p_hand_number AND settlement_key='gin_rummy_hand_history';
  RETURN v_result;
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
CREATE OR REPLACE FUNCTION public.request_session_end(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; fallback_host uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_end:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true); END IF;
 SELECT user_id INTO fallback_host FROM public.players WHERE game_id=g.id AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL ORDER BY created_at,id LIMIT 1;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 coalesce(g.current_host,fallback_host) IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL)
 AND NOT (g.current_host=auth.uid() AND g.status='waiting' AND g.current_game_uuid IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id))) THEN
 RAISE EXCEPTION 'session_end:not_session_host' USING ERRCODE='42501'; END IF;
 IF g.status IN ('session_ended','completed') THEN RETURN private.request_session_end(g.id); END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.timer_generation IS DISTINCT FROM p_expected_timer_generation THEN
 RETURN jsonb_build_object('request_recorded',false,'outcome','stale_identity'); END IF;
 RETURN private.request_session_end(g.id);
END $function$
;
CREATE OR REPLACE FUNCTION public.session_leave(p_game_id uuid, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  g public.games%ROWTYPE; p public.players%ROWTYPE; result jsonb;
  keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write',
    'app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  prior text[]:=ARRAY[]::text[]; i integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing-game'); END IF;
  SELECT * INTO p FROM public.players
    WHERE id=p_player_id AND game_id=p_game_id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  IF g.status IN ('session_ended','completed') THEN
    RETURN jsonb_build_object('outcome','already-session-ended');
  END IF;
  IF p.participation_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('outcome','stale-participation');
  END IF;
  IF p.status='left' THEN RETURN jsonb_build_object('outcome','already-left'); END IF;
  -- A mid-hand departure is not a settled hand. Never occupy its financial snapshot key.
  IF g.current_game_uuid IS NOT NULL OR coalesce(g.total_hands,0)>0 OR p.chips<>0 THEN
    INSERT INTO private.session_departures
      (game_id,player_id,participation_version,user_id,dealer_game_id,hand_number,position,chips)
    VALUES(g.id,p.id,p.participation_version,p.user_id,g.current_game_uuid,coalesce(g.total_hands,0),p.position,p.chips)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR i IN 1..cardinality(keys) LOOP
    prior:=array_append(prior,coalesce(current_setting(keys[i],true),''));
    PERFORM set_config(keys[i],'on',true);
  END LOOP;
  result:=private.stand_up_and_resolve_postgame(p_game_id);
  FOR i IN 1..cardinality(keys) LOOP PERFORM set_config(keys[i],prior[i],true); END LOOP;
  RETURN result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.session_take_seat(p_game_id uuid, p_position integer, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  g public.games%ROWTYPE; p public.players%ROWTYPE; occupant public.players%ROWTYPE;
  in_play boolean; waiting_room boolean; v_deck text; v_prior_357 text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active
  ) THEN RAISE EXCEPTION 'session_take_seat:not_authorized' USING ERRCODE='42501'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'session_take_seat:invalid_seat';
  END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing-game'); END IF;
  IF g.status IN ('session_ended','completed') THEN
    RETURN jsonb_build_object('outcome','already-session-ended');
  END IF;
  SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF p.id IS DISTINCT FROM p_player_id OR (p.id IS NOT NULL AND p.participation_version IS DISTINCT FROM p_expected_version) THEN
    RETURN jsonb_build_object('outcome','stale-participation');
  END IF;
  in_play:=g.status NOT IN ('waiting','waiting_for_players','dealer_selection','game_selection','configuring','ante_decision');
  waiting_room:=g.status IN ('waiting','waiting_for_players');
  IF in_play AND p.id IS NOT NULL AND p.status NOT IN ('left','observer') AND p.position IS DISTINCT FROM p_position THEN
    RAISE EXCEPTION 'session_take_seat:seat_locked_during_game';
  END IF;
  SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=p_position AND id IS DISTINCT FROM p.id FOR UPDATE;
  IF occupant.id IS NOT NULL THEN
    -- Preserve an in-flight participant's seat identity through settlement.
    IF occupant.status NOT IN ('left','observer') OR in_play THEN
      RAISE EXCEPTION 'session_take_seat:seat_occupied';
    END IF;
    UPDATE public.players SET position=NULL WHERE id=occupant.id;
  END IF;
  IF p.id IS NULL THEN
    IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND EXISTS(
      SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true'
    ) THEN RAISE EXCEPTION 'session_take_seat:maintenance' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=auth.uid()) THEN
      RAISE EXCEPTION 'session_take_seat:missing_historical_participant';
    END IF;
    SELECT deck_color_mode INTO v_deck FROM public.profiles WHERE id=auth.uid();
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
    VALUES(g.id,auth.uid(),p_position,0,'active',in_play,waiting_room OR in_play,v_deck)
    RETURNING * INTO p;
  ELSIF p.status IN ('left','observer') OR p.position IS NULL THEN
    UPDATE public.players SET position=p_position,status='active',sitting_out=in_play,
      waiting=waiting_room OR in_play,ante_decision=NULL,stand_up_next_hand=false,sit_out_next_hand=false
    WHERE id=p.id RETURNING * INTO p;
  ELSE
    UPDATE public.players SET position=p_position,
      sitting_out=CASE WHEN in_play THEN sitting_out ELSE false END,
      status=CASE WHEN in_play THEN status ELSE 'active' END,
      waiting=CASE WHEN in_play THEN waiting ELSE false END
    WHERE id=p.id RETURNING * INTO p;
  END IF;
  -- A newcomer at an already-settled boundary has an authoritative zero opening
  -- balance. Include it for session finalization without reserving an active hand.
  IF p.chips=0 AND g.status IN ('waiting','waiting_for_players','game_over')
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id=g.id)
     AND NOT EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=p.user_id) THEN
    v_prior_357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
    SELECT g.id,g.current_game_uuid,coalesce(g.total_hands,0),p.id,p.user_id,coalesce(profile.username,'Player'),0,false
      FROM public.profiles profile WHERE profile.id=p.user_id;
    PERFORM set_config('app.three_five_seven_authoritative_write',v_prior_357,true);
  END IF;
  UPDATE public.games SET current_host=(
    SELECT seated.user_id FROM public.players seated WHERE seated.game_id=g.id AND NOT seated.is_bot
      AND seated.status NOT IN ('left','observer') AND seated.position IS NOT NULL
    ORDER BY seated.created_at,seated.id LIMIT 1
  ) WHERE id=g.id AND NOT EXISTS (
    SELECT 1 FROM public.players host WHERE host.game_id=g.id AND host.user_id=g.current_host
      AND NOT host.is_bot AND host.status NOT IN ('left','observer') AND host.position IS NOT NULL
  );
  RETURN jsonb_build_object('outcome','seated','player_id',p.id,'participation_version',p.participation_version);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN RETURN jsonb_build_object('outcome','not_authorized'); END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN RETURN jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version); END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('outcome','busy');
END $function$
;
CREATE OR REPLACE FUNCTION public.set_session_player_intent(p_game_id uuid, p_player_id uuid, p_expected_version bigint, p_expected_dealer_game_id uuid, p_option text, p_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; p public.players%ROWTYPE; prior357 text;
BEGIN
 IF auth.uid() IS NULL OR p_value IS NULL OR p_option IS NULL OR p_option NOT IN
 ('auto_ante','auto_ante_runback','sit_out_next_hand','stand_up_next_hand','rejoin','cancel_exit') THEN
  RAISE EXCEPTION 'participant_intent:invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'participant_intent:missing_session'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR (NOT coalesce(p.is_bot,false) AND p.user_id IS DISTINCT FROM auth.uid())
 OR (coalesce(p.is_bot,false) AND (g.real_money IS DISTINCT FROM false OR g.current_host IS DISTINCT FROM auth.uid()))
 THEN RAISE EXCEPTION 'participant_intent:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR p.position IS NULL OR p.status IN ('left','observer')
 OR g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
 OR p.intent_version IS DISTINCT FROM p_expected_version THEN
  RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF p_option IN ('rejoin','cancel_exit') AND NOT p_value THEN
  RAISE EXCEPTION 'participant_intent:invalid_value' USING ERRCODE='22023'; END IF;
 prior357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_ante=CASE WHEN p_option='auto_ante' THEN p_value WHEN p_option='auto_ante_runback' AND p_value THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN p_option='auto_ante_runback' THEN p_value WHEN p_option='auto_ante' AND p_value THEN false ELSE auto_ante_runback END,
 sit_out_next_hand=CASE WHEN p_option='sit_out_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='stand_up_next_hand' AND p_value) THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN p_option='stand_up_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='sit_out_next_hand' AND p_value) THEN false ELSE stand_up_next_hand END,
 waiting=CASE WHEN p_option='rejoin' THEN true WHEN p_option IN ('sit_out_next_hand','stand_up_next_hand') AND p_value THEN false ELSE waiting END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior357,true);
 RETURN jsonb_build_object('outcome','accepted','player',to_jsonb(p));
END $function$
;
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
  UPDATE public.games SET status='in_progress',current_round=1,total_hands=1,pot=0,is_first_hand=true WHERE id=_game_id;
  RETURN jsonb_build_object('outcome','started','round_id',v_round.id,'hand_number',1,'state',private.gin_project_state(v_state,_game_id,v_actor));
END;
$function$
;
CREATE OR REPLACE FUNCTION private.reconcile_session_abandonment(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_watch private.session_abandonment_watches%ROWTYPE;
  v_active_humans integer := 0;
  v_seated_humans integer := 0;
  v_missed_heartbeat_counts jsonb := '{}'::jsonb;
  v_active_grace_seconds integer := 60;
  v_sitting_out_grace_seconds integer := 60;
  v_forced_confirmation_seconds integer := 15;
  v_initial_grace_seconds integer := 300;
  v_nonpristine boolean := false;
  v_outcome text;
  v_deleted integer := 0;
  v_authority_keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write','app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  v_prior_settings text[]:=ARRAY[]::text[];
  v_setting_index integer;
BEGIN
  IF p_game_id IS NULL THEN
    RETURN 'missing-game-id';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    IF v_game.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;
    END IF;
    RETURN 'ineligible-state';
  END IF;

  SELECT * INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'unarmed';
  END IF;

  SELECT
    CASE
      WHEN setting.value ->> 'subsequent_active_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_active_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'subsequent_sitting_out_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_sitting_out_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'forced_absence_confirmation_seconds' ~ '^[0-9]+$'
        THEN LEAST(300, GREATEST(5,
          (setting.value ->> 'forced_absence_confirmation_seconds')::integer))
      ELSE 15
    END,
    CASE
      WHEN setting.value ->> 'initial_waiting_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(7200, GREATEST(60,
          (setting.value ->> 'initial_waiting_grace_seconds')::integer))
      ELSE 300
    END
    INTO v_active_grace_seconds, v_sitting_out_grace_seconds,
         v_forced_confirmation_seconds, v_initial_grace_seconds
    FROM public.system_settings AS setting
   WHERE setting.key = 'postgame_presence'
   LIMIT 1;

  v_active_grace_seconds := COALESCE(v_active_grace_seconds, 60);
  v_sitting_out_grace_seconds := COALESCE(v_sitting_out_grace_seconds, 60);
  v_forced_confirmation_seconds := COALESCE(v_forced_confirmation_seconds, 15);
  v_initial_grace_seconds := COALESCE(v_initial_grace_seconds, 300);

  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(EXTRACT(EPOCH FROM (
          p_now - GREATEST(
            v_watch.armed_at,
            player.created_at,
            COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
          )
        )) / 5)::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
    LEFT JOIN LATERAL (
      SELECT heartbeat.updated_at
        FROM public.voice_presence_heartbeats AS heartbeat
       WHERE heartbeat.game_id = p_game_id
         AND heartbeat.user_id = player.user_id
         AND heartbeat.status IN ('active', 'hidden')
         AND heartbeat.updated_at >= v_watch.armed_at
       ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
       LIMIT 1
    ) AS latest_heartbeat ON true
   WHERE player.game_id = p_game_id
     AND NOT player.is_bot
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Any heartbeat after a forced claim cancels stand-up, but Sitting Out is
  -- retained. The player opts back in through the ordinary table action.
  DELETE FROM private.postgame_forced_absence_watches AS forced
   WHERE forced.game_id = p_game_id
     AND (
       NOT EXISTS (
         SELECT 1
           FROM public.players AS player
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND NOT player.is_bot
            AND player.position IS NOT NULL
            AND player.sitting_out
            AND player.status NOT IN ('observer', 'left')
       )
       OR EXISTS (
         SELECT 1
           FROM public.players AS player
           JOIN public.voice_presence_heartbeats AS heartbeat
             ON heartbeat.user_id = player.user_id
            AND heartbeat.game_id = player.game_id
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       )
     );

  IF v_watch.waiting_kind = 'subsequent' THEN
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM private.postgame_forced_absence_watches AS forced
     WHERE forced.game_id = p_game_id
       AND forced.player_id = player.id
       AND player.game_id = forced.game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND p_now >= forced.armed_at
         + make_interval(secs => v_forced_confirmation_seconds)
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = forced.game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       );

    DELETE FROM private.postgame_forced_absence_watches AS forced
     USING public.players AS player
     WHERE forced.game_id = p_game_id
       AND player.id = forced.player_id
       AND player.game_id = forced.game_id
       AND (
         player.status IN ('observer', 'left')
         OR NOT player.sitting_out
       );

    -- A sitting-out human without a forced claim is voluntary (or recovered
    -- from one). Sixty seconds without any new heartbeat releases the seat.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND NOT EXISTS (
           SELECT 1
             FROM private.postgame_forced_absence_watches AS forced
            WHERE forced.game_id = player.game_id
              AND forced.player_id = player.id
         )
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_sitting_out_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    -- The lateral join above intentionally requires a post-boundary heartbeat.
    -- Handle never-seen voluntary sitters from the boundary timestamp.
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM private.postgame_forced_absence_watches AS forced
          WHERE forced.game_id = player.game_id
            AND forced.player_id = player.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_sitting_out_grace_seconds);

    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        LEFT JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND NOT player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
         ) + make_interval(secs => v_active_grace_seconds)
    ), demoted AS (
      UPDATE public.players AS player
         SET sitting_out = true,
             waiting = false
        FROM due
       WHERE player.id = due.id
       RETURNING player.game_id, player.id
    )
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT demoted.game_id, demoted.id, p_now, 'presence_timeout'
      FROM demoted
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  ELSE
    -- Initial Waiting has no Sit Out action. Ready humans are stood up after
    -- five minutes without a heartbeat and no intermediate demotion.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_initial_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_initial_grace_seconds);
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_seated_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = CASE
             WHEN v_active_humans = 0
               THEN COALESCE(zero_active_since, p_now)
             ELSE NULL
           END,
           last_checked_at = p_now,
           next_check_at = p_now + interval '5 seconds',
           missed_heartbeat_counts = v_missed_heartbeat_counts,
           last_outcome = 'seated-humans:' || v_seated_humans::text ||
             ';active-humans:' || v_active_humans::text ||
             ';missed-windows:' || v_missed_heartbeat_counts::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'seated-humans';
  END IF;

  IF v_watch.waiting_kind = 'initial' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dealer_games WHERE session_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.rounds WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dice_roll_audit WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.cribbage_hand_archive WHERE game_id = p_game_id)
      OR COALESCE(v_game.total_hands, 0) > 0
      OR COALESCE(v_game.pot, 0) <> 0
      OR v_game.current_game_uuid IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.players
         WHERE game_id = p_game_id AND chips <> 0
      )
      INTO v_nonpristine;

    IF v_nonpristine THEN
      UPDATE private.session_abandonment_watches
         SET last_checked_at = p_now,
             next_check_at = p_now + interval '15 minutes',
             last_outcome = 'blocked-nonpristine-initial-waiting',
             updated_at = p_now
       WHERE game_id = p_game_id;
      RETURN 'blocked-nonpristine-initial-waiting';
    END IF;

    IF v_game.real_money IS DISTINCT FROM false THEN
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        v_prior_settings:=array_append(v_prior_settings,coalesce(current_setting(v_authority_keys[v_setting_index],true),''));
        PERFORM set_config(v_authority_keys[v_setting_index],'on',true);
      END LOOP;
      UPDATE public.games SET status='session_ended',session_ended_at=p_now,game_over_at=coalesce(game_over_at,p_now),
        pending_session_end=false,is_paused=false WHERE id=p_game_id;
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        PERFORM set_config(v_authority_keys[v_setting_index],v_prior_settings[v_setting_index],true);
      END LOOP;
      DELETE FROM private.session_abandonment_watches WHERE game_id=p_game_id;
      RETURN 'archived-pristine-real-session';
    END IF;

    DELETE FROM public.session_events WHERE game_id = p_game_id;
    DELETE FROM public.voice_presence_heartbeats WHERE game_id = p_game_id;
    DELETE FROM public.games WHERE id = p_game_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN CASE WHEN v_deleted = 1
      THEN 'deleted-pristine-initial-session'
      ELSE 'delete-race-lost'
    END;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id) THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(
      p_game_id,
      p_now
    );
    RETURN v_outcome;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND (
       EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
       OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
       OR COALESCE(v_game.pot, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.players WHERE game_id = p_game_id AND chips <> 0)
     ) THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = p_now + interval '15 minutes',
           last_outcome = 'blocked-unsettled-financial-evidence',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'blocked-unsettled-financial-evidence';
  END IF;

  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;
  DELETE FROM private.postgame_forced_absence_watches
   WHERE game_id = p_game_id;

  RETURN 'session-ended-without-financial-settlement';
END;
$function$
;
CREATE OR REPLACE FUNCTION private.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
END $function$
;
CREATE OR REPLACE FUNCTION public.settle_gameplay_chip_transfers(p_game_id uuid, p_transfers jsonb, p_reason text DEFAULT 'transfer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_transfer jsonb;
  v_from_kind text;
  v_to_kind text;
  v_from_player_id uuid;
  v_to_player_id uuid;
  v_amount integer;
  v_endpoint_key text;
  v_delta integer;
  v_deltas jsonb := '{}'::jsonb;
  v_pot_delta integer := 0;
BEGIN
  IF p_game_id IS NULL OR jsonb_typeof(p_transfers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_input';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:game_not_found:%', p_game_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:caller_not_in_session';
  END IF;

  PERFORM set_config(
    'ptown.chip_transfer_reason',
    CASE WHEN p_reason IN ('ante', 'bet', 'win', 'leg', 'sweep', 'transfer') THEN p_reason ELSE 'transfer' END,
    true
  );

  FOR v_transfer IN SELECT value FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      v_amount := (v_transfer ->> 'amount')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END IF;

    v_from_kind := v_transfer #>> '{from,kind}';
    v_to_kind := v_transfer #>> '{to,kind}';
    IF v_from_kind NOT IN ('pot', 'player') OR v_to_kind NOT IN ('pot', 'player')
       OR v_from_kind = v_to_kind AND v_from_kind = 'pot' THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_endpoint';
    END IF;

    IF v_from_kind = 'player' THEN
      BEGIN v_from_player_id := (v_transfer #>> '{from,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_from_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_from_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) - v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta - v_amount;
    END IF;

    IF v_to_kind = 'player' THEN
      BEGIN v_to_player_id := (v_transfer #>> '{to,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_to_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_to_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) + v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta + v_amount;
    END IF;
  END LOOP;

  UPDATE public.players p
     SET chips = p.chips + (entry.value #>> '{}')::integer
    FROM jsonb_each(v_deltas) AS entry(key, value)
   WHERE p.id = substring(entry.key from 8)::uuid
     AND p.game_id = p_game_id
     AND (entry.value #>> '{}')::integer <> 0;

  IF v_pot_delta <> 0 THEN
    UPDATE public.games
       SET pot = COALESCE(pot, 0) + v_pot_delta
     WHERE id = p_game_id;
  END IF;

  RETURN jsonb_build_object('status', 'settled');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.transfer_session_host(p_game_id uuid, p_target_player_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; p public.players%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR g.current_host IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND position IS NOT NULL)
 THEN RAISE EXCEPTION 'session_host:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR g.host_version IS DISTINCT FROM p_expected_version THEN
 RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 SELECT * INTO p FROM public.players WHERE id=p_target_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.is_bot OR p.position IS NULL OR p.status IN ('left','observer') THEN
 RAISE EXCEPTION 'session_host:invalid_target' USING ERRCODE='22023'; END IF;
 UPDATE public.games SET current_host=p.user_id WHERE id=g.id RETURNING * INTO g;
 RETURN jsonb_build_object('outcome','accepted','host_version',g.host_version,'current_host',g.current_host);
END $function$
;
$recovery_sql$;
  IF EXISTS(SELECT 1 FROM public.games WHERE replay_contract_version=1) THEN RAISE EXCEPTION 'recovery marker';END IF;
  IF (SELECT count(*) FROM private.replay_steps WHERE session_id=(f->>'game')::uuid)<>n+1 THEN RAISE EXCEPTION 'recovery append count';END IF;
  IF (SELECT body FROM private.replay_steps WHERE session_id=(f->>'game')::uuid ORDER BY sequence LIMIT 1) IS DISTINCT FROM body_before THEN RAISE EXCEPTION 'recovery altered opening';END IF;
  IF public.export_gin_replay_v1((f->>'game')::uuid,(f->>'round')::uuid,true)#>>'{seal,completeness}'<>'partial' THEN RAISE EXCEPTION 'recovery gap falsely complete';END IF;
  RAISE EXCEPTION USING ERRCODE='ZP099',MESSAGE='rollback_deployment_boundary_proof';
 EXCEPTION WHEN SQLSTATE 'ZP099' THEN NULL;END;
END $proof$;