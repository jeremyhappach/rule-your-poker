-- Keep the exact-game Gin outcome fixture deterministic when the session host
-- pointer is temporarily null or no longer resolves to one of the two players.
-- This mirrors the canonical harness-host rule: explicit human host first,
-- otherwise earliest human, then earliest remaining participant.

CREATE OR REPLACE FUNCTION private.gin_deal_state(
  _game public.games,
  _dealer_id uuid,
  _nondealer_id uuid,
  _match_scores jsonb,
  _hand_number integer,
  _points_to_win integer,
  _ante_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
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
$$;

REVOKE ALL ON FUNCTION private.gin_deal_state(public.games,uuid,uuid,jsonb,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.gin_deal_state(public.games,uuid,uuid,jsonb,integer,integer,integer) IS
  'Authoritative Gin deal with exact-game fixture consumption and canonical human-host fallback.';
