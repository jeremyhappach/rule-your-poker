-- One-shot, admin-armed session dealer-draw tie fixture.
--
-- This is deliberately separate from the persistent per-game harness profiles:
-- enabling the global harness gate would also activate any saved game profiles.
-- The request is instead scoped to the arming admin's user id, expires after a
-- short TTL, and is consumed atomically by the next dealer draw that user hosts.

INSERT INTO public.system_settings (key, value)
VALUES (
  'session_dealer_draw_tie_harness',
  jsonb_build_object('armed', false)
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_session_dealer_draw_tie_harness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_value jsonb;
  v_expires_at timestamptz;
  v_armed_for_user boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness';

  BEGIN
    v_expires_at := nullif(v_value->>'expiresAt', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    v_expires_at := NULL;
  END;

  v_armed_for_user := coalesce((v_value->>'armed')::boolean, false)
    AND nullif(v_value->>'armedBy', '')::uuid = v_user_id
    AND v_expires_at > clock_timestamp();

  RETURN jsonb_build_object(
    'outcome', 'ok',
    'armed', v_armed_for_user,
    'expiresAt', CASE WHEN v_armed_for_user THEN v_expires_at ELSE NULL END,
    'consumedAt', v_value->>'consumedAt',
    'consumedGameId', v_value->>'consumedGameId'
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('outcome', 'ok', 'armed', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.arm_session_dealer_draw_tie_harness(
  p_ttl_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ttl_seconds integer := least(900, greatest(60, coalesce(p_ttl_seconds, 600)));
  v_expires_at timestamptz := clock_timestamp()
    + make_interval(secs => least(900, greatest(60, coalesce(p_ttl_seconds, 600))));
  v_value jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  v_value := jsonb_build_object(
    'armed', true,
    'profile', 'force_first_round_tie_once',
    'armedBy', v_user_id,
    'armedAt', clock_timestamp(),
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds,
    'consumedAt', NULL,
    'consumedGameId', NULL
  );

  INSERT INTO public.system_settings (key, value, updated_at, updated_by)
  VALUES (
    'session_dealer_draw_tie_harness',
    v_value,
    clock_timestamp(),
    v_user_id
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object(
    'outcome', 'armed',
    'armed', true,
    'expiresAt', v_expires_at,
    'ttlSeconds', v_ttl_seconds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_session_dealer_draw_tie_harness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_value jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT public.has_role(v_user_id, 'admin') THEN
    RETURN jsonb_build_object('outcome', 'not_authorized', 'armed', false);
  END IF;

  SELECT setting.value
    INTO v_value
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness'
   FOR UPDATE;

  IF nullif(v_value->>'armedBy', '')::uuid IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
  END IF;

  UPDATE public.system_settings
     SET value = coalesce(v_value, '{}'::jsonb) || jsonb_build_object(
           'armed', false,
           'cancelledAt', clock_timestamp()
         ),
         updated_at = clock_timestamp(),
         updated_by = v_user_id
   WHERE key = 'session_dealer_draw_tie_harness';

  RETURN jsonb_build_object('outcome', 'cancelled', 'armed', false);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('outcome', 'not_armed_by_user', 'armed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_session_dealer_draw_tie_harness()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arm_session_dealer_draw_tie_harness(integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_session_dealer_draw_tie_harness()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_dealer_draw_tie_harness()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arm_session_dealer_draw_tie_harness(integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_session_dealer_draw_tie_harness()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.prepare_session_dealer_selection(
  p_game_id uuid,
  p_timer_generation bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
      SELECT card.rank, card.suit, random() AS random_order
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
             ORDER BY random()
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

REVOKE ALL ON FUNCTION private.prepare_session_dealer_selection(uuid,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prepare_session_dealer_selection(uuid,bigint)
  TO service_role;
