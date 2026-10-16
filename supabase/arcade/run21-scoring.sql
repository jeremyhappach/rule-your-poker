-- Stage disabled. Activate with activate-run21-scoring.sql after compatible bundles publish.
-- Existing runs and results are never rewritten.
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('run21/arcade-2','run21',$config${"preset":"run21/arcade-2","rounds":3,"columns":5,"target":21,"passes":1,"multipliers":{"97":50,"98":100,"99":150,"100":200,"101":250,"102":300,"103":400,"104":500,"105":1000},"speed":{"start":280,"decrement":2,"intervalMs":420,"bands":[{"until":200,"intervalMs":420},{"until":0,"intervalMs":900}]},"expiration":"zero","bust":"zero","exhausted":"score","clockStart":"intro_end","roundIntroMs":2500,"roundDurationMs":106800,"scorePresentationMs":5000,"silverCelebrationMs":2800,"goldCelebrationMs":3800}$config$::jsonb,false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='run21/arcade-2' AND config=$config${"preset":"run21/arcade-2","rounds":3,"columns":5,"target":21,"passes":1,"multipliers":{"97":50,"98":100,"99":150,"100":200,"101":250,"102":300,"103":400,"104":500,"105":1000},"speed":{"start":280,"decrement":2,"intervalMs":420,"bands":[{"until":200,"intervalMs":420},{"until":0,"intervalMs":900}]},"expiration":"zero","bust":"zero","exhausted":"score","clockStart":"intro_end","roundIntroMs":2500,"roundDurationMs":106800,"scorePresentationMs":5000,"silverCelebrationMs":2800,"goldCelebrationMs":3800}$config$::jsonb) THEN RAISE EXCEPTION 'arcade:ruleset_conflict';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.arcade_commit(p_actor uuid,p_run uuid,p_revision bigint,p_state jsonb,p_due bigint,
 p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;status_i text:=p_state->>'status';score_i bigint:=(p_state->>'score')::bigint;
BEGIN
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',to_jsonb(run));
  END IF;
 END IF;
 IF run.revision<>p_revision OR run.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',to_jsonb(run));END IF;
 -- A request computed before expiry may acquire this lock after expiry.
 -- Only the new clock policy changes; worker synchronization can commit its timeout.
 IF p_request IS NOT NULL AND run.config->>'clockStart'='intro_end'
  AND run.state->'board'->'result'='null'::jsonb
  AND (run.state->'board'->>'deadline')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RETURN jsonb_build_object('outcome','deadline','record',to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
 END IF;
 IF p_state->>'runId' IS DISTINCT FROM run.id::text OR p_state->>'userId' IS DISTINCT FROM run.user_id::text
  OR p_state->'config' IS DISTINCT FROM run.config OR status_i NOT IN('active','completed','expired','abandoned')
  OR score_i IS NULL OR score_i<0 OR (p_state->>'round')::integer NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF status_i='completed' AND ((p_state->>'round')::integer<>3 OR jsonb_array_length(p_state->'results')<>3
  OR score_i<>(SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(p_state->'results') x)) THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,
  due_at=CASE WHEN status_i='active' THEN p_due END,updated_at=clock_timestamp(),
  ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=p_run RETURNING * INTO run;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(run.user_id,p_request,p_run,p_fingerprint,run.revision);END IF;
 IF status_i='completed' THEN
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state)
   VALUES(run.id,run.user_id,run.game,run.ruleset,run.score,run.revision,run.ended_at,p_state);
 END IF;
 UPDATE public.arcade_revisions SET revision=run.revision WHERE run_id=p_run;
 RETURN jsonb_build_object('outcome','committed','record',to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
END $$;


DROP FUNCTION IF EXISTS public.arcade_leaderboard(uuid,text,text,uuid);
CREATE OR REPLACE FUNCTION public.arcade_leaderboard(p_actor uuid,p_game text,p_window text,p_result uuid DEFAULT NULL,p_ruleset text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE version_i text;current_i text;answer jsonb;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 SELECT id INTO current_i FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
 version_i:=coalesce(p_ruleset,current_i);
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id=version_i AND game=p_game) THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 IF version_i IS NULL THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 WITH best AS (
  SELECT DISTINCT ON(user_id) user_id,score,completed_at,run_id FROM private.arcade_results
   WHERE game=p_game AND ruleset=version_i AND (p_window='all' OR completed_at>=statement_timestamp()-interval '30 days')
   ORDER BY user_id,score DESC,completed_at,run_id
 ), ranked AS (
  SELECT b.*,rank() OVER(ORDER BY score DESC) place FROM best b
 ), named AS (
  SELECT jsonb_build_object('userId',r.user_id,'name',coalesce(p.username,'Player'),'score',r.score,'rank',r.place,'completedAt',r.completed_at) item,r.*
   FROM ranked r LEFT JOIN public.profiles p ON p.id=r.user_id
 )
 SELECT jsonb_build_object('ruleset',version_i,'currentRuleset',current_i,'availableRulesets',(SELECT jsonb_agg(id ORDER BY id DESC) FROM private.arcade_rulesets WHERE game=p_game),
  'rows',coalesce((SELECT jsonb_agg(item ORDER BY score DESC,completed_at,user_id) FROM(SELECT * FROM named ORDER BY score DESC,completed_at,user_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor),
  'personalBest',(SELECT max(score) FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND ruleset=version_i),
  'previousBests',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM(SELECT ruleset,max(score) score FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND ruleset<>version_i GROUP BY ruleset)b),'[]'),
  'activeRun',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active'),
  'latestResult',(SELECT jsonb_build_object('id',id,'score',score,'status',status,'ruleset',ruleset) FROM private.arcade_runs WHERE id=p_result AND user_id=p_actor AND game=p_game AND status<>'active')) INTO answer;
 RETURN answer;
END $$;


REVOKE ALL ON FUNCTION public.arcade_leaderboard(uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_leaderboard(uuid,text,text,uuid,text) TO service_role;
