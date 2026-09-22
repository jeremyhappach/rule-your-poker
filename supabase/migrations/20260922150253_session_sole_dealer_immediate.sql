-- Approved canonical sole-dealer fast path.
-- Patch the inspected current owners; retain their security, replay wrappers and grants.
DO $patch$
DECLARE
  v_source text;
  v_before text;
  v_after text;
  v_eligibility text := $body$
  WITH eligible AS (
    SELECT player.position, coalesce(player.is_bot,false) AS is_bot
      FROM public.players player
     WHERE player.game_id=p_game_id AND player.position IS NOT NULL
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  )
  SELECT count(*),min(position) INTO v_sole_count,v_sole_position
    FROM eligible
   WHERE NOT is_bot
      OR coalesce((SELECT defaults.allow_bot_dealers FROM public.game_defaults defaults
                    WHERE defaults.game_type=coalesce(v_game.game_type,'holm') LIMIT 1),false)
      OR NOT EXISTS (SELECT 1 FROM eligible WHERE NOT is_bot);
$body$;
BEGIN
  v_source:=pg_get_functiondef('private.complete_session_dealer_selection(uuid,bigint)'::regprocedure);
  IF md5(v_source)<>'fa42c411b01fefa605c4780a52659e9e' THEN
    RAISE EXCEPTION 'sole_dealer:complete_owner_drift';
  END IF;
  v_before:='  v_deadline timestamptz;';
  v_after:=v_before||E'\r\n  v_sole_count integer;\r\n  v_sole_position integer;';
  v_source:=replace(v_source,v_before,v_after);
  v_before:='  IF v_prepared_at IS NULL OR v_prepared_at+interval ''3 seconds''>clock_timestamp() THEN';
  v_after:=v_eligibility||$body$
  -- A sole eligible dealer has no card reveal to hold. Real draws retain the hold.
  IF v_prepared_at IS NULL OR (
    v_prepared_at+interval '3 seconds'>clock_timestamp()
    AND NOT coalesce((
      v_sole_count=1 AND v_sole_position=v_winner_position
      AND v_game.dealer_selection_state->'cards'='[]'::jsonb
      AND coalesce((v_game.dealer_selection_state->>'isComplete')::boolean,false)
    ),false)
  ) THEN$body$;
  IF strpos(v_source,v_before)=0 THEN RAISE EXCEPTION 'sole_dealer:complete_patch_missing'; END IF;
  EXECUTE replace(v_source,v_before,v_after);

  v_source:=pg_get_functiondef('public.begin_session_dealer_selection(uuid)'::regprocedure);
  IF md5(v_source)<>'da82c324af2a7b26c0d1d93502af6f8d' THEN
    RAISE EXCEPTION 'sole_dealer:begin_owner_drift';
  END IF;
  v_source:=replace(v_source,'  v_target_position integer;',
    E'  v_target_position integer;\r\n  v_sole_count integer;\r\n  v_sole_position integer;');
  v_before:='  v_replay_return := jsonb_build_object(''outcome'',''started'',''status'',v_game.status,''timer_generation'',v_game.timer_generation);';
  v_after:=v_eligibility||$body$
  IF v_sole_count=1 THEN
    -- Reuse both canonical authority steps in the same locked Start transaction.
    PERFORM private.prepare_session_dealer_selection(p_game_id,v_game.timer_generation);
    PERFORM private.complete_session_dealer_selection(p_game_id,v_game.timer_generation);
    SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  END IF;
$body$||v_before;
  IF strpos(v_source,v_before)=0 THEN RAISE EXCEPTION 'sole_dealer:begin_patch_missing'; END IF;
  EXECUTE replace(v_source,v_before,v_after);
END;
$patch$;
