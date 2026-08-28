-- Fake-money Yahtzee timeouts arm a client-paced Auto-roll turn instead of
-- committing its full sequence in one database transaction. The server remains
-- the liveness fallback if the armed client never completes that turn.

CREATE OR REPLACE FUNCTION public.yahtzee_apply_auto_roll_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _category text DEFAULT NULL,
  _hold_mask boolean[] DEFAULT NULL,
  _expected_action_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_action text:=lower(coalesce(_action,''));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:authentication_required';
  END IF;
  IF v_action NOT IN ('bot_roll','bot_score') THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:invalid_action';
  END IF;

  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:not_yahtzee_game';
  END IF;
  IF coalesce(v_game.real_money,false) THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:real_money_forbidden';
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=_player_id AND game_id=v_game.id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left') THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:player_not_found';
  END IF;
  IF coalesce(v_player.is_bot,false)
     OR NOT coalesce(v_player.auto_fold,false)
     OR v_player.user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'yahtzee_apply_auto_roll_action:not_auto_roll_owner';
  END IF;

  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing'
     OR nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM _player_id THEN
    RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',v_state);
  END IF;

  -- The established action owner revalidates exact turn/deadline/sequence
  -- identity. Elevation happens only after this wrapper has proved that the
  -- authenticated human owns this fake-money Auto-roll turn.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  RETURN public.yahtzee_apply_action(
    _round_id,_player_id,v_action,NULL,_category,_hold_mask,_expected_action_sequence
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.yahtzee_apply_auto_roll_action(uuid,uuid,text,text,boolean[],integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_apply_auto_roll_action(uuid,uuid,text,text,boolean[],integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.complete_due_fake_money_yahtzee_turn(
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
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_deadline timestamptz;
  v_sequence integer;
  v_result jsonb;
  v_step integer;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'complete_due_fake_money_yahtzee_turn:service_role_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_round'); END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RETURN jsonb_build_object('outcome','not_yahtzee');
  END IF;
  IF coalesce(v_game.real_money,false) THEN
    RETURN jsonb_build_object('outcome','not_fake_money');
  END IF;
  IF coalesce(v_game.is_paused,false) OR v_game.status IS DISTINCT FROM 'in_progress'
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
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=v_game.id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left') THEN
    RETURN jsonb_build_object('outcome','rejected','reason','player_not_current');
  END IF;

  IF NOT coalesce(v_player.is_bot,false) AND NOT coalesce(v_player.auto_fold,false) THEN
    -- First human expiry: arm Auto-roll and give its authenticated owner the
    -- normal server recovery window. No player-facing timer is rendered while
    -- Auto-roll is armed. A later due event is the disconnected-client fallback.
    UPDATE public.players
       SET auto_fold=true,sit_out_next_hand=true
     WHERE id=v_player.id;
    v_deadline:=private.yahtzee_turn_deadline(v_game.id,p_player_id);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_deadline),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds
       SET yahtzee_state=v_state,decision_deadline=v_deadline
     WHERE id=p_round_id;
    RETURN jsonb_build_object('outcome','auto_roll_armed','state',v_state);
  END IF;

  -- The owner was already armed (or this is a durable bot turn) and no browser
  -- completed the full turn before the recovery deadline. Complete it safely.
  FOR v_step IN 1..4 LOOP
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=p_round_id FOR UPDATE;
    IF v_state->>'gamePhase' IS DISTINCT FROM 'playing'
       OR nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM p_player_id THEN
      RETURN jsonb_build_object('outcome','completed','steps',v_step-1,'state',v_state);
    END IF;
    v_sequence:=coalesce((v_state->>'actionSequence')::integer,0);
    v_result:=public.yahtzee_apply_action(
      p_round_id,p_player_id,'deadline_auto',NULL,NULL,NULL,v_sequence
    );
    IF v_result->>'outcome' IS DISTINCT FROM 'applied' THEN
      RAISE EXCEPTION 'complete_due_fake_money_yahtzee_turn:completion_failed:%',v_result;
    END IF;
  END LOOP;
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=p_round_id;
  IF v_state->>'gamePhase'='playing'
     AND nullif(v_state->>'currentTurnPlayerId','')::uuid=p_player_id THEN
    RAISE EXCEPTION 'complete_due_fake_money_yahtzee_turn:turn_not_completed';
  END IF;
  RETURN jsonb_build_object('outcome','completed','steps',4,'state',v_state);
END;
$function$;

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
    SELECT round_row.id AS round_id,
           nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid AS player_id,
           coalesce((round_row.yahtzee_state->>'actionSequence')::integer,0) AS action_sequence,
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
      v_result:=private.complete_due_fake_money_yahtzee_turn(
        v_candidate.round_id,v_candidate.player_id,v_candidate.action_sequence
      );
    END IF;
    IF v_result->>'outcome' IN ('completed','paused','auto_roll_armed') THEN v_advanced:=v_advanced+1; END IF;
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

COMMENT ON FUNCTION public.yahtzee_apply_auto_roll_action(uuid,uuid,text,text,boolean[],integer) IS
  'Authenticated owner-only fake-money Auto-roll adapter. Delegates exact sequence validation and dice mutations to yahtzee_apply_action.';
COMMENT ON FUNCTION private.complete_due_fake_money_yahtzee_turn(uuid,uuid,integer) IS
  'Exact-identity fake-money timeout owner. First expiry arms human Auto-roll; a later overdue armed turn is completed only as server recovery.';
COMMENT ON FUNCTION private.advance_due_yahtzee_state() IS
  'Complete scheduled Yahtzee bootstrap, timeout ownership, terminal settlement, and postgame recovery owner.';
