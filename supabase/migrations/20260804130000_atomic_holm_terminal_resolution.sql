-- Holm terminal resolution must not depend on a browser surviving the last
-- Stay/Fold action. The decision command below owns the final-decision claim
-- and resolves the solo-vs-Chucky terminal path in the same transaction.

CREATE OR REPLACE FUNCTION public.holm_five_card_value(p_cards jsonb)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ranks integer[];
  v_suits text[];
  v_distinct integer[];
  v_four integer[];
  v_three integer[];
  v_pairs integer[];
  v_kickers integer[];
  v_is_flush boolean;
  v_straight_high integer := 0;
BEGIN
  SELECT
    array_agg(
      CASE upper(coalesce(card->>'rank', card->>'Rank'))
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        WHEN 'T' THEN 10 WHEN '10' THEN 10 WHEN '9' THEN 9 WHEN '8' THEN 8
        WHEN '7' THEN 7 WHEN '6' THEN 6 WHEN '5' THEN 5 WHEN '4' THEN 4
        WHEN '3' THEN 3 WHEN '2' THEN 2
        ELSE NULL
      END
      ORDER BY CASE upper(coalesce(card->>'rank', card->>'Rank'))
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        WHEN 'T' THEN 10 WHEN '10' THEN 10 WHEN '9' THEN 9 WHEN '8' THEN 8
        WHEN '7' THEN 7 WHEN '6' THEN 6 WHEN '5' THEN 5 WHEN '4' THEN 4
        WHEN '3' THEN 3 WHEN '2' THEN 2
        ELSE NULL
      END DESC
    ),
    array_agg(lower(coalesce(card->>'suit', card->>'Suit')))
  INTO v_ranks, v_suits
  FROM jsonb_array_elements(p_cards) AS card;

  IF cardinality(v_ranks) <> 5 OR array_position(v_ranks, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'holm_five_card_value:invalid_cards';
  END IF;

  SELECT array_agg(rank ORDER BY rank DESC)
  INTO v_distinct
  FROM (SELECT DISTINCT unnest(v_ranks) AS rank) ranks;

  SELECT
    array_agg(rank ORDER BY rank DESC) FILTER (WHERE copies = 4),
    array_agg(rank ORDER BY rank DESC) FILTER (WHERE copies = 3),
    array_agg(rank ORDER BY rank DESC) FILTER (WHERE copies = 2)
  INTO v_four, v_three, v_pairs
  FROM (
    SELECT rank, count(*)::integer AS copies
    FROM unnest(v_ranks) AS rank
    GROUP BY rank
  ) grouped;

  SELECT count(DISTINCT suit) = 1 INTO v_is_flush FROM unnest(v_suits) AS suit;

  IF cardinality(v_distinct) = 5 THEN
    IF v_distinct[1] - v_distinct[5] = 4 THEN
      v_straight_high := v_distinct[1];
    ELSIF v_distinct = ARRAY[14, 5, 4, 3, 2] THEN
      v_straight_high := 5;
    END IF;
  END IF;

  IF v_is_flush AND v_straight_high > 0 THEN
    RETURN ARRAY[8, v_straight_high];
  ELSIF cardinality(v_four) = 1 THEN
    SELECT array_agg(rank ORDER BY rank DESC) INTO v_kickers
    FROM unnest(v_ranks) AS rank WHERE rank <> v_four[1];
    RETURN ARRAY[7, v_four[1]] || v_kickers;
  ELSIF cardinality(v_three) = 1 AND cardinality(v_pairs) = 1 THEN
    RETURN ARRAY[6, v_three[1], v_pairs[1]];
  ELSIF v_is_flush THEN
    RETURN ARRAY[5] || v_ranks;
  ELSIF v_straight_high > 0 THEN
    RETURN ARRAY[4, v_straight_high];
  ELSIF cardinality(v_three) = 1 THEN
    SELECT array_agg(rank ORDER BY rank DESC) INTO v_kickers
    FROM unnest(v_ranks) AS rank WHERE rank <> v_three[1];
    RETURN ARRAY[3, v_three[1]] || v_kickers;
  ELSIF cardinality(v_pairs) = 2 THEN
    SELECT array_agg(rank ORDER BY rank DESC) INTO v_kickers
    FROM unnest(v_ranks) AS rank WHERE rank <> ALL(v_pairs);
    RETURN ARRAY[2] || v_pairs || v_kickers;
  ELSIF cardinality(v_pairs) = 1 THEN
    SELECT array_agg(rank ORDER BY rank DESC) INTO v_kickers
    FROM unnest(v_ranks) AS rank WHERE rank <> v_pairs[1];
    RETURN ARRAY[1, v_pairs[1]] || v_kickers;
  END IF;

  RETURN ARRAY[0] || v_ranks;
END;
$$;

CREATE OR REPLACE FUNCTION public.holm_best_hand_value(p_cards jsonb)
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.holm_five_card_value(jsonb_build_array(a.card, b.card, c.card, d.card, e.card))
  FROM jsonb_array_elements(p_cards) WITH ORDINALITY AS a(card, ordinal)
  JOIN jsonb_array_elements(p_cards) WITH ORDINALITY AS b(card, ordinal) ON a.ordinal < b.ordinal
  JOIN jsonb_array_elements(p_cards) WITH ORDINALITY AS c(card, ordinal) ON b.ordinal < c.ordinal
  JOIN jsonb_array_elements(p_cards) WITH ORDINALITY AS d(card, ordinal) ON c.ordinal < d.ordinal
  JOIN jsonb_array_elements(p_cards) WITH ORDINALITY AS e(card, ordinal) ON d.ordinal < e.ordinal
  ORDER BY public.holm_five_card_value(jsonb_build_array(a.card, b.card, c.card, d.card, e.card)) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.holm_hand_label(p_value integer[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_value[1]
    WHEN 8 THEN 'Straight Flush'
    WHEN 7 THEN 'Four of a Kind'
    WHEN 6 THEN 'Full House'
    WHEN 5 THEN 'Flush'
    WHEN 4 THEN 'Straight'
    WHEN 3 THEN 'Three of a Kind'
    WHEN 2 THEN 'Two Pair'
    WHEN 1 THEN 'One Pair'
    ELSE 'High Card'
  END;
$$;

CREATE OR REPLACE FUNCTION public.holm_deterministic_chucky_cards(
  p_round_id uuid,
  p_used_cards jsonb,
  p_card_count integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH deck AS (
    SELECT suit, rank
    FROM unnest(ARRAY['♣', '♦', '♥', '♠']) AS suits(suit)
    CROSS JOIN unnest(ARRAY['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) AS ranks(rank)
  ), available AS (
    SELECT
      jsonb_build_object('suit', suit, 'rank', rank) AS card,
      md5(p_round_id::text || ':holm-chucky:' || suit || ':' || rank) AS shuffle_key
    FROM deck
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_used_cards, '[]'::jsonb)) AS used(card)
      WHERE lower(coalesce(used.card->>'suit', used.card->>'Suit')) = deck.suit
        AND upper(coalesce(used.card->>'rank', used.card->>'Rank')) = upper(deck.rank)
    )
    ORDER BY shuffle_key
    LIMIT p_card_count
  )
  SELECT coalesce(jsonb_agg(card ORDER BY shuffle_key), '[]'::jsonb)
  FROM available;
$$;

CREATE OR REPLACE FUNCTION public.holm_submit_decision(
  p_game_id uuid,
  p_player_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_stayer public.players%ROWTYPE;
  v_active_count integer;
  v_stayer_count integer;
  v_all_decided boolean;
  v_tax integer;
  v_round_pot integer;
  v_pot_final integer;
  v_pot_match integer;
  v_deltas jsonb;
  v_player_cards jsonb;
  v_community_cards jsonb;
  v_chucky_cards jsonb;
  v_player_value integer[];
  v_chucky_value integer[];
  v_forced_harness text;
  v_player_wins boolean;
  v_username text;
  v_settlement jsonb;
BEGIN
  IF p_decision NOT IN ('stay', 'fold') THEN
    RAISE EXCEPTION 'holm_submit_decision:invalid_decision';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'holm_submit_decision:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_submit_decision:not_holm_game';
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('already_terminal', true, 'status', v_game.status);
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_round.status <> 'betting' THEN
    RETURN jsonb_build_object('round_not_betting', true, 'round_status', v_round.status);
  END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND OR v_player.game_id <> p_game_id THEN
    RAISE EXCEPTION 'holm_submit_decision:player_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players participant
    WHERE participant.game_id = p_game_id
      AND participant.user_id = auth.uid()
      AND participant.status = 'active'
  ) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_participant';
  END IF;

  IF v_player.user_id IS DISTINCT FROM auth.uid() AND NOT coalesce(v_player.is_bot, false) THEN
    RAISE EXCEPTION 'holm_submit_decision:not_player_owner';
  END IF;

  IF v_player.decision_locked THEN
    RETURN jsonb_build_object(
      'already_locked', true,
      'all_decisions_in', v_game.all_decisions_in,
      'status', v_game.status
    );
  END IF;

  UPDATE public.players
  SET current_decision = p_decision,
      decision_locked = true
  WHERE id = p_player_id
    AND decision_locked = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('already_locked', true);
  END IF;

  PERFORM 1
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
  FOR UPDATE;

  SELECT count(*), bool_and(decision_locked AND current_decision IN ('stay', 'fold'))
  INTO v_active_count, v_all_decided
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false;

  IF v_active_count = 0 OR NOT coalesce(v_all_decided, false) THEN
    RETURN jsonb_build_object('decision_locked', true, 'all_decisions_in', false);
  END IF;

  UPDATE public.games
  SET all_decisions_in = true,
      all_decisions_in_round_id = v_round.id
  WHERE id = p_game_id;

  UPDATE public.rounds
  SET current_turn_position = null,
      decision_deadline = null
  WHERE id = v_round.id;

  SELECT count(*) INTO v_stayer_count
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
    AND current_decision = 'stay';

  IF v_stayer_count > 1 THEN
    RETURN jsonb_build_object(
      'decision_locked', true,
      'all_decisions_in', true,
      'server_resolved', false,
      'resolution_owner', 'existing_showdown'
    );
  END IF;

  IF v_stayer_count = 0 THEN
    v_tax := CASE WHEN coalesce(v_game.pussy_tax_enabled, true)
      THEN coalesce(v_game.pussy_tax_value, 1)
      ELSE 0
    END;
    v_pot_final := coalesce(v_game.pot, 0) + (v_tax * v_active_count);

    SELECT coalesce(jsonb_object_agg(id::text, to_jsonb(-v_tax)), '{}'::jsonb)
    INTO v_deltas
    FROM public.players
    WHERE game_id = p_game_id
      AND status = 'active'
      AND sitting_out = false;

    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'pussy_tax_carryforward'::public.holm_event_kind, v_pot_final, true,
      CASE WHEN v_tax > 0 THEN 'Pussy Tax!' ELSE 'Everyone folded! No penalty.' END,
      v_deltas, 'Everyone folded', NULL, 'Pussy Tax', false, 0, true,
      v_pot_final, false, false
    ) INTO v_settlement;

    RETURN jsonb_build_object(
      'decision_locked', true,
      'all_decisions_in', true,
      'server_resolved', true,
      'event_kind', 'pussy_tax_carryforward',
      'terminal_disposition', v_settlement->>'terminal_disposition'
    );
  END IF;

  SELECT * INTO v_stayer
  FROM public.players
  WHERE game_id = p_game_id
    AND status = 'active'
    AND sitting_out = false
    AND current_decision = 'stay';

  SELECT cards INTO v_player_cards
  FROM public.player_cards
  WHERE round_id = v_round.id
    AND player_id = v_stayer.id
  ORDER BY id
  LIMIT 1;

  v_community_cards := coalesce(v_round.community_cards, '[]'::jsonb);
  IF jsonb_array_length(coalesce(v_player_cards, '[]'::jsonb)) <> 4
    OR jsonb_array_length(v_community_cards) <> 4 THEN
    RAISE EXCEPTION 'holm_submit_decision:incomplete_showdown_cards';
  END IF;

  v_chucky_cards := coalesce(nullif(v_round.chucky_cards, '[]'::jsonb),
    public.holm_deterministic_chucky_cards(
      v_round.id,
      v_player_cards || v_community_cards,
      coalesce(v_game.chucky_cards, 4)
    )
  );

  IF jsonb_array_length(v_chucky_cards) <> coalesce(v_game.chucky_cards, 4) THEN
    RAISE EXCEPTION 'holm_submit_decision:unable_to_deal_chucky';
  END IF;

  SELECT debug_harness INTO v_forced_harness
  FROM public.game_defaults
  WHERE game_type = 'holm'
  LIMIT 1;

  v_player_value := public.holm_best_hand_value(v_player_cards || v_community_cards);
  v_chucky_value := public.holm_best_hand_value(v_chucky_cards || v_community_cards);
  v_player_wins := CASE v_forced_harness
    WHEN 'force_player_beats_chucky' THEN true
    WHEN 'force_chucky_beats_player' THEN false
    ELSE v_player_value > v_chucky_value
  END;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_stayer.user_id;
  v_username := coalesce(v_username, v_stayer.user_id::text, 'Player');
  v_round_pot := coalesce(v_round.pot, v_game.pot, 0);

  UPDATE public.rounds
  SET community_cards_revealed = greatest(coalesce(community_cards_revealed, 0), 4),
      chucky_cards = v_chucky_cards,
      chucky_cards_revealed = jsonb_array_length(v_chucky_cards),
      chucky_active = true
  WHERE id = v_round.id;

  IF v_player_wins THEN
    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      'chucky_final_award'::public.holm_event_kind, 0, false,
      format('%s beat Chucky with %s!|||POT:%s', v_username, public.holm_hand_label(v_player_value), v_round_pot),
      jsonb_build_object(v_stayer.id::text, v_round_pot), public.holm_hand_label(v_player_value),
      v_stayer.id, v_username, false, v_round_pot, true, v_round_pot, false, true
    ) INTO v_settlement;
  ELSE
    v_pot_match := CASE WHEN coalesce(v_game.pot_max_enabled, true)
      THEN least(v_round_pot, coalesce(v_game.pot_max_value, v_round_pot))
      ELSE v_round_pot
    END;

    SELECT public.holm_settle_hand(
      p_game_id, v_round.dealer_game_id, v_round.hand_number,
      CASE WHEN v_player_value = v_chucky_value
        THEN 'chucky_tiebreak_pot_match'::public.holm_event_kind
        ELSE 'chucky_loss_pot_match'::public.holm_event_kind
      END,
      v_round_pot + v_pot_match, true,
      format('Chucky beat %s with %s. -$%s', v_username, public.holm_hand_label(v_chucky_value), v_pot_match),
      jsonb_build_object(v_stayer.id::text, -v_pot_match),
      CASE WHEN v_player_value = v_chucky_value THEN 'Tie - player matches pot' ELSE 'Chucky beat player' END,
      NULL, 'Chucky Win', false, 0, true, v_round_pot + v_pot_match, true, false
    ) INTO v_settlement;
  END IF;

  RETURN jsonb_build_object(
    'decision_locked', true,
    'all_decisions_in', true,
    'server_resolved', true,
    'event_kind', CASE WHEN v_player_wins THEN 'chucky_final_award' ELSE 'chucky_loss_pot_match' END,
    'terminal_disposition', v_settlement->>'terminal_disposition',
    'round_id', v_round.id,
    'dealer_game_id', v_round.dealer_game_id,
    'hand_number', v_round.hand_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.holm_submit_decision(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.holm_submit_decision(uuid, uuid, text) TO authenticated;
