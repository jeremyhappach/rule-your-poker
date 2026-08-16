-- A counting winner is authoritative as soon as PostgreSQL resolves the plan,
-- but it must not be published as a completed match before the visible count
-- reaches the winning beat. Keep the pending winner private, expose the scored
-- counting plan, and promote terminal state only from presentation completion
-- or the disconnect-safe fallback owner.

CREATE OR REPLACE FUNCTION private.cribbage_public_state(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, private
AS $$
DECLARE
  v_state jsonb := p_state - 'pendingTerminal';
  v_player_id text;
  v_player_state jsonb;
  v_reveal boolean := coalesce(p_state->>'phase', '') IN ('counting', 'complete');
BEGIN
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RETURN v_state;
  END IF;

  FOR v_player_id IN SELECT jsonb_object_keys(coalesce(v_state->'playerStates', '{}'::jsonb)) LOOP
    v_player_state := v_state->'playerStates'->v_player_id;
    v_player_state := jsonb_set(
      v_player_state,
      '{hand}',
      private.cribbage_mask_cards(v_player_state->'hand'),
      true
    );
    IF NOT v_reveal THEN
      v_player_state := jsonb_set(
        v_player_state,
        '{discardedToCrib}',
        private.cribbage_mask_cards(v_player_state->'discardedToCrib'),
        true
      );
    END IF;
    v_state := jsonb_set(v_state, ARRAY['playerStates', v_player_id], v_player_state, true);
  END LOOP;

  IF NOT v_reveal THEN
    v_state := jsonb_set(v_state, '{crib}', private.cribbage_mask_cards(v_state->'crib'), true);
  END IF;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_finalize_counting(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_state jsonb; v_actor uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role'; v_count integer; v_i integer; v_player_id text; v_dealer text;
  v_hand jsonb; v_score jsonb; v_total integer; v_new_score integer; v_winner text; v_plan jsonb; v_combo_count integer;
  v_presentation_ms integer:=3000; v_fallback_at timestamptz; v_resolution jsonb; v_resolved_at text;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_finalize_counting:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN RAISE EXCEPTION 'cribbage_finalize_counting:not_cribbage_round'; END IF;
  IF NOT v_service AND (v_actor IS NULL OR (NOT public.user_is_in_game(v_round.game_id) AND NOT public.has_role(v_actor,'admin'::public.app_role))) THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='complete' THEN
    RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'deduped',true);
  END IF;
  IF v_state->>'phase'<>'counting' THEN RETURN jsonb_build_object('outcome','rejected','reason','round_not_counting'); END IF;
  IF v_state->'countingResolution'->>'outcome'='ready' THEN
    RETURN jsonb_build_object('outcome','ready','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
      'presentation_release_at',v_round.presentation_fallback_at-interval '5 seconds','deduped',true);
  END IF;
  IF v_state->'countingResolution'->>'outcome'='terminal_pending' THEN
    RETURN jsonb_build_object('outcome','terminal_pending','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
      'presentation_release_at',v_round.presentation_fallback_at-interval '5 seconds',
      'presentation_fallback_at',v_round.presentation_fallback_at,'deduped',true);
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR coalesce(v_game.is_paused,false)
     OR v_game.status IN ('game_over','session_ended') THEN
    RETURN jsonb_build_object('outcome','rejected','reason','stale_or_inactive');
  END IF;
  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates');
  IF v_count<2 OR v_count>4 OR jsonb_array_length(v_state->'turnOrder')<>v_count THEN RAISE EXCEPTION 'cribbage_finalize_counting:invalid_cohort'; END IF;
  IF EXISTS(
    (SELECT player_key::uuid FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key))
    EXCEPT
    (SELECT id FROM public.players WHERE game_id=v_round.game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left'))
  ) OR EXISTS(
    (SELECT id FROM public.players WHERE game_id=v_round.game_id AND NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left'))
    EXCEPT
    (SELECT player_key::uuid FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key))
  ) THEN RAISE EXCEPTION 'cribbage_finalize_counting:player_cohort_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(v_state->'playerStates') WHERE jsonb_array_length(coalesce(value->'hand','[]'::jsonb))<>0) THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:pegging_incomplete';
  END IF;
  v_dealer:=v_state->>'dealerPlayerId'; v_plan:=v_state->'countingPlan';
  FOR v_i IN 0..v_count LOOP
    IF v_i<v_count-1 THEN v_player_id:=v_state->'turnOrder'->>v_i;
    ELSE v_player_id:=v_dealer; END IF;
    IF v_i=v_count THEN
      v_hand:=v_state->'crib'; v_score:=private.cribbage_hand_score(v_hand,v_state->'cutCard',true);
    ELSE
      SELECT coalesce(jsonb_agg(play->'card' ORDER BY ordinality),'[]'::jsonb) INTO v_hand
        FROM jsonb_array_elements(v_state->'pegging'->'playedCards') WITH ORDINALITY played(play,ordinality)
       WHERE play->>'playerId'=v_player_id;
      IF jsonb_array_length(v_hand)<>4 THEN RAISE EXCEPTION 'cribbage_finalize_counting:invalid_hand:%',v_player_id; END IF;
      v_score:=private.cribbage_hand_score(v_hand,v_state->'cutCard',false);
    END IF;
    v_total:=(v_score->>'total')::integer;
    v_combo_count:=jsonb_array_length(private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',v_i=v_count));
    v_presentation_ms:=v_presentation_ms+800+500+1500+CASE WHEN v_combo_count=0 THEN 1000 ELSE v_combo_count*2000+1500 END;
    v_new_score:=coalesce((v_state->'playerStates'->v_player_id->>'pegScore')::integer,0)+v_total;
    v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_id,'pegScore'],to_jsonb(v_new_score),true);
    IF jsonb_typeof(v_plan->'targets')='array' AND jsonb_array_length(v_plan->'targets')>v_i THEN
      v_plan:=jsonb_set(v_plan,ARRAY['targets',v_i::text,'comboPoints'],private.cribbage_hand_combo_points(v_hand,v_state->'cutCard',v_i=v_count),true);
      v_plan:=jsonb_set(v_plan,ARRAY['targets',v_i::text,'totalPoints'],to_jsonb(v_total),true);
    END IF;
    IF v_new_score>=coalesce(v_game.points_to_win,(v_state->>'pointsToWin')::integer,121) THEN v_winner:=v_player_id; EXIT; END IF;
  END LOOP;
  v_state:=jsonb_set(v_state,'{countingPlan}',v_plan,true);
  v_fallback_at:=clock_timestamp()+make_interval(secs=>ceil((v_presentation_ms+5000)::numeric/1000)::integer);
  v_resolved_at:=to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF v_winner IS NOT NULL THEN
    v_resolution:=jsonb_build_object(
      'version',4,'outcome','terminal_pending',
      'presentationReleaseAt',to_char((v_fallback_at-interval '5 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'presentationFallbackAt',to_char(v_fallback_at AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'resolvedAt',v_resolved_at
    );
    v_state:=jsonb_set(v_state,'{pendingTerminal}',jsonb_build_object('winnerPlayerId',v_winner,'resolvedAt',v_resolved_at),true);
    v_state:=jsonb_set(v_state,'{countingResolution}',v_resolution,true);
    PERFORM private.cribbage_publish_state(_round_id,v_state);
    PERFORM set_config('app.cribbage_authoritative_write','on',true);
    UPDATE public.rounds SET presentation_fallback_at=v_fallback_at WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','terminal_pending','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
      'presentation_release_at',v_fallback_at-interval '5 seconds','presentation_fallback_at',v_fallback_at,'deduped',false);
  END IF;
  v_resolution:=jsonb_build_object('version',3,'outcome','ready','successorHandNumber',coalesce(v_round.hand_number,0)+1,
    'presentationReleaseAt',to_char((v_fallback_at-interval '5 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'presentationFallbackAt',to_char(v_fallback_at AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolvedAt',v_resolved_at);
  v_state:=jsonb_set(v_state,'{countingResolution}',v_resolution,true);
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.rounds SET presentation_fallback_at=v_fallback_at WHERE id=_round_id;
  RETURN jsonb_build_object('outcome','ready','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
    'presentation_release_at',v_fallback_at-interval '5 seconds','presentation_fallback_at',v_fallback_at,'deduped',false);
END;
$$;

CREATE OR REPLACE FUNCTION private.cribbage_promote_terminal_counting(
  _round_id uuid,
  _from_fallback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_state jsonb; v_resolution jsonb;
  v_actor uuid:=auth.uid(); v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_winner text; v_winner_score integer; v_points_to_win integer;
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_promote_terminal_counting:authentication_required'; END IF;
  IF _from_fallback AND NOT v_service THEN RAISE EXCEPTION 'cribbage_promote_terminal_counting:fallback_requires_service_role'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_promote_terminal_counting:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN RAISE EXCEPTION 'cribbage_promote_terminal_counting:not_cribbage_round'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_promote_terminal_counting:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'='complete' THEN
    RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),'deduped',true);
  END IF;
  IF v_state->>'phase'<>'counting' OR v_state->'countingResolution'->>'outcome'<>'terminal_pending' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','terminal_counting_not_pending');
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_game.status IN ('game_over','session_ended')
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','stale_or_inactive');
  END IF;
  IF _from_fallback AND (v_round.presentation_fallback_at IS NULL OR v_round.presentation_fallback_at>clock_timestamp()) THEN
    RETURN jsonb_build_object('outcome','presentation_pending','presentation_fallback_at',v_round.presentation_fallback_at,'deduped',true);
  END IF;
  v_winner:=nullif(v_state->'pendingTerminal'->>'winnerPlayerId','');
  IF v_winner IS NULL OR NOT (v_state->'playerStates' ? v_winner) THEN
    RAISE EXCEPTION 'cribbage_promote_terminal_counting:missing_pending_winner';
  END IF;
  v_winner_score:=coalesce((v_state->'playerStates'->v_winner->>'pegScore')::integer,-1);
  v_points_to_win:=coalesce(v_game.points_to_win,(v_state->>'pointsToWin')::integer,121);
  IF v_winner_score<v_points_to_win THEN
    RAISE EXCEPTION 'cribbage_promote_terminal_counting:winner_below_target:%/%',v_winner_score,v_points_to_win;
  END IF;
  v_state:=private.cribbage_finish_match(v_state,v_winner);
  v_state:=v_state-'pendingTerminal';
  v_resolution:=coalesce(v_state->'countingResolution','{}'::jsonb)||jsonb_build_object(
    'version',4,'outcome','terminal',
    'presentationCompletedAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'fromFallback',_from_fallback
  );
  v_state:=jsonb_set(v_state,'{countingResolution}',v_resolution,true);
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.rounds SET presentation_fallback_at=NULL WHERE id=_round_id;
  RETURN jsonb_build_object('outcome','terminal','state',private.cribbage_project_state(v_state,v_round.game_id,v_actor),
    'deduped',false,'from_fallback',_from_fallback);
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_complete_counting(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cribbage_finalize_counting(_round_id);
  IF v_result->>'outcome'='terminal' THEN RETURN v_result; END IF;
  IF v_result->>'outcome'='terminal_pending' THEN
    RETURN private.cribbage_promote_terminal_counting(_round_id,false);
  END IF;
  RETURN public.cribbage_release_counting(_round_id,false);
END;
$$;

-- Preserve the already-proven startup/bot/nonterminal recovery implementation
-- and wrap it with the new terminal-presentation fallback. This avoids copying
-- or diverging the established recovery owner.
DO $rename$
BEGIN
  IF to_regprocedure('private.advance_due_cribbage_state_pre_terminal_lease()') IS NULL THEN
    ALTER FUNCTION private.advance_due_cribbage_state()
      RENAME TO advance_due_cribbage_state_pre_terminal_lease;
  END IF;
END;
$rename$;

CREATE OR REPLACE FUNCTION private.advance_due_cribbage_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_candidate record;
  v_result jsonb;
  v_advanced integer:=0;
BEGIN
  v_advanced:=private.advance_due_cribbage_state_pre_terminal_lease();
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE authority.state->>'phase'='counting'
       AND authority.state->'countingResolution'->>'outcome'='terminal_pending'
       AND round_row.presentation_fallback_at<=clock_timestamp()
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND game_row.status NOT IN ('game_over','session_ended')
     ORDER BY round_row.presentation_fallback_at,round_row.id
     LIMIT 32
  LOOP
    BEGIN
      v_result:=private.cribbage_promote_terminal_counting(v_candidate.round_id,true);
      IF v_result->>'outcome'='terminal' THEN
        PERFORM public.cribbage_settle_game(
          v_candidate.game_id,v_candidate.round_id,
          v_candidate.dealer_game_id,v_candidate.hand_number
        );
        v_advanced:=v_advanced+1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN v_advanced;
END;
$$;

REVOKE ALL ON FUNCTION private.cribbage_public_state(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cribbage_promote_terminal_counting(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.advance_due_cribbage_state() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cribbage_finalize_counting(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cribbage_complete_counting(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.advance_due_cribbage_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_finalize_counting(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_complete_counting(uuid) TO authenticated,service_role;

COMMENT ON FUNCTION private.cribbage_promote_terminal_counting(uuid,boolean) IS
  'Promotes a database-resolved Cribbage counting winner only after presentation acknowledgement or the due disconnect fallback.';
