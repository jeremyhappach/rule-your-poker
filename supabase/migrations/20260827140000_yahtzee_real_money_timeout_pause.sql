-- A Yahtzee timeout in a real-money session is an interruption, not a bot turn.
-- The helper locks the exact due turn, restores one full authoritative turn
-- window, then delegates pause/resume bookkeeping to the canonical owner.

CREATE OR REPLACE FUNCTION private.pause_due_real_money_yahtzee_turn(
  p_round_id uuid,
  p_player_id uuid,
  p_expected_action_sequence integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_sequence integer;
  v_deadline timestamptz;
  v_reset_deadline timestamptz;
  v_pause jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'pause_due_real_money_yahtzee_turn:service_role_required';
  END IF;

  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_round'); END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RETURN jsonb_build_object('outcome','not_yahtzee');
  END IF;
  IF NOT coalesce(v_game.real_money,false) THEN
    RETURN jsonb_build_object('outcome','not_real_money');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','already_paused','deduped',true);
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','round_not_current');
  END IF;

  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing'
     OR nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('outcome','stale_turn','deduped',true);
  END IF;
  BEGIN
    v_sequence:=coalesce((v_state->>'actionSequence')::integer,0);
    v_deadline:=nullif(v_state->>'turnDeadline','')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('outcome','rejected','reason','invalid_turn_identity');
  END;
  IF v_sequence IS DISTINCT FROM p_expected_action_sequence THEN
    RETURN jsonb_build_object('outcome','stale_action','deduped',true,'action_sequence',v_sequence);
  END IF;
  IF v_deadline IS NULL OR v_round.decision_deadline IS DISTINCT FROM v_deadline THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_identity_changed');
  END IF;
  IF v_deadline > clock_timestamp() THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_not_due');
  END IF;

  -- A preserved expired deadline would immediately re-pause on resume. Reset
  -- it first; public.set_game_paused shifts this fresh deadline on resume.
  v_reset_deadline:=private.yahtzee_turn_deadline(v_game.id,p_player_id);
  v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_reset_deadline),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds
     SET yahtzee_state=v_state,decision_deadline=v_reset_deadline
   WHERE id=v_round.id;

  v_pause:=public.set_game_paused(v_game.id,true);
  IF v_pause->>'outcome' NOT IN ('paused','already_set') THEN
    RAISE EXCEPTION 'pause_due_real_money_yahtzee_turn:pause_failed:%',v_pause;
  END IF;
  RETURN v_pause || jsonb_build_object(
    'reason','real_money_yahtzee_timeout',
    'round_id',v_round.id,
    'player_id',p_player_id,
    'action_sequence',v_sequence,
    'reset_deadline',v_reset_deadline
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.pause_due_real_money_yahtzee_turn(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.pause_due_real_money_yahtzee_turn(uuid,uuid,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION private.advance_due_yahtzee_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_candidate record;
  v_result jsonb;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  FOR v_candidate IN
    SELECT game_row.id FROM public.games game_row
     WHERE game_row.game_type='yahtzee' AND game_row.status='ante_decision'
       AND game_row.current_game_uuid IS NOT NULL
       AND NOT EXISTS(
         SELECT 1 FROM public.players participant WHERE participant.game_id=game_row.id
          AND NOT coalesce(participant.sitting_out,false) AND participant.status NOT IN ('observer','left')
          AND participant.ante_decision IS NULL
       )
     ORDER BY game_row.updated_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.id,NULL);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND coalesce(game_row.awaiting_next_round,false) AND round_row.status='completed'
       AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands
     ORDER BY round_row.hand_number,round_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.game_id,v_candidate.round_id);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,
           nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid AS player_id,
           coalesce((round_row.yahtzee_state->>'actionSequence')::integer,0) AS action_sequence,
           coalesce(participant.is_bot,false) AS is_bot,
           coalesce(game_row.real_money,false) AS real_money
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.id=nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND NOT coalesce(game_row.is_paused,false)
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='playing'
       AND participant.status NOT IN ('observer','left')
       AND round_row.decision_deadline IS NOT NULL
       AND round_row.decision_deadline=nullif(round_row.yahtzee_state->>'turnDeadline','')::timestamptz
       AND round_row.decision_deadline<=clock_timestamp()
     ORDER BY round_row.decision_deadline,round_row.id LIMIT 32
  LOOP
    IF v_candidate.real_money THEN
      v_result:=private.pause_due_real_money_yahtzee_turn(
        v_candidate.round_id,v_candidate.player_id,v_candidate.action_sequence
      );
    ELSE
      v_result:=public.yahtzee_apply_action(
        v_candidate.round_id,v_candidate.player_id,
        CASE WHEN v_candidate.is_bot THEN 'auto' ELSE 'deadline_auto' END,
        NULL,NULL,NULL,v_candidate.action_sequence
      );
    END IF;
    IF v_result->>'outcome' IN ('applied','paused') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,round_row.dealer_game_id,round_row.hand_number
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='complete'
     ORDER BY round_row.id LIMIT 32
  LOOP
    PERFORM public.yahtzee_settle_game(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    v_advanced:=v_advanced+1;
  END LOOP;
  FOR v_candidate IN
    SELECT game_row.id AS game_id,result.dealer_game_id,result.hand_number,round_row.id AS round_id
      FROM public.games game_row
      JOIN public.game_results result ON result.game_id=game_row.id AND result.settlement_key='yahtzee_terminal'
      JOIN public.rounds round_row ON round_row.game_id=game_row.id
       AND round_row.dealer_game_id=result.dealer_game_id AND round_row.hand_number=result.hand_number
     WHERE game_row.game_type='yahtzee' AND game_row.status='game_over'
       AND game_row.current_game_uuid=result.dealer_game_id AND game_row.total_hands=result.hand_number
       AND game_row.game_over_at<=clock_timestamp()-interval '30 seconds'
     ORDER BY game_row.game_over_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.yahtzee_advance_postgame(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    IF v_result->>'outcome' IN ('advanced','already_advanced') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  RETURN v_advanced;
END;
$function$;

COMMENT ON FUNCTION private.pause_due_real_money_yahtzee_turn(uuid,uuid,integer) IS
  'Exact-identity real-money Yahtzee timeout owner. Resets one full turn window then pauses; it never rolls or scores.';
COMMENT ON FUNCTION private.advance_due_yahtzee_state() IS
  'Complete scheduled Yahtzee bootstrap, real-money timeout pause, fake-money auto recovery, terminal settlement, and postgame recovery owner.';
