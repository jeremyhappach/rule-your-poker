CREATE OR REPLACE FUNCTION public.advance_357_round(_game_id uuid, _dealer_game_id uuid, _next_round_number integer, _next_hand_number integer, _decision_deadline timestamp with time zone, _ante_amount integer DEFAULT 0, _forced_hand_by_player jsonb DEFAULT NULL::jsonb)
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
  SELECT COALESCE(jsonb_agg(c ORDER BY random()), '[]'::jsonb)
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