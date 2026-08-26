-- Make Yahtzee's persisted human turn deadline executable without a browser.
-- Bot automation remains bot-only; the new deadline_auto action is restricted
-- to service_role and rejects any non-current or non-expired deadline identity.

CREATE OR REPLACE FUNCTION public.yahtzee_apply_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _die_index integer DEFAULT NULL,
  _category text DEFAULT NULL,
  _hold_mask boolean[] DEFAULT NULL,
  _expected_action_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_ps jsonb;
  v_dice jsonb;
  v_scores jsonb;
  v_action text:=lower(coalesce(_action,''));
  v_deadline_auto boolean:=v_action='deadline_auto';
  v_sequence integer;
  v_rolls integer;
  v_hold_mask boolean[];
  v_values integer[];
  v_best_value integer;
  v_best_count integer;
  v_category text:=_category;
  v_category_candidate text;
  v_score integer;
  v_candidate_score integer;
  v_best_score integer:=-1;
  v_best_priority integer:=-1;
  v_priority integer;
  v_bonus integer;
  v_is_yahtzee boolean;
  v_is_complete boolean;
  v_all_complete boolean;
  v_turn_order uuid[];
  v_current_index integer;
  v_next_player_id uuid;
  v_deadline timestamptz;
  v_expected_deadline timestamptz;
  v_settlement jsonb;
  offset_index integer;
BEGIN
  IF v_actor_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'yahtzee_apply_action:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_yahtzee_game';
  END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_game.id)
     AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_in_session';
  END IF;
  IF coalesce(v_game.is_paused,false) OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','round_not_current');
  END IF;
  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game_not_playing','state',v_state);
  END IF;
  BEGIN
    v_sequence:=coalesce((v_state->>'actionSequence')::integer,0);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_action_sequence';
  END;
  IF _expected_action_sequence IS NOT NULL AND _expected_action_sequence<>v_sequence THEN
    RETURN jsonb_build_object(
      'outcome','stale_action','deduped',true,'action_sequence',v_sequence,'state',v_state
    );
  END IF;
  IF nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM _player_id THEN
    RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',v_state);
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=_player_id AND game_id=v_game.id AND status NOT IN ('observer','left');
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_action:player_not_found'; END IF;

  IF v_deadline_auto THEN
    IF NOT v_service THEN
      RAISE EXCEPTION 'yahtzee_apply_action:deadline_auto_requires_service_role';
    END IF;
    BEGIN
      v_expected_deadline:=nullif(v_state->>'turnDeadline','')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('outcome','rejected','reason','invalid_turn_deadline','state',v_state);
    END;
    IF v_expected_deadline IS NULL
       OR v_round.decision_deadline IS DISTINCT FROM v_expected_deadline THEN
      RETURN jsonb_build_object('outcome','rejected','reason','deadline_identity_changed','state',v_state);
    END IF;
    IF v_expected_deadline>clock_timestamp() THEN
      RETURN jsonb_build_object('outcome','rejected','reason','deadline_not_due','state',v_state);
    END IF;
    v_action:='auto';
  END IF;

  IF v_action IN ('auto','bot_roll','bot_score') THEN
    IF NOT v_deadline_auto AND NOT coalesce(v_player.is_bot,false) THEN
      RAISE EXCEPTION 'yahtzee_apply_action:auto_requires_bot';
    END IF;
  ELSIF NOT v_service AND v_player.user_id IS DISTINCT FROM v_actor_id
        AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_player_owner';
  END IF;

  v_ps:=v_state->'playerStates'->_player_id::text;
  v_dice:=v_ps->'dice';
  v_scores:=coalesce(v_ps->'scorecard'->'scores','{}'::jsonb);
  v_rolls:=coalesce((v_ps->>'rollsRemaining')::integer,3);
  IF jsonb_typeof(v_ps) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_dice) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_dice)<>5 THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_player_state';
  END IF;

  IF v_action='auto' THEN
    SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
      INTO v_values FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_is_yahtzee:=v_rolls<3 AND (SELECT count(DISTINCT value)=1 AND min(value)>0 FROM unnest(v_values) value);
    IF v_rolls=0 OR v_is_yahtzee THEN
      v_action:='bot_score';
    ELSE
      IF v_rolls<3 THEN
        SELECT value,count(*) INTO v_best_value,v_best_count
          FROM unnest(v_values) value GROUP BY value ORDER BY count(*) DESC,value DESC LIMIT 1;
        IF v_best_count>=2 THEN
          SELECT array_agg(value=v_best_value ORDER BY ordinality)
            INTO v_hold_mask FROM unnest(v_values) WITH ORDINALITY item(value,ordinality);
        ELSE
          v_hold_mask:=ARRAY[false,false,false,false,false];
        END IF;
      END IF;
      v_action:='bot_roll';
    END IF;
  END IF;

  IF v_action IN ('roll','bot_roll') THEN
    IF v_rolls<=0 THEN RETURN jsonb_build_object('outcome','rejected','reason','no_rolls_remaining','state',v_state); END IF;
    IF v_action='bot_roll' AND _hold_mask IS NOT NULL THEN v_hold_mask:=_hold_mask; END IF;
    IF v_hold_mask IS NOT NULL THEN
      IF cardinality(v_hold_mask)<>5 THEN RAISE EXCEPTION 'yahtzee_apply_action:invalid_hold_mask'; END IF;
      SELECT jsonb_agg(jsonb_set(die.value,'{isHeld}',to_jsonb(v_hold_mask[die.ordinality]),true) ORDER BY die.ordinality)
        INTO v_dice FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'value',CASE WHEN coalesce((die.value->>'isHeld')::boolean,false)
                          THEN (die.value->>'value')::integer
                          ELSE floor(random()*6+1)::integer END,
             'isHeld',coalesce((die.value->>'isHeld')::boolean,false)
           ) ORDER BY die.ordinality),
           array_agg(coalesce((die.value->>'isHeld')::boolean,false) ORDER BY die.ordinality)
      INTO v_dice,v_hold_mask
      FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_sequence:=v_sequence+1;
    v_deadline:=private.yahtzee_turn_deadline(v_game.id,_player_id);
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}',to_jsonb(v_rolls-1),true);
    v_ps:=jsonb_set(v_ps,'{rollKey}',to_jsonb(format('yahtzee:%s:%s:%s',_round_id,_player_id,v_sequence)),true);
    v_ps:=jsonb_set(v_ps,'{heldMaskBeforeComplete}',to_jsonb(v_hold_mask),true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_deadline),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline
     WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','applied','action','roll','action_sequence',v_sequence,'state',v_state);
  END IF;

  IF v_action='hold' THEN
    IF _die_index IS NULL OR _die_index<0 OR _die_index>4 THEN
      RETURN jsonb_build_object('outcome','rejected','reason','invalid_die_index','state',v_state);
    END IF;
    IF v_rolls=3 OR v_rolls=0 THEN
      RETURN jsonb_build_object('outcome','rejected','reason','hold_not_allowed','state',v_state);
    END IF;
    SELECT jsonb_agg(CASE WHEN die.ordinality=_die_index+1
      THEN jsonb_set(die.value,'{isHeld}',to_jsonb(NOT coalesce((die.value->>'isHeld')::boolean,false)),true)
      ELSE die.value END ORDER BY die.ordinality)
      INTO v_dice FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_sequence:=v_sequence+1;
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','applied','action','hold','action_sequence',v_sequence,'state',v_state);
  END IF;

  IF v_action IN ('score','bot_score') THEN
    IF v_rolls=3 THEN RETURN jsonb_build_object('outcome','rejected','reason','must_roll_first','state',v_state); END IF;
    IF v_action='bot_score' AND v_category IS NULL THEN
      FOREACH v_category_candidate IN ARRAY ARRAY[
        'ones','twos','threes','fours','fives','sixes','three_of_a_kind',
        'four_of_a_kind','full_house','small_straight','large_straight','yahtzee','chance'
      ] LOOP
        IF private.yahtzee_category_is_legal(v_ps->'scorecard',v_dice,v_category_candidate) THEN
          v_candidate_score:=private.yahtzee_category_score(v_ps->'scorecard',v_dice,v_category_candidate);
          v_priority:=CASE v_category_candidate
            WHEN 'yahtzee' THEN 13 WHEN 'large_straight' THEN 12 WHEN 'small_straight' THEN 11
            WHEN 'full_house' THEN 10 WHEN 'four_of_a_kind' THEN 9 WHEN 'three_of_a_kind' THEN 8
            WHEN 'chance' THEN 7 WHEN 'sixes' THEN 6 WHEN 'fives' THEN 5 WHEN 'fours' THEN 4
            WHEN 'threes' THEN 3 WHEN 'twos' THEN 2 ELSE 1 END;
          IF v_candidate_score>v_best_score OR (v_candidate_score=v_best_score AND v_priority>v_best_priority) THEN
            v_best_score:=v_candidate_score;v_best_priority:=v_priority;v_category:=v_category_candidate;
          END IF;
        END IF;
      END LOOP;
    END IF;
    IF v_category IS NULL OR NOT private.yahtzee_category_is_legal(v_ps->'scorecard',v_dice,v_category) THEN
      RETURN jsonb_build_object('outcome','rejected','reason','category_not_legal','state',v_state);
    END IF;
    v_score:=private.yahtzee_category_score(v_ps->'scorecard',v_dice,v_category);
    SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
      INTO v_values FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_is_yahtzee:=(SELECT count(DISTINCT value)=1 AND min(value)>0 FROM unnest(v_values) value);
    v_bonus:=coalesce((v_ps->'scorecard'->>'yahtzeeBonuses')::integer,0);
    IF v_is_yahtzee AND coalesce((v_scores->>'yahtzee')::integer,0)=50 THEN v_bonus:=v_bonus+1; END IF;
    v_scores:=jsonb_set(v_scores,ARRAY[v_category],to_jsonb(v_score),true);
    SELECT count(*)=13 INTO v_is_complete FROM jsonb_object_keys(v_scores);
    v_ps:=jsonb_set(v_ps,'{scorecard,scores}',v_scores,true);
    v_ps:=jsonb_set(v_ps,'{scorecard,yahtzeeBonuses}',to_jsonb(v_bonus),true);
    v_ps:=jsonb_set(v_ps,'{isComplete}',to_jsonb(v_is_complete),true);
    v_ps:=jsonb_set(v_ps,'{dice}','[{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false}]'::jsonb,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}','3'::jsonb,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{lastAction}',jsonb_build_object(
      'type','score','playerId',_player_id,'category',v_category,'score',v_score,
      'dice',v_dice,'sequence',v_sequence+1
    ),true);
    SELECT NOT EXISTS(
      SELECT 1 FROM jsonb_each(v_state->'playerStates') entry
       WHERE coalesce((entry.value->>'isComplete')::boolean,false)=false
    ) INTO v_all_complete;
    v_sequence:=v_sequence+1;
    IF v_all_complete THEN
      v_state:=jsonb_set(v_state,'{currentTurnPlayerId}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{gamePhase}',to_jsonb('complete'::text),true);
      v_state:=jsonb_set(v_state,'{turnDeadline}','null'::jsonb,true);
      v_deadline:=NULL;
    ELSE
      SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_turn_order
        FROM jsonb_array_elements_text(v_state->'turnOrder') WITH ORDINALITY item(value,ordinality);
      v_current_index:=array_position(v_turn_order,_player_id);
      FOR offset_index IN 1..cardinality(v_turn_order) LOOP
        v_next_player_id:=v_turn_order[((v_current_index-1+offset_index)%cardinality(v_turn_order))+1];
        EXIT WHEN coalesce((v_state->'playerStates'->v_next_player_id::text->>'isComplete')::boolean,false)=false;
      END LOOP;
      v_deadline:=private.yahtzee_turn_deadline(v_game.id,v_next_player_id);
      v_state:=jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_next_player_id),true);
      v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_deadline),true);
    END IF;
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline,
      current_turn_position=(SELECT position FROM public.players WHERE id=v_next_player_id)
     WHERE id=_round_id;
    IF v_all_complete THEN
      v_settlement:=public.yahtzee_settle_game(v_game.id,_round_id,v_round.dealer_game_id,v_round.hand_number);
    END IF;
    RETURN jsonb_build_object(
      'outcome','applied','action','score','action_sequence',v_sequence,
      'category',v_category,'score',v_score,'terminal',v_all_complete,
      'state',v_state,'settlement',v_settlement
    );
  END IF;
  RETURN jsonb_build_object('outcome','rejected','reason','unknown_action','state',v_state);
END;
$function$;

REVOKE ALL ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer)
  TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.advance_due_yahtzee_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_candidate record;
  v_result jsonb;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  FOR v_candidate IN
    SELECT game_row.id FROM public.games game_row
     WHERE game_row.game_type='yahtzee' AND game_row.status='ante_decision'
       AND game_row.current_game_uuid IS NOT NULL
       AND NOT EXISTS(
         SELECT 1 FROM public.players participant WHERE participant.game_id=game_row.id
          AND NOT coalesce(participant.sitting_out,false) AND participant.status NOT IN ('observer','left')
          AND participant.ante_decision IS NULL
       )
     ORDER BY game_row.updated_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.id,NULL);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND coalesce(game_row.awaiting_next_round,false) AND round_row.status='completed'
       AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands
     ORDER BY round_row.hand_number,round_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.game_id,v_candidate.round_id);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.id AS round_id,
           nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid AS player_id,
           coalesce((round_row.yahtzee_state->>'actionSequence')::integer,0) AS action_sequence,
           coalesce(participant.is_bot,false) AS is_bot
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.id=nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND NOT coalesce(game_row.is_paused,false)
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='playing'
       AND participant.status NOT IN ('observer','left')
       AND round_row.decision_deadline IS NOT NULL
       AND round_row.decision_deadline=nullif(round_row.yahtzee_state->>'turnDeadline','')::timestamptz
       AND round_row.decision_deadline<=clock_timestamp()
     ORDER BY round_row.decision_deadline,round_row.id LIMIT 32
  LOOP
    v_result:=public.yahtzee_apply_action(
      v_candidate.round_id,v_candidate.player_id,
      CASE WHEN v_candidate.is_bot THEN 'auto' ELSE 'deadline_auto' END,
      NULL,NULL,NULL,v_candidate.action_sequence
    );
    IF v_result->>'outcome'='applied' THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,round_row.dealer_game_id,round_row.hand_number
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='complete'
     ORDER BY round_row.id LIMIT 32
  LOOP
    PERFORM public.yahtzee_settle_game(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    v_advanced:=v_advanced+1;
  END LOOP;
  FOR v_candidate IN
    SELECT game_row.id AS game_id,result.dealer_game_id,result.hand_number,round_row.id AS round_id
      FROM public.games game_row
      JOIN public.game_results result ON result.game_id=game_row.id AND result.settlement_key='yahtzee_terminal'
      JOIN public.rounds round_row ON round_row.game_id=game_row.id
       AND round_row.dealer_game_id=result.dealer_game_id AND round_row.hand_number=result.hand_number
     WHERE game_row.game_type='yahtzee' AND game_row.status='game_over'
       AND game_row.current_game_uuid=result.dealer_game_id AND game_row.total_hands=result.hand_number
       AND game_row.game_over_at<=clock_timestamp()-interval '30 seconds'
     ORDER BY game_row.game_over_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.yahtzee_advance_postgame(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    IF v_result->>'outcome' IN ('advanced','already_advanced') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  RETURN v_advanced;
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_due_yahtzee_state()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_yahtzee_state()
  TO service_role;

COMMENT ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer) IS
  'Exact-sequence Yahtzee action owner. deadline_auto is service-only, exact-deadline checked, and recovers expired human turns.';
COMMENT ON FUNCTION private.advance_due_yahtzee_state() IS
  'Complete scheduled Yahtzee bootstrap, expired bot or human turn, terminal settlement, and abandoned postgame recovery owner.';
