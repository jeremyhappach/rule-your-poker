-- The final discard transition is authoritative: the row update that commits
-- the final crib card also produces the one legal cut and pegging admission.

CREATE OR REPLACE FUNCTION public.cribbage_finish_discard_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE c.card->>'rank' = 'J' ORDER BY random() LIMIT 1;
  END IF;
  IF cut_card IS NULL THEN
    SELECT c.card INTO cut_card FROM jsonb_array_elements(available_cards) AS c(card) ORDER BY random() LIMIT 1;
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
$$;

DROP TRIGGER IF EXISTS cribbage_finish_discard_transition ON public.rounds;
CREATE TRIGGER cribbage_finish_discard_transition
AFTER UPDATE OF cribbage_state ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.cribbage_finish_discard_transition();

CREATE OR REPLACE FUNCTION public.cribbage_reconcile_discard_transition(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
  v_state jsonb;
BEGIN
  SELECT game_id INTO v_game_id FROM public.rounds WHERE id = _round_id FOR UPDATE;
  IF v_game_id IS NULL THEN RAISE EXCEPTION 'Round not found'; END IF;
  IF NOT public.user_is_in_game(v_game_id) THEN RAISE EXCEPTION 'Not in game'; END IF;
  UPDATE public.rounds SET cribbage_state = cribbage_state WHERE id = _round_id;
  SELECT cribbage_state INTO v_state FROM public.rounds WHERE id = _round_id;
  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_reconcile_discard_transition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_reconcile_discard_transition(uuid) TO authenticated, service_role;
