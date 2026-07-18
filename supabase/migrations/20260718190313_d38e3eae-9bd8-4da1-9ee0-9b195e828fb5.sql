
-- 1. Enum
CREATE TYPE public.holm_event_kind AS ENUM (
  'ante',
  'pussy_tax_carryforward',
  'chucky_loss_pot_match',
  'chucky_tiebreak_pot_match',
  'showdown_final_award',
  'partial_tie_final_award',
  'chucky_final_award'
);

-- 2. Column
ALTER TABLE public.game_results ADD COLUMN event_kind public.holm_event_kind NULL;

-- 3. Partial unique index — sole terminal race guard
CREATE UNIQUE INDEX game_results_holm_terminal_uniq
  ON public.game_results (dealer_game_id, hand_number)
  WHERE game_type IN ('holm','holm-game')
    AND event_kind IN (
      'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
      'showdown_final_award','partial_tie_final_award','chucky_final_award'
    );

-- 4. RPC
CREATE OR REPLACE FUNCTION public.holm_settle_hand(
  p_game_id                  uuid,
  p_dealer_game_id           uuid,
  p_hand_number              integer,
  p_event_kind               public.holm_event_kind,
  p_pot_final                integer,
  p_awaiting_next_round      boolean,
  p_last_round_result        jsonb,
  p_chip_deltas              jsonb,
  p_winning_hand_description text,
  p_winner_player_id         uuid,
  p_winner_username          text,
  p_is_chopped               boolean,
  p_pot_won                  integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_round     public.rounds%ROWTYPE;
  v_game      public.games%ROWTYPE;
  v_existing  uuid;
  v_result_id uuid;
  v_player_id uuid;
  v_delta     integer;
  v_end_game  boolean;
  v_bad_key   boolean;
BEGIN
  -- (a) Lock canonical round; (dealer_game_id, hand_number) is invariant-unique for Holm.
  SELECT * INTO STRICT v_round
    FROM public.rounds
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
   FOR UPDATE;

  -- (b) Ownership + game type
  IF v_round.game_id <> p_game_id THEN
    RAISE EXCEPTION 'holm_settle_hand:game_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game.game_type NOT IN ('holm','holm-game') THEN
    RAISE EXCEPTION 'holm_settle_hand:not_holm';
  END IF;

  -- (c) Terminal guard
  IF p_event_kind = 'ante' THEN
    RAISE EXCEPTION 'holm_settle_hand:non_terminal_event_kind';
  END IF;

  -- (d) Payload validation (loud even against already-settled hand)
  IF v_round.status NOT IN ('completed','in_progress','showdown','revealing') THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_eligible:%', v_round.status;
  END IF;

  IF p_chip_deltas IS NULL
     OR jsonb_typeof(p_chip_deltas) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_chip_deltas)) = 0 THEN
    RAISE EXCEPTION 'holm_settle_hand:empty_delta_map';
  END IF;

  -- Integer coercion — malformed values raise invalid_text_representation loudly.
  PERFORM (p_chip_deltas->>k)::int
    FROM jsonb_object_keys(p_chip_deltas) k;

  -- Every key must be a player seated in this game.
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_object_keys(p_chip_deltas) k
     WHERE NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = k::uuid AND game_id = p_game_id
     )
  ) INTO v_bad_key;
  IF v_bad_key THEN
    RAISE EXCEPTION 'holm_settle_hand:unrelated_player_in_delta_map';
  END IF;

  -- (e) Idempotency — only after payload proven well-formed.
  SELECT id INTO v_existing FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
     AND game_type IN ('holm','holm-game')
     AND event_kind IN (
       'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
       'showdown_final_award','partial_tie_final_award','chucky_final_award'
     )
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_settled','result_id',v_existing,'hand_number',p_hand_number);
  END IF;

  -- (f) Insert terminal result FIRST — point-of-no-return marker.
  INSERT INTO public.game_results (
    game_id, game_type, dealer_game_id, hand_number,
    event_kind, winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, v_game.game_type, p_dealer_game_id, p_hand_number,
    p_event_kind, p_winner_player_id, p_winner_username, p_winning_hand_description,
    p_pot_won, p_chip_deltas, p_is_chopped
  ) RETURNING id INTO v_result_id;

  -- (g) Apply chip deltas.
  FOR v_player_id, v_delta IN
    SELECT k::uuid, (p_chip_deltas->>k)::int
      FROM jsonb_object_keys(p_chip_deltas) k
  LOOP
    UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
  END LOOP;

  -- (h) Server-owned lifecycle — source-audited: only chucky_final_award ends the dealer game.
  v_end_game := (p_event_kind = 'chucky_final_award');

  UPDATE public.games SET
    last_round_result   = p_last_round_result,
    awaiting_next_round = p_awaiting_next_round,
    pot                 = p_pot_final,
    status              = CASE WHEN v_end_game THEN 'game_over' ELSE status END
  WHERE id = p_game_id;

  -- (i) Round terminal state.
  UPDATE public.rounds SET
    status                = 'completed',
    decision_deadline     = NULL,
    current_turn_position = NULL
  WHERE id = v_round.id;

  RETURN jsonb_build_object(
    'status','settled',
    'result_id',v_result_id,
    'hand_number',p_hand_number,
    'dealer_game_ended',v_end_game
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing FROM public.game_results
     WHERE dealer_game_id = p_dealer_game_id AND hand_number = p_hand_number
       AND game_type IN ('holm','holm-game')
       AND event_kind IN (
         'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
         'showdown_final_award','partial_tie_final_award','chucky_final_award'
       )
     LIMIT 1;
    RETURN jsonb_build_object('status','already_settled','result_id',v_existing,'hand_number',p_hand_number);
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_found:%/%', p_dealer_game_id, p_hand_number;
  WHEN TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'holm_settle_hand:round_identity_violation:%/%', p_dealer_game_id, p_hand_number;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.holm_settle_hand(
  uuid, uuid, integer, public.holm_event_kind, integer, boolean, jsonb, jsonb, text, uuid, text, boolean, integer
) TO authenticated, service_role;
