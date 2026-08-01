-- Canonical session snapshot identity: (game_id, dealer_game_id, hand_number, player_id).
-- hand_number restarts at 1 for every dealer game, so the old
-- (game_id, hand_number) existence guard suppressed every later dealer game's
-- snapshot batch. dealer_games.id is the existing immutable dealer-game key.

ALTER TABLE public.session_player_snapshots
  ADD COLUMN IF NOT EXISTS dealer_game_id UUID
    REFERENCES public.dealer_games(id) ON DELETE SET NULL;

-- Partial unique index: enforces exactly-once per participant per authoritative
-- dealer game / hand for all new writes, while leaving legacy rows (which have
-- no dealer_game_id and contain historical duplicates) untouched.
CREATE UNIQUE INDEX IF NOT EXISTS session_player_snapshots_dealer_hand_participant_key
  ON public.session_player_snapshots (game_id, dealer_game_id, hand_number, player_id)
  WHERE dealer_game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_snapshots_game_dealer_hand
  ON public.session_player_snapshots (game_id, dealer_game_id, hand_number);

CREATE OR REPLACE FUNCTION public.holm_settle_hand(p_game_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_event_kind holm_event_kind, p_pot_final integer, p_awaiting_next_round boolean, p_last_round_result text, p_chip_deltas jsonb, p_winning_hand_description text, p_winner_player_id uuid, p_winner_username text, p_is_chopped boolean, p_pot_won integer, p_mark_round_completed boolean DEFAULT true, p_round_pot integer DEFAULT NULL::integer, p_clear_chucky_active boolean DEFAULT false, p_reset_player_states boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round        public.rounds%ROWTYPE;
  v_game         public.games%ROWTYPE;
  v_existing     uuid;
  v_existing_knd holm_event_kind;
  v_result_id    uuid;
  v_player_id    uuid;
  v_delta        integer;
  v_end_game     boolean;
  v_end_session  boolean := false;
  v_disposition  text := NULL;
  v_bad_key      boolean;
  v_snap_exists  boolean;
  v_now          timestamptz := now();
BEGIN
  SELECT * INTO STRICT v_round
    FROM public.rounds
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
   FOR UPDATE;

  IF v_round.game_id <> p_game_id THEN
    RAISE EXCEPTION 'holm_settle_hand:game_mismatch';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game.game_type NOT IN ('holm','holm-game') THEN
    RAISE EXCEPTION 'holm_settle_hand:not_holm';
  END IF;

  IF p_event_kind = 'ante' THEN
    RAISE EXCEPTION 'holm_settle_hand:non_terminal_event_kind';
  END IF;

  IF v_round.status NOT IN ('completed','in_progress','showdown','revealing','betting','dealing','processing') THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_eligible:%', v_round.status;
  END IF;

  IF p_chip_deltas IS NULL OR jsonb_typeof(p_chip_deltas) <> 'object' THEN
    RAISE EXCEPTION 'holm_settle_hand:empty_delta_map';
  END IF;

  -- Validate every delta is an integer belonging to a player in THIS game.
  PERFORM (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_chip_deltas) k
     WHERE NOT EXISTS (
       SELECT 1 FROM public.players WHERE id = k::uuid AND game_id = p_game_id
     )
  ) INTO v_bad_key;
  IF v_bad_key THEN
    RAISE EXCEPTION 'holm_settle_hand:unrelated_player_in_delta_map';
  END IF;

  v_end_game := (p_event_kind = 'chucky_final_award');

  -- ── Stable settlement claim ────────────────────────────────────────────
  -- Backed by partial unique index game_results_holm_terminal_uniq
  -- (dealer_game_id, hand_number) WHERE holm game_type AND terminal event_kind.
  SELECT id, event_kind INTO v_existing, v_existing_knd
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
     AND game_type IN ('holm','holm-game')
     AND event_kind IN (
       'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
       'showdown_final_award','partial_tie_final_award','chucky_final_award'
     )
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Already claimed. NO financial write, NO result write, NO pot/result-text write.
    -- Only self-heal the terminal disposition (idempotent) so a settlement that
    -- committed while the caller disconnected can never strand the session.
    IF v_existing_knd = 'chucky_final_award' THEN
      v_end_session := COALESCE(v_game.pending_session_end, false);
      IF v_game.status = 'session_ended' THEN
        v_disposition := 'session_ended';
      ELSE
        IF v_end_session THEN
          SELECT EXISTS (
            SELECT 1 FROM public.session_player_snapshots
             WHERE game_id = p_game_id
               AND dealer_game_id = p_dealer_game_id
               AND hand_number = p_hand_number
          ) INTO v_snap_exists;
          IF NOT v_snap_exists THEN
            INSERT INTO public.session_player_snapshots
              (game_id, dealer_game_id, player_id, user_id, username, chips, is_bot, hand_number)
            SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
                   CASE WHEN p.is_bot THEN 'Bot ' || b.bot_index::text
                        ELSE COALESCE(pr.username, 'Unknown') END,
                   p.chips, p.is_bot, p_hand_number
              FROM public.players p
              LEFT JOIN public.profiles pr ON pr.id = p.user_id
              LEFT JOIN (
                SELECT id, row_number() OVER (ORDER BY created_at, id) AS bot_index
                  FROM public.players WHERE game_id = p_game_id AND is_bot = true
              ) b ON b.id = p.id
             WHERE p.game_id = p_game_id
             ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO NOTHING;
          END IF;
        END IF;
        UPDATE public.games SET
          status              = CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END,
          game_over_at        = CASE WHEN v_end_session THEN COALESCE(game_over_at, v_now) ELSE game_over_at END,
          session_ended_at    = CASE WHEN v_end_session THEN COALESCE(session_ended_at, v_now) ELSE session_ended_at END,
          pending_session_end = CASE WHEN v_end_session THEN false ELSE pending_session_end END
        WHERE id = p_game_id;
        v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'status','already_settled',
      'result_id',v_existing,
      'hand_number',p_hand_number,
      'dealer_game_ended',(v_existing_knd = 'chucky_final_award'),
      'terminal_disposition',v_disposition
    );
  END IF;

  -- ── Result of record (claim) ───────────────────────────────────────────
  INSERT INTO public.game_results (
    game_id, game_type, dealer_game_id, hand_number,
    event_kind, winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, v_game.game_type, p_dealer_game_id, p_hand_number,
    p_event_kind, p_winner_player_id, p_winner_username, p_winning_hand_description,
    p_pot_won, p_chip_deltas, p_is_chopped
  ) RETURNING id INTO v_result_id;

  -- ── Payout (exactly once, guarded by the claim above) ──────────────────
  FOR v_player_id, v_delta IN
    SELECT k::uuid, (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k
  LOOP
    IF v_delta <> 0 THEN
      UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
    END IF;
  END LOOP;

  -- ── Terminal consequences (dealer game ends) ───────────────────────────
  IF v_end_game THEN
    IF p_reset_player_states THEN
      -- SCOPED: never revive stood-up ('left') or observer rows.
      UPDATE public.players SET
        status           = 'active',
        current_decision = NULL,
        decision_locked  = false,
        ante_decision    = NULL
      WHERE game_id = p_game_id
        AND status NOT IN ('left','observer');
    END IF;

    v_end_session := COALESCE(v_game.pending_session_end, false);

    -- POST-PAYOUT final snapshot. Must exist BEFORE the status transition that
    -- fires record_session_results. Idempotent on
    -- (game_id, dealer_game_id, hand_number, player_id).
    IF v_end_session THEN
      SELECT EXISTS (
        SELECT 1 FROM public.session_player_snapshots
         WHERE game_id = p_game_id
           AND dealer_game_id = p_dealer_game_id
           AND hand_number = p_hand_number
      ) INTO v_snap_exists;
      IF NOT v_snap_exists THEN
        INSERT INTO public.session_player_snapshots
          (game_id, dealer_game_id, player_id, user_id, username, chips, is_bot, hand_number)
        SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
               CASE WHEN p.is_bot THEN 'Bot ' || b.bot_index::text
                    ELSE COALESCE(pr.username, 'Unknown') END,
               p.chips, p.is_bot, p_hand_number
          FROM public.players p
          LEFT JOIN public.profiles pr ON pr.id = p.user_id
          LEFT JOIN (
            SELECT id, row_number() OVER (ORDER BY created_at, id) AS bot_index
              FROM public.players WHERE game_id = p_game_id AND is_bot = true
          ) b ON b.id = p.id
         WHERE p.game_id = p_game_id
         ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO NOTHING;
      END IF;
    ELSE
      -- Ordinary game_over also captures the post-payout audit snapshot
      -- (previously done fire-and-forget by the client).
      SELECT EXISTS (
        SELECT 1 FROM public.session_player_snapshots
         WHERE game_id = p_game_id
           AND dealer_game_id = p_dealer_game_id
           AND hand_number = p_hand_number
      ) INTO v_snap_exists;
      IF NOT v_snap_exists THEN
        INSERT INTO public.session_player_snapshots
          (game_id, dealer_game_id, player_id, user_id, username, chips, is_bot, hand_number)
        SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
               CASE WHEN p.is_bot THEN 'Bot ' || b.bot_index::text
                    ELSE COALESCE(pr.username, 'Unknown') END,
               p.chips, p.is_bot, p_hand_number
          FROM public.players p
          LEFT JOIN public.profiles pr ON pr.id = p.user_id
          LEFT JOIN (
            SELECT id, row_number() OVER (ORDER BY created_at, id) AS bot_index
              FROM public.players WHERE game_id = p_game_id AND is_bot = true
          ) b ON b.id = p.id
         WHERE p.game_id = p_game_id
         ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO NOTHING;
      END IF;
    END IF;

    v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;
  END IF;

  -- ── Game row ───────────────────────────────────────────────────────────
  -- NOTE on game_over_at: for the ORDINARY game_over path it is deliberately
  -- left NULL. It is the existing cross-game auto-proceed handshake (the
  -- dealer-confirm / celebration owner stamps it once the local presentation
  -- finishes, and the cron backstop stamps it if nobody is connected).
  -- Stamping it here would skip that handshake. On the session_ended path
  -- there is no handshake left to run, so it is stamped once via COALESCE.
  UPDATE public.games SET
    last_round_result   = p_last_round_result,
    awaiting_next_round = CASE WHEN v_end_game THEN false ELSE p_awaiting_next_round END,
    pot                 = CASE WHEN v_end_game THEN 0 ELSE p_pot_final END,
    buck_position       = CASE WHEN v_end_game THEN NULL ELSE buck_position END,
    status              = CASE WHEN v_end_game
                                 THEN (CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END)
                                 ELSE status END,
    game_over_at        = CASE WHEN v_end_game AND v_end_session THEN COALESCE(game_over_at, v_now) ELSE game_over_at END,
    session_ended_at    = CASE WHEN v_end_game AND v_end_session THEN COALESCE(session_ended_at, v_now) ELSE session_ended_at END,
    pending_session_end = CASE WHEN v_end_game AND v_end_session THEN false ELSE pending_session_end END
  WHERE id = p_game_id;

  -- ── Round row ──────────────────────────────────────────────────────────
  UPDATE public.rounds SET
    status                = CASE WHEN p_mark_round_completed THEN 'completed' ELSE status END,
    pot                   = COALESCE(p_round_pot, pot),
    chucky_active         = CASE WHEN p_clear_chucky_active THEN false ELSE chucky_active END,
    decision_deadline     = CASE WHEN p_mark_round_completed THEN NULL ELSE decision_deadline END,
    current_turn_position = CASE WHEN p_mark_round_completed THEN NULL ELSE current_turn_position END
  WHERE id = v_round.id;

  RETURN jsonb_build_object(
    'status','settled',
    'result_id',v_result_id,
    'hand_number',p_hand_number,
    'dealer_game_ended',v_end_game,
    'terminal_disposition',v_disposition
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
    RETURN jsonb_build_object(
      'status','already_settled','result_id',v_existing,
      'hand_number',p_hand_number,'dealer_game_ended',false,'terminal_disposition',NULL
    );
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_found:%/%', p_dealer_game_id, p_hand_number;
  WHEN TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'holm_settle_hand:round_identity_violation:%/%', p_dealer_game_id, p_hand_number;
END;
$function$;