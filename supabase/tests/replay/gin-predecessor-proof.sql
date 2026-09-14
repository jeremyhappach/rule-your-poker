-- Disposable database only. DDL, fixtures and forced errors roll back together.
CREATE OR REPLACE FUNCTION private.replay_gin_predecessor_proof_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE mode text;f jsonb;r1 public.rounds;r2 public.rounds;g public.games;s jsonb;result jsonb;pub boolean;viewer text;
 n bigint;failed boolean;open_def text;pack jsonb;again jsonb;exports jsonb:='[]';checks jsonb:='[]';close_seq bigint;open_seq bigint;tail jsonb;
BEGIN
 BEGIN
  FOREACH mode IN ARRAY ARRAY['normal_knock_layoff','stock_two_void','system'] LOOP
   f:=private.replay_gin_predecessor_prepare('scoring',CASE WHEN mode='stock_two_void' THEN mode ELSE 'normal_knock_layoff' END,false);
   SELECT * INTO r1 FROM public.rounds WHERE id=(f->>'round')::uuid;
   IF mode='stock_two_void' THEN
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>1)::uuid,'pass_first_draw',NULL,NULL,0);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>0)::uuid,'pass_first_draw',NULL,NULL,1);
    SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=r1.id;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>1,'role','authenticated')::text,true);
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>1)::uuid,'discard',s->'playerStates'->(f->'players'->>1)->'hand'->0,NULL,2);
   ELSE
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>1)::uuid,'take_first_draw',NULL,NULL,0);
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>1)::uuid,'knock',private.gin_card('K',chr(9829)),NULL,1);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    PERFORM public.gin_rummy_apply_action(r1.id,(f->'players'->>0)::uuid,'finish_lay_off',NULL,NULL,2);
   END IF;
   SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=r1.game_id;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
   failed:=false;
   BEGIN PERFORM public.gin_rummy_start_next_hand(r1.id);
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;failed:=true;END;
   IF NOT failed OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n THEN RAISE EXCEPTION 'predecessor_proof:unauthorized_append'; END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
   SELECT pg_get_functiondef('private.replay_gin_open_v1(public.games,public.rounds,jsonb,jsonb)'::regprocedure) INTO open_def;
   failed:=false;
   BEGIN
    EXECUTE regexp_replace(open_def,'BEGIN','BEGIN RAISE EXCEPTION ''replay_test:forced_open_failure'';');
    PERFORM public.gin_rummy_start_next_hand(r1.id);
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'replay_test:forced_open_failure' THEN RAISE; END IF;failed:=true;END;
   IF NOT failed OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n
    OR (SELECT status FROM public.rounds WHERE id=r1.id)<>'betting'
    OR EXISTS(SELECT 1 FROM public.rounds WHERE predecessor_round_id=r1.id) THEN RAISE EXCEPTION 'predecessor_proof:atomic_rollback'; END IF;
   UPDATE public.game_defaults SET debug_harness='gin' WHERE game_type='gin-rummy';
   IF mode='system' THEN PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true); END IF;
   result:=public.gin_rummy_start_next_hand(r1.id);
   IF result->>'outcome'<>'started' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n+2 THEN RAISE EXCEPTION 'predecessor_proof:boundary_append_count:%',result; END IF;
   SELECT * INTO r2 FROM public.rounds WHERE id=(result->>'round_id')::uuid;
   SELECT sequence,body INTO close_seq,tail FROM private.replay_steps WHERE session_id=r1.game_id AND source_key='gin:'||r1.id||':predecessor_completed';
   SELECT sequence INTO open_seq FROM private.replay_steps WHERE session_id=r1.game_id AND source_key='gin:'||r2.id||':opening';
   IF close_seq>=open_seq OR tail#>>'{closing,endingState,round,status}'<>'completed'
     OR tail#>>'{substeps,0,operands,successorRoundId}'<>r2.id::text
     OR tail#>>'{substeps,0,origin}'<>(CASE WHEN mode='system' THEN 'system' ELSE 'player' END) THEN RAISE EXCEPTION 'predecessor_proof:ordered_boundary'; END IF;
   result:=public.gin_rummy_start_next_hand(r1.id);
   IF result->>'outcome'<>'already_started' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n+2 THEN RAISE EXCEPTION 'predecessor_proof:duplicate_append'; END IF;
   -- H2 is a real Gin terminal hand under the frozen 80-point fixture rules.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
   PERFORM public.gin_rummy_apply_action(r2.id,(f->'players'->>0)::uuid,'take_first_draw',NULL,NULL,0);
   PERFORM public.gin_rummy_apply_action(r2.id,(f->'players'->>0)::uuid,'knock',private.gin_card('K',chr(9827)),NULL,1);
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   PERFORM private.gin_apply_action_core(r2.id,(f->'players'->>0)::uuid,'finalize_scoring',NULL,NULL,2);
   SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=r1.game_id;
   result:=public.gin_rummy_start_next_hand(r1.id);
   IF result->>'outcome'<>'already_started' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n THEN RAISE EXCEPTION 'predecessor_proof:late_duplicate'; END IF;
   failed:=false;
   BEGIN PERFORM public.gin_rummy_start_next_hand(r2.id);
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%predecessor_not_continuable%' THEN RAISE; END IF;failed:=true;END;
   IF NOT failed OR (SELECT count(*) FROM private.replay_steps WHERE session_id=r1.game_id)<>n THEN RAISE EXCEPTION 'predecessor_proof:terminal_continuation'; END IF;
   FOR r1 IN SELECT * FROM public.rounds WHERE game_id=(f->>'game')::uuid ORDER BY hand_number LOOP
    IF r1.status<>'completed' THEN RAISE EXCEPTION 'predecessor_proof:not_completed'; END IF;
    SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=r1.id;
    SELECT body INTO tail FROM private.replay_steps WHERE session_id=r1.game_id AND body#>>'{identity,roundId}'=r1.id::text ORDER BY sequence DESC LIMIT 1;
    IF tail#>'{closing,endingState,round}' IS DISTINCT FROM to_jsonb(r1)-ARRAY['gin_rummy_state','authority_revision']
       OR tail#>'{closing,endingState,gameState}' IS DISTINCT FROM s THEN RAISE EXCEPTION 'predecessor_proof:authoritative_ending'; END IF;
    FOR viewer IN SELECT value FROM jsonb_array_elements_text(f->'users') LOOP
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
     FOREACH pub IN ARRAY ARRAY[true,false] LOOP
      pack:=public.export_gin_replay_v1(r1.game_id,r1.id,pub);
      IF pack#>>'{seal,completeness}'<>'complete' THEN RAISE EXCEPTION 'predecessor_proof:partial'; END IF;
      exports:=exports||jsonb_build_array(jsonb_build_object('category',mode||':hand'||r1.hand_number,'package',pack));
     END LOOP;
    END LOOP;
   END LOOP;
   DELETE FROM public.games WHERE id=(f->>'game')::uuid;
   FOR pack IN SELECT value FROM jsonb_array_elements(exports) WHERE value#>>'{package,sessionId}'=f->>'game' LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',coalesce(pack#>>'{package,perspective,userId}',f->'users'->>0),'role','authenticated')::text,true);
    again:=public.export_gin_replay_v1((f->>'game')::uuid,(pack#>>'{package,steps,0,identity,roundId}')::uuid,pack#>>'{package,perspective,kind}'='public');
    IF again IS DISTINCT FROM pack->'package' THEN RAISE EXCEPTION 'predecessor_proof:live_dependency'; END IF;
   END LOOP;
   checks:=checks||jsonb_build_array(mode);
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='ZP010',MESSAGE='rollback_predecessor_proof';
 EXCEPTION WHEN SQLSTATE 'ZP010' THEN NULL; END;
 RETURN jsonb_build_object('exports',exports,'checks',checks,'liveRowsRemovedDuringProof',true,'fixturesRolledBack',true);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_predecessor_proof_v1() FROM PUBLIC,anon,authenticated,service_role;
