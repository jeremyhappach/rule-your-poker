-- Remove the remaining browser-authored participation pass from the 3-5-7
-- terminal handoff. The exact postgame claim now reconciles queued player
-- intent, derives the eligible cohort, and publishes the next lifecycle phase
-- in the same locked transaction.

-- A stood-up bot is deleted at this boundary. Keep the committed winner UUID
-- in both private authority records even when that transient player row is
-- removed. The public history row intentionally retains its established
-- ON DELETE SET NULL contract plus winner name/chip-change history; exact
-- postgame authority remains in the resolution and replay claim.
ALTER TABLE private.three_five_seven_round_resolutions
  DROP CONSTRAINT IF EXISTS three_five_seven_round_resolutions_winner_player_id_fkey;

ALTER TABLE private.three_five_seven_postgame_advances
  DROP CONSTRAINT IF EXISTS three_five_seven_postgame_advances_winner_player_id_fkey;

CREATE OR REPLACE FUNCTION public.three_five_seven_advance_postgame(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_claim private.three_five_seven_postgame_advances%ROWTYPE;
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_winner_id uuid;
  v_settlements integer;
  v_active integer;
  v_humans integer;
  v_allow_bots boolean := false;
  v_make_take boolean := false;
  v_positions integer[];
  v_index integer;
  v_next_position integer;
  v_target text;
  v_deadline timestamptz;
  v_result jsonb;
BEGIN
  IF p_game_id IS NULL
     OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL
     OR p_hand_number < 1 THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:missing_identity';
  END IF;

  -- Preserve the established exact lock order: terminal round, then game.
  SELECT *
    INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:round_identity_mismatch';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:game_not_found';
  END IF;

  SELECT *
    INTO v_claim
    FROM private.three_five_seven_postgame_advances claim
   WHERE claim.game_id = p_game_id
     AND claim.dealer_game_id = p_dealer_game_id
     AND claim.round_id = p_round_id
     AND claim.hand_number = p_hand_number;

  IF FOUND THEN
    -- The first committed handoff can mark a human participant left. That
    -- former participant must still receive the exact stored result, while an
    -- unrelated authenticated caller must not learn it.
    IF NOT private.three_five_seven_actor_allowed(p_game_id)
       AND NOT EXISTS (
         SELECT 1
           FROM public.players participant
          WHERE participant.game_id = p_game_id
            AND participant.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session';
    END IF;
    RETURN v_claim.result || jsonb_build_object(
      'deduped', true,
      'outcome', 'already_advanced'
    );
  END IF;

  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:not_in_session';
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357') THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_identity',
      'deduped', true,
      'status', v_game.status,
      'current_dealer_game_id', v_game.current_game_uuid,
      'current_hand_number', v_game.total_hands
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.status NOT IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_identity',
      'deduped', true,
      'status', v_game.status,
      'current_dealer_game_id', v_game.current_game_uuid,
      'current_hand_number', v_game.total_hands
    );
  END IF;

  SELECT *
    INTO v_resolution
    FROM private.three_five_seven_round_resolutions resolution
   WHERE resolution.game_id = p_game_id
     AND resolution.dealer_game_id = p_dealer_game_id
     AND resolution.round_id = p_round_id
     AND resolution.hand_number = p_hand_number
     AND resolution.outcome IN ('terminal', 'instant_sweep');

  IF NOT FOUND
     OR v_round.status <> 'completed'
     OR v_resolution.winner_player_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:terminal_resolution_missing';
  END IF;

  v_winner_id := v_resolution.winner_player_id;

  SELECT count(*)
    INTO v_settlements
    FROM public.game_results result
   WHERE result.game_id = p_game_id
     AND result.dealer_game_id = p_dealer_game_id
     AND result.hand_number = p_hand_number
     AND result.settlement_key = 'three_five_seven_terminal'
     AND result.winner_player_id = v_winner_id;

  IF v_settlements <> 1 THEN
    RAISE EXCEPTION
      'three_five_seven_advance_postgame:settlement_not_committed:%',
      v_settlements;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.players player
     WHERE player.id = v_winner_id
       AND player.game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'three_five_seven_advance_postgame:winner_not_in_session';
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Apply the same precedence as evaluatePlayerStatesEndOfGame, but do it
  -- under the exact terminal game lock before dealer/cohort derivation:
  -- stand up > sit out > 3-5-7 auto-fold > waiting/rejoin.
  DELETE FROM public.players player
   WHERE player.game_id = p_game_id
     AND coalesce(player.is_bot, false)
     AND coalesce(player.stand_up_next_hand, false);

  UPDATE public.players player
     SET status = CASE
           WHEN coalesce(player.stand_up_next_hand, false) THEN 'left'
           ELSE player.status
         END,
         sitting_out = CASE
           WHEN coalesce(player.stand_up_next_hand, false)
             OR coalesce(player.sit_out_next_hand, false)
             OR coalesce(player.auto_fold, false) THEN true
           WHEN coalesce(player.waiting, false) THEN false
           ELSE player.sitting_out
         END,
         waiting = false,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         auto_fold = false,
         current_decision = NULL,
         decision_locked = false,
         pre_fold = false,
         pre_stay = false,
         ante_decision = NULL,
         legs = 0
   WHERE player.game_id = p_game_id;

  SELECT
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
    ),
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
        AND NOT coalesce(player.is_bot, false)
    )
    INTO v_active, v_humans
    FROM public.players player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' OR v_humans = 0 THEN
    v_target := 'session_ended';
  ELSIF v_active < 2 THEN
    v_target := 'waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers, false)
      INTO v_allow_bots
      FROM public.game_defaults defaults
     WHERE defaults.game_type = 'holm'
     LIMIT 1;
    v_allow_bots := coalesce(v_allow_bots, false);

    SELECT coalesce((setting.value->>'enabled')::boolean, false)
      INTO v_make_take
      FROM public.system_settings setting
     WHERE setting.key = 'make_it_take_it'
     LIMIT 1;
    v_make_take := coalesce(v_make_take, false);

    IF v_make_take THEN
      SELECT player.position
        INTO v_next_position
        FROM public.players player
       WHERE player.id = v_winner_id
         AND player.game_id = p_game_id
         AND NOT coalesce(player.is_bot, false)
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL;
    END IF;

    IF v_next_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position)
        INTO v_positions
        FROM public.players player
       WHERE player.game_id = p_game_id
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL
         AND (v_allow_bots OR NOT coalesce(player.is_bot, false));

      IF coalesce(cardinality(v_positions), 0) = 0 THEN
        v_target := 'dealer_selection';
      ELSE
        v_index := array_position(
          v_positions,
          coalesce(v_game.dealer_position, 1)
        );
        v_next_position := CASE
          WHEN v_index IS NULL THEN v_positions[1]
          ELSE v_positions[(v_index % cardinality(v_positions)) + 1]
        END;
      END IF;
    END IF;

    IF v_target IS NULL THEN
      v_target := 'game_selection';
      v_deadline := clock_timestamp() + make_interval(
        secs => greatest(1, coalesce(v_game.game_setup_timer_seconds, 30))
      );
    END IF;
  END IF;

  UPDATE public.rounds
     SET status = 'completed'
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND status <> 'completed';

  UPDATE public.games
     SET status = v_target,
         config_complete = false,
         config_deadline = v_deadline,
         last_round_result = NULL,
         current_round = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         pot = 0,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         game_over_at = NULL,
         buck_position = NULL,
         total_hands = 0,
         is_first_hand = false,
         current_game_uuid = NULL,
         dealer_selection_state = NULL,
         dealer_position = CASE
           WHEN v_target = 'game_selection' THEN v_next_position
           ELSE dealer_position
         END,
         session_ended_at = CASE
           WHEN v_target = 'session_ended'
             THEN coalesce(session_ended_at, clock_timestamp())
           ELSE session_ended_at
         END
   WHERE id = p_game_id;

  v_result := jsonb_build_object(
    'outcome', 'advanced',
    'deduped', false,
    'winner_player_id', v_winner_id,
    'status', v_target,
    'dealer_position', CASE
      WHEN v_target = 'game_selection' THEN v_next_position
      ELSE NULL
    END,
    'config_deadline', v_deadline
  );

  INSERT INTO private.three_five_seven_postgame_advances (
    game_id,
    dealer_game_id,
    round_id,
    hand_number,
    winner_player_id,
    target_status,
    dealer_position,
    config_deadline,
    result
  ) VALUES (
    p_game_id,
    p_dealer_game_id,
    p_round_id,
    p_hand_number,
    v_winner_id,
    v_target,
    CASE WHEN v_target = 'game_selection' THEN v_next_position END,
    v_deadline,
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_advance_postgame(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_advance_postgame(
  uuid, uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.three_five_seven_advance_postgame(
  uuid, uuid, uuid, integer
) IS
  'Atomically reconciles exact-terminal 3-5-7 participation intent, derives the next dealer/disposition, clears outgoing transients, and stores a replay-safe result.';
