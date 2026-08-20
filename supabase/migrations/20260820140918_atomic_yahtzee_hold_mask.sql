-- Persist the active player's complete Yahtzee hold intent atomically.
--
-- A single-die toggle RPC forced the browser to serialize every tap over the
-- network. On a slow cross-country connection, later taps looked enabled but
-- were discarded behind the first in-flight request. This RPC accepts the
-- complete desired mask under the existing action-sequence CAS boundary.

CREATE OR REPLACE FUNCTION public.yahtzee_set_holds(
  _round_id uuid,
  _player_id uuid,
  _hold_mask boolean[],
  _expected_action_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_player_state jsonb;
  v_dice jsonb;
  v_current_mask boolean[];
  v_sequence integer;
  v_rolls_remaining integer;
BEGIN
  IF v_actor_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'yahtzee_set_holds:authentication_required';
  END IF;

  -- Match yahtzee_apply_action's lock order so hold/roll/score callers cannot
  -- deadlock each other: round first, then its owning game.
  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = _round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yahtzee_set_holds:round_not_found';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = v_round.game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_set_holds:not_yahtzee_game';
  END IF;

  IF NOT v_service
     AND NOT public.user_is_in_game(v_game.id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_set_holds:not_in_session';
  END IF;

  IF coalesce(v_game.is_paused, false)
     OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'round_not_current');
  END IF;

  v_state := v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected', 'reason', 'game_not_playing', 'state', v_state
    );
  END IF;

  BEGIN
    v_sequence := coalesce((v_state->>'actionSequence')::integer, 0);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'yahtzee_set_holds:invalid_action_sequence';
  END;

  IF _expected_action_sequence IS NOT NULL
     AND _expected_action_sequence <> v_sequence THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_action',
      'deduped', true,
      'action_sequence', v_sequence,
      'state', v_state
    );
  END IF;

  IF nullif(v_state->>'currentTurnPlayerId', '')::uuid IS DISTINCT FROM _player_id THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected', 'reason', 'not_current_turn', 'state', v_state
    );
  END IF;

  SELECT * INTO v_player
    FROM public.players
   WHERE id = _player_id
     AND game_id = v_game.id
     AND status NOT IN ('observer', 'left');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yahtzee_set_holds:player_not_found';
  END IF;

  IF NOT v_service
     AND v_player.user_id IS DISTINCT FROM v_actor_id
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_set_holds:not_player_owner';
  END IF;

  IF _hold_mask IS NULL
     OR cardinality(_hold_mask) <> 5
     OR array_position(_hold_mask, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'yahtzee_set_holds:invalid_hold_mask';
  END IF;

  v_player_state := v_state->'playerStates'->_player_id::text;
  v_dice := v_player_state->'dice';
  IF jsonb_typeof(v_player_state) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_dice) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_dice) <> 5 THEN
    RAISE EXCEPTION 'yahtzee_set_holds:invalid_player_state';
  END IF;

  v_rolls_remaining := coalesce((v_player_state->>'rollsRemaining')::integer, 3);
  IF v_rolls_remaining = 3 OR v_rolls_remaining = 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected', 'reason', 'hold_not_allowed', 'state', v_state
    );
  END IF;

  SELECT array_agg(
           coalesce((die.value->>'isHeld')::boolean, false)
           ORDER BY die.ordinality
         )
    INTO v_current_mask
    FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value, ordinality);

  -- Replaying an already-committed desired mask is a read-only success. This
  -- keeps refresh/retry behavior idempotent without consuming a sequence.
  IF v_current_mask = _hold_mask THEN
    RETURN jsonb_build_object(
      'outcome', 'applied',
      'action', 'set_holds',
      'deduped', true,
      'action_sequence', v_sequence,
      'state', v_state
    );
  END IF;

  SELECT jsonb_agg(
           jsonb_set(
             die.value,
             '{isHeld}',
             to_jsonb(_hold_mask[die.ordinality]),
             true
           )
           ORDER BY die.ordinality
         )
    INTO v_dice
    FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value, ordinality);

  v_sequence := v_sequence + 1;
  v_player_state := jsonb_set(v_player_state, '{dice}', v_dice, true);
  v_state := jsonb_set(
    v_state,
    ARRAY['playerStates', _player_id::text],
    v_player_state,
    true
  );
  v_state := jsonb_set(v_state, '{actionSequence}', to_jsonb(v_sequence), true);

  PERFORM set_config('app.yahtzee_authoritative_write', 'on', true);
  UPDATE public.rounds
     SET yahtzee_state = v_state
   WHERE id = _round_id;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'action', 'set_holds',
    'action_sequence', v_sequence,
    'state', v_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.yahtzee_set_holds(uuid, uuid, boolean[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_set_holds(uuid, uuid, boolean[], integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.yahtzee_set_holds(uuid, uuid, boolean[], integer) IS
  'Atomically commits the active Yahtzee player complete five-die hold mask under action-sequence CAS.';
