CREATE FUNCTION private.secure_shuffle_key() RETURNS bytea
LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT extensions.gen_random_bytes(16) $$;
REVOKE ALL ON FUNCTION private.secure_shuffle_key() FROM PUBLIC,anon,authenticated;
-- Authority-generated outcomes use pgcrypto, never caller-seeded random().
CREATE FUNCTION private.secure_random_int(p_bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE b bytea; v bigint; ceiling bigint;
BEGIN
 IF p_bound IS NULL OR p_bound<1 THEN RAISE EXCEPTION 'secure_random_int:invalid_bound' USING ERRCODE='22023'; END IF;
 ceiling:=4294967296::bigint-(4294967296::bigint%p_bound);
 LOOP
  b:=extensions.gen_random_bytes(4);
  v:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)::bigint*256+get_byte(b,3);
  IF v<ceiling THEN RETURN (v%p_bound)::integer; END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.secure_random_unit() RETURNS double precision
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE b bytea:=extensions.gen_random_bytes(7); v bigint:=0; i integer;
BEGIN
 FOR i IN 0..6 LOOP v:=v*256+get_byte(b,i); END LOOP;
 RETURN (v/8)::double precision/9007199254740992.0;
END $$;
REVOKE ALL ON FUNCTION private.secure_random_int(integer),private.secure_random_unit() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cribbage_finish_discard_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s jsonb := NEW.cribbage_state;
  player_count integer;
  expected_discard integer;
  player_key text;
  all_discarded boolean := true;
  available_cards jsonb;
  cut_card jsonb;
  harness text;
  harnesses_enabled boolean := false;
  dealer_state jsonb;
  dealer_score integer;
  points_to_win integer;
  lowest_score integer;
  player_score integer;
  multiplier integer := 1;
BEGIN
  IF s IS NULL OR s->>'phase' <> 'discarding' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO player_count FROM jsonb_object_keys(s->'playerStates');
  expected_discard := CASE WHEN player_count = 2 THEN 2 ELSE 1 END;
  FOR player_key IN SELECT jsonb_object_keys(s->'playerStates') LOOP
    IF jsonb_array_length(COALESCE(s->'playerStates'->player_key->'discardedToCrib', '[]'::jsonb)) <> expected_discard THEN
      all_discarded := false;
      EXIT;
    END IF;
  END LOOP;
  IF NOT all_discarded
     OR jsonb_array_length(COALESCE(s->'crib', '[]'::jsonb)) <> player_count * expected_discard THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', d.rank, 'suit', su.suit, 'value', d.value)), '[]'::jsonb)
  INTO available_cards
  FROM (VALUES
    ('A', 1), ('2', 2), ('3', 3), ('4', 4), ('5', 5), ('6', 6), ('7', 7),
    ('8', 8), ('9', 9), ('10', 10), ('J', 10), ('Q', 10), ('K', 10)
  ) AS d(rank, value)
  CROSS JOIN (VALUES ('hearts'), ('diamonds'), ('clubs'), ('spades')) AS su(suit)
  WHERE NOT EXISTS (
    SELECT 1 FROM (
      SELECT c.card FROM jsonb_array_elements(COALESCE(s->'crib', '[]'::jsonb)) AS c(card)
      UNION ALL
      SELECT c.card FROM jsonb_each(s->'playerStates') AS ps(player_id, player_state)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ps.player_state->'hand', '[]'::jsonb)) AS c(card)
    ) used
    WHERE used.card->>'rank' = d.rank AND used.card->>'suit' = su.suit
  );
  IF jsonb_array_length(available_cards) = 0 THEN RAISE EXCEPTION 'No legal cut card remains'; END IF;

  SELECT gd.debug_harness INTO harness FROM public.game_defaults gd WHERE gd.game_type = 'cribbage' LIMIT 1;
  SELECT COALESCE((value->>'enabled')::boolean, false) INTO harnesses_enabled
  FROM public.system_settings WHERE key = 'harnesses_mode' LIMIT 1;
  harnesses_enabled := COALESCE(harnesses_enabled, false);
  IF harnesses_enabled AND harness = 'max_pegging_fan' THEN
    SELECT c.card INTO cut_card FROM jsonb_array_elements(available_cards) AS c(card)
    WHERE c.card->>'rank' = '4' AND c.card->>'suit' = 'spades' LIMIT 1;
  ELSIF harnesses_enabled AND harness = 'perpetual_heels' THEN
    SELECT c.card INTO cut_card FROM jsonb_array_elements(available_cards) AS c(card)
    WHERE c.card->>'rank' = 'J' ORDER BY private.secure_shuffle_key() LIMIT 1;
  END IF;
  IF cut_card IS NULL THEN
    SELECT c.card INTO cut_card FROM jsonb_array_elements(available_cards) AS c(card) ORDER BY private.secure_shuffle_key() LIMIT 1;
  END IF;

  s := jsonb_set(s, '{cutCard}', cut_card, true);
  s := jsonb_set(s, '{phase}', '"pegging"'::jsonb, true);
  s := jsonb_set(s, '{pegging,currentTurnPlayerId}', to_jsonb(s->'turnOrder'->>0), true);

  IF cut_card->>'rank' = 'J' THEN
    dealer_state := s->'playerStates'->(s->>'dealerPlayerId');
    dealer_score := COALESCE((dealer_state->>'pegScore')::integer, 0) + 2;
    dealer_state := jsonb_set(dealer_state, '{pegScore}', to_jsonb(dealer_score), true);
    s := jsonb_set(s, ARRAY['playerStates', s->>'dealerPlayerId'], dealer_state, true);
    s := jsonb_set(s, '{lastEvent}', jsonb_build_object(
      'id', gen_random_uuid(), 'type', 'his_heels', 'playerId', s->>'dealerPlayerId',
      'points', 2, 'label', 'His Heels',
      'createdAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ), true);
    points_to_win := COALESCE((s->>'pointsToWin')::integer, 121);
    IF dealer_score >= points_to_win THEN
      lowest_score := points_to_win;
      FOR player_key IN SELECT jsonb_object_keys(s->'playerStates') LOOP
        IF player_key <> s->>'dealerPlayerId' THEN
          player_score := COALESCE((s->'playerStates'->player_key->>'pegScore')::integer, 0);
          lowest_score := LEAST(lowest_score, player_score);
        END IF;
      END LOOP;
      IF COALESCE((s->>'doubleSkunkEnabled')::boolean, false) AND lowest_score < COALESCE((s->>'doubleSkunkThreshold')::integer, 61) THEN
        multiplier := 3;
      ELSIF COALESCE((s->>'skunkEnabled')::boolean, false) AND lowest_score < COALESCE((s->>'skunkThreshold')::integer, 91) THEN
        multiplier := 2;
      END IF;
      s := jsonb_set(s, '{phase}', '"complete"'::jsonb, true);
      s := jsonb_set(s, '{winnerPlayerId}', to_jsonb(s->>'dealerPlayerId'), true);
      s := jsonb_set(s, '{loserScore}', to_jsonb(lowest_score), true);
      s := jsonb_set(s, '{payoutMultiplier}', to_jsonb(multiplier), true);
      s := jsonb_set(s, '{matchCompleteLatch}', 'true'::jsonb, true);
    END IF;
  END IF;

  UPDATE public.rounds SET cribbage_state = s
  WHERE id = NEW.id AND cribbage_state->>'phase' = 'discarding';
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.yahtzee_apply_action(_round_id uuid, _player_id uuid, _action text, _die_index integer DEFAULT NULL::integer, _category text DEFAULT NULL::text, _hold_mask boolean[] DEFAULT NULL::boolean[], _expected_action_sequence integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
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
    v_deadline:=nullif(v_state->>'turnDeadline','')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_turn_identity';
  END;
  IF v_deadline IS NULL OR v_round.decision_deadline IS DISTINCT FROM v_deadline THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_identity_changed','state',v_state);
  END IF;
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
    IF v_deadline>clock_timestamp() THEN
      RETURN jsonb_build_object('outcome','rejected','reason','deadline_not_due','state',v_state);
    END IF;
    v_action:='auto';
  ELSIF NOT v_service AND v_deadline<=clock_timestamp() THEN
    RETURN jsonb_build_object('outcome','rejected','reason','turn_deadline_expired','state',v_state);
  END IF;

  IF v_action IN ('auto','bot_roll','bot_score') THEN
    IF NOT v_deadline_auto
       AND NOT coalesce(v_player.is_bot,false)
       AND NOT (
         NOT coalesce(v_game.real_money,false)
         AND coalesce(v_player.auto_fold,false)
         AND v_action IN ('bot_roll','bot_score')
         AND v_player.user_id IS NOT DISTINCT FROM v_actor_id
       ) THEN
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
                          ELSE (private.secure_random_int(6)+1) END,
             'isHeld',coalesce((die.value->>'isHeld')::boolean,false)
           ) ORDER BY die.ordinality),
           array_agg(coalesce((die.value->>'isHeld')::boolean,false) ORDER BY die.ordinality)
      INTO v_dice,v_hold_mask
      FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_sequence:=v_sequence+1;
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}',to_jsonb(v_rolls-1),true);
    v_ps:=jsonb_set(v_ps,'{rollKey}',to_jsonb(format('yahtzee:%s:%s:%s',_round_id,_player_id,v_sequence)),true);
    v_ps:=jsonb_set(v_ps,'{heldMaskBeforeComplete}',to_jsonb(v_hold_mask),true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    -- Rolls preserve the exact deadline assigned when this player turn began.
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline
     WHERE id=_round_id;
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
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
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline WHERE id=_round_id;
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
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
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
    RETURN jsonb_build_object(
      'outcome','applied','action','score','action_sequence',v_sequence,
      'category',v_category,'score',v_score,'terminal',v_all_complete,
      'state',v_state,'settlement',v_settlement
    );
  END IF;
  RETURN jsonb_build_object('outcome','rejected','reason','unknown_action','state',v_state);
END;
$function$;
CREATE OR REPLACE FUNCTION private.cribbage_new_deck()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$
  WITH deck AS (
    SELECT jsonb_build_object(
      'rank', rank,
      'suit', suit,
      'value', CASE WHEN rank = 'A' THEN 1 WHEN rank IN ('J','Q','K') THEN 10 ELSE rank::integer END
    ) AS card, private.secure_shuffle_key() AS shuffle_key
    FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
    CROSS JOIN unnest(ARRAY['hearts','diamonds','clubs','spades']) AS suits(suit)
  ) SELECT jsonb_agg(card ORDER BY shuffle_key) FROM deck;
$function$;
CREATE OR REPLACE FUNCTION public.cribbage_prepare_dealer_selection(_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player record;
  v_tied_ids uuid[];
  v_next_tied uuid[];
  v_cards jsonb := '[]'::jsonb;
  v_deck jsonb;
  v_card jsonb;
  v_round integer := 1;
  v_offset integer := 0;
  v_high integer;
  v_rank_value integer;
  v_winner_id uuid;
  v_winner_position integer;
  v_state jsonb;
  v_harness_applied boolean := false;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:authentication_required';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:not_cribbage_game';
  END IF;
  IF NOT v_is_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:not_in_session';
  END IF;
  IF v_game.dealer_selection_state->>'isComplete' = 'true'
     AND v_game.dealer_selection_state->>'winnerPosition' IS NOT NULL THEN
    RETURN v_game.dealer_selection_state;
  END IF;
  IF v_game.status IS DISTINCT FROM 'cribbage_dealer_selection' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'wrong_status', 'status', v_game.status);
  END IF;

  SELECT array_agg(id ORDER BY position) INTO v_tied_ids
    FROM public.players
   WHERE game_id = _game_id
     AND NOT coalesce(sitting_out, false)
     AND status NOT IN ('observer', 'left');
  IF coalesce(cardinality(v_tied_ids), 0) < 2 OR cardinality(v_tied_ids) > 4 THEN
    RAISE EXCEPTION 'cribbage_prepare_dealer_selection:invalid_player_count';
  END IF;

  v_harness_applied := private.consume_cribbage_dealer_draw_tie_harness(_game_id);
  IF v_harness_applied THEN
    v_deck := private.cribbage_forced_tie_deck(cardinality(v_tied_ids));
  ELSE
    WITH deck AS (
      SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, private.secure_shuffle_key() AS shuffle_key
        FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
        CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
    ) SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;
  END IF;

  LOOP
    IF v_offset + cardinality(v_tied_ids) > jsonb_array_length(v_deck) THEN
      WITH deck AS (
        SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, private.secure_shuffle_key() AS shuffle_key
          FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
          CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
      ) SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;
      v_offset := 0;
    END IF;
    v_high := 0;
    v_next_tied := ARRAY[]::uuid[];
    FOREACH v_winner_id IN ARRAY v_tied_ids LOOP
      SELECT * INTO v_player FROM public.players WHERE id = v_winner_id;
      v_card := v_deck->v_offset;
      v_offset := v_offset + 1;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_high THEN
        v_high := v_rank_value;
        v_next_tied := ARRAY[v_winner_id];
      ELSIF v_rank_value = v_high THEN
        v_next_tied := array_append(v_next_tied, v_winner_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId', v_winner_id,
        'position', v_player.position,
        'card', v_card,
        'isRevealed', true,
        'isWinner', false,
        'isDimmed', false,
        'roundNumber', v_round
      ));
    END LOOP;
    v_tied_ids := v_next_tied;
    EXIT WHEN cardinality(v_tied_ids) = 1;
    v_round := v_round + 1;
  END LOOP;

  v_winner_id := v_tied_ids[1];
  SELECT position INTO v_winner_position FROM public.players WHERE id = v_winner_id;
  SELECT coalesce(jsonb_agg(
    CASE WHEN card.value->>'playerId' = v_winner_id::text
      THEN card.value || jsonb_build_object('isWinner', true, 'isDimmed', false)
      ELSE card.value || jsonb_build_object('isWinner', false, 'isDimmed', true)
    END ORDER BY card.ordinality
  ), '[]'::jsonb)
  INTO v_cards
  FROM jsonb_array_elements(v_cards) WITH ORDINALITY card(value, ordinality);

  v_state := jsonb_build_object(
    'cards', v_cards,
    'announcement', 'Dealer selected',
    'isComplete', true,
    'winnerPosition', v_winner_position,
    'preparedAt', to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  IF v_harness_applied THEN
    v_state := v_state || jsonb_build_object(
      'harnessApplied', 'force_first_round_tie_once'
    );
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.games SET dealer_selection_state = v_state WHERE id = _game_id;
  RETURN v_state;
END;
$function$;
CREATE OR REPLACE FUNCTION public.start_holm_initial_hand(_game_id uuid, _skip_ante_collection boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_occupied_positions integer[];
  v_player_count integer;
  v_existing_round_count integer;
  v_updated_count integer;
  v_ante_amount integer;
  v_pot integer;
  v_buck_position integer;
  v_buck_event jsonb;
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_ante_changes jsonb;
  v_player_id uuid;
  v_fixture_profile text;
  v_player_index integer := 0;
  v_fixture_cards jsonb;
BEGIN
  IF _skip_ante_collection THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'legacy-recovery-not-supported'
    );
  END IF;

  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'start_holm_initial_hand:authentication_required';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-not-found');
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1
         FROM public.players participant
        WHERE participant.game_id = _game_id
          AND participant.user_id = v_actor_id
          AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles profile
        WHERE profile.id = v_actor_id
          AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'start_holm_initial_hand:not_participant';
  END IF;

  IF coalesce(v_game.game_type, '') <> 'holm-game' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'wrong-game-type',
      'game_type', v_game.game_type
    );
  END IF;

  IF v_game.current_game_uuid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'no-dealer-game');
  END IF;

  -- A delayed or duplicate caller receives the immutable first-hand identity.
  -- This check intentionally precedes the phase guard so a replay remains safe
  -- after the transaction has advanced the game to in_progress or terminal.
  SELECT *
    INTO v_existing_round
    FROM public.rounds
   WHERE game_id = _game_id
     AND dealer_game_id = v_game.current_game_uuid
     AND hand_number = 1
     AND round_number = 1
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-started',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', 1,
      'buck_position', v_existing_round.current_turn_position,
      'pot', v_existing_round.pot,
      'deduped', true
    );
  END IF;

  IF v_game.status <> 'ante_decision' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'wrong-status',
      'status', v_game.status
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.is_first_hand, false) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'partial-start-detected'
    );
  END IF;

  SELECT count(*)
    INTO v_existing_round_count
    FROM public.rounds
   WHERE game_id = _game_id
     AND dealer_game_id = v_game.current_game_uuid;

  IF v_existing_round_count <> 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'unexpected-existing-rounds',
      'existing_round_count', v_existing_round_count
    );
  END IF;

  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)::integer
    INTO v_player_ids, v_occupied_positions, v_player_count
    FROM public.players
   WHERE game_id = _game_id
     AND status = 'active'
     AND sitting_out = false
     AND ante_decision = 'ante_up';

  IF coalesce(v_player_count, 0) < 2 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'insufficient-ante-up',
      'count', coalesce(v_player_count, 0)
    );
  END IF;

  IF 4 + (4 * v_player_count) > 52 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'too-many-players',
      'count', v_player_count
    );
  END IF;

  IF v_game.dealer_position IS NULL
     OR NOT (v_game.dealer_position = ANY(v_occupied_positions)) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'invalid-dealer-position',
      'dealer_position', v_game.dealer_position
    );
  END IF;

  -- Canonical seat-ring clockwise order is the nearest lower occupied
  -- position, wrapping from the lowest position to the highest.
  SELECT max(position)
    INTO v_buck_position
    FROM unnest(v_occupied_positions) AS occupied(position)
   WHERE position < v_game.dealer_position;

  IF v_buck_position IS NULL THEN
    SELECT max(position)
      INTO v_buck_position
      FROM unnest(v_occupied_positions) AS occupied(position);
  END IF;

  v_ante_amount := coalesce(v_game.ante_amount, 1);
  v_pot := v_player_count * v_ante_amount;

  SELECT coalesce(defaults.decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults defaults
   WHERE defaults.game_type = 'holm'
   LIMIT 1;

  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  v_fixture_profile:=private.target_rule_branch_profile_for_context(
    _game_id,v_game.current_game_uuid,1,1,'holm-game'
  );

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           private.secure_shuffle_key() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key)
    INTO v_deck
    FROM deck;

  v_community_cards := jsonb_build_array(
    v_deck->0,
    v_deck->1,
    v_deck->2,
    v_deck->3
  );

  -- The initial Holm hand is an ante, never a terminal replacement-pot
  -- transfer. Both player and pot journal rows must carry the same reason.
  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  IF v_fixture_profile IS NOT NULL THEN
    v_community_cards:=private.target_holm_fixture_community(v_fixture_profile);
  END IF;

  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_player_count THEN
    RAISE EXCEPTION 'start_holm_initial_hand:ante_cohort_changed';
  END IF;

  -- Clear stale decisions for non-participating seats without moving chips.
  UPDATE public.players
     SET current_decision = NULL,
         decision_locked = false
   WHERE game_id = _game_id
     AND NOT (id = ANY(v_player_ids));

  SELECT jsonb_object_agg(player_id::text, -v_ante_amount)
    INTO v_ante_changes
    FROM unnest(v_player_ids) AS players(player_id);

  INSERT INTO public.game_results (
    game_id,
    dealer_game_id,
    hand_number,
    winner_player_id,
    winner_username,
    winning_hand_description,
    pot_won,
    player_chip_changes,
    is_chopped,
    game_type
  ) VALUES (
    _game_id,
    v_game.current_game_uuid,
    1,
    NULL,
    'Ante',
    v_player_count::text || ' players anted $' || v_ante_amount::text,
    0,
    v_ante_changes,
    false,
    'holm'
  );

  INSERT INTO public.rounds (
    game_id,
    round_number,
    cards_dealt,
    status,
    pot,
    decision_deadline,
    community_cards,
    community_cards_revealed,
    chucky_active,
    current_turn_position,
    hand_number,
    dealer_game_id
  ) VALUES (
    _game_id,
    1,
    4,
    'betting',
    v_pot,
    v_deadline,
    v_community_cards,
    2,
    false,
    v_buck_position,
    1,
    v_game.current_game_uuid
  )
  RETURNING id INTO v_round_id;

  IF v_fixture_profile IS NOT NULL THEN
    UPDATE public.rounds SET chucky_cards=private.target_holm_fixture_chucky(
      v_fixture_profile,coalesce(v_game.chucky_cards,4)
    ) WHERE id=v_round_id;
  END IF;

  -- H1 has no predecessor hand whose publication could mint this event.
  -- Treat the authoritative dealer seat as the Buck's origin and bind the
  -- recipient overlay to this exact dealer-game/round/hand identity.
  v_buck_event := jsonb_build_object(
    'id', gen_random_uuid(),
    'sessionId', _game_id,
    'dealerGameId', v_game.current_game_uuid,
    'roundId', v_round_id,
    'handContextId', v_round_id::text,
    'handNumber', 1,
    'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
    'fromPosition', v_game.dealer_position,
    'toPosition', v_buck_position,
    'createdAt', clock_timestamp(),
    'source', 'SERVER_BUCK_TRANSFER'
  );

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    v_player_index:=v_player_index+1;
    v_fixture_cards:=private.target_holm_fixture_player_cards(v_fixture_profile,v_player_index);
    INSERT INTO public.player_cards (
      player_id,
      round_id,
      cards,
      hand_context_id,
      source_version,
      is_public
    ) VALUES (
      v_player_id,
      v_round_id,
      coalesce(v_fixture_cards,jsonb_build_array(
        v_deck->v_card_offset,
        v_deck->(v_card_offset + 1),
        v_deck->(v_card_offset + 2),
        v_deck->(v_card_offset + 3)
      )),
      v_round_id::text,
      1,
      false
    );
    v_card_offset := v_card_offset + 4;
  END LOOP;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = 1,
         buck_position = v_buck_position,
         buck_transfer_presentation = v_buck_event,
         pot = v_pot,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         is_first_hand = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL
   WHERE id = _game_id;

  RETURN jsonb_build_object(
    'outcome', 'started',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', 1,
    'buck_position', v_buck_position,
    'pot', v_pot,
    'deduped', false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.advance_357_round_legacy(_game_id uuid, _dealer_game_id uuid, _next_round_number integer, _next_hand_number integer, _decision_deadline timestamp with time zone, _ante_amount integer DEFAULT 0, _forced_hand_by_player jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_uid          uuid := auth.uid();
  _game                public.games%ROWTYPE;
  _existing_round      public.rounds%ROWTYPE;
  _existing_found      boolean := false;
  _new_round_id        uuid;
  _eligible_ids        uuid[];
  _eligible_count      int;
  _cards_dealt         int;
  _new_per_player      int;
  _new_pot             int;
  _hand_number_final   int;
  _legs_at_start       jsonb;
  _all_dealt_cards     jsonb := '[]'::jsonb;
  _prev_round_id       uuid;
  _prev_cards_by_pid   jsonb := '{}'::jsonb;
  _deck                jsonb;
  _deck_cursor         int  := 0;
  _assignments         jsonb := '[]'::jsonb;
  _pid                 uuid;
  _carry               jsonb;
  _forced              jsonb;
  _new_slice           jsonb;
  _final_cards         jsonb;
  _missing_count       int;
  _ante_chip_changes   jsonb := '{}'::jsonb;
  _ante_total          int := 0;
  _sweep_winner        uuid := NULL;
  _sweep_username      text := NULL;
  _sweep_cards         jsonb;
  _sweep_ranks         text[];
  _total_leg_value     int := 0;
  _leg_value           int := 0;
  _total_prize         int := 0;
  _sweep_message       text;
  _pending_session_end boolean := false;
  _sweep_chip_changes  jsonb := '{}'::jsonb;
  _asg                 jsonb;
BEGIN
  IF _game_id IS NULL OR _dealer_game_id IS NULL THEN
    RAISE EXCEPTION 'advance_357_round:missing_identity';
  END IF;
  IF _next_round_number NOT IN (1,2,3) THEN
    RAISE EXCEPTION 'advance_357_round:invalid_round_number:%', _next_round_number;
  END IF;

  IF _forced_hand_by_player IS NOT NULL THEN
    IF _caller_uid IS NULL OR NOT public.has_role(_caller_uid, 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'advance_357_round:forced_hand_forbidden';
    END IF;
  END IF;

  _cards_dealt    := CASE _next_round_number WHEN 1 THEN 3 WHEN 2 THEN 5 ELSE 7 END;
  _new_per_player := CASE _next_round_number WHEN 1 THEN 3 ELSE 2 END;

  SELECT * INTO _game FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'advance_357_round:game_not_found'; END IF;
  IF _game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'advance_357_round:not_357:%', _game.game_type;
  END IF;
  IF _game.status IN ('game_over','session_ended') THEN
    RETURN jsonb_build_object('status','game_over','game_status', _game.status);
  END IF;
  IF COALESCE(_game.is_paused, false) THEN
    RETURN jsonb_build_object('status','paused');
  END IF;
  IF _game.current_game_uuid IS DISTINCT FROM _dealer_game_id THEN
    RAISE EXCEPTION 'advance_357_round:dealer_game_mismatch:expected=%,got=%',
      _game.current_game_uuid, _dealer_game_id;
  END IF;

  SELECT array_agg(id ORDER BY COALESCE(position, 9999), id)
    INTO _eligible_ids
    FROM public.players
   WHERE game_id = _game_id
     AND status NOT IN ('left','observer')
     AND sitting_out = false;
  IF _eligible_ids IS NULL OR array_length(_eligible_ids,1) < 1 THEN
    RAISE EXCEPTION 'advance_357_round:no_eligible_players';
  END IF;
  _eligible_count := array_length(_eligible_ids, 1);

  SELECT * INTO _existing_round
    FROM public.rounds
   WHERE dealer_game_id = _dealer_game_id
     AND hand_number    = _next_hand_number
     AND round_number   = _next_round_number
   LIMIT 1;
  _existing_found := FOUND;

  IF _existing_found THEN
    SELECT count(*) INTO _missing_count
      FROM unnest(_eligible_ids) pid
     WHERE NOT EXISTS (
       SELECT 1 FROM public.player_cards pc
        WHERE pc.round_id = _existing_round.id AND pc.player_id = pid);
    IF _missing_count = 0 THEN
      RETURN jsonb_build_object(
        'status','already_advanced',
        'round_id',_existing_round.id,
        'hand_number',_next_hand_number,
        'round_number',_next_round_number,
        'eligible_player_count', _eligible_count
      );
    END IF;
  END IF;

  IF _next_round_number = 1 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'player_id', p.id,
             'position',  COALESCE(p.position, 0),
             'legs',      COALESCE(p.legs, 0)
           ) ORDER BY COALESCE(p.position, 9999)), '[]'::jsonb)
      INTO _legs_at_start
      FROM public.players p
     WHERE p.game_id = _game_id;
  ELSE
    _legs_at_start := NULL;
  END IF;

  IF _next_round_number IN (2,3) THEN
    SELECT id INTO _prev_round_id
      FROM public.rounds
     WHERE dealer_game_id = _dealer_game_id
       AND hand_number    = _next_hand_number
       AND round_number   = _next_round_number - 1
     LIMIT 1;
    IF _prev_round_id IS NULL THEN
      RAISE EXCEPTION 'advance_357_round:prev_round_missing:hand=%,round=%',
        _next_hand_number, _next_round_number - 1;
    END IF;
    SELECT COALESCE(jsonb_object_agg(pc.player_id::text, pc.cards), '{}'::jsonb)
      INTO _prev_cards_by_pid
      FROM public.player_cards pc
     WHERE pc.round_id = _prev_round_id;
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO _all_dealt_cards
      FROM public.player_cards pc,
           LATERAL jsonb_array_elements(pc.cards) elem
     WHERE pc.round_id = _prev_round_id;
  END IF;

  WITH ranks(r) AS (VALUES ('2'),('3'),('4'),('5'),('6'),('7'),('8'),('9'),('10'),('J'),('Q'),('K'),('A')),
       suits(s) AS (VALUES ('♠'),('♥'),('♦'),('♣')),
       all_cards AS (
         SELECT jsonb_build_object('rank', r, 'suit', s) AS c
           FROM ranks CROSS JOIN suits
       ),
       dealt AS (SELECT c FROM jsonb_array_elements(_all_dealt_cards) c),
       remaining AS (
         SELECT a.c FROM all_cards a
          WHERE NOT EXISTS (
            SELECT 1 FROM dealt d
             WHERE (d.c->>'rank') = (a.c->>'rank')
               AND (d.c->>'suit') = (a.c->>'suit'))
       )
  SELECT COALESCE(jsonb_agg(c ORDER BY private.secure_shuffle_key()), '[]'::jsonb)
    INTO _deck
    FROM remaining;

  _assignments := '[]'::jsonb;
  _deck_cursor := 0;
  FOREACH _pid IN ARRAY _eligible_ids LOOP
    IF _next_round_number IN (2,3) THEN
      _carry := COALESCE(_prev_cards_by_pid -> _pid::text, '[]'::jsonb);
      IF jsonb_typeof(_carry) <> 'array'
         OR jsonb_array_length(_carry) <> (CASE _next_round_number WHEN 2 THEN 3 ELSE 5 END)
      THEN
        RAISE EXCEPTION 'advance_357_round:carryforward_length_mismatch:player=%,expected=%,got=%',
          _pid,
          (CASE _next_round_number WHEN 2 THEN 3 ELSE 5 END),
          COALESCE(jsonb_array_length(_carry), -1);
      END IF;
    ELSE
      _carry := '[]'::jsonb;
    END IF;

    _forced := NULL;
    IF _next_round_number = 1 AND _forced_hand_by_player IS NOT NULL THEN
      _forced := _forced_hand_by_player -> _pid::text;
    END IF;

    IF _forced IS NOT NULL
       AND jsonb_typeof(_forced) = 'array'
       AND jsonb_array_length(_forced) = _new_per_player
    THEN
      _new_slice := _forced;
    ELSE
      IF _deck_cursor + _new_per_player > jsonb_array_length(_deck) THEN
        RAISE EXCEPTION 'advance_357_round:deck_underflow:need=%,have=%',
          _new_per_player, jsonb_array_length(_deck) - _deck_cursor;
      END IF;
      SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
        INTO _new_slice
        FROM jsonb_array_elements(_deck) WITH ORDINALITY AS t(elem, ord)
       WHERE ord > _deck_cursor AND ord <= _deck_cursor + _new_per_player;
      _deck_cursor := _deck_cursor + _new_per_player;
    END IF;

    _final_cards := _carry || _new_slice;
    IF jsonb_array_length(_final_cards) <> _cards_dealt THEN
      RAISE EXCEPTION 'advance_357_round:assignment_length_mismatch:player=%,expected=%,got=%',
        _pid, _cards_dealt, jsonb_array_length(_final_cards);
    END IF;

    _assignments := _assignments || jsonb_build_array(
      jsonb_build_object('player_id', _pid, 'cards', _final_cards)
    );
  END LOOP;

  UPDATE public.players
     SET current_decision = NULL,
         decision_locked  = false,
         status           = 'active'
   WHERE game_id = _game_id
     AND status NOT IN ('left','observer')
     AND sitting_out = false;

  _new_pot := COALESCE(_game.pot, 0);
  IF _next_round_number = 1 AND COALESCE(_ante_amount, 0) > 0 THEN
    UPDATE public.players
       SET chips = chips - _ante_amount
     WHERE id = ANY(_eligible_ids);
    _ante_total := _eligible_count * _ante_amount;
    _new_pot := _new_pot + _ante_total;

    SELECT COALESCE(jsonb_object_agg(pid::text, -_ante_amount), '{}'::jsonb)
      INTO _ante_chip_changes
      FROM unnest(_eligible_ids) pid;
  END IF;

  _hand_number_final := CASE WHEN _next_round_number = 1
                              THEN _next_hand_number
                              ELSE COALESCE(_game.total_hands, _next_hand_number) END;

  IF _existing_found THEN
    INSERT INTO public.player_cards (player_id, round_id, cards)
    SELECT (x->>'player_id')::uuid, _existing_round.id, x->'cards'
      FROM jsonb_array_elements(_assignments) x
     WHERE NOT EXISTS (
       SELECT 1 FROM public.player_cards pc
        WHERE pc.round_id = _existing_round.id
          AND pc.player_id = (x->>'player_id')::uuid);
    _new_round_id := _existing_round.id;
  ELSE
    BEGIN
      INSERT INTO public.rounds (
        game_id, dealer_game_id, round_number, hand_number,
        cards_dealt, status, pot, decision_deadline,
        three_five_seven_legs_at_start
      ) VALUES (
        _game_id, _dealer_game_id, _next_round_number, _next_hand_number,
        _cards_dealt, 'betting', _new_pot, _decision_deadline,
        _legs_at_start
      ) RETURNING id INTO _new_round_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO _existing_round
        FROM public.rounds
       WHERE dealer_game_id = _dealer_game_id
         AND hand_number    = _next_hand_number
         AND round_number   = _next_round_number
       LIMIT 1;
      RETURN jsonb_build_object(
        'status','already_advanced',
        'round_id', _existing_round.id,
        'hand_number', _next_hand_number,
        'round_number', _next_round_number,
        'race','insert_lost'
      );
    END;

    INSERT INTO public.player_cards (player_id, round_id, cards)
    SELECT (x->>'player_id')::uuid, _new_round_id, x->'cards'
      FROM jsonb_array_elements(_assignments) x;
  END IF;

  UPDATE public.games
     SET status                    = 'in_progress',
         current_round             = _next_round_number,
         total_hands               = _hand_number_final,
         pot                       = _new_pot,
         awaiting_next_round       = false,
         next_round_number         = NULL,
         all_decisions_in          = false,
         all_decisions_in_round_id = NULL,
         last_round_result         = NULL,
         game_over_at              = NULL,
         config_deadline           = NULL,
         ante_decision_deadline    = NULL,
         is_first_hand             = false
   WHERE id = _game_id;

  IF _next_round_number = 1 THEN
    -- (a) Ante audit game_results row (idempotent via partial unique index; use conflict-target inference).
    IF _ante_total > 0 THEN
      INSERT INTO public.game_results (
        game_id, hand_number, winner_player_id, winner_username,
        winning_hand_description, pot_won, player_chip_changes,
        is_chopped, game_type, dealer_game_id
      ) VALUES (
        _game_id, _hand_number_final, NULL,
        (_eligible_count::text || ' players anted $' || _ante_amount::text),
        'Ante', 0, _ante_chip_changes, false, '357', _dealer_game_id
      )
      ON CONFLICT (dealer_game_id, hand_number)
        WHERE game_type = ANY (ARRAY['3-5-7'::text, '3-5-7-game'::text, '357'::text])
          AND winning_hand_description = 'Ante'::text
      DO NOTHING;
    END IF;

    FOR _asg IN SELECT * FROM jsonb_array_elements(_assignments) LOOP
      _sweep_cards := _asg->'cards';
      SELECT array_agg(c->>'rank') INTO _sweep_ranks
        FROM jsonb_array_elements(_sweep_cards) c;
      IF _sweep_ranks IS NOT NULL
         AND '3' = ANY(_sweep_ranks)
         AND '5' = ANY(_sweep_ranks)
         AND '7' = ANY(_sweep_ranks)
      THEN
        _sweep_winner := (_asg->>'player_id')::uuid;
        EXIT;
      END IF;
    END LOOP;

    IF _sweep_winner IS NOT NULL THEN
      SELECT COALESCE(pr.username, 'Player ' || COALESCE(p.position, 0)::text)
        INTO _sweep_username
        FROM public.players p
        LEFT JOIN public.profiles pr ON pr.id = p.user_id
       WHERE p.id = _sweep_winner;

      UPDATE public.rounds SET status = 'completed' WHERE id = _new_round_id;

      _leg_value := COALESCE(_game.leg_value, 1);
      SELECT COALESCE(SUM(COALESCE(legs,0) * _leg_value), 0)
        INTO _total_leg_value
        FROM public.players
       WHERE game_id = _game_id;
      _total_prize := _new_pot + _total_leg_value;
      _sweep_message := '357_SWEEP:' || _sweep_username || ':' || _total_prize::text;

      UPDATE public.players
         SET chips = chips + _total_prize
       WHERE id = _sweep_winner;

      SELECT COALESCE(jsonb_object_agg(
               p.id::text,
               CASE WHEN p.id = _sweep_winner THEN _total_prize ELSE 0 END), '{}'::jsonb)
        INTO _sweep_chip_changes
        FROM public.players p
       WHERE p.game_id = _game_id;

      UPDATE public.players
         SET legs = 0, current_decision = NULL, decision_locked = false
       WHERE game_id = _game_id;
      UPDATE public.players
         SET ante_decision = NULL
       WHERE game_id = _game_id AND status <> 'observer';

      _pending_session_end := COALESCE(_game.pending_session_end, false);

      UPDATE public.games
         SET status                    = CASE WHEN _pending_session_end THEN 'session_ended' ELSE 'game_over' END,
             session_ended_at          = CASE WHEN _pending_session_end THEN now() ELSE session_ended_at END,
             game_over_at              = CASE WHEN _pending_session_end THEN now() ELSE NULL END,
             pending_session_end       = CASE WHEN _pending_session_end THEN false ELSE pending_session_end END,
             pot                       = 0,
             current_round             = NULL,
             awaiting_next_round       = false,
             all_decisions_in          = false,
             all_decisions_in_round_id = NULL,
             last_round_result         = _sweep_message,
             total_hands               = _hand_number_final
       WHERE id = _game_id
         AND status = 'in_progress';

      -- Sweep game_results row (idempotent via partial unique index; use conflict-target inference).
      INSERT INTO public.game_results (
        game_id, hand_number, winner_player_id, winner_username,
        winning_hand_description, pot_won, player_chip_changes,
        is_chopped, game_type, dealer_game_id
      ) VALUES (
        _game_id, _hand_number_final, _sweep_winner, _sweep_username,
        '3-5-7 Sweep', _total_prize, _sweep_chip_changes, false, '357', _dealer_game_id
      )
      ON CONFLICT (dealer_game_id, hand_number)
        WHERE game_type = ANY (ARRAY['3-5-7'::text, '3-5-7-game'::text, '357'::text])
          AND winning_hand_description = '3-5-7 Sweep'::text
      DO NOTHING;

      RETURN jsonb_build_object(
        'status', CASE WHEN _existing_found THEN 'repaired_and_advanced_instant_win' ELSE 'advanced_instant_win' END,
        'round_id', _new_round_id,
        'hand_number', _hand_number_final,
        'round_number', _next_round_number,
        'eligible_player_count', _eligible_count,
        'pot', 0,
        'ante_charged', _ante_total,
        'instant_win', jsonb_build_object(
          'winner_player_id', _sweep_winner,
          'winner_username', _sweep_username,
          'total_prize', _total_prize,
          'sweep_message', _sweep_message,
          'session_ended', _pending_session_end
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN _existing_found THEN 'repaired_and_advanced' ELSE 'advanced' END,
    'round_id', _new_round_id,
    'hand_number', _hand_number_final,
    'round_number', _next_round_number,
    'eligible_player_count', _eligible_count,
    'pot', _new_pot,
    'ante_charged', _ante_total
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.proceed_to_next_holm_hand_core(p_game_id uuid, p_expected_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_expected_round public.rounds%ROWTYPE;
  v_existing_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_positions integer[];
  v_player_count integer;
  v_new_buck_position integer;
  v_hand_number integer;
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_player_id uuid;
  v_updated_count integer;
  v_buck_event jsonb := NULL;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_holm_game';
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1
       FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_participant';
  END IF;

  SELECT * INTO v_expected_round
  FROM public.rounds
  WHERE id = p_expected_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-round');
  END IF;

  -- Duplicate or late callbacks receive the immutable successor identity.
  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
    AND hand_number > coalesce(v_expected_round.hand_number, 0)
  ORDER BY hand_number, round_number
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-started',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'buck_position', v_existing_round.current_turn_position,
      'pot', v_existing_round.pot,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'terminal-state',
      'status', v_game.status
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-awaiting-next-hand');
  END IF;

  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)::integer
    INTO v_player_ids, v_positions, v_player_count
    FROM public.players
   WHERE game_id = p_game_id
     AND status = 'active'
     AND sitting_out = false;

  IF coalesce(v_player_count, 0) < 1 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'no-active-players');
  END IF;

  IF 4 + (4 * v_player_count) > 52 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'too-many-players');
  END IF;

  SELECT max(position)
    INTO v_new_buck_position
    FROM unnest(v_positions) AS occupied(position)
   WHERE position < v_game.buck_position;

  IF v_new_buck_position IS NULL THEN
    SELECT max(position)
      INTO v_new_buck_position
      FROM unnest(v_positions) AS occupied(position);
  END IF;

  v_hand_number := coalesce(v_expected_round.hand_number, 0) + 1;

  SELECT coalesce(decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults
   WHERE game_type = 'holm'
   LIMIT 1;

  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           private.secure_shuffle_key() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key)
    INTO v_deck
    FROM deck;

  v_community_cards := jsonb_build_array(
    v_deck->0,
    v_deck->1,
    v_deck->2,
    v_deck->3
  );

  UPDATE public.players
     SET current_decision = NULL,
         decision_locked = false,
         pre_fold = false,
         pre_stay = false
   WHERE game_id = p_game_id;

  UPDATE public.rounds
     SET status = 'completed',
         current_turn_position = NULL,
         decision_deadline = NULL
   WHERE id = v_expected_round.id;

  INSERT INTO public.rounds (
    game_id,
    round_number,
    cards_dealt,
    status,
    pot,
    decision_deadline,
    community_cards,
    community_cards_revealed,
    chucky_active,
    chucky_cards,
    chucky_cards_revealed,
    current_turn_position,
    hand_number,
    dealer_game_id,
    holm_turn_sequence
  ) VALUES (
    p_game_id,
    1,
    4,
    'betting',
    coalesce(v_game.pot, 0),
    v_deadline,
    v_community_cards,
    2,
    false,
    '[]'::jsonb,
    0,
    v_new_buck_position,
    v_hand_number,
    v_game.current_game_uuid,
    0
  )
  RETURNING id INTO v_round_id;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards (
      player_id,
      round_id,
      cards,
      hand_context_id,
      source_version,
      is_public
    ) VALUES (
      v_player_id,
      v_round_id,
      jsonb_build_array(
        v_deck->v_card_offset,
        v_deck->(v_card_offset + 1),
        v_deck->(v_card_offset + 2),
        v_deck->(v_card_offset + 3)
      ),
      v_round_id::text,
      1,
      false
    );
    v_card_offset := v_card_offset + 4;
  END LOOP;

  SELECT count(*)::integer
    INTO v_updated_count
    FROM public.player_cards
   WHERE round_id = v_round_id
     AND player_id = ANY(v_player_ids)
     AND hand_context_id = v_round_id::text;

  IF v_updated_count <> v_player_count THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:card_cohort_changed';
  END IF;

  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_new_buck_position THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_new_buck_position,
      'createdAt', clock_timestamp(),
      'source', 'SERVER_BUCK_TRANSFER'
    );
  END IF;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = v_hand_number,
         buck_position = v_new_buck_position,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         buck_transfer_presentation = coalesce(v_buck_event, buck_transfer_presentation)
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'started',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_hand_number,
    'buck_position', v_new_buck_position,
    'pot', coalesce(v_game.pot, 0),
    'deduped', false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.prepare_next_holm_hand(p_game_id uuid, p_expected_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_expected_round public.rounds%ROWTYPE;
  v_existing_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_positions integer[];
  v_player_count integer;
  v_new_buck_position integer;
  v_hand_number integer;
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_player_id uuid;
  v_inserted_count integer;
  v_fallback_seconds integer;
  v_fallback_at timestamptz;
  v_buck_event jsonb := NULL;
  v_ack_required integer := 0;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:not_holm_game';
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:not_participant';
  END IF;

  SELECT * INTO v_expected_round
  FROM public.rounds
  WHERE id = p_expected_round_id
    AND game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale-round');
  END IF;

  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE holm_predecessor_round_id = p_expected_round_id
  LIMIT 1;

  IF FOUND THEN
    SELECT count(*)::integer INTO v_ack_required
    FROM private.holm_hand_presentation_ack_requirements requirement
    WHERE requirement.successor_round_id = v_existing_round.id;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_existing_round.status = 'dealing' THEN 'already-prepared' ELSE 'already-active' END,
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'pending_turn_position', v_existing_round.pending_turn_position,
      'presentation_fallback_at', v_existing_round.presentation_fallback_at,
      'acknowledgements_required', v_ack_required,
      'deduped', true
    );
  END IF;

  SELECT * INTO v_existing_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
    AND hand_number > coalesce(v_expected_round.hand_number, 0)
  ORDER BY hand_number, round_number
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-active',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_existing_round.dealer_game_id,
      'hand_number', v_existing_round.hand_number,
      'deduped', true
    );
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal-state', 'status', v_game.status);
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.awaiting_next_round, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'not-awaiting-next-hand');
  END IF;

  IF v_expected_round.status <> 'completed' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'predecessor-not-completed', 'status', v_expected_round.status);
  END IF;

  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)::integer
    INTO v_player_ids, v_positions, v_player_count
    FROM public.players
   WHERE game_id = p_game_id
     AND status = 'active'
     AND sitting_out = false;

  IF coalesce(v_player_count, 0) < 1 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'no-active-players');
  END IF;

  IF 4 + (4 * v_player_count) > 52 THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'too-many-players');
  END IF;

  SELECT max(position) INTO v_new_buck_position
  FROM unnest(v_positions) AS occupied(position)
  WHERE position < v_game.buck_position;

  IF v_new_buck_position IS NULL THEN
    SELECT max(position) INTO v_new_buck_position
    FROM unnest(v_positions) AS occupied(position);
  END IF;

  v_hand_number := coalesce(v_expected_round.hand_number, 0) + 1;
  SELECT holm_presentation_ack_fallback_seconds INTO v_fallback_seconds
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;
  v_fallback_seconds := coalesce(v_fallback_seconds, 30);
  v_fallback_at := clock_timestamp() + make_interval(secs => v_fallback_seconds);

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           private.secure_shuffle_key() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;

  v_community_cards := jsonb_build_array(v_deck->0, v_deck->1, v_deck->2, v_deck->3);

  INSERT INTO public.rounds (
    game_id, round_number, cards_dealt, status, pot, decision_deadline,
    community_cards, community_cards_revealed, chucky_active,
    chucky_cards, chucky_cards_revealed, current_turn_position,
    pending_turn_position, presentation_generation, presentation_fallback_at,
    hand_number, dealer_game_id, holm_turn_sequence,
    holm_predecessor_round_id
  ) VALUES (
    p_game_id, 1, 4, 'dealing', coalesce(v_game.pot, 0), NULL,
    v_community_cards, 2, false,
    '[]'::jsonb, 0, NULL,
    v_new_buck_position, 0, v_fallback_at,
    v_hand_number, v_game.current_game_uuid, 0,
    p_expected_round_id
  ) RETURNING id INTO v_round_id;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards (
      player_id, round_id, cards, hand_context_id, source_version, is_public
    ) VALUES (
      v_player_id,
      v_round_id,
      jsonb_build_array(
        v_deck->v_card_offset,
        v_deck->(v_card_offset + 1),
        v_deck->(v_card_offset + 2),
        v_deck->(v_card_offset + 3)
      ),
      v_round_id::text,
      1,
      false
    );
    v_card_offset := v_card_offset + 4;
  END LOOP;

  SELECT count(*)::integer INTO v_inserted_count
  FROM public.player_cards
  WHERE round_id = v_round_id
    AND player_id = ANY(v_player_ids)
    AND hand_context_id = v_round_id::text;

  IF v_inserted_count <> v_player_count THEN
    RAISE EXCEPTION 'prepare_next_holm_hand:card_cohort_changed';
  END IF;

  INSERT INTO private.holm_hand_presentation_ack_requirements (
    game_id, dealer_game_id, predecessor_round_id, successor_round_id,
    hand_number, player_id, user_id
  )
  SELECT p_game_id,
         v_game.current_game_uuid,
         p_expected_round_id,
         v_round_id,
         v_hand_number,
         participant.id,
         participant.user_id
  FROM public.players participant
  WHERE participant.game_id = p_game_id
    AND participant.status = 'active'
    AND participant.sitting_out = false
    AND participant.is_bot = false;
  GET DIAGNOSTICS v_ack_required = ROW_COUNT;

  IF v_game.buck_position IS NOT NULL
     AND v_game.buck_position IS DISTINCT FROM v_new_buck_position THEN
    v_buck_event := jsonb_build_object(
      'id', gen_random_uuid(),
      'sessionId', p_game_id,
      'dealerGameId', v_game.current_game_uuid,
      'roundId', v_round_id,
      'handContextId', v_round_id::text,
      'handNumber', v_hand_number,
      'sequence', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'fromPosition', v_game.buck_position,
      'toPosition', v_new_buck_position,
      'createdAt', clock_timestamp(),
      'source', 'SERVER_BUCK_TRANSFER'
    );
  END IF;

  -- The exact H2 Buck event is durable before clients are allowed to present
  -- H2. Exact round/hand admission prevents it from appearing on H1.
  UPDATE public.games
     SET buck_transfer_presentation = v_buck_event
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'prepared',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', v_hand_number,
    'pending_turn_position', v_new_buck_position,
    'pot', coalesce(v_game.pot, 0),
    'presentation_fallback_at', v_fallback_at,
    'acknowledgements_required', v_ack_required,
    'deduped', false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION private.gin_new_deck()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  WITH deck AS (
    SELECT private.gin_card(rank, suit) AS card, private.secure_shuffle_key() AS shuffle_key
      FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key) FROM deck;
$function$;
CREATE OR REPLACE FUNCTION private.gin_deck_without(_used jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  WITH deck AS (
    SELECT private.gin_card(rank, suit) AS card, private.secure_shuffle_key() AS shuffle_key
      FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
  )
  SELECT coalesce(jsonb_agg(deck.card ORDER BY deck.shuffle_key), '[]'::jsonb)
    FROM deck
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(_used,'[]'::jsonb)) used(value)
      WHERE private.gin_card_key(used.value)=private.gin_card_key(deck.card)
   );
$function$;
CREATE OR REPLACE FUNCTION public.create_session(p_request_id uuid, p_name text, p_real_money boolean, p_position integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE receipt private.session_creation_requests%ROWTYPE; payload jsonb; g uuid; p uuid; seat integer;
 setup_seconds integer; ante_seconds integer; deck text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 THEN RAISE EXCEPTION 'create_session:not_authorized' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_real_money IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR (p_position IS NOT NULL AND p_position NOT BETWEEN 1 AND 7)
 THEN RAISE EXCEPTION 'create_session:invalid_request' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('name',btrim(p_name),'real_money',p_real_money,'position',p_position);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,914));
 SELECT * INTO receipt FROM private.session_creation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.payload IS DISTINCT FROM payload
  THEN RAISE EXCEPTION 'create_session:request_mismatch' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('outcome',CASE WHEN receipt.game_id IS NULL THEN 'already_deleted' ELSE 'already_created' END,
   'game_id',receipt.game_id,'player_id',receipt.player_id);
 END IF;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND
 EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true')
 THEN RAISE EXCEPTION 'create_session:maintenance' USING ERRCODE='42501'; END IF;
 SELECT (value::text)::integer INTO setup_seconds FROM public.system_settings WHERE key='game_setup_timer_seconds';
 SELECT (value::text)::integer INTO ante_seconds FROM public.system_settings WHERE key='ante_decision_timer_seconds';
 SELECT deck_color_mode INTO deck FROM public.profiles WHERE id=auth.uid();
 seat:=coalesce(p_position,1+private.secure_random_int(7));
 INSERT INTO public.games(name,status,real_money,buy_in,current_host,game_setup_timer_seconds,ante_decision_timer_seconds)
 VALUES(btrim(p_name),'waiting',p_real_money,100,auth.uid(),coalesce(setup_seconds,30),coalesce(ante_seconds,30)) RETURNING id INTO g;
 INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
 VALUES(g,auth.uid(),seat,0,'active',false,true,deck) RETURNING id INTO p;
 INSERT INTO private.session_creation_requests(request_id,actor_id,payload,game_id,player_id)
 VALUES(p_request_id,auth.uid(),payload,g,p);
 RETURN jsonb_build_object('outcome','created','game_id',g,'player_id',p);
END $function$;
CREATE OR REPLACE FUNCTION private.cribbage_finish_discard(p_state jsonb, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_state jsonb:=p_state;
  v_used jsonb := '[]'::jsonb;
  v_available jsonb;
  v_cut jsonb;
  v_extra jsonb;
  v_player_id text;
  v_score integer;
  v_low integer;
  v_multiplier integer:=1;
  v_harness text;
  v_harness_enabled boolean:=false;
  v_campaign_harness text:=nullif(p_state->>'campaignHarnessProfile','');
BEGIN
  IF v_state->>'phase'<>'discarding' THEN RETURN v_state; END IF;
  v_used:=coalesce(v_state->'crib','[]'::jsonb);
  FOR v_player_id IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP
    v_used:=v_used||coalesce(v_state->'playerStates'->v_player_id->'hand','[]'::jsonb)||coalesce(v_state->'playerStates'->v_player_id->'discardedToCrib','[]'::jsonb);
  END LOOP;
  SELECT coalesce(jsonb_agg(card), '[]'::jsonb) INTO v_available FROM jsonb_array_elements(private.cribbage_new_deck()) card
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_used) used WHERE used->>'rank'=card->>'rank' AND used->>'suit'=card->>'suit');
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type='cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF v_campaign_harness IS NOT NULL THEN v_harness:=v_campaign_harness; v_harness_enabled:=true; END IF;
  v_harness_enabled := coalesce(v_harness_enabled,false) AND EXISTS(
    SELECT 1 FROM public.games WHERE id=p_game_id AND real_money IS FALSE);
  IF coalesce(v_harness_enabled,false) AND v_harness='max_pegging_fan' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='spades' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='perpetual_heels' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='J' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='fifteen_run_go_counting' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='hearts' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_qualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='clubs' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_nonqualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='hearts' LIMIT 1; END IF;
  IF v_cut IS NULL THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card ORDER BY private.secure_shuffle_key() LIMIT 1; END IF;
  IF jsonb_object_length(v_state->'playerStates')=3 AND jsonb_array_length(v_state->'crib')=3 THEN
    SELECT card INTO v_extra FROM jsonb_array_elements(v_available) card
     WHERE card->>'rank'<>v_cut->>'rank' OR card->>'suit'<>v_cut->>'suit'
     ORDER BY private.secure_shuffle_key() LIMIT 1;
    IF v_extra IS NULL THEN RAISE EXCEPTION 'cribbage:missing_fourth_crib_card'; END IF;
    v_state:=jsonb_set(v_state,'{crib}',(v_state->'crib')||jsonb_build_array(v_extra),true);
  END IF;
  v_state:=jsonb_set(v_state,'{cutCard}',v_cut,true);
  v_state:=jsonb_set(v_state,'{phase}','"pegging"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',to_jsonb(v_state->'turnOrder'->>0),true);
  IF v_cut->>'rank'='J' THEN
    v_player_id:=v_state->>'dealerPlayerId';
    v_score:=coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)+2;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id,'pegScore'],to_jsonb(v_score),true);
    v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','his_heels','playerId',v_player_id,'points',2,'label','His Heels','createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN
      SELECT min(coalesce((value->>'pegScore')::integer,0)) INTO v_low FROM jsonb_each(v_state->'playerStates') WHERE key<>v_player_id;
      IF coalesce((v_state->>'doubleSkunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'doubleSkunkThreshold')::integer,61) THEN v_multiplier:=3;
      ELSIF coalesce((v_state->>'skunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'skunkThreshold')::integer,91) THEN v_multiplier:=2; END IF;
      v_state:=jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{winnerPlayerId}',to_jsonb(v_player_id),true);
      v_state:=jsonb_set(v_state,'{loserScore}',to_jsonb(v_low),true);
      v_state:=jsonb_set(v_state,'{payoutMultiplier}',to_jsonb(v_multiplier),true);
      v_state:=jsonb_set(v_state,'{matchCompleteLatch}','true'::jsonb,true);
    END IF;
  END IF;
  RETURN v_state;
END;
$function$;
CREATE OR REPLACE FUNCTION private.three_five_seven_create_round(p_game_id uuid, p_dealer_game_id uuid, p_round_number integer, p_hand_number integer, p_charge_amount integer, p_charge_label text, p_decision_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE; v_existing public.rounds%ROWTYPE; v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE; v_player_ids uuid[]; v_player_id uuid;
  v_cards_dealt integer:=CASE p_round_number WHEN 1 THEN 3 WHEN 2 THEN 5 WHEN 3 THEN 7 END;
  v_new_count integer:=CASE p_round_number WHEN 1 THEN 3 ELSE 2 END;
  v_prev_round_id uuid; v_carry jsonb; v_dealt jsonb:='[]'::jsonb; v_deck jsonb;
  v_slice jsonb; v_cards jsonb; v_cursor integer:=0; v_total_charge integer:=0;
  v_legs jsonb; v_changes jsonb:='{}'::jsonb; v_transfer jsonb:='[]'::jsonb;
  v_fixture_profile text; v_player_index integer:=0; v_fixture_slice jsonb;
BEGIN
  IF p_round_number NOT IN (1,2,3) OR p_hand_number<1 THEN
    RAISE EXCEPTION 'three_five_seven_create_round:invalid_identity';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_create_round:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_create_round:dealer_game_mismatch';
  END IF;
  IF v_game.status IN ('game_over','session_ended') THEN
    RAISE EXCEPTION 'three_five_seven_create_round:terminal_game';
  END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number AND round_number=p_round_number
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',v_existing.hand_number,'round_number',v_existing.round_number,
      'round',to_jsonb(v_existing)
    );
  END IF;

  SELECT array_agg(player.id ORDER BY coalesce(player.position,9999),player.id)
    INTO v_player_ids
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out,false);
  IF coalesce(cardinality(v_player_ids),0)<2 THEN
    RAISE EXCEPTION 'three_five_seven_create_round:insufficient_players';
  END IF;

  v_fixture_profile:=private.target_rule_branch_profile_for_context(
    p_game_id,p_dealer_game_id,p_hand_number,p_round_number,'3-5-7'
  );

  IF p_round_number IN (2,3) THEN
    SELECT id INTO v_prev_round_id FROM public.rounds
     WHERE dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
       AND round_number=p_round_number-1 AND status='completed'
     FOR UPDATE;
    IF v_prev_round_id IS NULL THEN RAISE EXCEPTION 'three_five_seven_create_round:predecessor_not_completed'; END IF;
    SELECT coalesce(jsonb_agg(card),'[]'::jsonb) INTO v_dealt
      FROM public.player_cards pc CROSS JOIN LATERAL jsonb_array_elements(pc.cards) card
     WHERE pc.round_id=v_prev_round_id;
  END IF;

  WITH ranks(rank) AS (VALUES ('2'),('3'),('4'),('5'),('6'),('7'),('8'),('9'),('10'),('J'),('Q'),('K'),('A')),
       suits(suit) AS (VALUES ('♠'),('♥'),('♦'),('♣')),
       available AS (
         SELECT jsonb_build_object('rank',rank,'suit',suit) card FROM ranks CROSS JOIN suits
         EXCEPT
         SELECT dealt_card FROM jsonb_array_elements(v_dealt) dealt_card
       )
  SELECT coalesce(jsonb_agg(card ORDER BY private.secure_shuffle_key()),'[]'::jsonb) INTO v_deck FROM available;

  IF p_round_number=1 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'player_id',player.id,'position',coalesce(player.position,0),'legs',coalesce(player.legs,0)
    ) ORDER BY coalesce(player.position,9999),player.id),'[]'::jsonb)
    INTO v_legs FROM public.players player WHERE player.game_id=p_game_id;
  END IF;

  INSERT INTO public.rounds(
    game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot,
    decision_deadline,three_five_seven_legs_at_start
  ) VALUES (
    p_game_id,p_dealer_game_id,p_hand_number,p_round_number,v_cards_dealt,'betting',
    coalesce(v_game.pot,0),p_decision_deadline,v_legs
  ) RETURNING * INTO v_round;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    v_player_index:=v_player_index+1;
    IF p_round_number=1 THEN v_carry:='[]'::jsonb;
    ELSE
      SELECT cards INTO v_carry FROM public.player_cards
       WHERE round_id=v_prev_round_id AND player_id=v_player_id;
      IF jsonb_array_length(coalesce(v_carry,'[]'::jsonb))<>v_cards_dealt-2 THEN
        RAISE EXCEPTION 'three_five_seven_create_round:invalid_carry:%',v_player_id;
      END IF;
    END IF;
    SELECT coalesce(jsonb_agg(card ORDER BY ord),'[]'::jsonb) INTO v_slice
      FROM jsonb_array_elements(v_deck) WITH ORDINALITY deck(card,ord)
     WHERE ord>v_cursor AND ord<=v_cursor+v_new_count;
    v_fixture_slice:=private.target_357_fixture_slice(v_fixture_profile,p_round_number,v_player_index);
    IF v_fixture_slice IS NOT NULL THEN v_slice:=v_fixture_slice; END IF;
    IF jsonb_array_length(v_slice)<>v_new_count THEN RAISE EXCEPTION 'three_five_seven_create_round:deck_underflow'; END IF;
    v_cursor:=v_cursor+v_new_count; v_cards:=v_carry||v_slice;
    INSERT INTO public.player_cards(player_id,round_id,cards) VALUES(v_player_id,v_round.id,v_cards);
  END LOOP;

  IF coalesce(p_charge_amount,0)>0 THEN
    FOREACH v_player_id IN ARRAY v_player_ids LOOP
      v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',v_player_id),
        'to',jsonb_build_object('kind','pot'),'amount',p_charge_amount
      ));
      v_changes:=jsonb_set(v_changes,ARRAY[v_player_id::text],to_jsonb(-p_charge_amount),true);
    END LOOP;
    PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'ante');
    v_total_charge:=cardinality(v_player_ids)*p_charge_amount;
    UPDATE public.rounds SET pot=(SELECT pot FROM public.games WHERE id=p_game_id) WHERE id=v_round.id;
    INSERT INTO public.game_results(
      game_id,dealer_game_id,hand_number,winner_player_id,winner_username,
      winning_hand_description,pot_won,player_chip_changes,is_chopped,game_type,
      settlement_key
    ) VALUES (
      p_game_id,p_dealer_game_id,p_hand_number,NULL,
      cardinality(v_player_ids)::text||' players '||lower(p_charge_label)||' $'||p_charge_amount::text,
      p_charge_label,0,v_changes,false,'357',
      'three_five_seven_charge:'||v_round.id::text
    ) ON CONFLICT (dealer_game_id,hand_number,settlement_key)
        WHERE settlement_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.players SET current_decision=NULL,decision_locked=false,status='active'
   WHERE id=ANY(v_player_ids);
  UPDATE public.games SET
    status='in_progress',current_round=p_round_number,total_hands=p_hand_number,
    awaiting_next_round=false,next_round_number=NULL,all_decisions_in=false,
    all_decisions_in_round_id=NULL,last_round_result=NULL,game_over_at=NULL,
    config_deadline=NULL,ante_decision_deadline=NULL,is_first_hand=false
   WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=v_round.id;
  RETURN jsonb_build_object(
    'outcome','started','deduped',false,'round_id',v_round.id,
    'hand_number',p_hand_number,'round_number',p_round_number,
    'charged',v_total_charge,'round',to_jsonb(v_round)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_horses_scc_expired_turn(p_round_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_current_player_id uuid;
  v_current_state jsonb;
  v_current_is_bot boolean;
  v_current_auto_fold boolean;
  v_turn_deadline timestamptz;
  v_all_absent boolean;
  v_current_stale boolean;
  v_should_roll boolean;
  v_dice jsonb;
  v_die jsonb;
  v_index integer;
  v_roll integer;
  v_rolls_remaining integer;
  v_value integer;
  v_target integer;
  v_wild_count integer;
  v_best_count integer;
  v_best_value integer;
  v_candidate_count integer;
  v_has_ship boolean;
  v_has_captain boolean;
  v_has_crew boolean;
  v_cargo_sum integer;
  v_result jsonb;
  v_turn_order jsonb;
  v_seen_current boolean := false;
  v_next_player_id uuid;
  v_next_is_bot boolean;
  v_next_auto_fold boolean;
  v_timer_seconds integer;
  v_bot_delay_seconds numeric;
  v_next_deadline timestamptz;
  v_outcome jsonb;
  v_winner_count integer;
  v_settlement jsonb;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing_round');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = v_round.game_id FOR UPDATE;
  IF NOT FOUND
     OR v_game.game_type NOT IN ('horses', 'ship-captain-crew')
     OR v_game.status <> 'in_progress'
     OR COALESCE(v_game.is_paused, false)
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;

  v_state := v_round.horses_state;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('status', 'missing_state');
  END IF;
  v_all_absent := private.horses_scc_all_humans_absent(v_game.id, p_now);
  IF v_state ->> 'gamePhase' = 'complete' THEN
    v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
    v_winner_count := jsonb_array_length(v_outcome -> 'winner_player_ids');
    IF v_winner_count = 1 THEN
      SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
        INTO v_settlement;
      RETURN v_settlement;
    END IF;
    IF v_all_absent THEN
      RETURN private.horses_scc_rollover_abandoned_round(v_round.id, p_now);
    END IF;
    RETURN jsonb_build_object('status', 'tie_waiting_for_client');
  END IF;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('status', 'unsupported_phase');
  END IF;

  BEGIN
    v_current_player_id := NULLIF(v_state ->> 'currentTurnPlayerId', '')::uuid;
    v_turn_deadline := NULLIF(v_state ->> 'turnDeadline', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:malformed_turn_identity';
  END;
  IF v_current_player_id IS NULL THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:missing_current_player';
  END IF;
  v_current_state := v_state -> 'playerStates' -> v_current_player_id::text;
  IF COALESCE((v_current_state ->> 'isComplete')::boolean, false) THEN
    RETURN private.horses_scc_finish_turn(v_round.id,v_current_player_id,p_now);
  END IF;
  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_current_player_state';
  END IF;
  SELECT player.is_bot, player.auto_fold
    INTO v_current_is_bot, v_current_auto_fold
    FROM public.players AS player
   WHERE player.id = v_current_player_id AND player.game_id = v_game.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:current_player_not_in_game';
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.voice_presence_heartbeats AS heartbeat
     JOIN public.players AS player ON player.user_id = heartbeat.user_id
    WHERE heartbeat.game_id = v_game.id
      AND player.id = v_current_player_id
      AND heartbeat.status IN ('active', 'hidden')
      AND heartbeat.updated_at >= p_now - interval '15 seconds'
  ) INTO v_current_stale;
  v_should_roll := (v_current_is_bot AND v_all_absent)
    OR (v_turn_deadline IS NOT NULL AND v_turn_deadline <= p_now)
    OR (COALESCE(v_current_auto_fold, false) AND v_current_stale);
  IF NOT v_should_roll THEN
    RETURN jsonb_build_object('status', 'not_expired');
  END IF;

  IF NOT v_current_is_bot THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = v_current_player_id;
  END IF;
  v_dice := v_current_state -> 'dice';
  IF v_dice IS NULL OR jsonb_typeof(v_dice) <> 'array' OR jsonb_array_length(v_dice) <> 5 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_dice';
  END IF;

  BEGIN
    v_rolls_remaining := (v_current_state ->> 'rollsRemaining')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END;
  IF v_rolls_remaining NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END IF;

  FOR v_roll IN 1..v_rolls_remaining LOOP
    FOR v_index IN 0..4 LOOP
      v_die := v_dice -> v_index;
      IF NOT COALESCE((v_die ->> 'isHeld')::boolean, false) THEN
        v_die := v_die || jsonb_build_object('value', (private.secure_random_int(6)+1));
        IF v_game.game_type = 'ship-captain-crew' THEN
          v_die := v_die - 'sccType' || jsonb_build_object('isSCC', false);
        END IF;
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END IF;
    END LOOP;

    IF v_game.game_type = 'horses' THEN
      v_wild_count := 0;
      v_best_count := 0;
      v_best_value := 0;
      FOR v_value IN 1..6 LOOP
        SELECT count(*) INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_value = 1 THEN
          v_wild_count := v_candidate_count;
        END IF;
      END LOOP;
      FOR v_value IN REVERSE 6..2 LOOP
        SELECT count(*) + v_wild_count INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_candidate_count > v_best_count
           OR (v_candidate_count = v_best_count AND v_value > v_best_value) THEN
          v_best_count := v_candidate_count;
          v_best_value := v_value;
        END IF;
      END LOOP;
      v_target := v_best_value;
      FOR v_index IN 0..4 LOOP
        v_die := v_dice -> v_index;
        v_value := (v_die ->> 'value')::integer;
        v_die := jsonb_set(v_die, '{isHeld}', to_jsonb(v_value = 1 OR v_value = v_target), true);
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END LOOP;
      EXIT WHEN v_best_count >= 5;
    ELSE
      SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'ship'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'captain'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'crew')
        INTO v_has_ship, v_has_captain, v_has_crew;
      IF NOT v_has_ship THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 6 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'ship'), false);
            v_has_ship := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND NOT v_has_captain THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 5 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'captain'), false);
            v_has_captain := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND NOT v_has_crew THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 4 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'crew'), false);
            v_has_crew := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND v_has_crew THEN
        SELECT COALESCE(sum((die.value ->> 'value')::integer), 0) INTO v_cargo_sum
          FROM jsonb_array_elements(v_dice) AS die
         WHERE NOT COALESCE((die.value ->> 'isSCC')::boolean, false);
        EXIT WHEN v_cargo_sum >= 8;
      END IF;
    END IF;
  END LOOP;

  FOR v_index IN 0..4 LOOP
    v_die := jsonb_set(v_dice -> v_index, '{isHeld}', 'true'::jsonb, true);
    v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
  END LOOP;
  v_result := private.horses_scc_player_result(v_dice, v_game.game_type);
  v_current_state := v_current_state || jsonb_build_object(
    'dice', v_dice,
    'rollsRemaining', 0,
    'isComplete', true,
    'result', v_result
  );
  v_state := jsonb_set(v_state, ARRAY['playerStates', v_current_player_id::text], v_current_state, true);

  v_turn_order := v_state -> 'turnOrder';
  FOR v_index IN 0..jsonb_array_length(v_turn_order) - 1 LOOP
    IF (v_turn_order ->> v_index)::uuid = v_current_player_id THEN
      v_seen_current := true;
    ELSIF v_seen_current
      AND NOT COALESCE(((v_state -> 'playerStates' -> (v_turn_order ->> v_index) ->> 'isComplete')::boolean), false) THEN
      v_next_player_id := (v_turn_order ->> v_index)::uuid;
      EXIT;
    END IF;
  END LOOP;

  IF v_next_player_id IS NULL THEN
    v_state := jsonb_set(v_state, '{gamePhase}', '"complete"'::jsonb, true);
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{turnDeadline}', 'null'::jsonb, true);
  ELSE
    SELECT player.is_bot, player.auto_fold INTO v_next_is_bot, v_next_auto_fold
      FROM public.players AS player WHERE player.id = v_next_player_id;
    SELECT COALESCE(defaults.decision_timer_seconds, 60),
           COALESCE(defaults.bot_decision_delay_seconds, 2)
      INTO v_timer_seconds, v_bot_delay_seconds
      FROM public.game_defaults AS defaults WHERE defaults.game_type = v_game.game_type;
    v_next_deadline := CASE
      WHEN v_next_auto_fold THEN p_now
      WHEN v_next_is_bot THEN p_now + make_interval(secs => GREATEST(0.1, COALESCE(v_bot_delay_seconds, 2)))
      ELSE p_now + make_interval(secs => GREATEST(1, COALESCE(v_timer_seconds, 60)))
    END;
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', to_jsonb(v_next_player_id::text), true);
    v_state := jsonb_set(v_state, '{turnDeadline}', to_jsonb(v_next_deadline), true);
  END IF;
  UPDATE public.rounds SET horses_state = v_state WHERE id = v_round.id;

  IF v_next_player_id IS NULL THEN
    SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
      INTO v_settlement;
    RETURN v_settlement;
  END IF;
  RETURN jsonb_build_object('status', 'advanced_turn', 'next_player_id', v_next_player_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.horses_scc_apply_action(_round_id uuid, _player_id uuid, _action text, _expected_action_sequence integer, _hold_mask boolean[] DEFAULT NULL::boolean[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
 r public.rounds; g public.games; p public.players; s jsonb; ps jsonb; dice jsonb; die jsonb;
 seq integer; rolls integer; i integer; j integer; target integer; label text; profile text;
 holds boolean[]; result jsonb; finished boolean:=false; now_at timestamptz:=clock_timestamp();
 barrier timestamptz; deadline timestamptz; last_turn boolean; force_fixture boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'horses_action:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=_round_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'horses_action:round_not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 IF NOT public.user_is_in_game(g.id) THEN RAISE EXCEPTION 'horses_action:not_in_session' USING ERRCODE='42501'; END IF;
 s:=r.horses_state;
 IF g.game_type NOT IN ('horses','ship-captain-crew') OR g.status<>'in_progress'
  OR coalesce(g.is_paused,false) OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id
  OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
  OR r.status<>'betting' THEN RETURN jsonb_build_object('outcome','rejected','reason','round_not_current','state',s); END IF;
 SELECT * INTO p FROM public.players WHERE id=_player_id AND game_id=g.id AND status NOT IN ('left','observer');
 IF NOT FOUND THEN RAISE EXCEPTION 'horses_action:player_not_found'; END IF;
 IF (p.is_bot OR p.auto_fold) AND s->>'botControllerUserId'=auth.uid()::text THEN
  IF NOT p.is_bot AND g.real_money THEN RAISE EXCEPTION 'horses_action:real_money_auto_requires_owner' USING ERRCODE='42501'; END IF;
 ELSIF p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot THEN
  RAISE EXCEPTION 'horses_action:not_player_owner' USING ERRCODE='42501';
 END IF;
 seq:=coalesce((s->>'actionSequence')::integer,0);
 IF _expected_action_sequence IS NULL THEN RAISE EXCEPTION 'horses_action:sequence_required'; END IF;
 IF _expected_action_sequence<>seq THEN RETURN jsonb_build_object('outcome','stale_action','action_sequence',seq,'state',s); END IF;
 IF s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM _player_id::text THEN
  RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',s); END IF;
 ps:=s->'playerStates'->_player_id::text; dice:=ps->'dice'; rolls:=coalesce((ps->>'rollsRemaining')::integer,3);
 IF coalesce((ps->>'isComplete')::boolean,false) THEN RETURN jsonb_build_object('outcome','stale_action','action_sequence',seq,'state',s); END IF;
 IF jsonb_typeof(dice)<>'array' OR jsonb_array_length(dice)<>5 OR rolls NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'horses_action:invalid_state'; END IF;
 deadline:=nullif(s->>'turnDeadline','')::timestamptz;
 IF NOT p.is_bot AND NOT p.auto_fold AND deadline IS NOT NULL AND deadline<=now_at THEN
  RETURN jsonb_build_object('outcome','rejected','reason','deadline_expired','state',s); END IF;
 barrier:=nullif(ps->>'rollAnimationMinEndAt','')::timestamptz;
 IF barrier>now_at THEN RETURN jsonb_build_object('outcome','rejected','reason','roll_presentation_pending','state',s); END IF;
 IF _action NOT IN ('roll','set_holds','lock') THEN RAISE EXCEPTION 'horses_action:invalid_action'; END IF;
 IF _hold_mask IS NOT NULL THEN
  IF cardinality(_hold_mask)<>5 OR array_position(_hold_mask,NULL) IS NOT NULL THEN RAISE EXCEPTION 'horses_action:invalid_holds'; END IF;
  IF rolls=3 AND true=ANY(_hold_mask) THEN RAISE EXCEPTION 'horses_action:cannot_hold_before_roll'; END IF;
  FOR i IN 0..4 LOOP
   die:=dice->i;
   IF coalesce((die->>'isSCC')::boolean,false) AND NOT _hold_mask[i+1] THEN RAISE EXCEPTION 'horses_action:scc_lock_is_permanent'; END IF;
   dice:=jsonb_set(dice,ARRAY[i::text],jsonb_set(die,'{isHeld}',to_jsonb(_hold_mask[i+1]),true));
  END LOOP;
 END IF;
 SELECT array_agg(coalesce((value->>'isHeld')::boolean,false) ORDER BY ordinality) INTO holds FROM jsonb_array_elements(dice) WITH ORDINALITY;
 IF _action='roll' THEN
  IF rolls<=0 THEN RAISE EXCEPTION 'horses_action:no_rolls'; END IF;
  SELECT debug_harness INTO profile FROM public.game_defaults WHERE game_type=g.game_type;
  SELECT g.real_money IS FALSE AND coalesce((value->>'enabled')::boolean,false) INTO force_fixture FROM public.system_settings WHERE key='harnesses_mode';
  FOR i IN 0..4 LOOP
   die:=dice->i;
   IF NOT holds[i+1] THEN
    target:=CASE WHEN force_fixture AND g.game_type='horses' AND profile='force_tie' THEN 1
      WHEN force_fixture AND g.game_type='ship-captain-crew' AND profile='force_no_qualify' THEN (private.secure_random_int(3)+1)
      ELSE (private.secure_random_int(6)+1) END;
    die:=jsonb_set(die,'{value}',to_jsonb(target),true);
    IF g.game_type='ship-captain-crew' THEN die:=(die-'sccType')||jsonb_build_object('isSCC',false); END IF;
    dice:=jsonb_set(dice,ARRAY[i::text],die);
   END IF;
  END LOOP;
  IF g.game_type='ship-captain-crew' THEN
   FOR j IN 1..3 LOOP
    label:=CASE j WHEN 1 THEN 'ship' WHEN 2 THEN 'captain' ELSE 'crew' END; target:=7-j;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dice) x WHERE x->>'sccType'=label) THEN
     SELECT ordinality::integer-1 INTO i FROM jsonb_array_elements(dice) WITH ORDINALITY x(value,ordinality)
      WHERE (value->>'value')::integer=target AND NOT coalesce((value->>'isSCC')::boolean,false) ORDER BY ordinality LIMIT 1;
     IF i IS NULL THEN EXIT; END IF;
     dice:=jsonb_set(dice,ARRAY[i::text],(dice->i)||jsonb_build_object('isHeld',true,'isSCC',true,'sccType',label));
    END IF;
   END LOOP;
  END IF;
  IF p.is_bot AND rolls=3 THEN
   SELECT coalesce(decision_timer_seconds,60) INTO target FROM public.game_defaults WHERE game_type=g.game_type;
   s:=s||jsonb_build_object('turnDeadline',now_at+make_interval(secs=>greatest(1,coalesce(target,60))));
  END IF;
  rolls:=rolls-1;
  result:=private.horses_scc_player_result(dice,g.game_type);
  finished:=rolls=0 OR (g.game_type='ship-captain-crew' AND (result->>'cargoSum')::integer=12);
  ps:=ps||jsonb_build_object('rollKey',greatest(floor(extract(epoch FROM now_at)*1000)::bigint,coalesce((ps->>'rollKey')::bigint,0)+1),
   'holdSeq',0,'rollStartedAt',now_at,'rollAnimationMinEndAt',now_at+make_interval(secs=>CASE WHEN rolls=2 THEN 1.3 ELSE 1.8 END),
   'heldMaskBeforeComplete',to_jsonb(holds),'heldCountBeforeComplete',(SELECT count(*) FROM unnest(holds) h WHERE h));
 ELSIF _action='set_holds' THEN
  IF _hold_mask IS NULL OR rolls=3 THEN RAISE EXCEPTION 'horses_action:hold_requires_roll'; END IF;
  ps:=ps||jsonb_build_object('holdSeq',coalesce((ps->>'holdSeq')::integer,0)+1);
 ELSE
  IF rolls=3 THEN RAISE EXCEPTION 'horses_action:lock_requires_roll'; END IF;
  result:=private.horses_scc_player_result(dice,g.game_type);
  IF g.game_type='ship-captain-crew' AND NOT (result->>'isQualified')::boolean THEN RAISE EXCEPTION 'horses_action:scc_not_qualified'; END IF;
  finished:=true;
 END IF;
 IF finished THEN
  rolls:=0;
  SELECT jsonb_agg(jsonb_set(value,'{isHeld}','true'::jsonb,true) ORDER BY ordinality) INTO dice FROM jsonb_array_elements(dice) WITH ORDINALITY;
  ps:=ps||jsonb_build_object('result',result);
  last_turn:=(s->'turnOrder'->>(jsonb_array_length(s->'turnOrder')-1))=_player_id::text;
  s:=s||jsonb_build_object('turnAdvanceAt',now_at+make_interval(secs=>(CASE WHEN _action='roll' THEN 1.8 ELSE 0 END)+(CASE WHEN last_turn THEN 0 ELSE 3 END)));
 END IF;
 ps:=ps||jsonb_build_object('dice',dice,'rollsRemaining',rolls,'isComplete',finished);
 s:=jsonb_set(s,ARRAY['playerStates',_player_id::text],ps)||jsonb_build_object('actionSequence',seq+1);
 UPDATE public.rounds SET horses_state=s WHERE id=r.id RETURNING horses_state INTO s;
 RETURN jsonb_build_object('outcome','applied','action_sequence',seq+1,'state',s);
END;
$function$;
CREATE OR REPLACE FUNCTION private.three_five_seven_recover_game(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE; v_round public.rounds%ROWTYPE; v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_eligible integer; v_ready integer; v_fold_probability integer:=30; v_result jsonb;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RETURN jsonb_build_object('outcome','not_357');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN RETURN jsonb_build_object('outcome','paused'); END IF;

  IF v_game.status='ante_decision' THEN
    SELECT count(*),count(*) FILTER(WHERE player.ante_decision='ante_up') INTO v_eligible,v_ready
      FROM public.players player WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
       AND NOT coalesce(player.sitting_out,false);
    IF v_eligible>=2 AND v_ready=v_eligible THEN RETURN public.three_five_seven_begin_game(p_game_id); END IF;
    RETURN jsonb_build_object('outcome','awaiting_antes');
  END IF;

  IF v_game.status='in_progress' AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round FROM public.rounds
     WHERE game_id=p_game_id AND dealer_game_id=v_game.current_game_uuid
       AND hand_number=v_game.total_hands AND round_number=v_game.current_round FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_recover_game:current_round_missing'; END IF;
    IF v_round.status='betting' THEN
      SELECT coalesce(defaults.bot_fold_probability,30) INTO v_fold_probability
        FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
      UPDATE public.players SET current_decision=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30) THEN 'fold' ELSE 'stay' END,
        decision_locked=true
       WHERE game_id=p_game_id AND coalesce(is_bot,false) AND status NOT IN ('left','observer')
         AND NOT coalesce(sitting_out,false) AND NOT coalesce(decision_locked,false);
      IF v_round.decision_deadline<=clock_timestamp() THEN
        RETURN public.three_five_seven_expire_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number);
      END IF;
      SELECT count(*) FILTER(WHERE NOT coalesce(player.decision_locked,false)) INTO v_ready
        FROM public.players player WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
         AND NOT coalesce(player.sitting_out,false);
      IF v_ready=0 THEN RETURN private.three_five_seven_resolve_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number); END IF;
      RETURN jsonb_build_object('outcome','awaiting_decisions');
    END IF;
    SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=v_round.dealer_game_id
       AND resolution.round_id=v_round.id AND resolution.hand_number=v_round.hand_number
       AND resolution.round_number=v_round.round_number;
    IF coalesce(v_game.awaiting_next_round,false) AND FOUND
       AND v_resolution.presentation_fallback_at<=clock_timestamp() THEN
      RETURN public.three_five_seven_advance_round(p_game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number,v_round.round_number);
    END IF;
  END IF;

  IF v_game.status IN ('game_over','session_ended') AND v_game.current_game_uuid IS NOT NULL THEN
    SELECT resolution.* INTO v_resolution FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id AND resolution.dealer_game_id=v_game.current_game_uuid
       AND resolution.hand_number=v_game.total_hands AND resolution.outcome IN ('terminal','instant_sweep')
     ORDER BY resolution.created_at DESC LIMIT 1;
    IF FOUND AND v_resolution.presentation_fallback_at<=clock_timestamp() THEN
      RETURN public.three_five_seven_advance_postgame(
        p_game_id,v_resolution.round_id,v_resolution.dealer_game_id,v_resolution.hand_number
      );
    END IF;
  END IF;
  RETURN jsonb_build_object('outcome','nothing_due');
END;
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
