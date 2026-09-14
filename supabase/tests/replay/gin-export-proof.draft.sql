CREATE OR REPLACE FUNCTION private.replay_gin_export_proof_v1(_sample integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE v_case record; v_f jsonb; v_viewer text; v_public boolean; v_package jsonb; v_again jsonb; v_exports jsonb:='[]';
 v_state jsonb; v_balances jsonb; v_game public.games; v_round public.rounds; v_denied boolean; v_steps_before bigint; v_result jsonb; v_next uuid;
BEGIN
 BEGIN
  FOR v_case IN SELECT * FROM private.replay_gin_benchmark_samples WHERE sample=_sample AND enabled
    AND category IN ('reveal_void','scoring','settlement_terminal') ORDER BY category LOOP
   v_f:=v_case.fixture;
   SELECT * INTO v_game FROM public.games WHERE id=(v_f->>'game')::uuid;
   SELECT * INTO v_round FROM public.rounds WHERE id=(v_f->>'round')::uuid;
   SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round.id;
   SELECT jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',v_game.pot) INTO v_balances FROM public.players WHERE game_id=v_game.id;
   -- Outsider may not request even the public perspective of a private session.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
   v_denied:=false;
   BEGIN PERFORM public.export_gin_replay_v1(v_game.id,v_round.id,true);
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_historical_participant%' THEN RAISE; END IF;v_denied:=true; END;
   IF NOT v_denied THEN RAISE EXCEPTION 'proof:outsider_export_allowed'; END IF;
   FOR v_viewer IN SELECT value FROM jsonb_array_elements_text(v_f->'users') LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_viewer,'role','authenticated')::text,true);
    FOREACH v_public IN ARRAY ARRAY[true,false] LOOP
     v_package:=public.export_gin_replay_v1(v_game.id,v_round.id,v_public);
     IF v_package #> ARRAY['steps',(jsonb_array_length(v_package->'steps')-1)::text,'closing','balances'] IS DISTINCT FROM v_balances THEN
      RAISE EXCEPTION 'proof:closing_balance_mismatch'; END IF;
     IF (v_package #> ARRAY['steps',(jsonb_array_length(v_package->'steps')-1)::text,'closing','endingState','session'])-ARRAY['authority_revision','chip_transfer_cursor','pot_transfer_cursor'] IS DISTINCT FROM to_jsonb(v_game)-ARRAY['replay_contract_version','authority_revision','chip_transfer_cursor','pot_transfer_cursor']
       OR v_package #> ARRAY['steps',(jsonb_array_length(v_package->'steps')-1)::text,'closing','endingState','round'] IS DISTINCT FROM to_jsonb(v_round)-ARRAY['gin_rummy_state','authority_revision'] THEN
      RAISE EXCEPTION 'proof:ending_envelope_mismatch'; END IF;
     v_exports:=v_exports||jsonb_build_array(jsonb_build_object('category',v_case.category,'package',v_package));
    END LOOP;
   END LOOP;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_f->>'user','role','authenticated')::text,true);
   SELECT count(*) INTO v_steps_before FROM private.replay_steps WHERE session_id=v_game.id;
   IF v_case.category='settlement_terminal' THEN
    v_result:=public.gin_rummy_settle_game(v_game.id,v_round.id,v_round.dealer_game_id,v_round.hand_number);
    IF v_result->>'status' IS DISTINCT FROM 'already_settled' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=v_game.id)<>v_steps_before THEN
      RAISE EXCEPTION 'proof:duplicate_settlement_journaled'; END IF;
   ELSE
    v_result:=public.gin_rummy_start_next_hand(v_round.id);v_next:=(v_result->>'round_id')::uuid;
    IF v_result->>'outcome' IS DISTINCT FROM 'started' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=v_game.id)<>v_steps_before+1 THEN
     RAISE EXCEPTION 'proof:continuation_opening_missing'; END IF;
    v_result:=public.gin_rummy_start_next_hand(v_round.id);
    IF v_result->>'outcome' IS DISTINCT FROM 'already_started' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=v_game.id)<>v_steps_before+1 THEN
     RAISE EXCEPTION 'proof:duplicate_continuation'; END IF;
   END IF;
   -- Remove all mutable gameplay tables' rows for this synthetic session. The
   -- same historical export must remain available and byte-equivalent as JSONB.
   v_package:=public.export_gin_replay_v1(v_game.id,v_round.id,false);
   DELETE FROM public.games WHERE id=v_game.id;
   IF EXISTS(SELECT 1 FROM public.rounds WHERE game_id=v_game.id) OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game.id) THEN
    RAISE EXCEPTION 'proof:mutable_fixture_rows_remain'; END IF;
   v_again:=public.export_gin_replay_v1(v_game.id,v_round.id,false);
   IF v_again IS DISTINCT FROM v_package THEN RAISE EXCEPTION 'proof:export_depends_on_live_state'; END IF;
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='ZP002',MESSAGE='rollback_export_proof';
 EXCEPTION WHEN SQLSTATE 'ZP002' THEN NULL;
 END;
 RETURN jsonb_build_object('exports',v_exports,'liveRowsRemovedDuringProof',true,'fixturesRolledBack',true);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_export_proof_v1(integer) FROM PUBLIC,anon,authenticated,service_role;
