CREATE FUNCTION private.recovery_timestamp_due(p_value text,p_fallback timestamptz,p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN RETURN coalesce(nullif(p_value,'')::timestamptz,p_fallback)<=p_now;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.recovery_timestamp_due(text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE TABLE private.game_recovery_unit_failures(
 task_name text NOT NULL, game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 unit_key text NOT NULL, dealer_game_id uuid, round_id uuid REFERENCES public.rounds(id) ON DELETE CASCADE, first_failed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_failed_at timestamptz NOT NULL, retry_after timestamptz NOT NULL, failure_count bigint NOT NULL DEFAULT 1,
 returned_sqlstate text NOT NULL, error_message text NOT NULL, PRIMARY KEY(task_name,game_id,unit_key)
);
ALTER TABLE private.game_recovery_unit_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_recovery_unit_failures FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.recovery_session_deferred(p_task text,p_game uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.game_recovery_unit_failures f JOIN public.games g ON g.id=f.game_id
 WHERE f.task_name=p_task AND f.game_id=p_game AND f.dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND f.retry_after>clock_timestamp() AND (f.round_id IS NULL OR EXISTS(SELECT 1 FROM public.rounds r WHERE r.id=f.round_id AND (
 r.hand_number>coalesce(g.total_hands,0) OR (r.hand_number=coalesce(g.total_hands,0) AND r.round_number>=coalesce(g.current_round,0))))))
$$;
CREATE FUNCTION private.record_recovery_unit_failure(p_task text,p_game uuid,p_unit text,p_sqlstate text,p_message text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO private.game_recovery_unit_failures(task_name,game_id,unit_key,dealer_game_id,round_id,last_failed_at,retry_after,returned_sqlstate,error_message)
 SELECT p_task,p_game,p_unit,g.current_game_uuid,(SELECT r.id FROM public.rounds r WHERE r.game_id=p_game AND r.id::text=split_part(p_unit,':',2)),clock_timestamp(),clock_timestamp()+interval '2 seconds',p_sqlstate,left(p_message,2000)
 FROM public.games g WHERE g.id=p_game
 ON CONFLICT(task_name,game_id,unit_key) DO UPDATE SET
 dealer_game_id=EXCLUDED.dealer_game_id,round_id=EXCLUDED.round_id,last_failed_at=EXCLUDED.last_failed_at,
 retry_after=EXCLUDED.last_failed_at+make_interval(secs=>least(30,power(2,least(5,game_recovery_unit_failures.failure_count+1))::integer)),
 failure_count=game_recovery_unit_failures.failure_count+1,returned_sqlstate=EXCLUDED.returned_sqlstate,error_message=EXCLUDED.error_message
$$;
CREATE FUNCTION private.clear_recovery_unit_failure(p_task text,p_game uuid,p_unit text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM private.game_recovery_unit_failures WHERE task_name=p_task AND game_id=p_game AND unit_key=p_unit
$$;
CREATE FUNCTION private.capture_recovery_context() RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_object_agg(k,coalesce(current_setting(k,true),'')) FROM unnest(ARRAY[
 'request.jwt.claim.sub','request.jwt.claim.role','request.jwt.claims',
 'app.three_five_seven_authoritative_write','app.three_five_seven_recovery',
 'app.cribbage_authoritative_write','app.gin_rummy_authoritative_write',
 'app.yahtzee_authoritative_write','app.session_pause_write'
 ]) k
$$;
CREATE FUNCTION private.restore_recovery_context(p_context jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item record;
BEGIN FOR item IN SELECT key,value FROM jsonb_each_text(p_context) LOOP PERFORM set_config(item.key,item.value,true); END LOOP; END
$$;
REVOKE ALL ON FUNCTION private.recovery_session_deferred(text,uuid),private.record_recovery_unit_failure(text,uuid,text,text,text),
 private.clear_recovery_unit_failure(text,uuid,text),private.capture_recovery_context(),private.restore_recovery_context(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.advance_due_gin_rummy_state()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_due record;
  v_count integer := 0;
  v_player uuid;
BEGIN
  FOR v_due IN
    SELECT authority.round_id,authority.state,authority.updated_at,round_row.game_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.gin_rummy_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='gin-rummy' AND game_row.status='in_progress' AND NOT coalesce(game_row.is_paused,false)
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND (
         (authority.state->>'phase'='scoring' AND private.recovery_timestamp_due(authority.state->>'scoringDueAt',authority.updated_at+interval '4 seconds',clock_timestamp()))
         OR (authority.state->>'phase'='complete' AND private.recovery_timestamp_due(authority.state->>'completeDueAt',authority.updated_at+interval '5 seconds',clock_timestamp()))
         OR (authority.state->>'phase' IN ('first_draw','playing','knocking','laying_off')
          AND private.recovery_timestamp_due(authority.state->>'botActionDueAt',authority.updated_at+interval '1 second',clock_timestamp())
          AND EXISTS(SELECT 1 FROM public.players p WHERE p.id::text=authority.state->>'currentTurnPlayerId' AND p.is_bot))
       )
       AND NOT private.recovery_session_deferred('gin_rummy',game_row.id)
     ORDER BY authority.updated_at,authority.round_id
     LIMIT 50
  LOOP
    BEGIN
    IF v_due.state->>'phase' IN ('scoring','complete') THEN
      IF coalesce((v_due.state->>CASE WHEN v_due.state->>'phase'='scoring' THEN 'scoringDueAt' ELSE 'completeDueAt' END)::timestamptz,
        v_due.updated_at+CASE WHEN v_due.state->>'phase'='scoring' THEN interval '4 seconds' ELSE interval '5 seconds' END)>clock_timestamp() THEN CONTINUE; END IF;
    ELSE
      IF NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id::text=v_due.state->>'currentTurnPlayerId' AND p.is_bot) THEN CONTINUE; END IF;
      IF coalesce((v_due.state->>'botActionDueAt')::timestamptz,v_due.updated_at+interval '1 second')>clock_timestamp() THEN CONTINUE; END IF;
    END IF;
    IF v_due.state->>'phase'='scoring' THEN
      v_player:=(v_due.state->>'currentTurnPlayerId')::uuid;
      PERFORM private.gin_apply_action_core(v_due.round_id,v_player,'finalize_scoring',NULL,NULL,coalesce((v_due.state->>'actionCount')::bigint,0));
    ELSIF v_due.state->>'phase'='complete' THEN
      IF nullif(v_due.state->>'winnerPlayerId','') IS NULL THEN
        PERFORM private.gin_start_next_hand_core(v_due.round_id);
      ELSE
        PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
        PERFORM public.gin_rummy_settle_game(v_due.game_id,v_due.round_id,v_due.dealer_game_id,v_due.hand_number);
      END IF;
    ELSE
      PERFORM private.gin_apply_bot_action(v_due.round_id);
    END IF;
    v_count:=v_count+1;

      PERFORM private.clear_recovery_unit_failure('gin_rummy',v_due.game_id,'1:'||v_due.round_id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('gin_rummy',v_due.game_id,'1:'||v_due.round_id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  PERFORM private.restore_recovery_context(v_saved_recovery_context);
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_three_five_seven_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context(); v_game record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_scope uuid;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  BEGIN
    v_scope:=nullif(current_setting('app.three_five_seven_recovery_game_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_due_three_five_seven_state:invalid_recovery_scope';
  END;
  FOR v_game IN SELECT id FROM public.games
    WHERE game_type IN ('3-5-7','3-5-7-game','357')
      AND status IN ('ante_decision','in_progress','game_over','session_ended')
      AND NOT coalesce(is_paused,false)
      AND NOT private.recovery_session_deferred('three_five_seven',id)
      AND (v_scope IS NULL OR id=v_scope)
    ORDER BY id
  LOOP
    BEGIN
    v_result:=private.three_five_seven_recover_game(v_game.id);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game.id,'result',v_result));

      PERFORM private.clear_recovery_unit_failure('three_five_seven',v_game.id,'1:'||v_game.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('three_five_seven',v_game.id,'1:'||v_game.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  PERFORM private.restore_recovery_context(v_saved_recovery_context);
  RETURN jsonb_build_object('outcome','recovered','games',v_results);
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.enforce_horses_scc_deadlines()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_round record;
  v_processed integer := 0;
BEGIN
  FOR v_round IN
    SELECT round_row.id,round_row.game_id
      FROM public.rounds AS round_row
      JOIN public.games AS game ON game.id = round_row.game_id
     WHERE game.game_type IN ('horses', 'ship-captain-crew')
       AND NOT private.recovery_session_deferred('horses_scc',game.id)
       AND game.status = 'in_progress'
       AND COALESCE(game.is_paused, false) = false
       AND game.current_game_uuid = round_row.dealer_game_id
       AND game.current_round = round_row.round_number
       AND round_row.horses_state ->> 'gamePhase' IN ('playing', 'complete')
     ORDER BY game.updated_at, round_row.id
     LIMIT 20
  LOOP
    BEGIN
    PERFORM private.advance_horses_scc_expired_turn(v_round.id, clock_timestamp());
    v_processed := v_processed + 1;

      PERFORM private.clear_recovery_unit_failure('horses_scc',v_round.game_id,'1:'||v_round.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('horses_scc',v_round.game_id,'1:'||v_round.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  PERFORM private.restore_recovery_context(v_saved_recovery_context);
  RETURN v_processed;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.reconcile_abandoned_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_watch record;
  v_processed integer := 0;
BEGIN
  PERFORM set_config(
    'app.three_five_seven_authoritative_write',
    'on',
    true
  );

  FOR v_watch IN
    SELECT watch.game_id
      FROM private.session_abandonment_watches AS watch
     WHERE NOT private.recovery_session_deferred('session_abandonment',watch.game_id)
       AND watch.next_check_at <= clock_timestamp()
     ORDER BY watch.next_check_at, watch.game_id
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
    PERFORM private.reconcile_session_abandonment(
      v_watch.game_id,
      clock_timestamp()
    );
    v_processed := v_processed + 1;

      PERFORM private.clear_recovery_unit_failure('session_abandonment',v_watch.game_id,'1:'||v_watch.game_id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('session_abandonment',v_watch.game_id,'1:'||v_watch.game_id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN v_processed;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.release_due_holm_presentations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_due record;
  v_result jsonb;
  v_released integer := 0;
  v_release_mode text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('private.release_due_holm_presentations', 0)) THEN
    PERFORM private.restore_recovery_context(v_saved_recovery_context);
    RETURN 0;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  FOR v_due IN
    SELECT successor.game_id,
           successor.holm_predecessor_round_id AS predecessor_round_id,
           successor.id AS successor_round_id,
           false AS actor_acknowledged,
           successor.presentation_fallback_at <= clock_timestamp() AS fallback_due
      FROM public.rounds successor
      JOIN public.games game_row ON game_row.id = successor.game_id
     WHERE successor.status = 'dealing'
       AND successor.holm_predecessor_round_id IS NOT NULL
       AND successor.presentation_fallback_at IS NOT NULL
       AND NOT private.recovery_session_deferred('holm',game_row.id)
       AND game_row.game_type IN ('holm', 'holm-game')
       AND game_row.awaiting_next_round = true
       AND game_row.status NOT IN ('game_over', 'session_ended')
       AND coalesce(game_row.is_paused, false) = false
     ORDER BY successor.presentation_fallback_at, successor.id
     LIMIT 100
  LOOP
    BEGIN
    v_due.actor_acknowledged:=private.holm_prepared_hand_actor_acknowledged(v_due.successor_round_id);
    IF NOT v_due.fallback_due AND NOT v_due.actor_acknowledged THEN CONTINUE; END IF;
    v_release_mode := CASE
      WHEN v_due.actor_acknowledged THEN 'acknowledged'
      ELSE 'fallback'
    END;
    SELECT private.activate_prepared_holm_hand_exact(
      v_due.game_id,
      v_due.predecessor_round_id,
      v_due.successor_round_id,
      v_release_mode
    ) INTO v_result;

    IF v_result->>'outcome' IN ('activated', 'already-active') THEN
      v_released := v_released + 1;
    END IF;

      PERFORM private.clear_recovery_unit_failure('holm',v_due.game_id,'1:'||v_due.successor_round_id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('holm',v_due.game_id,'1:'||v_due.successor_round_id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN v_released;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_yahtzee_state()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_candidate record;
  v_result jsonb;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  FOR v_candidate IN
    SELECT game_row.id,game_row.id AS game_id FROM public.games game_row
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('yahtzee',game_row.id) AND game_row.game_type='yahtzee' AND game_row.status='ante_decision'
       AND game_row.current_game_uuid IS NOT NULL
       AND NOT EXISTS(
         SELECT 1 FROM public.players participant WHERE participant.game_id=game_row.id
          AND NOT coalesce(participant.sitting_out,false) AND participant.status NOT IN ('observer','left')
          AND participant.ante_decision IS NULL
       )
     ORDER BY game_row.updated_at,game_row.id LIMIT 32
  LOOP
    BEGIN
    v_result:=public.start_yahtzee_round(v_candidate.id,NULL);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;

      PERFORM private.clear_recovery_unit_failure('yahtzee',v_candidate.game_id,'1:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('yahtzee',v_candidate.game_id,'1:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('yahtzee',game_row.id) AND game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND coalesce(game_row.awaiting_next_round,false) AND round_row.status='completed'
       AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands
     ORDER BY round_row.hand_number,round_row.id LIMIT 32
  LOOP
    BEGIN
    v_result:=public.start_yahtzee_round(v_candidate.game_id,v_candidate.round_id);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;

      PERFORM private.clear_recovery_unit_failure('yahtzee',v_candidate.game_id,'2:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('yahtzee',v_candidate.game_id,'2:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.id AS round_id,round_row.game_id,
           round_row.yahtzee_state->>'currentTurnPlayerId' AS player_id,
           round_row.yahtzee_state->>'actionSequence' AS action_sequence,
           coalesce(game_row.real_money,false) AS real_money
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.id::text=round_row.yahtzee_state->>'currentTurnPlayerId'
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('yahtzee',game_row.id) AND game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND NOT coalesce(game_row.is_paused,false)
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='playing'
       AND participant.status NOT IN ('observer','left')
       AND round_row.decision_deadline IS NOT NULL
       AND round_row.decision_deadline<=clock_timestamp()
     ORDER BY round_row.decision_deadline,round_row.id LIMIT 32
  LOOP
    BEGIN
    IF v_candidate.real_money THEN
      v_result:=private.pause_due_real_money_yahtzee_turn(
        v_candidate.round_id,v_candidate.player_id::uuid,coalesce(v_candidate.action_sequence::integer,0)
      );
    ELSE
      v_result:=private.complete_due_fake_money_yahtzee_turn(
        v_candidate.round_id,v_candidate.player_id::uuid,coalesce(v_candidate.action_sequence::integer,0)
      );
    END IF;
    IF v_result->>'outcome' IN ('completed','paused','auto_roll_armed') THEN v_advanced:=v_advanced+1; END IF;

      PERFORM private.clear_recovery_unit_failure('yahtzee',v_candidate.game_id,'3:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('yahtzee',v_candidate.game_id,'3:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,round_row.dealer_game_id,round_row.hand_number
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('yahtzee',game_row.id) AND game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='complete'
     ORDER BY round_row.id LIMIT 32
  LOOP
    BEGIN
    PERFORM public.yahtzee_settle_game(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('yahtzee',v_candidate.game_id,'4:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('yahtzee',v_candidate.game_id,'4:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  FOR v_candidate IN
    SELECT game_row.id AS game_id,result.dealer_game_id,result.hand_number,round_row.id AS round_id
      FROM public.games game_row
      JOIN public.game_results result ON result.game_id=game_row.id AND result.settlement_key='yahtzee_terminal'
      JOIN public.rounds round_row ON round_row.game_id=game_row.id
       AND round_row.dealer_game_id=result.dealer_game_id AND round_row.hand_number=result.hand_number
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('yahtzee',game_row.id) AND game_row.game_type='yahtzee' AND game_row.status='game_over'
       AND game_row.current_game_uuid=result.dealer_game_id AND game_row.total_hands=result.hand_number
       AND game_row.game_over_at<=clock_timestamp()-interval '30 seconds'
     ORDER BY game_row.game_over_at,game_row.id LIMIT 32
  LOOP
    BEGIN
    v_result:=public.yahtzee_advance_postgame(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    IF v_result->>'outcome' IN ('advanced','already_advanced') THEN v_advanced:=v_advanced+1; END IF;

      PERFORM private.clear_recovery_unit_failure('yahtzee',v_candidate.game_id,'5:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('yahtzee',v_candidate.game_id,'5:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  PERFORM private.restore_recovery_context(v_saved_recovery_context);
  RETURN v_advanced;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_cribbage_state_pre_terminal_lease()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_candidate record;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_candidate IN
    SELECT game_row.id AS game_id,game_row.dealer_selection_state->>'preparedAt' AS prepared_at
      FROM public.games game_row
     WHERE NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id) AND game_row.game_type='cribbage'
       AND game_row.status='cribbage_dealer_selection'
       AND game_row.dealer_selection_state->>'isComplete'='true'
       AND private.recovery_timestamp_due(game_row.dealer_selection_state->>'preparedAt',NULL,clock_timestamp()-interval '5 seconds')
     ORDER BY game_row.updated_at,game_row.id
     LIMIT 32
  LOOP
    BEGIN
      IF nullif(v_candidate.prepared_at,'')::timestamptz>clock_timestamp()-interval '5 seconds' OR v_candidate.prepared_at IS NULL THEN CONTINUE; END IF;
      PERFORM public.start_cribbage_initial_hand(v_candidate.game_id);
      v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'1:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'1:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT authority.round_id,round_row.game_id,
           participant.id AS player_id,
           authority.state->'playerStates' AS player_states
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.game_id=round_row.game_id
     WHERE authority.state->>'phase'='discarding'
       AND coalesce(participant.is_bot,false)
       AND authority.state->'playerStates' ? participant.id::text
       AND CASE WHEN jsonb_typeof(coalesce(authority.state->'playerStates'->participant.id::text->'discardedToCrib','[]'::jsonb))='array'
         THEN jsonb_array_length(coalesce(authority.state->'playerStates'->participant.id::text->'discardedToCrib','[]'::jsonb))=0 ELSE true END
       AND NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id)
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY authority.updated_at,authority.round_id,participant.position
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_apply_discard(
        v_candidate.round_id,v_candidate.player_id,CASE WHEN jsonb_object_length(v_candidate.player_states)=2 THEN ARRAY[0,1]::integer[] ELSE ARRAY[0]::integer[] END
      );
      v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'2:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'2:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT authority.round_id,round_row.game_id,
           authority.state->'pegging'->>'currentTurnPlayerId' AS player_id,
           authority.state->'pegging'->>'eventSequence' AS event_sequence
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant
        ON participant.id::text=authority.state->'pegging'->>'currentTurnPlayerId'
       AND participant.game_id=round_row.game_id
     WHERE authority.state->>'phase'='pegging'
       AND coalesce(participant.is_bot,false)
       AND NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id)
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY authority.updated_at,authority.round_id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_apply_pegging_action(
        v_candidate.round_id,
        v_candidate.player_id::uuid,
        'auto',
        NULL,
        coalesce(v_candidate.event_sequence::integer,0)
      );
      v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'3:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'3:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT round_row.id AS round_id,round_row.game_id
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE authority.state->>'phase'='counting'
       AND authority.state->'countingResolution'->>'outcome'='ready'
       AND round_row.presentation_fallback_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id)
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
     ORDER BY round_row.presentation_fallback_at,round_row.id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_release_counting(v_candidate.round_id,true);
      v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'4:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'4:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.cribbage_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE authority.state->>'phase'='complete'
       AND NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id)
       AND game_row.game_type='cribbage'
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND game_row.status NOT IN ('game_over','session_ended')
     ORDER BY authority.updated_at,round_row.id
     LIMIT 32
  LOOP
    BEGIN
      PERFORM public.cribbage_settle_game(
        v_candidate.game_id,v_candidate.round_id,
        v_candidate.dealer_game_id,v_candidate.hand_number
      );
      v_advanced:=v_advanced+1;

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'5:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'5:'||(coalesce(to_jsonb(v_candidate)->>'round_id',v_candidate.game_id::text))::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN v_advanced;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_cribbage_state()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
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
       AND NOT coalesce(game_row.is_paused,false) AND NOT private.recovery_session_deferred('cribbage',game_row.id)
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

      PERFORM private.clear_recovery_unit_failure('cribbage',v_candidate.game_id,'1:'||v_candidate.round_id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('cribbage',v_candidate.game_id,'1:'||v_candidate.round_id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;
  PERFORM private.restore_recovery_context(v_saved_recovery_context);
  RETURN v_advanced;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN random()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
CREATE OR REPLACE FUNCTION private.run_due_game_recovery_task(p_task_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET lock_timeout TO '750ms'
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_started_at timestamptz := clock_timestamp();
  v_finished_at timestamptz;
  v_duration_ms integer;
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
  v_failure_count bigint;
  v_last_reported_at timestamptz;
  v_outcome text;
BEGIN
  CASE p_task_name
    WHEN 'canonical_timers' THEN
      PERFORM private.advance_due_canonical_game_timers();
    WHEN 'holm' THEN
      PERFORM private.release_due_holm_presentations();
    WHEN 'cribbage' THEN
      PERFORM private.advance_due_cribbage_state();
    WHEN 'gin_rummy' THEN
      PERFORM private.advance_due_gin_rummy_state();
    WHEN 'yahtzee' THEN
      PERFORM private.advance_due_yahtzee_state();
    WHEN 'three_five_seven' THEN
      PERFORM private.advance_due_three_five_seven_state();
    WHEN 'horses_scc' THEN
      PERFORM private.enforce_horses_scc_deadlines();
    WHEN 'session_abandonment' THEN
      PERFORM private.reconcile_abandoned_sessions();
    ELSE
      RAISE EXCEPTION 'run_due_game_recovery_task:unknown_task:%', p_task_name;
  END CASE;

  DELETE FROM private.game_recovery_failures
   WHERE task_name = p_task_name;

  v_finished_at := clock_timestamp();
  v_duration_ms := greatest(
    0,
    round(extract(epoch FROM (v_finished_at - v_started_at)) * 1000)::integer
  );

  IF v_duration_ms >= 500 THEN
    INSERT INTO private.game_recovery_slow_task_runs(
      task_name, started_at, finished_at, duration_ms, outcome
    ) VALUES (
      p_task_name, v_started_at, v_finished_at, v_duration_ms, 'completed'
    );

    DELETE FROM private.game_recovery_slow_task_runs
     WHERE started_at < clock_timestamp() - interval '14 days';
  END IF;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'task', p_task_name,
    'outcome', 'completed',
    'duration_ms', v_duration_ms
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_sqlstate = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL,
    v_hint = PG_EXCEPTION_HINT,
    v_context = PG_EXCEPTION_CONTEXT;

  v_finished_at := clock_timestamp();
  v_duration_ms := greatest(
    0,
    round(extract(epoch FROM (v_finished_at - v_started_at)) * 1000)::integer
  );
  v_outcome := CASE WHEN v_sqlstate = '55P03' THEN 'lock_timeout' ELSE 'failed' END;

  INSERT INTO private.game_recovery_failures(
    task_name,
    first_failed_at,
    last_failed_at,
    failure_count,
    returned_sqlstate,
    error_message,
    error_detail,
    error_hint,
    error_context
  ) VALUES (
    p_task_name,
    v_started_at,
    v_finished_at,
    1,
    v_sqlstate,
    v_message,
    nullif(v_detail, ''),
    nullif(v_hint, ''),
    nullif(v_context, '')
  )
  ON CONFLICT (task_name) DO UPDATE
    SET last_failed_at = EXCLUDED.last_failed_at,
        failure_count = private.game_recovery_failures.failure_count + 1,
        returned_sqlstate = EXCLUDED.returned_sqlstate,
        error_message = EXCLUDED.error_message,
        error_detail = EXCLUDED.error_detail,
        error_hint = EXCLUDED.error_hint,
        error_context = EXCLUDED.error_context
  RETURNING failure_count, last_reported_at
       INTO v_failure_count, v_last_reported_at;

  INSERT INTO private.game_recovery_slow_task_runs(
    task_name, started_at, finished_at, duration_ms, outcome,
    returned_sqlstate, error_message
  ) VALUES (
    p_task_name, v_started_at, v_finished_at, v_duration_ms, v_outcome,
    v_sqlstate, v_message
  );

  DELETE FROM private.game_recovery_slow_task_runs
   WHERE started_at < clock_timestamp() - interval '14 days';

  IF v_last_reported_at IS NULL
     OR v_last_reported_at <= v_finished_at - interval '1 minute' THEN
    UPDATE private.game_recovery_failures
       SET last_reported_at = v_finished_at
     WHERE task_name = p_task_name;
    RAISE WARNING 'game recovery task % failed [%]: %',
      p_task_name, v_sqlstate, v_message;
  END IF;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'task', p_task_name,
    'outcome', v_outcome,
    'sqlstate', v_sqlstate,
    'message', v_message,
    'failure_count', v_failure_count,
    'duration_ms', v_duration_ms
  );
END;
$function$;
CREATE OR REPLACE FUNCTION private.evaluate_real_money_liveness(p_game_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_checked_at timestamptz := clock_timestamp();
  v_game public.games%ROWTYPE;
  v_dispatch private.game_recovery_dispatch_state%ROWTYPE;
  v_failure_tasks text[] := ARRAY[]::text[];
  v_session_failures jsonb:='[]'::jsonb;
  v_overdue_timers jsonb := '[]'::jsonb;
  v_scheduler_fresh boolean := false;
  v_allowed boolean := false;
  v_reason text := 'scheduler_heartbeat_missing';
BEGIN
  SELECT * INTO v_dispatch
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true;

  v_scheduler_fresh := v_dispatch.last_completed_at IS NOT NULL
    AND v_dispatch.last_completed_at >= v_checked_at - interval '10 seconds'
    AND v_dispatch.last_outcome = 'completed';

  SELECT coalesce(array_agg(failure.task_name ORDER BY failure.task_name), ARRAY[]::text[])
    INTO v_failure_tasks
    FROM private.game_recovery_failures failure;

  IF p_game_id IS NOT NULL THEN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'real_money_liveness_health:game_not_found';
    END IF;

    IF NOT coalesce(v_game.real_money, false) THEN
      RETURN jsonb_build_object(
        'outcome', 'healthy',
        'admission_allowed', true,
        'reason', 'fake_money_exempt',
        'checked_at', v_checked_at,
        'game_id', p_game_id,
        'scheduler_last_completed_at', v_dispatch.last_completed_at,
        'scheduler_last_outcome', v_dispatch.last_outcome,
        'active_failure_tasks', to_jsonb(v_failure_tasks),
        'overdue_timers', '[]'::jsonb
      );
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('task',f.task_name,'unit',f.unit_key,'sqlstate',f.returned_sqlstate,'retry_after',f.retry_after)),'[]'::jsonb)
    INTO v_session_failures FROM private.game_recovery_unit_failures f
    WHERE f.game_id=p_game_id AND f.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid AND (f.round_id IS NULL OR EXISTS(SELECT 1 FROM public.rounds r WHERE r.id=f.round_id AND (
 r.hand_number>coalesce(v_game.total_hands,0) OR (r.hand_number=coalesce(v_game.total_hands,0) AND r.round_number>=coalesce(v_game.current_round,0)))));
    -- Paused games are deliberately outside stagnation admission/evidence.
    -- Their existing scheduled timer rows may remain overdue until resume.
    IF NOT coalesce(v_game.is_paused, false) THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'timer_kind', timer.timer_kind,
               'owner_task', timer.owner_task,
               'phase_key', timer.phase,
               'seconds_overdue', greatest(
                 0,
                 floor(extract(epoch FROM (v_checked_at - timer.due_at)))::integer
               )
             ) ORDER BY timer.due_at, timer.id), '[]'::jsonb)
        INTO v_overdue_timers
        FROM private.game_timer_registry timer
       WHERE timer.game_id = p_game_id
         AND timer.state = 'scheduled'
         AND timer.due_at < v_checked_at - interval '10 seconds'
         AND (
           timer.dealer_game_id IS NULL
           OR timer.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
         )
         AND (
           timer.round_id IS NULL
           OR EXISTS (
             SELECT 1
               FROM public.rounds round_row
              WHERE round_row.id = timer.round_id
                AND round_row.game_id = p_game_id
                AND round_row.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
                AND round_row.status NOT IN ('completed', 'game_over')
           )
         );
    END IF;
  END IF;

  IF p_game_id IS NOT NULL AND coalesce(v_game.is_paused, false) THEN
    v_reason := 'game_paused';
  ELSIF NOT v_scheduler_fresh THEN
    v_reason := CASE
      WHEN v_dispatch.last_completed_at IS NULL THEN 'scheduler_heartbeat_missing'
      WHEN v_dispatch.last_outcome IS DISTINCT FROM 'completed' THEN 'scheduler_partial_failure'
      ELSE 'scheduler_heartbeat_stale'
    END;
  ELSIF cardinality(v_failure_tasks) > 0 THEN
    v_reason := 'active_recovery_failure';
  ELSIF jsonb_array_length(v_session_failures)>0 THEN
    v_reason:='session_recovery_failure';
  ELSIF jsonb_array_length(v_overdue_timers) > 0 THEN
    v_reason := 'overdue_authoritative_timer';
  ELSE
    v_allowed := true;
    v_reason := 'healthy';
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_allowed THEN 'healthy' ELSE 'unhealthy' END,
    'admission_allowed', v_allowed,
    'reason', v_reason,
    'checked_at', v_checked_at,
    'game_id', p_game_id,
    'scheduler_last_completed_at', v_dispatch.last_completed_at,
    'scheduler_last_outcome', v_dispatch.last_outcome,
    'scheduler_last_duration_ms', v_dispatch.last_duration_ms,
    'scheduler_consecutive_partial_failures', v_dispatch.consecutive_partial_failures,
    'active_failure_tasks', to_jsonb(v_failure_tasks),
    'session_failures',v_session_failures,
    'overdue_timers', v_overdue_timers
  );
END;
$function$
;
