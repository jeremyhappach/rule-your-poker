CREATE OR REPLACE FUNCTION private.complete_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_winner_position integer;
  v_prepared_at timestamptz;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'private.complete_session_dealer_selection'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  BEGIN
    v_winner_position := nullif(v_game.dealer_selection_state->>'winnerPosition','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_winner';
  END;
  IF v_winner_position IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','not_prepared');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  BEGIN
    v_prepared_at:=nullif(v_game.dealer_selection_state->>'preparedAt','')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_prepared_at';
  END;
  IF v_prepared_at IS NULL OR v_prepared_at+interval '3 seconds'>clock_timestamp() THEN
    v_replay_return := jsonb_build_object(
      'outcome','presentation_pending','prepared_at',v_prepared_at
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.position = v_winner_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  ) THEN
    v_replay_return := jsonb_build_object('outcome','winner_ineligible');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  v_deadline := clock_timestamp() + make_interval(
    secs => greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
  );
  UPDATE public.games
     SET status = 'game_selection',
         dealer_position = v_winner_position,
         config_complete = false,
         config_deadline = v_deadline,
         current_game_uuid = NULL
   WHERE id = p_game_id;
  v_replay_return := jsonb_build_object(
    'outcome','advanced','status','game_selection',
    'dealer_position',v_winner_position,'config_deadline',v_deadline
  );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.finalize_settled_session_if_no_active_humans(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return text;
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_result_count integer := 0;
  v_snapshot_count integer := 0;
  v_missing_or_stale_snapshot boolean := false;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'private.finalize_settled_session_if_no_active_humans'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := 'missing-game';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF NOT COALESCE(v_game.real_money, false) THEN
    v_replay_return := 'ineligible-state';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := 'already-session-ended';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    v_replay_return := 'active-humans';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT count(*) INTO v_result_count
    FROM public.game_results
   WHERE game_id = p_game_id;

  IF v_result_count = 0 THEN
    v_replay_return := 'no-settled-results';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT count(DISTINCT user_id) INTO v_snapshot_count
    FROM public.session_player_snapshots
   WHERE game_id = p_game_id
     AND is_bot = false;

  SELECT EXISTS (
    SELECT 1
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.is_bot = false
       AND player.status <> 'observer'
       AND NOT EXISTS (
         SELECT 1
           FROM (
             SELECT DISTINCT ON (snapshot.user_id)
                    snapshot.user_id,
                    snapshot.chips
               FROM public.session_player_snapshots AS snapshot
              WHERE snapshot.game_id = p_game_id
                AND snapshot.is_bot = false
              ORDER BY snapshot.user_id, snapshot.created_at DESC, snapshot.id DESC
           ) AS latest
          WHERE latest.user_id = player.user_id
            AND latest.chips = player.chips
       )
  ) INTO v_missing_or_stale_snapshot;

  IF v_snapshot_count = 0 OR v_missing_or_stale_snapshot THEN
    v_replay_return := 'blocked-incomplete-final-snapshots';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  -- The existing games-status trigger mints SessionResult rows from the
  -- already-final snapshots. Its unique key keeps a repeated call idempotent.
  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;

  v_replay_return := 'session-ended-with-results';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.prepare_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_allow_bot boolean := false;
  v_remaining uuid[];
  v_winners uuid[];
  v_player_id uuid;
  v_position integer;
  v_deck jsonb;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_round integer := 0;
  v_deck_index integer := 0;
  v_rank_value integer;
  v_highest integer;
  v_prepared_at timestamptz := clock_timestamp();
  v_winner_position integer;
  v_state jsonb;
  v_harness_value jsonb;
  v_harness_expires_at timestamptz;
  v_harness_applied boolean := false;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'private.prepare_session_dealer_selection'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF coalesce((v_game.dealer_selection_state->>'isComplete')::boolean,false)
     AND (v_game.dealer_selection_state->>'winnerPosition') IS NOT NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome','already_prepared','state',v_game.dealer_selection_state
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm')
   LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);

  SELECT array_agg(player.id ORDER BY player.position)
    INTO v_remaining
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false));

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    SELECT array_agg(player.id ORDER BY player.position)
      INTO v_remaining
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND NOT coalesce(player.sitting_out,false)
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left');
  END IF;

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    v_replay_return := jsonb_build_object('outcome','no_eligible_players');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  -- Lock the single request before testing it. A second concurrent dealer draw
  -- sees the consumed value after this transaction commits, so the fixture can
  -- never leak into two sessions.
  SELECT setting.value
    INTO v_harness_value
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness'
   FOR UPDATE;

  BEGIN
    v_harness_expires_at := nullif(v_harness_value->>'expiresAt', '')::timestamptz;
    v_harness_applied := cardinality(v_remaining) > 1
      AND coalesce((v_harness_value->>'armed')::boolean, false)
      AND nullif(v_harness_value->>'armedBy', '')::uuid = v_game.current_host
      AND v_harness_expires_at > clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN
    v_harness_applied := false;
  END;

  IF v_harness_applied THEN
    -- First two seats receive equal aces; every other eligible seat receives a
    -- lower unique card. The tied seats then receive K/Q, guaranteeing a real
    -- second draw with one winner while preserving deck uniqueness.
    WITH all_cards AS (
      SELECT rank, suit,
        CASE rank
          WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
          ELSE rank::integer
        END AS rank_value
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit
    ), first_round_fill AS (
      SELECT row_number() OVER (ORDER BY card.rank_value DESC, card.suit) + 2 AS sequence,
             card.rank,
             card.suit
        FROM all_cards card
       WHERE card.rank_value <= 11
       ORDER BY card.rank_value DESC, card.suit
       LIMIT greatest(cardinality(v_remaining) - 2, 0)
    ), forced_cards AS (
      SELECT 1::bigint AS sequence, 'A'::text AS rank, '♠'::text AS suit
      UNION ALL SELECT 2, 'A', '♥'
      UNION ALL SELECT fill.sequence, fill.rank, fill.suit FROM first_round_fill fill
      UNION ALL SELECT cardinality(v_remaining) + 1, 'K', '♠'
      UNION ALL SELECT cardinality(v_remaining) + 2, 'Q', '♠'
    ), remaining_cards AS (
      SELECT card.rank, card.suit, private.secure_shuffle_key() AS random_order
        FROM all_cards card
       WHERE NOT EXISTS (
         SELECT 1 FROM forced_cards forced
          WHERE forced.rank = card.rank AND forced.suit = card.suit
       )
    ), ordered_cards AS (
      SELECT 0 AS section, forced.sequence::double precision AS sequence,
             forced.rank, forced.suit
        FROM forced_cards forced
      UNION ALL
      SELECT 1, remaining.random_order, remaining.rank, remaining.suit
        FROM remaining_cards remaining
    )
    SELECT jsonb_agg(
             jsonb_build_object('rank', deck.rank, 'suit', deck.suit)
             ORDER BY deck.section, deck.sequence
           )
      INTO v_deck
      FROM ordered_cards deck;

    UPDATE public.system_settings
       SET value = v_harness_value || jsonb_build_object(
             'armed', false,
             'consumedAt', clock_timestamp(),
             'consumedGameId', p_game_id
           ),
           updated_at = clock_timestamp()
     WHERE key = 'session_dealer_draw_tie_harness';
  ELSE
    SELECT jsonb_agg(
             jsonb_build_object('rank',rank,'suit',suit)
             ORDER BY private.secure_shuffle_key()
           )
      INTO v_deck
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit;
  END IF;

  WHILE cardinality(v_remaining) > 1 LOOP
    v_round := v_round + 1;
    v_highest := 0;
    v_winners := ARRAY[]::uuid[];
    FOREACH v_player_id IN ARRAY v_remaining LOOP
      v_card := v_deck -> v_deck_index;
      v_deck_index := v_deck_index + 1;
      SELECT player.position INTO v_position
        FROM public.players player WHERE player.id = v_player_id;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_highest THEN
        v_highest := v_rank_value;
        v_winners := ARRAY[v_player_id];
      ELSIF v_rank_value = v_highest THEN
        v_winners := array_append(v_winners,v_player_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId',v_player_id,'position',v_position,'card',v_card,
        'isRevealed',true,'isWinner',false,'isDimmed',false,
        'roundNumber',v_round
      ));
    END LOOP;

    SELECT coalesce(jsonb_agg(
      CASE WHEN (entry.value->>'roundNumber')::integer = v_round THEN
        entry.value || jsonb_build_object(
          'isWinner',(entry.value->>'playerId')::uuid = ANY(v_winners),
          'isDimmed',NOT ((entry.value->>'playerId')::uuid = ANY(v_winners))
        ) ELSE entry.value END
      ORDER BY entry.ordinality
    ),'[]'::jsonb) INTO v_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS entry(value,ordinality);

    IF v_replay_shared IS NOT NULL THEN
      v_replay_shared:=jsonb_set(v_replay_shared,'{dealerDrawRounds}',coalesce(v_replay_shared->'dealerDrawRounds','[]')||jsonb_build_array(v_cards));
    END IF;
    v_remaining := v_winners;
  END LOOP;

  v_player_id := v_remaining[1];
  SELECT player.position INTO v_winner_position
    FROM public.players player WHERE player.id = v_player_id;

  IF jsonb_array_length(v_cards) = 0 THEN
    v_state := jsonb_build_object(
      'cards','[]'::jsonb,
      'announcement','Only eligible player wins the deal',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
  ELSE
    v_state := jsonb_build_object(
      'cards',v_cards,
      'announcement','Seat ' || v_winner_position::text || ' wins the deal!',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
    IF v_harness_applied THEN
      v_state := v_state || jsonb_build_object(
        'harnessApplied', 'force_first_round_tie_once'
      );
    END IF;
  END IF;

  UPDATE public.games
     SET dealer_selection_state = v_state
   WHERE id = p_game_id;

  PERFORM private.register_game_timer(
    p_game_id, 'dealer_selection_complete', p_timer_generation::text,
    'canonical_timers', v_prepared_at + interval '3 seconds',
    NULL, NULL, NULL, v_player_id, 'dealer_selection',
    jsonb_build_object(
      'timer_generation',p_timer_generation,
      'winner_position',v_winner_position,
      'prepared_at',v_prepared_at
    )
  );

  v_replay_return := jsonb_build_object('outcome','prepared','state',v_state);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.request_session_end(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; ctx text; prior jsonb:='{}'; target text; terminal_key text; settled boolean:=false; result jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'private.request_session_end'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF g.status IN ('session_ended','completed') THEN
 v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','session_ended','already_terminal',true);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF g.status='game_over' THEN
  terminal_key:=CASE g.game_type WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN '3-5-7-game' THEN 'three_five_seven_terminal'
   WHEN '357' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal'
   WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  SELECT coalesce(g.pot,0)=0 AND EXISTS(SELECT 1 FROM public.game_results r WHERE r.game_id=g.id
   AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands
   AND ((g.game_type IN ('holm','holm-game') AND r.event_kind='chucky_final_award') OR r.settlement_key=terminal_key))
   INTO settled;
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF (g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0 AND g.status IN ('waiting','dealer_selection','game_selection','configuring')) OR settled THEN
  IF g.real_money IS FALSE AND g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0
   AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND chips<>0)
   AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g.id) THEN
   DELETE FROM public.games WHERE id=g.id; target:='deleted';
  ELSE
   UPDATE public.games SET status='session_ended',session_ended_at=coalesce(session_ended_at,clock_timestamp()),
    pending_session_end=false,config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=g.id;
   target:='session_ended';
  END IF;
 ELSE
  -- Rule engines consume the request at their financial completion boundary.
  UPDATE public.games SET pending_session_end=true WHERE id=g.id;
  target:='pending_session_end';
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition',target,'already_terminal',false);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.begin_session_dealer_selection(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_host public.players%ROWTYPE;
  v_other public.players%ROWTYPE;
  v_occupant public.players%ROWTYPE;
  v_eligible_count integer := 0;
  v_target_position integer;
  v_old_other_position integer;
  v_new_dealer_position integer;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF NOT v_service AND auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'public.begin_session_dealer_selection'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  IF v_game.status = 'dealer_selection' THEN
    v_replay_return := jsonb_build_object('outcome','already_started','status',v_game.status,'timer_generation',v_game.timer_generation,'dealer_selection_state',v_game.dealer_selection_state);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF v_game.status <> 'waiting' THEN
    v_replay_return := jsonb_build_object('outcome','not_startable','status',v_game.status);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  PERFORM 1 FROM public.players player WHERE player.game_id = p_game_id FOR UPDATE;
  SELECT count(*) INTO v_eligible_count
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false));
  IF v_eligible_count < 2 THEN
    v_replay_return := jsonb_build_object('outcome','not_ready','eligible_players',v_eligible_count);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  SELECT player.* INTO v_host
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     AND NOT coalesce(player.is_bot,false)
   ORDER BY CASE WHEN player.user_id = v_game.current_host THEN 0 ELSE 1 END,
            player.created_at NULLS LAST, player.id
   LIMIT 1;
  IF NOT FOUND THEN
    SELECT player.* INTO v_host
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     ORDER BY player.created_at NULLS LAST, player.id
     LIMIT 1;
  END IF;
  IF NOT v_service AND v_host.user_id IS DISTINCT FROM auth.uid() THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF v_eligible_count = 2 THEN
    SELECT player.* INTO v_other
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.id <> v_host.id
       AND player.position IS NOT NULL AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     LIMIT 1;
    v_target_position := ((v_host.position - 1 + 3) % 7) + 1;
    v_old_other_position := v_other.position;
    IF least(abs(v_host.position - v_other.position),7 - abs(v_host.position - v_other.position)) <> 3 THEN
      SELECT player.* INTO v_occupant FROM public.players player
       WHERE player.game_id = p_game_id AND player.id <> v_other.id
         AND player.position = v_target_position LIMIT 1;
      IF FOUND THEN UPDATE public.players SET position = NULL WHERE id = v_occupant.id; END IF;
      UPDATE public.players SET position = v_target_position WHERE id = v_other.id;
      IF v_occupant.id IS NOT NULL THEN
        UPDATE public.players SET position = v_old_other_position WHERE id = v_occupant.id;
      END IF;
      v_new_dealer_position := v_game.dealer_position;
      IF v_new_dealer_position = v_old_other_position THEN
        v_new_dealer_position := v_target_position;
      ELSIF v_occupant.id IS NOT NULL AND v_new_dealer_position = v_target_position THEN
        v_new_dealer_position := v_old_other_position;
      END IF;
      IF v_new_dealer_position IS DISTINCT FROM v_game.dealer_position THEN
        UPDATE public.games SET dealer_position = v_new_dealer_position WHERE id = p_game_id;
      END IF;
    END IF;
  END IF;
  UPDATE public.players SET status = 'active', sitting_out = false, waiting = false
   WHERE game_id = p_game_id AND position IS NOT NULL AND status NOT IN ('observer','left')
     AND (coalesce(waiting,false) OR NOT coalesce(sitting_out,false));
  UPDATE public.games
     SET status = 'dealer_selection', dealer_selection_state = NULL, current_game_uuid = NULL,
         config_deadline = NULL, config_complete = false, awaiting_next_round = false, last_round_result = NULL
   WHERE id = p_game_id
   RETURNING * INTO v_game;
  v_replay_return := jsonb_build_object('outcome','started','status',v_game.status,'timer_generation',v_game.timer_generation);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_session_bot(_game_id uuid, _bot_id uuid, _aggression_level text, _position integer, _sitting_out boolean DEFAULT false, _waiting boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
 _next integer; _name text; _suffix text; _player public.players;
 _game public.games; _actor uuid:=auth.uid();
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'create_session_bot:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO _game FROM public.games WHERE id=_game_id FOR UPDATE;
 IF FOUND THEN
  IF _game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(_game.id,'public.create_session_bot'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'create_session_bot:game_not_found'; END IF;
 IF _game.current_host IS DISTINCT FROM _actor AND NOT public.has_role(_actor,'admin'::public.app_role) THEN
   RAISE EXCEPTION 'create_session_bot:host_required' USING ERRCODE='42501';
 END IF;
 IF _game.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'create_session_bot:fake_money_only' USING ERRCODE='42501'; END IF;
 IF _game.status IN ('completed','session_ended','game_over') THEN RAISE EXCEPTION 'create_session_bot:terminal_game'; END IF;
 IF _bot_id IS NULL OR _position IS NULL OR _position NOT BETWEEN 1 AND 7
    OR coalesce(_aggression_level,'normal') NOT IN ('very_conservative','conservative','normal','aggressive','very_aggressive') THEN
   RAISE EXCEPTION 'create_session_bot:invalid_request';
 END IF;
 -- The caller's UUID is an operation identity, never a replacement identity.
 SELECT * INTO _player FROM public.players WHERE game_id=_game_id AND user_id=_bot_id;
 IF FOUND THEN
   IF NOT _player.is_bot THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
   SELECT username INTO _name FROM public.profiles WHERE id=_bot_id;
   SELECT (event_data->>'bot_alias_ordinal')::integer INTO _next FROM public.session_events
    WHERE game_id=_game_id AND event_type='bot_added' AND event_data->>'bot_id'=_bot_id::text LIMIT 1;
   v_replay_return := jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',true);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('_game_id',_game_id,'_bot_id',_bot_id,'_aggression_level',_aggression_level,'_position',_position,'_sitting_out',_sitting_out,'_waiting',_waiting,'_actor_user_id',_actor_user_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_bot_id) THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=_game_id AND position=_position) THEN
   RAISE EXCEPTION 'Seat % is already occupied',_position;
 END IF;
 _next:=public.allocate_bot_alias_number(_game_id);
 _name:='Bot '||_next::text;
 _suffix:=substr(replace(_bot_id::text,'-',''),1,6);
 IF EXISTS(SELECT 1 FROM public.profiles WHERE username=_name) THEN _name:=_name||'-'||_suffix; END IF;
 INSERT INTO public.profiles(id,username,aggression_level)
 VALUES(_bot_id,_name,coalesce(_aggression_level,'normal'));
 INSERT INTO public.players(user_id,game_id,position,chips,is_bot,status,sitting_out,waiting)
 VALUES(_bot_id,_game_id,_position,0,true,'active',
   _game.status='in_progress' OR coalesce(_sitting_out,false),
   _game.status='in_progress' OR coalesce(_waiting,false))
 RETURNING * INTO _player;
 INSERT INTO public.session_events(game_id,event_type,event_data,user_id)
 VALUES(_game_id,'bot_added',jsonb_build_object('position',_position,'bot_username',_name,
   'bot_alias_ordinal',_next,'bot_id',_bot_id),_actor);
 v_replay_return := jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',false);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('_game_id',_game_id,'_bot_id',_bot_id,'_aggression_level',_aggression_level,'_position',_position,'_sitting_out',_sitting_out,'_waiting',_waiting,'_actor_user_id',_actor_user_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_session_end(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; fallback_host uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_end:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.request_session_end'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 SELECT user_id INTO fallback_host FROM public.players WHERE game_id=g.id AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL ORDER BY created_at,id LIMIT 1;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 coalesce(g.current_host,fallback_host) IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL)
 AND NOT (g.current_host=auth.uid() AND g.status='waiting' AND g.current_game_uuid IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id))) THEN
 RAISE EXCEPTION 'session_end:not_session_host' USING ERRCODE='42501'; END IF;
 IF g.status IN ('session_ended','completed') THEN v_replay_return := private.request_session_end(g.id);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.timer_generation IS DISTINCT FROM p_expected_timer_generation THEN
 v_replay_return := jsonb_build_object('request_recorded',false,'outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 v_replay_return := private.request_session_end(g.id);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.session_leave(p_game_id uuid, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  g public.games%ROWTYPE; p public.players%ROWTYPE; result jsonb;
  keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write',
    'app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  prior text[]:=ARRAY[]::text[]; i integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.session_leave'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing-game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  SELECT * INTO p FROM public.players
    WHERE id=p_player_id AND game_id=p_game_id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  IF g.status IN ('session_ended','completed') THEN
    v_replay_return := jsonb_build_object('outcome','already-session-ended');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF p.participation_version IS DISTINCT FROM p_expected_version THEN
    v_replay_return := jsonb_build_object('outcome','stale-participation');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  IF p.status='left' THEN v_replay_return := jsonb_build_object('outcome','already-left');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  -- A mid-hand departure is not a settled hand. Never occupy its financial snapshot key.
  IF g.current_game_uuid IS NOT NULL OR coalesce(g.total_hands,0)>0 OR p.chips<>0 THEN
    INSERT INTO private.session_departures
      (game_id,player_id,participation_version,user_id,dealer_game_id,hand_number,position,chips)
    VALUES(g.id,p.id,p.participation_version,p.user_id,g.current_game_uuid,coalesce(g.total_hands,0),p.position,p.chips)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR i IN 1..cardinality(keys) LOOP
    prior:=array_append(prior,coalesce(current_setting(keys[i],true),''));
    PERFORM set_config(keys[i],'on',true);
  END LOOP;
  result:=private.stand_up_and_resolve_postgame(p_game_id);
  FOR i IN 1..cardinality(keys) LOOP PERFORM set_config(keys[i],prior[i],true); END LOOP;
  v_replay_return := result;
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.session_take_seat(p_game_id uuid, p_position integer, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  g public.games%ROWTYPE; p public.players%ROWTYPE; occupant public.players%ROWTYPE;
  in_play boolean; waiting_room boolean; v_deck text; v_prior_357 text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active
  ) THEN RAISE EXCEPTION 'session_take_seat:not_authorized' USING ERRCODE='42501'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'session_take_seat:invalid_seat';
  END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.session_take_seat'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing-game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
  IF g.status IN ('session_ended','completed') THEN
    v_replay_return := jsonb_build_object('outcome','already-session-ended');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF p.id IS DISTINCT FROM p_player_id OR (p.id IS NOT NULL AND p.participation_version IS DISTINCT FROM p_expected_version) THEN
    v_replay_return := jsonb_build_object('outcome','stale-participation');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;
  in_play:=g.status NOT IN ('waiting','waiting_for_players','dealer_selection','game_selection','configuring','ante_decision');
  waiting_room:=g.status IN ('waiting','waiting_for_players');
  IF in_play AND p.id IS NOT NULL AND p.status NOT IN ('left','observer') AND p.position IS DISTINCT FROM p_position THEN
    RAISE EXCEPTION 'session_take_seat:seat_locked_during_game';
  END IF;
  SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=p_position AND id IS DISTINCT FROM p.id FOR UPDATE;
  IF occupant.id IS NOT NULL THEN
    -- Preserve an in-flight participant's seat identity through settlement.
    IF occupant.status NOT IN ('left','observer') OR in_play THEN
      RAISE EXCEPTION 'session_take_seat:seat_occupied';
    END IF;
    UPDATE public.players SET position=NULL WHERE id=occupant.id;
  END IF;
  IF p.id IS NULL THEN
    IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND EXISTS(
      SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true'
    ) THEN RAISE EXCEPTION 'session_take_seat:maintenance' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=auth.uid()) THEN
      RAISE EXCEPTION 'session_take_seat:missing_historical_participant';
    END IF;
    SELECT deck_color_mode INTO v_deck FROM public.profiles WHERE id=auth.uid();
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
    VALUES(g.id,auth.uid(),p_position,0,'active',in_play,waiting_room OR in_play,v_deck)
    RETURNING * INTO p;
  ELSIF p.status IN ('left','observer') OR p.position IS NULL THEN
    UPDATE public.players SET position=p_position,status='active',sitting_out=in_play,
      waiting=waiting_room OR in_play,ante_decision=NULL,stand_up_next_hand=false,sit_out_next_hand=false
    WHERE id=p.id RETURNING * INTO p;
  ELSE
    UPDATE public.players SET position=p_position,
      sitting_out=CASE WHEN in_play THEN sitting_out ELSE false END,
      status=CASE WHEN in_play THEN status ELSE 'active' END,
      waiting=CASE WHEN in_play THEN waiting ELSE false END
    WHERE id=p.id RETURNING * INTO p;
  END IF;
  -- A newcomer at an already-settled boundary has an authoritative zero opening
  -- balance. Include it for session finalization without reserving an active hand.
  IF p.chips=0 AND g.status IN ('waiting','waiting_for_players','game_over')
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id=g.id)
     AND NOT EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=p.user_id) THEN
    v_prior_357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
    SELECT g.id,g.current_game_uuid,coalesce(g.total_hands,0),p.id,p.user_id,coalesce(profile.username,'Player'),0,false
      FROM public.profiles profile WHERE profile.id=p.user_id;
    PERFORM set_config('app.three_five_seven_authoritative_write',v_prior_357,true);
  END IF;
  UPDATE public.games SET current_host=(
    SELECT seated.user_id FROM public.players seated WHERE seated.game_id=g.id AND NOT seated.is_bot
      AND seated.status NOT IN ('left','observer') AND seated.position IS NOT NULL
    ORDER BY seated.created_at,seated.id LIMIT 1
  ) WHERE id=g.id AND NOT EXISTS (
    SELECT 1 FROM public.players host WHERE host.game_id=g.id AND host.user_id=g.current_host
      AND NOT host.is_bot AND host.status NOT IN ('left','observer') AND host.position IS NOT NULL
  );
  v_replay_return := jsonb_build_object('outcome','seated','player_id',p.id,'participation_version',p.participation_version);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.set_game_paused'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.set_session_player_intent(p_game_id uuid, p_player_id uuid, p_expected_version bigint, p_expected_dealer_game_id uuid, p_option text, p_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE; prior357 text;
BEGIN
 IF auth.uid() IS NULL OR p_value IS NULL OR p_option IS NULL OR p_option NOT IN
 ('auto_ante','auto_ante_runback','sit_out_next_hand','stand_up_next_hand','rejoin','cancel_exit') THEN
  RAISE EXCEPTION 'participant_intent:invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.set_session_player_intent'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'participant_intent:missing_session'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR (NOT coalesce(p.is_bot,false) AND p.user_id IS DISTINCT FROM auth.uid())
 OR (coalesce(p.is_bot,false) AND (g.real_money IS DISTINCT FROM false OR g.current_host IS DISTINCT FROM auth.uid()))
 THEN RAISE EXCEPTION 'participant_intent:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR p.position IS NULL OR p.status IN ('left','observer')
 OR g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
 OR p.intent_version IS DISTINCT FROM p_expected_version THEN
  v_replay_return := jsonb_build_object('outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_option',p_option,'p_value',p_value),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 IF p_option IN ('rejoin','cancel_exit') AND NOT p_value THEN
  RAISE EXCEPTION 'participant_intent:invalid_value' USING ERRCODE='22023'; END IF;
 prior357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_ante=CASE WHEN p_option='auto_ante' THEN p_value WHEN p_option='auto_ante_runback' AND p_value THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN p_option='auto_ante_runback' THEN p_value WHEN p_option='auto_ante' AND p_value THEN false ELSE auto_ante_runback END,
 sit_out_next_hand=CASE WHEN p_option='sit_out_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='stand_up_next_hand' AND p_value) THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN p_option='stand_up_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='sit_out_next_hand' AND p_value) THEN false ELSE stand_up_next_hand END,
 waiting=CASE WHEN p_option='rejoin' THEN true WHEN p_option IN ('sit_out_next_hand','stand_up_next_hand') AND p_value THEN false ELSE waiting END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior357,true);
 v_replay_return := jsonb_build_object('outcome','accepted','player',to_jsonb(p));
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_option',p_option,'p_value',p_value),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION private.reconcile_session_abandonment(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return text;
  v_game public.games%ROWTYPE;
  v_watch private.session_abandonment_watches%ROWTYPE;
  v_active_humans integer := 0;
  v_seated_humans integer := 0;
  v_missed_heartbeat_counts jsonb := '{}'::jsonb;
  v_active_grace_seconds integer := 60;
  v_sitting_out_grace_seconds integer := 60;
  v_forced_confirmation_seconds integer := 15;
  v_initial_grace_seconds integer := 300;
  v_nonpristine boolean := false;
  v_outcome text;
  v_deleted integer := 0;
  v_authority_keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write','app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  v_prior_settings text[]:=ARRAY[]::text[];
  v_setting_index integer;
BEGIN
  IF p_game_id IS NULL THEN
    v_replay_return := 'missing-game-id';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'private.reconcile_session_abandonment'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := 'missing-game';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    IF v_game.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;
    END IF;
    v_replay_return := 'ineligible-state';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := 'unarmed';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT
    CASE
      WHEN setting.value ->> 'subsequent_active_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_active_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'subsequent_sitting_out_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_sitting_out_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'forced_absence_confirmation_seconds' ~ '^[0-9]+$'
        THEN LEAST(300, GREATEST(5,
          (setting.value ->> 'forced_absence_confirmation_seconds')::integer))
      ELSE 15
    END,
    CASE
      WHEN setting.value ->> 'initial_waiting_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(7200, GREATEST(60,
          (setting.value ->> 'initial_waiting_grace_seconds')::integer))
      ELSE 300
    END
    INTO v_active_grace_seconds, v_sitting_out_grace_seconds,
         v_forced_confirmation_seconds, v_initial_grace_seconds
    FROM public.system_settings AS setting
   WHERE setting.key = 'postgame_presence'
   LIMIT 1;

  v_active_grace_seconds := COALESCE(v_active_grace_seconds, 60);
  v_sitting_out_grace_seconds := COALESCE(v_sitting_out_grace_seconds, 60);
  v_forced_confirmation_seconds := COALESCE(v_forced_confirmation_seconds, 15);
  v_initial_grace_seconds := COALESCE(v_initial_grace_seconds, 300);

  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(EXTRACT(EPOCH FROM (
          p_now - GREATEST(
            v_watch.armed_at,
            player.created_at,
            COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
          )
        )) / 5)::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
    LEFT JOIN LATERAL (
      SELECT heartbeat.updated_at
        FROM public.voice_presence_heartbeats AS heartbeat
       WHERE heartbeat.game_id = p_game_id
         AND heartbeat.user_id = player.user_id
         AND heartbeat.status IN ('active', 'hidden')
         AND heartbeat.updated_at >= v_watch.armed_at
       ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
       LIMIT 1
    ) AS latest_heartbeat ON true
   WHERE player.game_id = p_game_id
     AND NOT player.is_bot
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Any heartbeat after a forced claim cancels stand-up, but Sitting Out is
  -- retained. The player opts back in through the ordinary table action.
  DELETE FROM private.postgame_forced_absence_watches AS forced
   WHERE forced.game_id = p_game_id
     AND (
       NOT EXISTS (
         SELECT 1
           FROM public.players AS player
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND NOT player.is_bot
            AND player.position IS NOT NULL
            AND player.sitting_out
            AND player.status NOT IN ('observer', 'left')
       )
       OR EXISTS (
         SELECT 1
           FROM public.players AS player
           JOIN public.voice_presence_heartbeats AS heartbeat
             ON heartbeat.user_id = player.user_id
            AND heartbeat.game_id = player.game_id
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       )
     );

  IF v_watch.waiting_kind = 'subsequent' THEN
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM private.postgame_forced_absence_watches AS forced
     WHERE forced.game_id = p_game_id
       AND forced.player_id = player.id
       AND player.game_id = forced.game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND p_now >= forced.armed_at
         + make_interval(secs => v_forced_confirmation_seconds)
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = forced.game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       );

    DELETE FROM private.postgame_forced_absence_watches AS forced
     USING public.players AS player
     WHERE forced.game_id = p_game_id
       AND player.id = forced.player_id
       AND player.game_id = forced.game_id
       AND (
         player.status IN ('observer', 'left')
         OR NOT player.sitting_out
       );

    -- A sitting-out human without a forced claim is voluntary (or recovered
    -- from one). Sixty seconds without any new heartbeat releases the seat.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND NOT EXISTS (
           SELECT 1
             FROM private.postgame_forced_absence_watches AS forced
            WHERE forced.game_id = player.game_id
              AND forced.player_id = player.id
         )
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_sitting_out_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    -- The lateral join above intentionally requires a post-boundary heartbeat.
    -- Handle never-seen voluntary sitters from the boundary timestamp.
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM private.postgame_forced_absence_watches AS forced
          WHERE forced.game_id = player.game_id
            AND forced.player_id = player.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_sitting_out_grace_seconds);

    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        LEFT JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND NOT player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
         ) + make_interval(secs => v_active_grace_seconds)
    ), demoted AS (
      UPDATE public.players AS player
         SET sitting_out = true,
             waiting = false
        FROM due
       WHERE player.id = due.id
       RETURNING player.game_id, player.id
    )
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT demoted.game_id, demoted.id, p_now, 'presence_timeout'
      FROM demoted
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  ELSE
    -- Initial Waiting has no Sit Out action. Ready humans are stood up after
    -- five minutes without a heartbeat and no intermediate demotion.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_initial_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_initial_grace_seconds);
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_seated_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = CASE
             WHEN v_active_humans = 0
               THEN COALESCE(zero_active_since, p_now)
             ELSE NULL
           END,
           last_checked_at = p_now,
           next_check_at = p_now + interval '5 seconds',
           missed_heartbeat_counts = v_missed_heartbeat_counts,
           last_outcome = 'seated-humans:' || v_seated_humans::text ||
             ';active-humans:' || v_active_humans::text ||
             ';missed-windows:' || v_missed_heartbeat_counts::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    v_replay_return := 'seated-humans';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF v_watch.waiting_kind = 'initial' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dealer_games WHERE session_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.rounds WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dice_roll_audit WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.cribbage_hand_archive WHERE game_id = p_game_id)
      OR COALESCE(v_game.total_hands, 0) > 0
      OR COALESCE(v_game.pot, 0) <> 0
      OR v_game.current_game_uuid IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.players
         WHERE game_id = p_game_id AND chips <> 0
      )
      INTO v_nonpristine;

    IF v_nonpristine THEN
      UPDATE private.session_abandonment_watches
         SET last_checked_at = p_now,
             next_check_at = p_now + interval '15 minutes',
             last_outcome = 'blocked-nonpristine-initial-waiting',
             updated_at = p_now
       WHERE game_id = p_game_id;
      v_replay_return := 'blocked-nonpristine-initial-waiting';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
    END IF;

    IF v_game.real_money IS DISTINCT FROM false THEN
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        v_prior_settings:=array_append(v_prior_settings,coalesce(current_setting(v_authority_keys[v_setting_index],true),''));
        PERFORM set_config(v_authority_keys[v_setting_index],'on',true);
      END LOOP;
      UPDATE public.games SET status='session_ended',session_ended_at=p_now,game_over_at=coalesce(game_over_at,p_now),
        pending_session_end=false,is_paused=false WHERE id=p_game_id;
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        PERFORM set_config(v_authority_keys[v_setting_index],v_prior_settings[v_setting_index],true);
      END LOOP;
      DELETE FROM private.session_abandonment_watches WHERE game_id=p_game_id;
      v_replay_return := 'archived-pristine-real-session';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
    END IF;

    DELETE FROM public.session_events WHERE game_id = p_game_id;
    DELETE FROM public.voice_presence_heartbeats WHERE game_id = p_game_id;
    DELETE FROM public.games WHERE id = p_game_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_replay_return := CASE WHEN v_deleted = 1
      THEN 'deleted-pristine-initial-session'
      ELSE 'delete-race-lost'
    END;
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id) THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(
      p_game_id,
      p_now
    );
    v_replay_return := v_outcome;
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND (
       EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
       OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
       OR COALESCE(v_game.pot, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.players WHERE game_id = p_game_id AND chips <> 0)
     ) THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = p_now + interval '15 minutes',
           last_outcome = 'blocked-unsettled-financial-evidence',
           updated_at = p_now
     WHERE game_id = p_game_id;
    v_replay_return := 'blocked-unsettled-financial-evidence';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;
  DELETE FROM private.postgame_forced_absence_watches
   WHERE game_id = p_game_id;

  v_replay_return := 'session-ended-without-financial-settlement';
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'private.stand_up_and_resolve_postgame'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  v_replay_return := jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.set_automatic_play'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.settle_gameplay_chip_transfers(p_game_id uuid, p_transfers jsonb, p_reason text DEFAULT 'transfer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_transfer jsonb;
  v_from_kind text;
  v_to_kind text;
  v_from_player_id uuid;
  v_to_player_id uuid;
  v_amount integer;
  v_endpoint_key text;
  v_delta integer;
  v_deltas jsonb := '{}'::jsonb;
  v_pot_delta integer := 0;
BEGIN
  IF p_game_id IS NULL OR jsonb_typeof(p_transfers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_input';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'public.settle_gameplay_chip_transfers'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:game_not_found:%', p_game_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:caller_not_in_session';
  END IF;

  PERFORM set_config(
    'ptown.chip_transfer_reason',
    CASE WHEN p_reason IN ('ante', 'bet', 'win', 'leg', 'sweep', 'transfer') THEN p_reason ELSE 'transfer' END,
    true
  );

  FOR v_transfer IN SELECT value FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      v_amount := (v_transfer ->> 'amount')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END IF;

    v_from_kind := v_transfer #>> '{from,kind}';
    v_to_kind := v_transfer #>> '{to,kind}';
    IF v_from_kind NOT IN ('pot', 'player') OR v_to_kind NOT IN ('pot', 'player')
       OR v_from_kind = v_to_kind AND v_from_kind = 'pot' THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_endpoint';
    END IF;

    IF v_from_kind = 'player' THEN
      BEGIN v_from_player_id := (v_transfer #>> '{from,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_from_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_from_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) - v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta - v_amount;
    END IF;

    IF v_to_kind = 'player' THEN
      BEGIN v_to_player_id := (v_transfer #>> '{to,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_to_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_to_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) + v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta + v_amount;
    END IF;
  END LOOP;

  UPDATE public.players p
     SET chips = p.chips + (entry.value #>> '{}')::integer
    FROM jsonb_each(v_deltas) AS entry(key, value)
   WHERE p.id = substring(entry.key from 8)::uuid
     AND p.game_id = p_game_id
     AND (entry.value #>> '{}')::integer <> 0;

  IF v_pot_delta <> 0 THEN
    UPDATE public.games
       SET pot = COALESCE(pot, 0) + v_pot_delta
     WHERE id = p_game_id;
  END IF;

  v_replay_return := jsonb_build_object('status', 'settled');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_transfers',p_transfers,'p_reason',p_reason),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(v_game.id,'public.stand_up_and_resolve_postgame'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  v_replay_return := jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.transfer_session_host(p_game_id uuid, p_target_player_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_shared_begin_v1(g.id,'public.transfer_session_host'); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND OR auth.uid() IS NULL OR g.current_host IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND position IS NOT NULL)
 THEN RAISE EXCEPTION 'session_host:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR g.host_version IS DISTINCT FROM p_expected_version THEN
 v_replay_return := jsonb_build_object('outcome','stale_identity');
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_target_player_id',p_target_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_target_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.is_bot OR p.position IS NULL OR p.status IN ('left','observer') THEN
 RAISE EXCEPTION 'session_host:invalid_target' USING ERRCODE='22023'; END IF;
 UPDATE public.games SET current_host=p.user_id WHERE id=g.id RETURNING * INTO g;
 v_replay_return := jsonb_build_object('outcome','accepted','host_version',g.host_version,'current_host',g.current_host);
 PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_target_player_id',p_target_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return));
 RETURN v_replay_return;
END $function$
;