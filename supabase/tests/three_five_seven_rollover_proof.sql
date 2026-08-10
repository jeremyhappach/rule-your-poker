-- Rollback-only proof for the 3-5-7 opening-ante / subsequent-rollover split.
-- Run before the migration (the schema/RPC preparation below rolls back), then
-- run again after deployment. No synthetic data or schema change survives.

BEGIN;

ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS rollover_amount integer NOT NULL DEFAULT 1;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS rollover_amount integer NOT NULL DEFAULT 1;

DO $proof_prepare$
BEGIN
  IF to_regprocedure(
    'public.advance_357_round(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.advance_357_round_legacy(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb)'
  ) IS NULL THEN
    EXECUTE
      'ALTER FUNCTION public.advance_357_round(uuid,uuid,integer,integer,timestamp with time zone,integer,jsonb) '
      || 'RENAME TO advance_357_round_legacy';
  END IF;
END;
$proof_prepare$;

CREATE OR REPLACE FUNCTION public.advance_357_round(
  _game_id uuid,
  _dealer_game_id uuid,
  _next_round_number integer,
  _next_hand_number integer,
  _decision_deadline timestamp with time zone,
  _forced_hand_by_player jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_rollover_amount integer;
  v_result jsonb;
  v_eligible_count integer;
  v_hand_number integer;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_357_round:game_not_found';
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357') THEN
    RAISE EXCEPTION 'advance_357_round:not_357:%', v_game.game_type;
  END IF;

  v_rollover_amount := COALESCE(v_game.rollover_amount, 1);
  IF v_rollover_amount < 1 THEN
    RAISE EXCEPTION 'advance_357_round:invalid_rollover_amount';
  END IF;

  SELECT public.advance_357_round_legacy(
    _game_id,
    _dealer_game_id,
    _next_round_number,
    _next_hand_number,
    _decision_deadline,
    CASE WHEN _next_round_number = 1 THEN v_rollover_amount ELSE 0 END,
    _forced_hand_by_player
  ) INTO v_result;

  IF _next_round_number = 1
     AND COALESCE(v_result->>'status', '') IN (
       'advanced',
       'repaired_and_advanced',
       'advanced_instant_win',
       'repaired_and_advanced_instant_win'
     ) THEN
    v_hand_number := COALESCE((v_result->>'hand_number')::integer, _next_hand_number);

    SELECT count(*) INTO v_eligible_count
      FROM public.players
     WHERE game_id = _game_id
       AND status NOT IN ('left', 'observer')
       AND sitting_out = false;

    UPDATE public.game_results
       SET winner_username = v_eligible_count::text || ' players rolled over $' || v_rollover_amount::text,
           winning_hand_description = 'Rollover'
     WHERE game_id = _game_id
       AND dealer_game_id = _dealer_game_id
       AND hand_number = v_hand_number
       AND winning_hand_description = 'Ante'
       AND game_type = '357';

    v_result := (v_result - 'ante_charged')
      || jsonb_build_object(
        'rollover_charged', v_eligible_count * v_rollover_amount,
        'rollover_amount', v_rollover_amount
      );
  END IF;

  RETURN v_result;
END;
$function$;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_continuation_game_id uuid := gen_random_uuid();
  v_continuation_dealer_game_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_forced_by_player jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 2
    ) available_users;

  IF COALESCE(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION '357_rollover_proof:requires_two_profiles';
  END IF;

  -- Game 1 begins with a $5 ante already represented in the pot. Its next R1
  -- must collect only the persisted $1 rollover from each eligible player.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    ante_amount, rollover_amount, leg_value, legs_to_win, total_hands,
    current_round, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - 357 rollover', 'in_progress', '3-5-7',
    v_dealer_game_id, v_users[1], 5, 1, 1, 3, 1, 3, 10, false
  );

  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type, config)
  VALUES (
    v_dealer_game_id, v_game_id, v_users[1], '3-5-7',
    jsonb_build_object('ante_amount', 5, 'rollover_amount', 1, 'leg_value', 1, 'legs_to_win', 3)
  );

  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 95, 'active', false, false),
    (v_game_id, v_users[2], 2, 95, 'active', false, false);

  -- Authorization guard: only an admin can inject forced cards.
  v_forced_by_player := jsonb_build_object(
    (SELECT id::text FROM public.players WHERE game_id = v_game_id AND position = 1),
    jsonb_build_array(
      jsonb_build_object('rank', '3', 'suit', '♠'),
      jsonb_build_object('rank', '5', 'suit', '♥'),
      jsonb_build_object('rank', '7', 'suit', '♦')
    )
  );

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.advance_357_round(
      v_game_id, v_dealer_game_id, 1, 2, now() + interval '30 seconds', v_forced_by_player
    );
    RAISE EXCEPTION '357_rollover_proof:forced_cards_authorization_bypassed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = '357_rollover_proof:forced_cards_authorization_bypassed'
       OR SQLERRM NOT LIKE '%advance_357_round:forced_hand_forbidden%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  SELECT public.advance_357_round(
    v_game_id, v_dealer_game_id, 1, 2, now() + interval '30 seconds', NULL
  ) INTO v_result;

  IF v_result->>'status' <> 'advanced'
     OR v_result ? 'ante_charged'
     OR (v_result->>'rollover_amount')::integer <> 1
     OR (v_result->>'rollover_charged')::integer <> 2 THEN
    RAISE EXCEPTION '357_rollover_proof:rollover_result_invalid:%', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.games
     WHERE id = v_game_id
       AND ante_amount = 5
       AND rollover_amount = 1
       AND total_hands = 2
       AND current_round = 1
       AND pot = 12
  ) THEN
    RAISE EXCEPTION '357_rollover_proof:opening_ante_or_rollover_amount_wrong';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.players
     WHERE game_id = v_game_id
       AND chips <> 94
  ) THEN
    RAISE EXCEPTION '357_rollover_proof:rollover_not_exactly_one_per_player';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.game_results
   WHERE game_id = v_game_id
     AND dealer_game_id = v_dealer_game_id
     AND hand_number = 2
     AND winning_hand_description = 'Rollover'
     AND winner_username = '2 players rolled over $1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '357_rollover_proof:rollover_audit_invalid:%', v_count;
  END IF;

  SELECT public.advance_357_round(
    v_game_id, v_dealer_game_id, 1, 2, now() + interval '30 seconds', NULL
  ) INTO v_replay;
  IF v_replay->>'status' <> 'already_advanced'
     OR EXISTS (
       SELECT 1 FROM public.players WHERE game_id = v_game_id AND chips <> 94
     )
     OR (SELECT pot FROM public.games WHERE id = v_game_id) <> 12
     OR (SELECT count(*) FROM public.game_results
          WHERE game_id = v_game_id AND winning_hand_description = 'Rollover') <> 1 THEN
    RAISE EXCEPTION '357_rollover_proof:duplicate_replay_changed_state:%', v_replay;
  END IF;

  -- A normal R1 -> R2 continuation carries cards but collects no rollover.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    ante_amount, rollover_amount, leg_value, legs_to_win, total_hands,
    current_round, pot, real_money
  ) VALUES (
    v_continuation_game_id, 'Codex rollback proof - 357 continuation', 'in_progress', '3-5-7',
    v_continuation_dealer_game_id, v_users[1], 5, 1, 1, 3, 1, 1, 10, false
  );

  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_continuation_dealer_game_id, v_continuation_game_id, v_users[1], '3-5-7');

  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot)
  VALUES
    (v_continuation_game_id, v_users[1], 1, 95, 'active', false, false),
    (v_continuation_game_id, v_users[2], 2, 95, 'active', false, false);

  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot
  ) VALUES (
    v_continuation_game_id, v_continuation_dealer_game_id, 1, 1, 3, 'completed', 10
  );

  INSERT INTO public.player_cards (player_id, round_id, cards)
  SELECT p.id, r.id,
    CASE p.position
      WHEN 1 THEN jsonb_build_array(
        jsonb_build_object('rank', '2', 'suit', '♠'),
        jsonb_build_object('rank', '4', 'suit', '♥'),
        jsonb_build_object('rank', '6', 'suit', '♦')
      )
      ELSE jsonb_build_array(
        jsonb_build_object('rank', '3', 'suit', '♣'),
        jsonb_build_object('rank', '8', 'suit', '♠'),
        jsonb_build_object('rank', 'K', 'suit', '♥')
      )
    END
    FROM public.players p
    CROSS JOIN public.rounds r
   WHERE p.game_id = v_continuation_game_id
     AND r.game_id = v_continuation_game_id;

  SELECT public.advance_357_round(
    v_continuation_game_id, v_continuation_dealer_game_id, 2, 1, now() + interval '30 seconds', NULL
  ) INTO v_result;
  IF v_result->>'status' <> 'advanced'
     OR v_result ? 'rollover_charged'
     OR EXISTS (
       SELECT 1 FROM public.players WHERE game_id = v_continuation_game_id AND chips <> 95
     )
     OR (SELECT pot FROM public.games WHERE id = v_continuation_game_id) <> 10 THEN
    RAISE EXCEPTION '357_rollover_proof:continuation_collected_rollover:%', v_result;
  END IF;

  -- Terminal and late-replay calls are no-ops, including a tie-labelled prior hand.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    ante_amount, rollover_amount, leg_value, legs_to_win, total_hands,
    current_round, pot, last_round_result, real_money
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - 357 terminal', 'game_over', '3-5-7',
    v_terminal_dealer_game_id, v_users[1], 5, 1, 1, 3, 1, 3, 10, 'Tie: carry-forward', false
  );

  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_terminal_dealer_game_id, v_terminal_game_id, v_users[1], '3-5-7');

  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot)
  VALUES
    (v_terminal_game_id, v_users[1], 1, 95, 'active', false, false),
    (v_terminal_game_id, v_users[2], 2, 95, 'active', false, false);

  SELECT public.advance_357_round(
    v_terminal_game_id, v_terminal_dealer_game_id, 1, 2, now() + interval '30 seconds', NULL
  ) INTO v_result;
  IF v_result->>'status' <> 'game_over'
     OR EXISTS (
       SELECT 1 FROM public.players WHERE game_id = v_terminal_game_id AND chips <> 95
     )
     OR (SELECT pot FROM public.games WHERE id = v_terminal_game_id) <> 10 THEN
    RAISE EXCEPTION '357_rollover_proof:terminal_or_late_replay_changed_state:%', v_result;
  END IF;
END;
$proof$;

ROLLBACK;
