-- Candidate only. Admission stays closed until the complete release gate passes.
-- Scores are stored in hundredths of an arcade point; never wallet currency.
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES
 ('river-city-run/1','river-city-run','{"id":"the-boat","version":"river-city-run/1"}',false)
 ON CONFLICT(id) DO NOTHING;
CREATE INDEX IF NOT EXISTS arcade_river_course ON private.arcade_results
 ((final_state#>>'{config,id}'),ruleset,score DESC,completed_at,run_id) WHERE game='river-city-run';

CREATE OR REPLACE FUNCTION public.arcade_river_start(p_actor uuid,p_request uuid,p_course text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.arcade_runs;receipt private.arcade_command_receipts;f text:='river:start:'||p_course;
BEGIN
 PERFORM private.require_account_enabled(p_actor);
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_course IS DISTINCT FROM 'the-boat' THEN RAISE EXCEPTION 'arcade:invalid_course';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||'river-city-run',0));
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF receipt.fingerprint IS DISTINCT FROM f THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
  SELECT * INTO STRICT r FROM private.arcade_runs WHERE id=receipt.run_id;
 ELSE
  SELECT * INTO r FROM private.arcade_runs WHERE user_id=p_actor AND game='river-city-run' AND status='active';
  IF FOUND THEN
   IF r.config->>'id' IS DISTINCT FROM p_course THEN RAISE EXCEPTION 'arcade:other_course_active';END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='river-city-run/1' AND enabled) THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   IF EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:maintenance';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at)
    VALUES(p_actor,'river-city-run','river-city-run/1','{"id":"the-boat","version":"river-city-run/1"}',floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO r;
   INSERT INTO public.arcade_revisions VALUES(r.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,r.id,f,r.revision);
 END IF;
 RETURN to_jsonb(r)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_river_commit(p_actor uuid,p_run uuid,p_revision bigint,p_state jsonb,p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.arcade_runs;receipt private.arcade_command_receipts;at_ms bigint;status_i text;score_i bigint;expected numeric;prior bigint;
BEGIN
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSE
  PERFORM private.require_account_enabled(p_actor);
  IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO r FROM private.arcade_runs WHERE id=p_run FOR UPDATE;at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT FOUND OR r.game<>'river-city-run' OR (p_actor IS NOT NULL AND r.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=r.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>r.id OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));
  END IF;
 END IF;
 IF r.revision IS DISTINCT FROM p_revision OR r.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));END IF;
 status_i:=p_state->>'status';score_i:=round((p_state->>'score')::numeric*100);
 IF p_state->>'id' IS DISTINCT FROM r.id::text OR p_state->>'owner' IS DISTINCT FROM r.user_id::text
  OR p_state->>'ruleset' IS DISTINCT FROM r.ruleset OR p_state->'config' IS DISTINCT FROM r.config
  OR status_i NOT IN('active','completed','abandoned') OR status_i IS NULL OR score_i IS NULL OR score_i<0
  OR p_state#>'{road,practice}' IS NOT NULL OR p_state#>'{road,previewSample}' IS NOT NULL
  OR (p_state#>>'{road,t}')::numeric NOT BETWEEN 0 AND 186
  OR (r.state IS NOT NULL AND (p_state#>>'{road,t}')::numeric<(r.state#>>'{road,t}')::numeric)
 THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF status_i='completed' THEN
  IF p_state->'casino'<>'null'::jsonb THEN
   IF p_state#>>'{casino,phase}' IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
   expected:=(p_state#>>'{casino,balance}')::numeric;
  ELSE
   IF p_state#>>'{road,phase}' NOT IN('finished','crashed') THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
   expected:=floor((p_state#>>'{road,distance}')::numeric)+(p_state#>>'{road,money}')::numeric
    +CASE WHEN p_state#>>'{road,resultKind}'='arrival' AND (p_state#>>'{road,hitCount}')::integer=0 THEN 500 ELSE 0 END;
  END IF;
  IF expected IS NULL OR score_i<>round(expected*100) THEN RAISE EXCEPTION 'arcade:invalid_score';END IF;
 END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,
  due_at=CASE WHEN status_i='active' THEN (p_state->>'deadline')::bigint END,updated_at=clock_timestamp(),ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=r.id RETURNING * INTO r;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(r.user_id,p_request,r.id,p_fingerprint,r.revision);END IF;
 IF status_i='completed' THEN
  SELECT max(score) INTO prior FROM private.arcade_results WHERE user_id=r.user_id AND game=r.game AND ruleset=r.ruleset AND final_state#>>'{config,id}'=r.config->>'id';
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record)
   VALUES(r.id,r.user_id,r.game,r.ruleset,r.score,r.revision,r.ended_at,p_state,jsonb_build_object('priorBest',prior,'kind',CASE WHEN prior IS NULL THEN 'first' WHEN r.score>prior THEN 'broken' WHEN r.score=prior THEN 'matched' ELSE 'lower' END));
 END IF;
 UPDATE public.arcade_revisions SET revision=r.revision WHERE run_id=r.id;
 RETURN jsonb_build_object('outcome','committed','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_river_board(p_actor uuid,p_course text,p_window text DEFAULT '30') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 PERFORM private.require_account_enabled(p_actor);
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_course IS DISTINCT FROM 'the-boat' THEN RAISE EXCEPTION 'arcade:invalid_course';END IF;
 IF p_window IS NULL OR p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 WITH eligible AS(SELECT r.*,rank() OVER(ORDER BY score DESC) place FROM private.arcade_results r
  WHERE game='river-city-run' AND ruleset='river-city-run/1' AND final_state#>>'{config,id}'=p_course AND (p_window='all' OR completed_at>=statement_timestamp()-interval '30 days')),
 named AS(SELECT e.*,jsonb_build_object('runId',e.run_id,'name',coalesce(p.username,'Player'),'score',e.score/100.0,'rank',place,'completedAt',completed_at) item FROM eligible e LEFT JOIN public.profiles p ON p.id=e.user_id)
 SELECT jsonb_build_object('courseId',p_course,'rows',coalesce((SELECT jsonb_agg(item ORDER BY score DESC,completed_at,run_id) FROM(SELECT * FROM named ORDER BY score DESC,completed_at,run_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor ORDER BY score DESC,completed_at,run_id LIMIT 1),
  'personalBest',(SELECT max(score)/100.0 FROM private.arcade_results WHERE game='river-city-run' AND ruleset='river-city-run/1' AND user_id=p_actor AND final_state#>>'{config,id}'=p_course),
  'activeRun',(SELECT id FROM private.arcade_runs WHERE game='river-city-run' AND config->>'id'=p_course AND user_id=p_actor AND status='active'),
  'admission',EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='river-city-run/1' AND enabled)) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.arcade_river_start(uuid,uuid,text),public.arcade_river_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.arcade_river_board(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_river_start(uuid,uuid,text),public.arcade_river_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.arcade_river_board(uuid,text,text) TO service_role;
