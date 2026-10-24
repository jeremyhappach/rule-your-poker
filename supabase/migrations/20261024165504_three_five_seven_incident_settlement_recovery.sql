-- 357 incident correction. Admission remains CLOSED; no historical rows are repaired.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer)'::regprocedure)) <> 'd87746216622e62db7c599f43caf122e'
 OR md5(pg_get_functiondef('public.three_five_seven_advance_postgame(uuid,uuid,uuid,integer)'::regprocedure)) <> '4dc7727fbce453070c38fe2471bef4d0'
 THEN RAISE EXCEPTION '357_incident:authority_drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.three_five_seven_release WHERE singleton AND NOT real_money_admission_enabled)
 THEN RAISE EXCEPTION '357_incident:admission_must_remain_closed'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.three_five_seven_settle_game_authority_impl(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_existing_terminal public.game_results%ROWTYPE;
  v_winner_id uuid;
  v_winner_username text;
  v_result_id uuid;
  v_sweep_count integer;
  v_terminal_winner_count integer;
  v_leg_value integer;
  v_legs_to_win integer;
  v_total_leg_value integer;
  v_payout_amount integer;
  v_chip_changes jsonb;
  v_end_session boolean;
  v_disposition text;
  v_terminal_description text;
  v_is_sweep boolean := false;
  v_updated_player_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:round_not_found:%', p_round_id;
  END IF;
  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:game_not_found:%', p_game_id;
  END IF;

  -- Service-role rollback proofs have no auth UID. Browser callers must be a
  -- session participant or administrator.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:caller_not_in_session';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dealer_games
     WHERE id = p_dealer_game_id
       AND session_id = p_game_id
       AND game_type IN ('3-5-7', '3-5-7-game', '357')
  ) THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:dealer_game_not_found';
  END IF;

  -- The durable claim makes a replay valid even after terminal lifecycle work
  -- reset legs or moved the game to the next dealer game.
  SELECT * INTO v_existing_terminal
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'three_five_seven_terminal'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_terminal.game_id IS DISTINCT FROM p_game_id
       OR v_existing_terminal.game_type NOT IN ('3-5-7', '3-5-7-game', '357')
       OR v_existing_terminal.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:authoritative_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_terminal.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_existing_terminal.winner_player_id,
      'payout_amount', v_existing_terminal.pot_won,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END
    );
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357')
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_round.status NOT IN ('betting', 'completed') THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:game_not_settleable';
  END IF;

  v_leg_value := COALESCE(v_game.leg_value, 1);
  v_legs_to_win := COALESCE(v_game.legs_to_win, 3);
  IF v_leg_value < 0 OR v_legs_to_win <= 0 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:invalid_game_configuration';
  END IF;

  -- Round-one 3/5/7 is an immediate terminal sweep. Exactly one dealt hand
  -- may satisfy the invariant; anything else is ambiguous state.
  IF v_round.round_number = 1 THEN
    SELECT count(*) INTO v_sweep_count
      FROM public.player_cards pc
     WHERE pc.round_id = p_round_id
       AND jsonb_typeof(pc.cards) = 'array'
       AND jsonb_array_length(pc.cards) = 3
       AND (
         SELECT array_agg(card.value->>'rank' ORDER BY card.value->>'rank')
           FROM jsonb_array_elements(pc.cards) AS card(value)
       ) = ARRAY['3', '5', '7']::text[];
  ELSE
    v_sweep_count := 0;
  END IF;

  IF v_sweep_count > 1 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:multiple_sweep_winners';
  ELSIF v_sweep_count = 1 THEN
    v_is_sweep := true;
    SELECT pc.player_id INTO v_winner_id
      FROM public.player_cards pc
     WHERE pc.round_id = p_round_id
       AND jsonb_typeof(pc.cards) = 'array'
       AND jsonb_array_length(pc.cards) = 3
       AND (
         SELECT array_agg(card.value->>'rank' ORDER BY card.value->>'rank')
           FROM jsonb_array_elements(pc.cards) AS card(value)
       ) = ARRAY['3', '5', '7']::text[];
  ELSE
    SELECT count(*) INTO v_terminal_winner_count
      FROM public.players
     WHERE game_id = p_game_id
       AND legs >= v_legs_to_win;
    IF v_terminal_winner_count = 0 THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:no_terminal_winner';
    ELSIF v_terminal_winner_count > 1 THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:terminal_tie_requires_review';
    END IF;
    SELECT id INTO v_winner_id
      FROM public.players
     WHERE game_id = p_game_id
       AND legs >= v_legs_to_win;
  END IF;

  SELECT COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         )
    INTO v_winner_username
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.id = v_winner_id
     AND p.game_id = p_game_id;
  IF v_winner_username IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:winner_not_in_session';
  END IF;

  SELECT COALESCE(SUM(
           p.legs * v_leg_value
         ), 0)::integer
    INTO v_total_leg_value
    FROM public.players p
   WHERE p.game_id = p_game_id;
  v_payout_amount := COALESCE(v_game.pot, 0) + v_total_leg_value;

  SELECT COALESCE(jsonb_object_agg(
           p.id::text,
           CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END
         ), '{}'::jsonb)
    INTO v_chip_changes
    FROM public.players p
   WHERE p.game_id = p_game_id;

  v_terminal_description := CASE
    WHEN v_is_sweep THEN '3-5-7 Sweep'
    ELSE v_legs_to_win::text || ' legs'
  END;

  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'three_five_seven_terminal',
    v_game.game_type, v_winner_id, v_winner_username, v_terminal_description,
    v_payout_amount, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  -- Both terminal paths return only purchased reserves, then transfer the pot.
  -- Winning instant-357 proof is public; ordinary wins retain Show Cards consent.
  IF v_is_sweep THEN
    -- Instant settlement may share the deal transaction with its ante. Seal
    -- that existing stage before crediting purchased reserves; all writes
    -- remain atomic and disappear together if any later statement fails.
    SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
    SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
    UPDATE public.player_cards SET is_public=true
     WHERE round_id=p_round_id AND player_id=v_winner_id;
  END IF;
  IF v_total_leg_value > 0 THEN
    PERFORM set_config('ptown.chip_transfer_reason', 'sweep', true);
    UPDATE public.players p
       SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_total_leg_value ELSE 0 END,
           legs = 0,
           current_decision = NULL,
           decision_locked = false,
           ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
     WHERE p.game_id = p_game_id;

    IF v_is_sweep THEN
      SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
      SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
    END IF;
    PERFORM set_config('ptown.chip_transfer_reason', 'transfer', true);
    UPDATE public.players p
       SET chips = p.chips + COALESCE(v_game.pot, 0)
     WHERE p.id = v_winner_id
       AND p.game_id = p_game_id;
  ELSE
    PERFORM set_config('ptown.chip_transfer_reason', 'transfer', true);
    UPDATE public.players p
       SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END,
           legs = 0,
           current_decision = NULL,
           decision_locked = false,
           ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
     WHERE p.game_id = p_game_id;
  END IF;
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  IF v_updated_player_count = 0 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:empty_roster';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL
   WHERE id = p_round_id;

  -- Snapshot post-payout balances before terminal status can trigger result UI.
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
         COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         ),
         p.chips, p.is_bot, p_hand_number
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.game_id = p_game_id
  ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    username = EXCLUDED.username,
    chips = EXCLUDED.chips,
    is_bot = EXCLUDED.is_bot,
    created_at = EXCLUDED.created_at;

  v_end_session := COALESCE(v_game.pending_session_end, false);
  v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;

  -- Last: the terminal status is published only after all financial and
  -- snapshot state is durable. Normal game-over keeps its legacy null clock
  -- so the connected table can complete the celebration.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         current_game_uuid = p_dealer_game_id,
         total_hands = p_hand_number,
         current_round = v_round.round_number,
         awaiting_next_round = false,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         last_round_result = CASE
           WHEN v_is_sweep THEN '357_SWEEP:' || v_winner_username || ':' || v_payout_amount::text
           ELSE chr(127942) || ' ' || v_winner_username || ' won the game!'
         END,
         game_over_at = CASE
           WHEN v_end_session THEN COALESCE(game_over_at, v_now)
           ELSE NULL
         END,
         session_ended_at = CASE
           WHEN v_end_session THEN COALESCE(session_ended_at, v_now)
           ELSE session_ended_at
         END,
         pending_session_end = CASE
           WHEN v_end_session THEN false
           ELSE pending_session_end
         END
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'hand_number', p_hand_number,
    'winner_player_id', v_winner_id,
    'payout_amount', v_payout_amount,
    'terminal_disposition', v_disposition,
    'is_sweep', v_is_sweep
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.three_five_seven_advance_postgame(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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

  IF private.three_five_seven_round_concealed(p_round_id) THEN
    RETURN jsonb_build_object('outcome','disclosure_pending');
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
$function$
;
