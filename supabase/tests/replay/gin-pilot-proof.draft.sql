-- Disposable database only. Every fixture mutation is rolled back by the
-- sentinel subtransaction, while the returned journal remains inspectable.
CREATE OR REPLACE FUNCTION private.replay_gin_pilot_proof_v1(_record boolean DEFAULT true, _mode text DEFAULT 'stock_two_void')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, private AS $proof$
DECLARE
  g uuid := gen_random_uuid(); dg uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); r uuid; result jsonb; state jsonb; context jsonb;
  before_state jsonb; before_count bigint; exported jsonb; card jsonb; step_count integer; denied boolean; timings jsonb := '[]'; started timestamptz;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      (u1,'replay-'||u1||'@example.invalid',jsonb_build_object('username','replay-'||u1)),
      (u2,'replay-'||u2||'@example.invalid',jsonb_build_object('username','replay-'||u2));
    INSERT INTO public.profiles(id,username) VALUES(u1,'replay-'||u1),(u2,'replay-'||u2) ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":true}')
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
    INSERT INTO public.game_defaults(game_type,debug_harness) VALUES('gin-rummy',_mode)
      ON CONFLICT(game_type) DO UPDATE SET debug_harness=EXCLUDED.debug_harness;
    INSERT INTO public.games(id,name,game_type,status,ante_amount,buy_in,pot,total_hands,points_to_win,current_host,dealer_position,replay_contract_version)
      VALUES(g,'Replay qualification','gin-rummy','ante_decision',1,1000,0,0,1000,u1,1,CASE WHEN _record THEN 1 ELSE NULL END);
    INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
      VALUES(dg,u1,'gin-rummy',g,'{"points_to_win":1000,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}');
    UPDATE public.games SET current_game_uuid=dg WHERE id=g;
    INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
      VALUES(p1,u1,g,1,1000,false,'active','ante_up'),(p2,u2,g,2,1000,false,'active','ante_up');
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
    result := public.start_gin_rummy_initial_hand(g); r := (result->>'round_id')::uuid;
    IF result->>'outcome' IS DISTINCT FROM 'started' THEN RAISE EXCEPTION 'proof:opening:%',result; END IF;
    result := public.start_gin_rummy_initial_hand(g);
    IF result->>'outcome' IS DISTINCT FROM 'already_started' THEN RAISE EXCEPTION 'proof:opening_duplicate'; END IF;
    SELECT s.state INTO before_state FROM private.gin_rummy_round_states s WHERE round_id=r;
    -- Unauthorized action must neither mutate authoritative state nor journal.
    denied := false;
    BEGIN
      PERFORM public.gin_rummy_apply_action(r,p2,'pass_first_draw',NULL,NULL,0);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not_player_actor%' THEN RAISE; END IF; denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'proof:authorization'; END IF;
    IF _mode='stock_two_void' THEN
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
      started := clock_timestamp(); result := public.gin_rummy_apply_action(r,p2,'pass_first_draw',NULL,NULL,0);
      timings := timings||jsonb_build_array(jsonb_build_object('action','ordinary','ms',1000*extract(epoch FROM clock_timestamp()-started)));
      SELECT s.state INTO before_state FROM private.gin_rummy_round_states s WHERE round_id=r;
      -- A stale count uses the existing authority guard; no replay append occurs.
      result := public.gin_rummy_apply_action(r,p2,'pass_first_draw',NULL,NULL,0);
      IF result->>'outcome' IS DISTINCT FROM 'stale_action' THEN RAISE EXCEPTION 'proof:stale_action'; END IF;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
      started := clock_timestamp(); result := public.gin_rummy_apply_action(r,p1,'pass_first_draw',NULL,NULL,1);
      timings := timings||jsonb_build_array(jsonb_build_object('action','compound','ms',1000*extract(epoch FROM clock_timestamp()-started)));
      SELECT s.state INTO state FROM private.gin_rummy_round_states s WHERE round_id=r;
      card := state->'playerStates'->p2::text->'hand'->0;
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
      started := clock_timestamp(); result := public.gin_rummy_apply_action(r,p2,'discard',card,NULL,2);
      timings := timings||jsonb_build_array(jsonb_build_object('action','void_terminal','ms',1000*extract(epoch FROM clock_timestamp()-started)));
    ELSE
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
      result := public.gin_rummy_apply_action(r,p2,'take_first_draw',NULL,NULL,0);
      card := private.gin_card('K',chr(9829));
      result := public.gin_rummy_apply_action(r,p2,'knock',card,NULL,1);
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
      started := clock_timestamp(); result := public.gin_rummy_apply_action(r,p1,'finish_lay_off',NULL,NULL,2);
      timings := timings||jsonb_build_array(jsonb_build_object('action','scoring','ms',1000*extract(epoch FROM clock_timestamp()-started)));
    END IF;
    SELECT s.state,s.replay_context_v1 INTO state,context FROM private.gin_rummy_round_states s WHERE round_id=r;
    IF state->>'phase' IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'proof:not_complete:%',state->>'phase'; END IF;
    IF _record THEN
      SELECT count(*) INTO step_count FROM private.replay_steps WHERE session_id=g;
      IF step_count<>4 THEN RAISE EXCEPTION 'proof:one_append_per_action:%',step_count; END IF;
      IF _mode='stock_two_void' AND (SELECT jsonb_array_length(body->'substeps') FROM private.replay_steps WHERE session_id=g AND source_key='gin:'||r||':action:1')<>2 THEN
        RAISE EXCEPTION 'proof:missing_compound_substeps';
      END IF;
      -- Complete seals are forbidden while any writer is unqualified.
      denied := false;
      BEGIN
        PERFORM private.replay_append_v1(g,'invalid-seal',context->'identity',NULL,'[]','{"completeness":"complete"}');
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%unqualified_writer_cannot_seal%' THEN RAISE; END IF; denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'proof:complete_seal_allowed'; END IF;
      -- Force a source collision after a gameplay write and prove both roll back.
      SELECT chips INTO before_count FROM public.players WHERE id=p1;
      BEGIN
        UPDATE public.players SET chips=chips+1 WHERE id=p1;
        PERFORM private.replay_append_v1(g,'gin:'||r||':action:0',context->'identity',NULL,'[]');
        RAISE EXCEPTION 'proof:duplicate_source_allowed';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      IF (SELECT chips FROM public.players WHERE id=p1)<>before_count THEN RAISE EXCEPTION 'proof:journal_failure_not_atomic'; END IF;
      denied := false;
      BEGIN UPDATE private.replay_steps SET source_key='rewritten' WHERE session_id=g;
      EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%append_only%' THEN RAISE; END IF; denied := true; END;
      IF NOT denied THEN RAISE EXCEPTION 'proof:journal_mutable'; END IF;
      SELECT jsonb_build_object('mode',_mode,'sessionId',g,'ownerUserId',u2,'otherUserId',u1,
        'steps',jsonb_agg(body ORDER BY sequence),'expected',private.replay_gin_state_v1(state,context),'timings',timings,
        'coverage','pilot_partial','committedLatencyMeasured',false)
        INTO exported FROM private.replay_steps WHERE session_id=g;
    ELSE
      exported := jsonb_build_object('mode',_mode,'timings',timings,'committedLatencyMeasured',false);
    END IF;
    RAISE EXCEPTION USING ERRCODE='ZP001',MESSAGE='rollback_qualification_fixtures';
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
  END;
  RETURN exported;
END;
$proof$;
REVOKE ALL ON FUNCTION private.replay_gin_pilot_proof_v1(boolean,text) FROM PUBLIC,anon,authenticated,service_role;
