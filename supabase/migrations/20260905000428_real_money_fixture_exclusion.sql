-- Fixture selection never changes a real-money outcome, deal or cut.
CREATE OR REPLACE FUNCTION public.holm_submit_decision_core(p_game_id uuid, p_player_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_harnesses_mode_enabled boolean := false;
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

  v_round := private.holm_authoritative_round(v_round);
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

  SELECT COALESCE((value ->> 'enabled')::boolean, false)
  INTO v_harnesses_mode_enabled
  FROM public.system_settings
  WHERE key = 'harnesses_mode'
  LIMIT 1;
  v_harnesses_mode_enabled := COALESCE(v_harnesses_mode_enabled, false) AND v_game.real_money IS FALSE;

  v_player_value := public.holm_best_hand_value(v_player_cards || v_community_cards);
  v_chucky_value := public.holm_best_hand_value(v_chucky_cards || v_community_cards);
  v_player_wins := CASE
    WHEN v_harnesses_mode_enabled
      AND v_forced_harness = 'force_player_beats_chucky' THEN true
    WHEN v_harnesses_mode_enabled
      AND v_forced_harness = 'force_chucky_beats_player' THEN false
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
      v_stayer.id, v_username, false, v_round_pot, true, v_round_pot, false, false
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
      NULL, 'Chucky Win', false, 0, true, v_round_pot + v_pot_match, false, false
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
$function$;

CREATE OR REPLACE FUNCTION private.cribbage_initial_state(p_game games, p_player_ids uuid[], p_dealer_id uuid, p_deck jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_player_count integer := cardinality(p_player_ids);
  v_cards_per_player integer := CASE WHEN cardinality(p_player_ids) = 2 THEN 6 ELSE 5 END;
  v_states jsonb := '{}'::jsonb;
  v_order jsonb := '[]'::jsonb;
  v_hand jsonb;
  v_offset integer := 0;
  v_player_id uuid;
  v_dealer_index integer;
  v_index integer;
  v_harness text;
  v_harness_enabled boolean := false;
  v_campaign_harness text;
  v_harness_target uuid;
  v_score integer;
  v_state jsonb;
  v_non_dealer_deal jsonb;
  v_dealer_deal jsonb;
BEGIN
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type = 'cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean, false) INTO v_harness_enabled
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode' LIMIT 1;
  v_campaign_harness := private.consume_cribbage_rule_branch_harness(p_game.id);
  IF v_campaign_harness IS NOT NULL THEN
    v_harness := v_campaign_harness;
    v_harness_enabled := true;
  END IF;
  v_harness_enabled := coalesce(v_harness_enabled,false) AND p_game.real_money IS FALSE;
  IF NOT v_harness_enabled THEN v_campaign_harness := NULL; END IF;
  SELECT participant.id
    INTO v_harness_target
    FROM public.players participant
   WHERE participant.game_id = p_game.id
     AND participant.id = ANY(p_player_ids)
   ORDER BY CASE WHEN participant.user_id = p_game.current_host THEN 0 ELSE 1 END,
            CASE WHEN coalesce(participant.is_bot, false) THEN 1 ELSE 0 END,
            participant.position,
            participant.id
   LIMIT 1;

  IF coalesce(v_harness_enabled, false)
     AND v_harness IN ('max_pegging_fan', 'perpetual_heels')
     AND v_player_count = 2
     AND (v_harness = 'max_pegging_fan' OR v_campaign_harness IS NOT NULL) THEN
    p_deck := jsonb_build_array(
      jsonb_build_object('rank','A','suit','spades','value',1),
      jsonb_build_object('rank','A','suit','hearts','value',1),
      jsonb_build_object('rank','2','suit','spades','value',2),
      jsonb_build_object('rank','2','suit','hearts','value',2),
      jsonb_build_object('rank','3','suit','spades','value',3),
      jsonb_build_object('rank','3','suit','hearts','value',3),
      jsonb_build_object('rank','A','suit','diamonds','value',1),
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','2','suit','diamonds','value',2),
      jsonb_build_object('rank','2','suit','clubs','value',2),
      jsonb_build_object('rank','3','suit','diamonds','value',3),
      jsonb_build_object('rank','3','suit','clubs','value',3)
    ) || p_deck;
  ELSIF coalesce(v_harness_enabled, false)
     AND v_harness = 'fifteen_run_go_counting'
     AND v_player_count = 2
     AND v_campaign_harness IS NOT NULL THEN
    v_non_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','spades','value',1),
      jsonb_build_object('rank','A','suit','hearts','value',1),
      jsonb_build_object('rank','5','suit','spades','value',5),
      jsonb_build_object('rank','6','suit','spades','value',6),
      jsonb_build_object('rank','9','suit','spades','value',9),
      jsonb_build_object('rank','7','suit','spades','value',7)
    );
    v_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','diamonds','value',1),
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','10','suit','hearts','value',10),
      jsonb_build_object('rank','10','suit','diamonds','value',10),
      jsonb_build_object('rank','8','suit','spades','value',8),
      jsonb_build_object('rank','J','suit','hearts','value',10)
    );
    p_deck := CASE WHEN p_player_ids[1] = p_dealer_id
      THEN v_dealer_deal || v_non_dealer_deal || p_deck
      ELSE v_non_dealer_deal || v_dealer_deal || p_deck END;
  ELSIF coalesce(v_harness_enabled, false)
     AND v_harness IN ('crib_flush_qualifying', 'crib_flush_nonqualifying')
     AND v_player_count = 2
     AND v_campaign_harness IS NOT NULL THEN
    v_non_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','2','suit','clubs','value',2),
      jsonb_build_object('rank','5','suit','spades','value',5),
      jsonb_build_object('rank','6','suit','hearts','value',6),
      jsonb_build_object('rank','8','suit','diamonds','value',8),
      jsonb_build_object('rank','10','suit','clubs','value',10)
    );
    v_dealer_deal := jsonb_build_array(
      jsonb_build_object('rank','3','suit','clubs','value',3),
      jsonb_build_object('rank','4','suit','clubs','value',4),
      jsonb_build_object('rank','7','suit','spades','value',7),
      jsonb_build_object('rank','9','suit','hearts','value',9),
      jsonb_build_object('rank','Q','suit','diamonds','value',10),
      jsonb_build_object('rank','K','suit','spades','value',10)
    );
    p_deck := CASE WHEN p_player_ids[1] = p_dealer_id
      THEN v_dealer_deal || v_non_dealer_deal || p_deck
      ELSE v_non_dealer_deal || v_dealer_deal || p_deck END;
  END IF;

  FOREACH v_player_id IN ARRAY p_player_ids LOOP
    SELECT coalesce(jsonb_agg(card.value ORDER BY card.ordinality), '[]'::jsonb)
      INTO v_hand
      FROM jsonb_array_elements(p_deck) WITH ORDINALITY card(value, ordinality)
     WHERE card.ordinality > v_offset
       AND card.ordinality <= v_offset + v_cards_per_player;
    v_offset := v_offset + v_cards_per_player;
    v_score := CASE WHEN coalesce(v_harness_enabled, false) AND v_harness = 'near_double_skunk'
                    THEN CASE WHEN v_player_id = v_harness_target THEN 119 ELSE 10 END
                    ELSE 0 END;
    v_states := jsonb_set(v_states, ARRAY[v_player_id::text], jsonb_build_object(
      'playerId', v_player_id,
      'hand', v_hand,
      'pegScore', v_score,
      'hasCalledGo', false,
      'discardedToCrib', '[]'::jsonb
    ), true);
  END LOOP;

  v_dealer_index := array_position(p_player_ids, p_dealer_id);
  FOR v_index IN 1..v_player_count LOOP
    v_order := v_order || jsonb_build_array(p_player_ids[((v_dealer_index - 1 + v_index) % v_player_count) + 1]);
  END LOOP;

  v_state := jsonb_build_object(
    'phase', 'discarding',
    'dealerPlayerId', p_dealer_id,
    'cribOwnerPlayerId', p_dealer_id,
    'playerStates', v_states,
    'turnOrder', v_order,
    'crib', '[]'::jsonb,
    'cutCard', NULL,
    'pegging', jsonb_build_object(
      'playedCards', '[]'::jsonb,
      'currentCount', 0,
      'eventSequence', 0,
      'currentTurnPlayerId', v_order->>0,
      'lastToPlay', NULL,
      'goCalledBy', '[]'::jsonb,
      'sequenceStartIndex', 0
    ),
    'anteAmount', coalesce(p_game.ante_amount, 1),
    'pot', 0,
    'pointsToWin', coalesce(p_game.points_to_win, 121),
    'skunkEnabled', coalesce(p_game.skunk_enabled, true),
    'skunkThreshold', coalesce(p_game.skunk_threshold, 91),
    'doubleSkunkEnabled', coalesce(p_game.double_skunk_enabled, true),
    'doubleSkunkThreshold', coalesce(p_game.double_skunk_threshold, 61),
    'lastEvent', NULL,
    'lastHandCount', NULL,
    'winnerPlayerId', NULL,
    'loserScore', NULL,
    'payoutMultiplier', 1,
    'dealerSelectionCohort', 0,
    'dealerResolved', true,
    'matchCompleteLatch', false
  );
  IF v_campaign_harness IS NOT NULL THEN
    v_state := jsonb_set(v_state, '{campaignHarnessProfile}', to_jsonb(v_campaign_harness), true);
  END IF;
  RETURN v_state;
END;
$function$;

CREATE OR REPLACE FUNCTION private.gin_deal_state(_game games, _dealer_id uuid, _nondealer_id uuid, _match_scores jsonb, _hand_number integer, _points_to_win integer, _ante_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_deck jsonb := private.gin_new_deck();
  v_dealer_hand jsonb;
  v_nondealer_hand jsonb;
  v_up_card jsonb;
  v_stock jsonb;
  v_discard jsonb;
  v_used jsonb;
  v_remaining jsonb;
  v_harness text := 'none';
  v_harness_enabled boolean := false;
  v_campaign_harness text;
  v_target_id uuid;
  v_target_hand jsonb;
  v_other_hand jsonb;
BEGIN
  SELECT coalesce(defaults.debug_harness,'none') INTO v_harness
    FROM public.game_defaults defaults WHERE defaults.game_type='gin-rummy' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled
    FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF NOT coalesce(v_harness_enabled,false) THEN v_harness := 'none'; END IF;
  IF v_harness='opponent_instant_knock' THEN v_harness:='non_dealer_near_knock'; END IF;

  v_campaign_harness := private.consume_gin_rule_branch_harness(_game.id);
  IF v_campaign_harness IS NOT NULL THEN
    v_harness := v_campaign_harness;
    v_harness_enabled := true;
  END IF;

  IF _game.real_money IS DISTINCT FROM false THEN
    v_harness := 'none'; v_harness_enabled := false; v_campaign_harness := NULL;
  END IF;

  IF v_harness IN ('non_dealer_near_knock', 'normal_knock_layoff') THEN
    v_nondealer_hand := jsonb_build_array(
      private.gin_card('3',chr(9830)),private.gin_card('4',chr(9830)),private.gin_card('5',chr(9830)),
      private.gin_card('9',chr(9824)),private.gin_card('9',chr(9829)),private.gin_card('9',chr(9830)),
      private.gin_card('2',chr(9827)),private.gin_card('3',chr(9827)),
      private.gin_card('A',chr(9824)),private.gin_card('K',chr(9829))
    );
    v_dealer_hand := jsonb_build_array(
      private.gin_card('2',chr(9830)),private.gin_card('A',chr(9827)),private.gin_card('9',chr(9827)),
      private.gin_card('7',chr(9829)),private.gin_card('8',chr(9829)),private.gin_card('J',chr(9824)),
      private.gin_card('Q',chr(9830)),private.gin_card('6',chr(9827)),private.gin_card('10',chr(9829)),
      private.gin_card('K',chr(9830))
    );
    v_up_card := private.gin_card('4',chr(9827));
    v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
    v_stock := private.gin_deck_without(v_used);
  ELSIF v_harness='undercut' THEN
    v_nondealer_hand := jsonb_build_array(
      private.gin_card('3',chr(9830)),private.gin_card('4',chr(9830)),private.gin_card('5',chr(9830)),
      private.gin_card('9',chr(9824)),private.gin_card('9',chr(9829)),private.gin_card('9',chr(9830)),
      private.gin_card('2',chr(9827)),private.gin_card('3',chr(9827)),
      private.gin_card('A',chr(9824)),private.gin_card('K',chr(9829))
    );
    v_dealer_hand := jsonb_build_array(
      private.gin_card('2',chr(9830)),
      private.gin_card('6',chr(9829)),private.gin_card('7',chr(9829)),private.gin_card('8',chr(9829)),
      private.gin_card('J',chr(9824)),private.gin_card('Q',chr(9824)),private.gin_card('K',chr(9824)),
      private.gin_card('5',chr(9827)),private.gin_card('5',chr(9829)),private.gin_card('5',chr(9824))
    );
    v_up_card := private.gin_card('4',chr(9827));
    v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
    v_stock := private.gin_deck_without(v_used);
  ELSIF v_harness IN ('near_gin', 'gin') THEN
    SELECT participant.id INTO v_target_id
      FROM public.players participant
     WHERE participant.game_id=_game.id
       AND participant.user_id=_game.current_host
       AND participant.id IN (_dealer_id,_nondealer_id)
       AND NOT coalesce(participant.is_bot,false)
     LIMIT 1;
    IF v_target_id IS NULL THEN
      SELECT participant.id INTO v_target_id
        FROM public.players participant
       WHERE participant.game_id=_game.id
         AND participant.id IN (_dealer_id,_nondealer_id)
       ORDER BY coalesce(participant.is_bot,false), participant.created_at, participant.position, participant.id
       LIMIT 1;
    END IF;
    IF v_target_id IS NOT NULL THEN
      v_target_hand := jsonb_build_array(
        private.gin_card('A',chr(9824)),private.gin_card('2',chr(9824)),private.gin_card('3',chr(9824)),
        private.gin_card('4',chr(9829)),private.gin_card('5',chr(9829)),private.gin_card('6',chr(9829)),
        private.gin_card('7',chr(9830)),private.gin_card('8',chr(9830)),private.gin_card('9',chr(9830)),
        private.gin_card('K',chr(9827))
      );
      v_other_hand := CASE WHEN v_harness='near_gin' THEN jsonb_build_array(
        private.gin_card('K',chr(9829)),private.gin_card('K',chr(9830)),private.gin_card('K',chr(9824)),
        private.gin_card('A',chr(9827)),private.gin_card('A',chr(9830)),private.gin_card('2',chr(9827)),
        private.gin_card('2',chr(9829)),private.gin_card('3',chr(9830)),private.gin_card('3',chr(9829)),
        private.gin_card('4',chr(9827))
      ) ELSE jsonb_build_array(
        private.gin_card('K',chr(9824)),private.gin_card('Q',chr(9829)),private.gin_card('J',chr(9827)),
        private.gin_card('10',chr(9824)),private.gin_card('8',chr(9827)),private.gin_card('7',chr(9824)),
        private.gin_card('6',chr(9827)),private.gin_card('5',chr(9830)),private.gin_card('3',chr(9829)),
        private.gin_card('2',chr(9827))
      ) END;
      v_dealer_hand := CASE WHEN v_target_id=_dealer_id THEN v_target_hand ELSE v_other_hand END;
      v_nondealer_hand := CASE WHEN v_target_id=_nondealer_id THEN v_target_hand ELSE v_other_hand END;
      v_up_card := private.gin_card('10',chr(9830));
      v_used := v_nondealer_hand || v_dealer_hand || jsonb_build_array(v_up_card);
      v_stock := private.gin_deck_without(v_used);
    END IF;
  ELSIF v_harness='stock_two_void' THEN
    v_nondealer_hand := jsonb_build_array(
      private.gin_card('3',chr(9830)),private.gin_card('4',chr(9830)),private.gin_card('5',chr(9830)),
      private.gin_card('9',chr(9824)),private.gin_card('9',chr(9829)),private.gin_card('9',chr(9830)),
      private.gin_card('2',chr(9827)),private.gin_card('3',chr(9827)),
      private.gin_card('A',chr(9824)),private.gin_card('K',chr(9829))
    );
    v_dealer_hand := jsonb_build_array(
      private.gin_card('2',chr(9830)),private.gin_card('A',chr(9827)),private.gin_card('9',chr(9827)),
      private.gin_card('7',chr(9829)),private.gin_card('8',chr(9829)),private.gin_card('J',chr(9824)),
      private.gin_card('Q',chr(9830)),private.gin_card('6',chr(9827)),private.gin_card('10',chr(9829)),
      private.gin_card('K',chr(9830))
    );
    v_used := v_nondealer_hand || v_dealer_hand;
    v_remaining := private.gin_deck_without(v_used);
    SELECT
      jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality <= 3),
      jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality > 3)
      INTO v_stock, v_discard
      FROM jsonb_array_elements(v_remaining) WITH ORDINALITY card(value, ordinality);
    v_up_card := v_discard->(jsonb_array_length(v_discard)-1);
  END IF;

  IF v_dealer_hand IS NULL THEN
    SELECT jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 1 AND 10),
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality BETWEEN 11 AND 20),
           (jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality=21))->0,
           jsonb_agg(card.value ORDER BY card.ordinality) FILTER (WHERE card.ordinality>21)
      INTO v_nondealer_hand,v_dealer_hand,v_up_card,v_stock
      FROM jsonb_array_elements(v_deck) WITH ORDINALITY card(value,ordinality);
  END IF;
  v_discard := coalesce(v_discard, jsonb_build_array(v_up_card));

  RETURN jsonb_build_object(
    'phase','first_draw',
    'dealerPlayerId',_dealer_id,
    'nonDealerPlayerId',_nondealer_id,
    'playerStates',jsonb_build_object(
      _dealer_id::text,jsonb_build_object('playerId',_dealer_id,'hand',v_dealer_hand,'melds','[]'::jsonb,'deadwood','[]'::jsonb,'deadwoodValue',0,'hasKnocked',false,'hasGin',false,'laidOffCards','[]'::jsonb),
      _nondealer_id::text,jsonb_build_object('playerId',_nondealer_id,'hand',v_nondealer_hand,'melds','[]'::jsonb,'deadwood','[]'::jsonb,'deadwoodValue',0,'hasKnocked',false,'hasGin',false,'laidOffCards','[]'::jsonb)
    ),
    'turnOrder',jsonb_build_array(_nondealer_id,_dealer_id),
    'stockPile',coalesce(v_stock,'[]'::jsonb),
    'discardPile',v_discard,
    'currentTurnPlayerId',_nondealer_id,
    'turnPhase','draw',
    'drawSource',NULL,
    'firstDrawOfferedTo',_nondealer_id,
    'firstDrawPassed','[]'::jsonb,
    'anteAmount',_ante_amount,
    'pot',0,
    'pointsToWin',_points_to_win,
    'matchScores',coalesce(_match_scores,jsonb_build_object(_dealer_id::text,0,_nondealer_id::text,0)),
    'knockResult',NULL,
    'actionCount',0,
    'handNumber',_hand_number,
    'lastAction',NULL,
    'winnerPlayerId',NULL,
    'botActionDueAt',to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.cribbage_finish_discard(p_state jsonb, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_state jsonb:=p_state;
  v_used jsonb := '[]'::jsonb;
  v_available jsonb;
  v_cut jsonb;
  v_player_id text;
  v_score integer;
  v_low integer;
  v_multiplier integer:=1;
  v_harness text;
  v_harness_enabled boolean:=false;
  v_campaign_harness text:=nullif(p_state->>'campaignHarnessProfile','');
BEGIN
  FOR v_player_id IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP
    v_used:=v_used||coalesce(v_state->'playerStates'->v_player_id->'hand','[]'::jsonb)||coalesce(v_state->'playerStates'->v_player_id->'discardedToCrib','[]'::jsonb);
  END LOOP;
  SELECT coalesce(jsonb_agg(card), '[]'::jsonb) INTO v_available FROM jsonb_array_elements(private.cribbage_new_deck()) card
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_used) used WHERE used->>'rank'=card->>'rank' AND used->>'suit'=card->>'suit');
  SELECT defaults.debug_harness INTO v_harness FROM public.game_defaults defaults WHERE defaults.game_type='cribbage' LIMIT 1;
  SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_harness_enabled FROM public.system_settings setting WHERE setting.key='harnesses_mode' LIMIT 1;
  IF v_campaign_harness IS NOT NULL THEN v_harness:=v_campaign_harness; v_harness_enabled:=true; END IF;
  v_harness_enabled := coalesce(v_harness_enabled,false) AND EXISTS(
    SELECT 1 FROM public.games WHERE id=p_game_id AND real_money IS FALSE);
  IF coalesce(v_harness_enabled,false) AND v_harness='max_pegging_fan' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='spades' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='perpetual_heels' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='J' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='fifteen_run_go_counting' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='4' AND card->>'suit'='hearts' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_qualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='clubs' LIMIT 1;
  ELSIF coalesce(v_harness_enabled,false) AND v_harness='crib_flush_nonqualifying' THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card WHERE card->>'rank'='5' AND card->>'suit'='hearts' LIMIT 1; END IF;
  IF v_cut IS NULL THEN SELECT card INTO v_cut FROM jsonb_array_elements(v_available) card ORDER BY random() LIMIT 1; END IF;
  v_state:=jsonb_set(v_state,'{cutCard}',v_cut,true);
  v_state:=jsonb_set(v_state,'{phase}','"pegging"'::jsonb,true);
  v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',to_jsonb(v_state->'turnOrder'->>0),true);
  IF v_cut->>'rank'='J' THEN
    v_player_id:=v_state->>'dealerPlayerId';
    v_score:=coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)+2;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id,'pegScore'],to_jsonb(v_score),true);
    v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','his_heels','playerId',v_player_id,'points',2,'label','His Heels','createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN
      SELECT min(coalesce((value->>'pegScore')::integer,0)) INTO v_low FROM jsonb_each(v_state->'playerStates') WHERE key<>v_player_id;
      IF coalesce((v_state->>'doubleSkunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'doubleSkunkThreshold')::integer,61) THEN v_multiplier:=3;
      ELSIF coalesce((v_state->>'skunkEnabled')::boolean,false) AND v_low<coalesce((v_state->>'skunkThreshold')::integer,91) THEN v_multiplier:=2; END IF;
      v_state:=jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{winnerPlayerId}',to_jsonb(v_player_id),true);
      v_state:=jsonb_set(v_state,'{loserScore}',to_jsonb(v_low),true);
      v_state:=jsonb_set(v_state,'{payoutMultiplier}',to_jsonb(v_multiplier),true);
      v_state:=jsonb_set(v_state,'{matchCompleteLatch}','true'::jsonb,true);
    END IF;
  END IF;
  RETURN v_state;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cribbage_apply_discard(_round_id uuid, _player_id uuid, _card_indices integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE; v_state jsonb; v_player public.players%ROWTYPE; v_ps jsonb; v_hand jsonb;
  v_discard jsonb:='[]'::jsonb; v_remaining jsonb:='[]'::jsonb; v_i integer; v_expected integer; v_count integer; v_all boolean:=true; v_key text;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_apply_discard:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_apply_discard:round_not_found'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_in_session'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=_player_id AND game_id=v_round.game_id;
  IF NOT FOUND OR (NOT v_service AND NOT coalesce(v_player.is_bot,false) AND v_player.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_player_owner'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'discarding' THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  v_ps:=v_state->'playerStates'->_player_id::text;
  IF jsonb_array_length(coalesce(v_ps->'discardedToCrib','[]'::jsonb))>0 THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates'); v_expected:=CASE WHEN v_count=2 THEN 2 ELSE 1 END;
  IF cardinality(_card_indices) IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_count'; END IF;
  v_hand:=coalesce(v_ps->'hand','[]'::jsonb);
  FOR v_i IN 0..jsonb_array_length(v_hand)-1 LOOP IF v_i=ANY(_card_indices) THEN v_discard:=v_discard||jsonb_build_array(v_hand->v_i); ELSE v_remaining:=v_remaining||jsonb_build_array(v_hand->v_i); END IF; END LOOP;
  IF jsonb_array_length(v_discard)<>v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_indices'; END IF;
  v_ps:=jsonb_set(v_ps,'{hand}',v_remaining,true); v_ps:=jsonb_set(v_ps,'{discardedToCrib}',v_discard,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
  v_state:=jsonb_set(v_state,'{crib}',coalesce(v_state->'crib','[]'::jsonb)||v_discard,true);
  FOR v_key IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP IF jsonb_array_length(coalesce(v_state->'playerStates'->v_key->'discardedToCrib','[]'::jsonb))<>v_expected THEN v_all:=false; EXIT; END IF; END LOOP;
  IF v_all THEN v_state:=private.cribbage_finish_discard(v_state,v_round.game_id); END IF;
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.cribbage_reconcile_discard_transition(_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_round public.rounds%ROWTYPE; v_state jsonb; v_count integer; v_expected integer; v_all boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'cribbage_reconcile_discard_transition:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_reconcile_discard_transition:not_in_session'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='discarding' THEN
    SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates'); v_expected:=CASE WHEN v_count=2 THEN 2 ELSE 1 END;
    SELECT bool_and(jsonb_array_length(coalesce(value->'discardedToCrib','[]'::jsonb))=v_expected) INTO v_all FROM jsonb_each(v_state->'playerStates');
    IF coalesce(v_all,false) AND jsonb_array_length(v_state->'crib')=v_count*v_expected THEN v_state:=private.cribbage_finish_discard(v_state,v_round.game_id); PERFORM private.cribbage_publish_state(_round_id,v_state); END IF;
  END IF;
  RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION private.cribbage_finish_discard(jsonb,uuid) FROM PUBLIC,anon,authenticated;
DROP FUNCTION private.cribbage_finish_discard(jsonb);
NOTIFY pgrst,'reload schema';
