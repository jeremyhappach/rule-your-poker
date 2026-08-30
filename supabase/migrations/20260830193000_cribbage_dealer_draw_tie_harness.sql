-- Exact-game, fake-money-only, one-shot Cribbage dealer-draw tie fixture.
--
-- The existing session-level fixture cannot serve this seam: it is consumed by
-- the waiting-table dealer draw before a Cribbage dealer game is configured.
-- Requests here are keyed to one generated fake-money session UUID, armed only
-- by an authenticated admin who is already a participant, expire quickly, and
-- are consumed atomically by Cribbage's existing dealer-selection authority.

INSERT INTO public.system_settings (key, value)
VALUES ('cribbage_dealer_draw_tie_harness', jsonb_build_object('requests', '{}'::jsonb))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_cribbage_dealer_draw_tie_harness(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request jsonb;
  v_expires_at timestamptz;
  v_armed boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT setting.value->'requests'->p_game_id::text
    INTO v_request
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_dealer_draw_tie_harness';

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('outcome', 'ok', 'armed', false, 'gameId', p_game_id);
  END IF;

  BEGIN
    v_expires_at := nullif(v_request->>'expiresAt', '')::timestamptz;
    v_armed := coalesce((v_request->>'armed')::boolean, false)
      AND nullif(v_request->>'armedBy', '')::uuid = v_user_id
      AND nullif(v_request->>'gameId', '')::uuid = p_game_id
      AND v_expires_at > clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN
    v_armed := false;
  END;

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'armed', v_armed,
    'gameId', p_game_id,
    'expiresAt', CASE WHEN v_armed THEN v_expires_at ELSE NULL END,
    'consumedAt', v_request->>'consumedAt',
    'cancelledAt', v_request->>'cancelledAt'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.arm_cribbage_dealer_draw_tie_harness(
  p_game_id uuid,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_game public.games%ROWTYPE;
  v_ttl_seconds integer := least(900, greatest(60, coalesce(p_ttl_seconds, 600)));
  v_expires_at timestamptz := clock_timestamp()
    + make_interval(secs => least(900, greatest(60, coalesce(p_ttl_seconds, 600))));
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT * INTO v_game FROM public.games game WHERE game.id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game', 'armed', false);
  END IF;
  IF coalesce(v_game.real_money, false) THEN
    RETURN jsonb_build_object('outcome', 'real_money_forbidden', 'armed', false);
  END IF;
  IF NOT public.user_is_in_game(p_game_id) THEN
    RETURN jsonb_build_object('outcome', 'not_in_game', 'armed', false);
  END IF;
  IF v_game.status NOT IN (
    'waiting', 'dealer_selection', 'game_selection', 'configuring',
    'ante_decision', 'cribbage_dealer_selection'
  ) OR (
    v_game.status = 'cribbage_dealer_selection'
    AND v_game.dealer_selection_state IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'wrong_status', 'armed', false, 'status', v_game.status
    );
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_dealer_draw_tie_harness'
   FOR UPDATE;
  v_value := coalesce(v_value, jsonb_build_object('requests', '{}'::jsonb));
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := jsonb_build_object(
    'armed', true,
    'profile', 'force_first_round_tie_once',
    'gameId', p_game_id,
    'armedBy', v_user_id,
    'armedAt', clock_timestamp(),
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds,
    'consumedAt', NULL,
    'cancelledAt', NULL
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);

  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_user_id
   WHERE key = 'cribbage_dealer_draw_tie_harness';

  RETURN jsonb_build_object(
    'outcome', 'armed',
    'armed', true,
    'gameId', p_game_id,
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_cribbage_dealer_draw_tie_harness(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_dealer_draw_tie_harness'
   FOR UPDATE;
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := v_requests->p_game_id::text;

  BEGIN
    IF v_request IS NULL
       OR nullif(v_request->>'armedBy', '')::uuid IS DISTINCT FROM v_user_id THEN
      RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
  END;

  v_request := v_request || jsonb_build_object(
    'armed', false,
    'cancelledAt', clock_timestamp()
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);
  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_user_id
   WHERE key = 'cribbage_dealer_draw_tie_harness';

  RETURN jsonb_build_object('outcome', 'cancelled', 'armed', false, 'gameId', p_game_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_cribbage_dealer_draw_tie_harness(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arm_cribbage_dealer_draw_tie_harness(uuid,integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_cribbage_dealer_draw_tie_harness(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cribbage_dealer_draw_tie_harness(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arm_cribbage_dealer_draw_tie_harness(uuid,integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_cribbage_dealer_draw_tie_harness(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_cribbage_dealer_draw_tie_harness(
  p_game_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_value jsonb;
  v_requests jsonb;
  v_request jsonb;
  v_armed_by uuid;
  v_request_game_id uuid;
  v_expires_at timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games game WHERE game.id = p_game_id;
  IF NOT FOUND OR coalesce(v_game.real_money, false) THEN
    RETURN false;
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'cribbage_dealer_draw_tie_harness'
   FOR UPDATE;
  v_requests := coalesce(v_value->'requests', '{}'::jsonb);
  v_request := v_requests->p_game_id::text;
  IF v_request IS NULL THEN RETURN false; END IF;

  BEGIN
    v_armed_by := nullif(v_request->>'armedBy', '')::uuid;
    v_request_game_id := nullif(v_request->>'gameId', '')::uuid;
    v_expires_at := nullif(v_request->>'expiresAt', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF NOT coalesce((v_request->>'armed')::boolean, false)
     OR v_request_game_id IS DISTINCT FROM p_game_id
     OR v_expires_at <= clock_timestamp()
     OR NOT public.has_role(v_armed_by, 'admin')
     OR NOT EXISTS (
       SELECT 1
         FROM public.players player
        WHERE player.game_id = p_game_id
          AND player.user_id = v_armed_by
          AND player.status NOT IN ('observer', 'left')
     ) THEN
    RETURN false;
  END IF;

  v_request := v_request || jsonb_build_object(
    'armed', false,
    'consumedAt', clock_timestamp()
  );
  v_requests := jsonb_set(v_requests, ARRAY[p_game_id::text], v_request, true);
  UPDATE public.system_settings
     SET value = jsonb_set(v_value, '{requests}', v_requests, true),
         updated_at = clock_timestamp(),
         updated_by = v_armed_by
   WHERE key = 'cribbage_dealer_draw_tie_harness';
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION private.consume_cribbage_dealer_draw_tie_harness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.consume_cribbage_dealer_draw_tie_harness(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.cribbage_forced_tie_deck(
  p_player_count integer
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  WITH all_cards AS (
    SELECT rank, suit,
      CASE rank
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE rank::integer
      END AS rank_value
    FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
    CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) suit
  ), first_round_fill AS (
    SELECT row_number() OVER (ORDER BY card.rank_value DESC, card.suit) + 2 AS sequence,
           card.rank,
           card.suit
      FROM all_cards card
     WHERE card.rank_value <= 11
     ORDER BY card.rank_value DESC, card.suit
     LIMIT greatest(p_player_count - 2, 0)
  ), forced_cards AS (
    SELECT 1::bigint AS sequence, 'A'::text AS rank, chr(9824)::text AS suit
    UNION ALL SELECT 2, 'A', chr(9829)
    UNION ALL SELECT fill.sequence, fill.rank, fill.suit FROM first_round_fill fill
    UNION ALL SELECT p_player_count + 1, 'K', chr(9824)
    UNION ALL SELECT p_player_count + 2, 'Q', chr(9824)
  ), remaining_cards AS (
    SELECT card.rank, card.suit,
           row_number() OVER (ORDER BY card.rank_value DESC, card.suit) AS sequence
      FROM all_cards card
     WHERE NOT EXISTS (
       SELECT 1 FROM forced_cards forced
        WHERE forced.rank = card.rank AND forced.suit = card.suit
     )
  ), ordered_cards AS (
    SELECT 0 AS section, forced.sequence, forced.rank, forced.suit
      FROM forced_cards forced
    UNION ALL
    SELECT 1, remaining.sequence, remaining.rank, remaining.suit
      FROM remaining_cards remaining
  )
  SELECT jsonb_agg(
    jsonb_build_object('rank', deck.rank, 'suit', deck.suit)
    ORDER BY deck.section, deck.sequence
  )
  FROM ordered_cards deck;
$function$;

REVOKE ALL ON FUNCTION private.cribbage_forced_tie_deck(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cribbage_forced_tie_deck(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cribbage_prepare_dealer_selection(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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
      SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, random() AS shuffle_key
        FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
        CROSS JOIN unnest(ARRAY[chr(9824),chr(9829),chr(9830),chr(9827)]) AS suits(suit)
    ) SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;
  END IF;

  LOOP
    IF v_offset + cardinality(v_tied_ids) > jsonb_array_length(v_deck) THEN
      WITH deck AS (
        SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card, random() AS shuffle_key
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

REVOKE ALL ON FUNCTION public.cribbage_prepare_dealer_selection(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_prepare_dealer_selection(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.arm_cribbage_dealer_draw_tie_harness(uuid,integer) IS
  'Admin-only exact-game fake-money fixture; expires and is consumed by one Cribbage dealer draw.';
