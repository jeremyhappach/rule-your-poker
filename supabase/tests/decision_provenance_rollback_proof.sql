-- Run after the migration, always inside a rolled-back transaction/savepoint.
-- Helpers create only exact fake-money games; no historical rows are updated.
CREATE TEMP TABLE IF NOT EXISTS decision_proof_results (metric text, value jsonb);

CREATE OR REPLACE FUNCTION pg_temp.decision_proof_fixture(p_bot boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $fixture$
DECLARE u uuid[]; g uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); p1 uuid; p2 uuid; r uuid; result jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO u FROM
    (SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2) p;
  IF cardinality(u)<2 THEN RAISE EXCEPTION 'provenance proof requires two profiles'; END IF;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM set_config('request.path','',true);
  PERFORM set_config('app.three_five_seven_recovery','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,
    ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,current_round,pot,real_money,
    timeout_enforcement_enabled,timeout_action)
  VALUES(g,'Codex rollback proof - decision provenance','ante_decision','3-5-7',d,u[1],1,1,1,1,3,0,NULL,0,false,true,'auto_fold');
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,u[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
    VALUES(g,u[1],1,100,'active',false,false,'ante_up') RETURNING id INTO p1;
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
    VALUES(g,u[2],2,100,'active',false,p_bot,'ante_up') RETURNING id INTO p2;
  result:=public.three_five_seven_begin_game(g); r:=(result->>'round_id')::uuid;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  RETURN jsonb_build_object('game',g,'dealer',d,'round',r,'p1',p1,'p2',p2,'user1',u[1],'user2',u[2]);
END;
$fixture$;

CREATE OR REPLACE FUNCTION pg_temp.decision_proof_benchmark(p_label text)
RETURNS void LANGUAGE plpgsql AS $benchmark$
DECLARE f jsonb:=pg_temp.decision_proof_fixture(); t timestamptz; samples double precision[]:='{}'; n int;
BEGIN
  PERFORM set_config('request.path','/rpc/three_five_seven_submit_decision',true);
  PERFORM set_config('request.headers',jsonb_build_object('x-client-info','ptown-decision/1 '||jsonb_build_object(
    'version',1,'requestId',gen_random_uuid(),'gameId',f->>'game','dealerGameId',f->>'dealer',
    'roundId',f->>'round','playerId',f->>'p1','decision','fold','source','button',
    'build','benchmark','activatedAt',123456,'trusted',true,'modality','mouse')::text)::text,true);
  FOR n IN 1..80 LOOP
    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    UPDATE public.players SET current_decision=NULL,decision_locked=false WHERE id=(f->>'p1')::uuid;
    DELETE FROM public.player_actions WHERE round_id=(f->>'round')::uuid AND player_id=(f->>'p1')::uuid;
    PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
    t:=clock_timestamp();
    PERFORM public.three_five_seven_submit_decision((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1,(f->>'p1')::uuid,'fold');
    samples:=array_append(samples,extract(epoch FROM clock_timestamp()-t)*1000);
  END LOOP;
  INSERT INTO decision_proof_results SELECT p_label,jsonb_build_object('n',count(*),
    'median_ms',percentile_cont(0.5) WITHIN GROUP(ORDER BY x),'p95_ms',percentile_cont(0.95) WITHIN GROUP(ORDER BY x),
    'max_ms',max(x)) FROM unnest(samples) x;
END;
$benchmark$;

-- PROVENANCE_ASSERTIONS_BEGIN
DO $proof$
DECLARE f jsonb; c jsonb; row_data record; result jsonb; source text; count_before int; version bigint;
BEGIN
  IF has_table_privilege('authenticated','private.decision_provenance','SELECT')
    OR has_table_privilege('anon','private.decision_provenance','SELECT')
    OR has_table_privilege('authenticated','private.decision_provenance','INSERT')
    OR has_function_privilege('authenticated','private.record_357_decision_provenance()','EXECUTE') THEN
    RAISE EXCEPTION 'provenance private access exposed';
  END IF;

  FOREACH source IN ARRAY ARRAY['button','auto_fold','missing','malformed','wrong_round','forged_deadline'] LOOP
    f:=pg_temp.decision_proof_fixture();
    c:=jsonb_build_object('version',1,'requestId',gen_random_uuid(),'gameId',f->>'game','dealerGameId',f->>'dealer',
      'roundId',CASE WHEN source='wrong_round' THEN gen_random_uuid()::text ELSE f->>'round' END,
      'playerId',f->>'p1','decision','fold','source',CASE WHEN source='forged_deadline' THEN 'server_deadline' ELSE source END,
      'build','proof-build','activatedAt',123456,'trusted',true,'modality','touch','secret','MUST_NOT_BE_STORED');
    PERFORM set_config('request.path','/rpc/three_five_seven_submit_decision',true);
    PERFORM set_config('request.headers',CASE WHEN source='missing' THEN '{}' ELSE
      jsonb_build_object('x-client-info','ptown-decision/1 '||CASE WHEN source='malformed' THEN 'not-json' ELSE c::text END)::text END,true);
    result:=public.three_five_seven_submit_decision((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1,(f->>'p1')::uuid,'fold');
    SELECT * INTO STRICT row_data FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid AND event_kind='decision_committed';
    IF result->>'outcome'<>'decision_committed' OR row_data.server_context->>'producer'<>'authenticated_decision_rpc'
      OR row_data.server_context->>'actor_user_id'<>f->>'user1' OR row_data.client_claim ? 'secret'
      OR row_data.client_claim->>'source'<>(CASE WHEN source IN ('button','auto_fold') THEN source ELSE 'unknown' END)
      OR (source IN ('button','auto_fold') AND row_data.client_claim->>'request_id'<>c->>'requestId') THEN
      RAISE EXCEPTION 'provenance attribution invalid: %, %',source,to_jsonb(row_data);
    END IF;
    -- Replay does not replace original attribution or mint another committed event.
    result:=public.three_five_seven_submit_decision((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1,(f->>'p1')::uuid,'fold');
    IF result->>'outcome'<>'already_decided' OR (SELECT count(*) FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid)<>1 THEN
      RAISE EXCEPTION 'provenance duplicate action';
    END IF;
    BEGIN
      PERFORM public.three_five_seven_submit_decision((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1,(f->>'p2')::uuid,'fold');
      RAISE EXCEPTION 'provenance unauthorized action accepted';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_player_owner%' THEN RAISE; END IF; END;
    IF (SELECT count(*) FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid)<>1 THEN RAISE EXCEPTION 'refused action journaled as accepted'; END IF;
  END LOOP;

  f:=pg_temp.decision_proof_fixture();
  PERFORM set_config('request.path','/rpc/set_automatic_play',true);
  SELECT intent_version INTO version FROM public.players WHERE id=(f->>'p1')::uuid;
  PERFORM public.set_automatic_play((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,(f->>'p1')::uuid,version,true);
  IF NOT EXISTS(SELECT 1 FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid AND event_kind='auto_fold_changed'
    AND server_context->>'producer'='authenticated_preference_rpc' AND server_context->>'auto_fold'='true'
    AND server_context->>'auto_fold_before'='false') THEN RAISE EXCEPTION 'preference change missing'; END IF;

  f:=pg_temp.decision_proof_fixture();
  PERFORM set_config('request.path','/rpc/three_five_seven_expire_round',true);
  result:=public.three_five_seven_expire_round((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1);
  IF result->>'outcome'<>'not_due' OR EXISTS(SELECT 1 FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid) THEN RAISE EXCEPTION 'early timeout changed'; END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.rounds SET decision_deadline=clock_timestamp()-interval '1 second' WHERE id=(f->>'round')::uuid;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM public.three_five_seven_expire_round((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1);
  IF (SELECT count(*) FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid AND server_context->>'producer'='server_deadline')<>2 THEN RAISE EXCEPTION 'deadline source missing'; END IF;

  f:=pg_temp.decision_proof_fixture(true);
  PERFORM set_config('request.path','',true);
  PERFORM private.three_five_seven_recover_game((f->>'game')::uuid);
  IF NOT EXISTS(SELECT 1 FROM private.decision_provenance WHERE game_id=(f->>'game')::uuid
    AND player_id=(f->>'p2')::uuid AND server_context->>'producer'='server_bot_recovery') THEN RAISE EXCEPTION 'bot source missing'; END IF;

  -- Even a failed private write cannot reject a valid decision; fault scoped to one synthetic session.
  f:=pg_temp.decision_proof_fixture();
  EXECUTE format('ALTER TABLE private.decision_provenance ADD CONSTRAINT proof_private_write_failure CHECK (game_id<>%L::uuid) NOT VALID',f->>'game');
  result:=public.three_five_seven_submit_decision((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealer')::uuid,1,1,(f->>'p1')::uuid,'fold');
  ALTER TABLE private.decision_provenance DROP CONSTRAINT proof_private_write_failure;
  IF result->>'outcome'<>'decision_committed' OR NOT EXISTS(SELECT 1 FROM public.player_actions WHERE round_id=(f->>'round')::uuid AND player_id=(f->>'p1')::uuid) THEN RAISE EXCEPTION 'diagnostic failure rejected gameplay'; END IF;
  INSERT INTO decision_proof_results VALUES('provenance_assertions','{"passed":true,"cases":["button","automatic","missing","malformed","wrong_scope","forged_source","replay","authorization","preference","deadline","bot_recovery","storage_failure","private_access"]}');
END;
$proof$;

SELECT pg_temp.decision_proof_benchmark('instrumented_rpc');
