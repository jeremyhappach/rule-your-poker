-- Approved incident release: presentation metadata; accounting is unchanged.
-- Nullable presentation metadata only; no historical backfill or balance change.
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.horses_settle_game(uuid,uuid,uuid,integer)'::regprocedure)
       IS DISTINCT FROM '2be173657078bfe6af4eaf659a1d1ee2'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.horses_scc_rollover_abandoned_round(uuid,timestamptz)'::regprocedure)
       IS DISTINCT FROM 'aa4ce34034802875f04133366a90b579'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.start_horses_scc_initial_round(uuid,uuid)'::regprocedure)
       IS DISTINCT FROM '02f02705dedad321b11feb18e27cd484'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.finalize_gameplay_transfer_batch()'::regprocedure)
       IS DISTINCT FROM '592fe96e0a2e4009861ca9c729bb66bc' THEN
    RAISE EXCEPTION 'dice_transfer_metadata: authority changed since qualification';
  END IF;
END;
$guard$;
ALTER TABLE public.gameplay_transfer_pending_changes ADD COLUMN source_round_id uuid, ADD COLUMN successor_round_id uuid;
ALTER TABLE public.gameplay_transfer_batches ADD COLUMN source_round_id uuid, ADD COLUMN successor_round_id uuid;
COMMENT ON COLUMN public.gameplay_transfer_batches.source_round_id IS
  'Exact predecessor/settlement round; null with an explicit successor identifies initial admission, otherwise legacy reconciliation.';

CREATE OR REPLACE FUNCTION private.capture_transfer_source_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_context text := current_setting('ptown.transfer_source_round_id', true);
BEGIN
  -- This is annotation, not an authorization mechanism. Invalid context must
  -- never fail or modify accounting. Only the validated settlement sets it.
  NEW.source_round_id := NULL;
  IF NEW.reason IN ('win', 'ante') AND COALESCE(v_context, '') ~ '^[0-9a-fA-F-]{36}$' THEN
    SELECT r.id INTO NEW.source_round_id FROM public.rounds r
      WHERE r.id::text = lower(v_context) AND r.game_id = NEW.game_id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_round_id IS DISTINCT FROM NEW.source_round_id THEN
    NEW.source_round_id := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER capture_transfer_source_round BEFORE INSERT OR UPDATE OF opening_balance, closing_balance, reason ON public.gameplay_transfer_pending_changes
FOR EACH ROW EXECUTE FUNCTION private.capture_transfer_source_round();

CREATE OR REPLACE FUNCTION private.annotate_transfer_batch_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_round uuid; v_successor uuid;
BEGIN
  NEW.source_round_id := NULL;
  NEW.successor_round_id := NULL;
  -- The deferred finalizer inserts its batch BEFORE deleting this journal.
  -- Mixed/unknown journal ownership is deliberately left unassigned.
  SELECT (array_agg(DISTINCT p.source_round_id))[1] INTO v_round
    FROM public.gameplay_transfer_pending_changes p
    WHERE p.game_id = NEW.game_id AND p.transaction_id = txid_current()
    HAVING count(*) > 0 AND count(p.source_round_id) = count(*)
      AND count(DISTINCT p.source_round_id) = 1;
  IF v_round IS NOT NULL AND EXISTS (SELECT 1 FROM public.rounds r
    WHERE r.id = v_round AND r.game_id = NEW.game_id AND r.dealer_game_id = NEW.dealer_game_id) THEN
    NEW.source_round_id := v_round;
    SELECT (array_agg(DISTINCT p.successor_round_id))[1] INTO v_successor
      FROM public.gameplay_transfer_pending_changes p
      WHERE p.game_id = NEW.game_id AND p.transaction_id = txid_current()
      HAVING count(p.successor_round_id) = count(*) AND count(DISTINCT p.successor_round_id) = 1;
    IF v_successor IS NOT NULL AND EXISTS (SELECT 1 FROM public.rounds next_round
      JOIN public.rounds prior ON prior.id = v_round
      WHERE next_round.id = v_successor AND next_round.game_id = NEW.game_id
        AND next_round.dealer_game_id = NEW.dealer_game_id
        AND next_round.hand_number = prior.hand_number + 1) THEN
      NEW.successor_round_id := v_successor;
    END IF;
  ELSIF NEW.reason = 'ante' THEN
    -- Initial admission has no predecessor. Only its validated creator writes
    -- this exact destination into every journal row, after inserting hand 1.
    SELECT (array_agg(DISTINCT p.successor_round_id))[1] INTO v_successor
      FROM public.gameplay_transfer_pending_changes p
      WHERE p.game_id = NEW.game_id AND p.transaction_id = txid_current()
      HAVING count(*) > 0 AND count(p.source_round_id) = 0
        AND count(p.successor_round_id) = count(*) AND count(DISTINCT p.successor_round_id) = 1;
    IF v_successor IS NOT NULL AND EXISTS (SELECT 1 FROM public.rounds r
      WHERE r.id = v_successor AND r.game_id = NEW.game_id
        AND r.dealer_game_id = NEW.dealer_game_id AND r.hand_number = 1 AND r.round_number = 1) THEN
      NEW.successor_round_id := v_successor;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER annotate_transfer_batch_round BEFORE INSERT ON public.gameplay_transfer_batches
FOR EACH ROW EXECUTE FUNCTION private.annotate_transfer_batch_round();
REVOKE ALL ON FUNCTION private.capture_transfer_source_round() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.annotate_transfer_batch_round() FROM PUBLIC;

-- Existing settlement body below, with only scoped context capture/reset added.
CREATE OR REPLACE FUNCTION public.horses_settle_game(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_previous_round_context text;
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_outcome jsonb;
  v_winner_ids uuid[];
  v_winner_id uuid;
  v_winner_result jsonb;
  v_winner_username text;
  v_pot integer;
  v_result_id uuid;
  v_existing_result_id uuid;
  v_chip_changes jsonb;
  v_description text;
  v_end_session boolean;
  v_disposition text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'horses_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_settle_game:round_not_found:%', p_round_id;
  END IF;
  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'horses_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_settle_game:game_not_found:%', p_game_id;
  END IF;
  IF v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_settle_game:not_dice_game:%', v_game.game_type;
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'horses_settle_game:dealer_game_mismatch';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'horses_settle_game:caller_not_in_session';
  END IF;

  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'horses_terminal'
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result_id,
      'terminal_disposition', CASE WHEN v_game.status = 'session_ended' THEN 'session_ended' ELSE 'game_over' END
    );
  END IF;

  v_state := v_round.horses_state;
  IF v_state IS NULL OR v_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'horses_settle_game:round_not_terminal';
  END IF;
  v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
  SELECT array_agg(value::uuid)
    INTO v_winner_ids
    FROM jsonb_array_elements_text(v_outcome -> 'winner_player_ids') AS winner(value);
  IF cardinality(v_winner_ids) <> 1 THEN
    RETURN jsonb_build_object('status', 'tie', 'winner_player_ids', to_jsonb(v_winner_ids));
  END IF;
  v_winner_id := v_winner_ids[1];
  IF NOT EXISTS (
    SELECT 1 FROM public.players
     WHERE id = v_winner_id AND game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'horses_settle_game:winner_not_participant';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(v_state -> 'turnOrder') AS participant(player_id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = participant.player_id::uuid AND game_id = p_game_id
     )
  ) THEN
    RAISE EXCEPTION 'horses_settle_game:participant_membership_mismatch';
  END IF;

  -- Never infer and replay a partial legacy browser settlement.
  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = v_game.game_type
     AND settlement_key IS NULL
     AND winner_player_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    IF v_game.status NOT IN ('game_over', 'session_ended') THEN
      RAISE EXCEPTION 'horses_settle_game:legacy_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object('status', 'already_settled', 'result_id', v_existing_result_id, 'legacy_result', true);
  END IF;
  IF v_round.status = 'completed' OR v_game.status IN ('game_over', 'session_ended') THEN
    RAISE EXCEPTION 'horses_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'horses_settle_game:game_not_settleable:%', v_game.status;
  END IF;

  SELECT COALESCE(profile.username, 'Player ' || player.position::text)
    INTO v_winner_username
    FROM public.players AS player
    LEFT JOIN public.profiles AS profile ON profile.id = player.user_id
   WHERE player.id = v_winner_id;
  v_winner_result := v_outcome -> 'player_results' -> v_winner_id::text;
  v_pot := greatest(COALESCE(v_game.pot, 0), 0);
  v_chip_changes := jsonb_build_object(v_winner_id::text, v_pot);
  v_description := v_winner_username || ' wins with ' || (v_winner_result ->> 'description');

  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'horses_terminal', v_game.game_type,
    v_winner_id, v_winner_username, v_winner_result ->> 'description',
    v_pot, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  v_previous_round_context := current_setting('ptown.transfer_source_round_id', true);
  PERFORM set_config('ptown.transfer_source_round_id', p_round_id::text, true);
  PERFORM set_config('ptown.chip_transfer_reason', 'win', true);
  IF v_pot > 0 THEN
    UPDATE public.players
       SET chips = chips + v_pot
     WHERE id = v_winner_id AND game_id = p_game_id;
  END IF;
  UPDATE public.games
     SET pot = 0
   WHERE id = p_game_id AND pot <> 0;

  PERFORM set_config('ptown.transfer_source_round_id', COALESCE(v_previous_round_context, ''), true);

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT player.game_id, p_dealer_game_id, player.id, player.user_id,
         COALESCE(profile.username, CASE WHEN player.is_bot THEN 'Bot' ELSE 'Unknown' END),
         player.chips, player.is_bot, p_hand_number
    FROM public.players AS player
    LEFT JOIN public.profiles AS profile ON profile.id = player.user_id
   WHERE player.game_id = p_game_id
  ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    username = EXCLUDED.username,
    chips = EXCLUDED.chips,
    is_bot = EXCLUDED.is_bot,
    created_at = EXCLUDED.created_at;

  v_end_session := COALESCE(v_game.pending_session_end, false)
    OR private.horses_scc_all_humans_absent(p_game_id, v_now);
  v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;
  UPDATE public.games
     SET status = v_disposition,
         last_round_result = v_description,
         game_over_at = COALESCE(game_over_at, v_now),
         session_ended_at = CASE WHEN v_end_session THEN COALESCE(session_ended_at, v_now) ELSE session_ended_at END,
         pending_session_end = CASE WHEN v_end_session THEN false ELSE pending_session_end END
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'winner_player_id', v_winner_id,
    'terminal_disposition', v_disposition
  );
END;
$function$;

-- Presentation identity is write-once, including null legacy identity. No backfill.
CREATE OR REPLACE FUNCTION private.keep_transfer_round_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.source_round_id IS DISTINCT FROM OLD.source_round_id
    OR NEW.successor_round_id IS DISTINCT FROM OLD.successor_round_id THEN
    RAISE EXCEPTION 'transfer_source_round_is_immutable';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER keep_transfer_round_immutable BEFORE UPDATE OF source_round_id, successor_round_id
ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION private.keep_transfer_round_immutable();
REVOKE ALL ON FUNCTION private.keep_transfer_round_immutable() FROM PUBLIC;

-- Existing rollover body; only exact presentation lineage metadata is added.
CREATE OR REPLACE FUNCTION private.horses_scc_rollover_abandoned_round(
  p_round_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_previous_round_context text;
  v_successor_round_id uuid;
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_outcome jsonb;
  v_turn_order jsonb;
  v_player_key text;
  v_player_ids uuid[] := ARRAY[]::uuid[];
  v_player_count integer;
  v_next_hand integer;
  v_next_round integer;
  v_ante_amount integer;
  v_new_pot integer;
  v_initial_dice jsonb;
  v_player_states jsonb := '{}'::jsonb;
  v_next_state jsonb;
  v_first_player_id uuid;
  v_controller_user_id uuid;
  v_first_is_bot boolean;
  v_first_auto_fold boolean;
  v_tie_names text;
  v_tie_description text;
  v_chip_changes jsonb;
  v_existing_tie boolean;
  v_pre_chips jsonb;
  v_post_chips jsonb;
BEGIN
  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:round_not_found';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = v_round.game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:not_dice_game';
  END IF;
  IF v_game.status <> 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;

  -- The function remains private. The deadline runner calls it only after
  -- proving every human absent; the authenticated connected-client wrapper
  -- below proves exact membership and identity before calling the same owner.
  v_state := v_round.horses_state;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RETURN jsonb_build_object('status', 'not_terminal');
  END IF;
  v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
  IF coalesce((v_outcome ->> 'is_tie')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'not_tie');
  END IF;

  v_turn_order := v_state -> 'turnOrder';
  FOR v_player_key IN SELECT jsonb_array_elements_text(v_turn_order) LOOP
    v_player_ids := array_append(v_player_ids, v_player_key::uuid);
  END LOOP;
  v_player_count := cardinality(v_player_ids);
  IF v_player_count < 2
     OR (
       SELECT count(*)
         FROM public.players player
        WHERE player.game_id = v_game.id
          AND player.id = ANY(v_player_ids)
     ) <> v_player_count THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:participant_membership_mismatch';
  END IF;

  v_next_hand := v_round.hand_number + 1;
  v_next_round := v_round.round_number + 1;
  IF EXISTS (
    SELECT 1
      FROM public.rounds successor
     WHERE successor.game_id = v_game.id
       AND successor.dealer_game_id = v_round.dealer_game_id
       AND successor.hand_number = v_next_hand
  ) THEN
    RETURN jsonb_build_object('status', 'already_advanced');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.game_results result
     WHERE result.game_id = v_game.id
       AND result.dealer_game_id = v_round.dealer_game_id
       AND result.hand_number = v_round.hand_number
       AND result.is_chopped = true
  ) INTO v_existing_tie;
  IF NOT v_existing_tie THEN
    SELECT
      string_agg(
        coalesce(profile.username, 'Player ' || player.position::text),
        ' & ' ORDER BY player.position
      ),
      max(entry.value ->> 'description')
      INTO v_tie_names, v_tie_description
      FROM public.players player
      LEFT JOIN public.profiles profile ON profile.id = player.user_id
      LEFT JOIN LATERAL jsonb_each(v_outcome -> 'player_results') entry(key, value)
        ON entry.key = player.id::text
     WHERE player.id = ANY(v_player_ids);

    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, game_type,
      winner_player_id, winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped
    ) VALUES (
      v_game.id,
      v_round.dealer_game_id,
      v_round.hand_number,
      v_game.game_type,
      NULL,
      v_tie_names,
      'TIE: ' || coalesce(v_tie_description, 'Unknown') || ' - Rollover',
      0,
      '{}'::jsonb,
      true
    );
  END IF;

  v_ante_amount := greatest(coalesce(v_game.ante_amount, 1), 0);
  v_new_pot := coalesce(v_game.pot, 0) + v_ante_amount * v_player_count;

  SELECT jsonb_object_agg(player.id::text, player.chips)
    INTO v_pre_chips
    FROM public.players player
   WHERE player.game_id = v_game.id
     AND player.id = ANY(v_player_ids);

  v_previous_round_context := current_setting('ptown.transfer_source_round_id', true);
  PERFORM set_config('ptown.transfer_source_round_id', v_round.id::text, true);
  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  IF v_ante_amount > 0 THEN
    UPDATE public.players player
       SET chips = player.chips - v_ante_amount
     WHERE player.game_id = v_game.id
       AND player.id = ANY(v_player_ids);
  END IF;
  UPDATE public.games
     SET pot = v_new_pot
   WHERE id = v_game.id;

  PERFORM set_config('ptown.transfer_source_round_id', COALESCE(v_previous_round_context, ''), true);

  SELECT jsonb_object_agg(player.id::text, player.chips)
    INTO v_post_chips
    FROM public.players player
   WHERE player.game_id = v_game.id
     AND player.id = ANY(v_player_ids);

  v_initial_dice := CASE WHEN v_game.game_type = 'ship-captain-crew' THEN
    jsonb_build_array(
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false)
    ) ELSE jsonb_build_array(
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false)
    ) END;

  FOR v_player_key IN SELECT jsonb_array_elements_text(v_turn_order) LOOP
    v_player_states := v_player_states || jsonb_build_object(
      v_player_key,
      jsonb_build_object(
        'dice', v_initial_dice,
        'rollsRemaining', 3,
        'isComplete', false
      )
    );
  END LOOP;

  v_first_player_id := (v_turn_order ->> 0)::uuid;
  SELECT player.user_id, player.is_bot, player.auto_fold
    INTO v_controller_user_id, v_first_is_bot, v_first_auto_fold
    FROM public.players player
   WHERE player.id = v_first_player_id;
  SELECT player.user_id INTO v_controller_user_id
    FROM public.players player
   WHERE player.id = ANY(v_player_ids)
     AND player.is_bot = false
   ORDER BY array_position(v_player_ids, player.id)
   LIMIT 1;

  v_next_state := jsonb_build_object(
    'currentTurnPlayerId', v_first_player_id,
    'playerStates', v_player_states,
    'gamePhase', 'playing',
    'turnOrder', v_turn_order,
    'botControllerUserId', v_controller_user_id,
    'turnDeadline', CASE
      WHEN v_first_is_bot OR v_first_auto_fold THEN p_now
      ELSE p_now + interval '60 seconds'
    END
  );

  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (
    v_game.id,
    v_round.dealer_game_id,
    v_next_hand,
    v_next_round,
    2,
    'betting',
    v_new_pot,
    v_next_state
  ) RETURNING id INTO v_successor_round_id;
  UPDATE public.gameplay_transfer_pending_changes
     SET successor_round_id = v_successor_round_id
   WHERE transaction_id = txid_current() AND game_id = v_game.id
     AND source_round_id = v_round.id AND reason = 'ante';

  UPDATE public.rounds
     SET status = 'completed'
   WHERE id = v_round.id;

  UPDATE public.games
     SET current_round = v_next_round,
         total_hands = v_next_hand,
         status = 'in_progress',
         awaiting_next_round = false,
         all_decisions_in = false,
         last_round_result = NULL,
         game_over_at = NULL,
         is_first_hand = false
   WHERE id = v_game.id;

  v_chip_changes := (
    SELECT jsonb_object_agg(player_id::text, -v_ante_amount)
      FROM unnest(v_player_ids) player_id
  );
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    v_game.id,
    v_round.dealer_game_id,
    v_next_hand,
    v_game.game_type,
    NULL,
    v_player_count::text || ' players re-anted $' || v_ante_amount::text,
    'Re-Ante (Rollover)',
    0,
    coalesce(v_chip_changes, '{}'::jsonb),
    false
  );

  RETURN jsonb_build_object(
    'status', 'advanced',
    'transition', 'tie_rollover',
    'round_number', v_next_round,
    'hand_number', v_next_hand,
    'ante_amount', v_ante_amount,
    'active_count', v_player_count,
    'pot', v_new_pot,
    'pre_chips', coalesce(v_pre_chips, '{}'::jsonb),
    'post_chips', coalesce(v_post_chips, '{}'::jsonb)
  );
END;
$function$;

-- Initial live antes retain canonical flights with an explicit destination.
CREATE OR REPLACE FUNCTION private.start_horses_scc_initial_round(
  p_game_id uuid,
  p_expected_dealer_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_player_ids uuid[];
  v_first_position integer;
  v_first_player_id uuid;
  v_first_is_bot boolean;
  v_controller_user_id uuid;
  v_make_take boolean := false;
  v_turn_seconds integer := 60;
  v_bot_delay numeric := 2;
  v_due_at timestamptz;
  v_dice jsonb;
  v_player_states jsonb;
  v_state jsonb;
  v_transfers jsonb;
  v_round_id uuid;
  v_pot integer;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses','ship-captain-crew') THEN
    RAISE EXCEPTION 'start_horses_scc_initial_round:not_dice_game';
  END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status);
  END IF;

  SELECT * INTO v_existing FROM public.rounds round_row
   WHERE round_row.game_id=p_game_id
     AND round_row.dealer_game_id=p_expected_dealer_game_id
     AND round_row.hand_number=1
     AND round_row.round_number=1
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id
    );
  END IF;

  IF (SELECT count(*) FROM public.players player
       WHERE player.game_id=p_game_id
         AND NOT coalesce(player.sitting_out,false)
         AND player.status NOT IN ('observer','left')
         AND player.position IS NOT NULL
         AND player.ante_decision='ante_up') < 2 THEN
    RETURN jsonb_build_object('outcome','admission_incomplete');
  END IF;

  SELECT coalesce((setting.value->>'enabled')::boolean,false)
    INTO v_make_take
    FROM public.system_settings setting
   WHERE setting.key='make_it_take_it' LIMIT 1;
  v_make_take:=coalesce(v_make_take,false);

  IF v_make_take AND EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id=p_game_id AND player.position=v_game.dealer_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision='ante_up'
  ) THEN
    v_first_position:=v_game.dealer_position;
  ELSE
    SELECT coalesce(
      max(player.position) FILTER (WHERE player.position<v_game.dealer_position),
      max(player.position)
    ) INTO v_first_position
    FROM public.players player
    WHERE player.game_id=p_game_id
      AND NOT coalesce(player.sitting_out,false)
      AND player.status NOT IN ('observer','left')
      AND player.position IS NOT NULL
      AND player.ante_decision='ante_up';
  END IF;

  SELECT array_agg(player.id ORDER BY
           CASE WHEN player.position<=v_first_position THEN 0 ELSE 1 END,
           player.position DESC)
    INTO v_player_ids
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  v_first_player_id:=v_player_ids[1];
  SELECT player.is_bot INTO v_first_is_bot
    FROM public.players player WHERE player.id=v_first_player_id;
  SELECT player.user_id INTO v_controller_user_id
    FROM unnest(v_player_ids) WITH ORDINALITY ordered(player_id,ordinality)
    JOIN public.players player ON player.id=ordered.player_id
   WHERE NOT coalesce(player.is_bot,false)
   ORDER BY ordered.ordinality LIMIT 1;

  SELECT coalesce(defaults.decision_timer_seconds,60),
         coalesce(defaults.bot_decision_delay_seconds,2)
    INTO v_turn_seconds,v_bot_delay
    FROM public.game_defaults defaults
   WHERE defaults.game_type=v_game.game_type LIMIT 1;
  v_turn_seconds:=greatest(1,coalesce(v_turn_seconds,60));
  v_bot_delay:=greatest(0.1,coalesce(v_bot_delay,2));
  v_due_at:=clock_timestamp()+CASE WHEN coalesce(v_first_is_bot,false)
    THEN make_interval(secs=>v_bot_delay)
    ELSE make_interval(secs=>v_turn_seconds) END;

  v_dice:=CASE WHEN v_game.game_type='ship-captain-crew' THEN
    jsonb_build_array(
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false),
      jsonb_build_object('value',0,'isHeld',false,'isSCC',false)
    ) ELSE jsonb_build_array(
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false),
      jsonb_build_object('value',0,'isHeld',false)
    ) END;

  SELECT jsonb_object_agg(player_id::text,jsonb_build_object(
           'dice',v_dice,'rollsRemaining',3,'isComplete',false
         )) INTO v_player_states
    FROM unnest(v_player_ids) player_id;
  v_state:=jsonb_build_object(
    'currentTurnPlayerId',v_first_player_id,
    'playerStates',v_player_states,
    'gamePhase','playing',
    'turnOrder',to_jsonb(v_player_ids),
    'botControllerUserId',v_controller_user_id,
    'turnDeadline',v_due_at
  );

  IF coalesce(v_game.ante_amount,0)>0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'from',jsonb_build_object('kind','player','playerId',player_id),
      'to',jsonb_build_object('kind','pot'),
      'amount',v_game.ante_amount
    )) INTO v_transfers FROM unnest(v_player_ids) player_id;
    PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfers,'ante');
  END IF;
  SELECT game_row.pot INTO v_pot FROM public.games game_row WHERE id=p_game_id;

  INSERT INTO public.rounds(
    game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot,
    horses_state,current_turn_position
  ) VALUES (
    p_game_id,p_expected_dealer_game_id,1,1,2,'betting',coalesce(v_pot,0),
    v_state,v_first_position
  ) RETURNING id INTO v_round_id;
  -- Exact destination of this initial admission, attached before finalization.
  -- No predecessor exists; accounting and round creation retain their order.
  UPDATE public.gameplay_transfer_pending_changes
     SET successor_round_id = v_round_id
   WHERE game_id = p_game_id AND transaction_id = txid_current()
     AND reason = 'ante' AND source_round_id IS NULL;

  UPDATE public.games
     SET status='in_progress',current_round=1,total_hands=1,
         all_decisions_in=false,awaiting_next_round=false,
         last_round_result=NULL,game_over_at=NULL,is_first_hand=true,
         config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=p_game_id;

  RETURN jsonb_build_object(
    'outcome','started','deduped',false,'round_id',v_round_id,
    'dealer_game_id',p_expected_dealer_game_id,'hand_number',1
  );
END;
$function$;
