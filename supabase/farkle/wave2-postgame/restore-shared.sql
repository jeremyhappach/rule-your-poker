BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4','3f60fdfc00de2466dd2f31060892db0d') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:shared_metadata_drift'; END IF; END $guard$;
SELECT id FROM private.game_timer_registry WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing') ORDER BY due_at,id FOR UPDATE;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
UPDATE private.farkle_postgame_control_v2 SET enabled=false WHERE singleton;
DO $active$ BEGIN IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress','game_over')) THEN RAISE EXCEPTION 'farkle_wave2:active_games_require_compatible_recovery'; END IF; END $active$;
UPDATE private.game_timer_registry SET state='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE timer_kind='farkle_postgame' AND state IN ('scheduled','processing');
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
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
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
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.advance_due_canonical_game_timers(integer)'::regprocedure AND md5(pg_get_functiondef(p.oid)) IN ('e7c784e3fa2e412d3333ffd2355096f4') AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=true AND p.proconfig=ARRAY['search_path=""']::text[] AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND p.provolatile='v' AND p.proparallel='u' AND p.proleakproof=false AND p.proisstrict=false) THEN RAISE EXCEPTION 'farkle_wave2:restoration_metadata_mismatch'; END IF; END $verify$;
COMMIT;
