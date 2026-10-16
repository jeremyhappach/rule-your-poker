-- Arcade is nonfinancial. No references or writes to multiplayer authority tables.
CREATE TABLE private.arcade_rulesets (
 id text PRIMARY KEY, game text NOT NULL, config jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true
);
INSERT INTO private.arcade_rulesets VALUES ('run21/arcade-1','run21',
 '{"preset":"run21/1","rounds":3,"columns":5,"target":21,"passes":1,"multipliers":{"97":50,"98":100,"99":150,"100":200,"101":250,"102":300,"103":400,"104":500,"105":1000},"speed":{"start":250,"decrement":1,"intervalMs":1000},"expiration":"zero","bust":"zero","exhausted":"score","firstPlacementSeconds":30,"roundIntroMs":2500,"roundDurationMs":250000,"scorePresentationMs":5000,"silverCelebrationMs":2800,"goldCelebrationMs":3800}',true);
CREATE TABLE private.arcade_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 game text NOT NULL, ruleset text NOT NULL REFERENCES private.arcade_rulesets(id), config jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), state jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','completed','expired','abandoned')),
 score bigint NOT NULL DEFAULT 0 CHECK(score>=0), due_at bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_at timestamptz
);
CREATE UNIQUE INDEX arcade_one_unfinished ON private.arcade_runs(user_id,game) WHERE status='active';
CREATE INDEX arcade_due ON private.arcade_runs(due_at,id) WHERE status='active';
CREATE TABLE private.arcade_command_receipts (
 user_id uuid NOT NULL, request_id uuid NOT NULL, run_id uuid NOT NULL REFERENCES private.arcade_runs(id),
 fingerprint text NOT NULL, revision bigint NOT NULL, PRIMARY KEY(user_id,request_id)
);
CREATE TABLE private.arcade_results (
 run_id uuid PRIMARY KEY REFERENCES private.arcade_runs(id),user_id uuid NOT NULL,
 game text NOT NULL,ruleset text NOT NULL,score bigint NOT NULL CHECK(score>=0),revision bigint NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(), final_state jsonb NOT NULL
);
CREATE INDEX arcade_results_window ON private.arcade_results(game,ruleset,completed_at DESC,user_id,score DESC);
CREATE INDEX arcade_results_best ON private.arcade_results(game,ruleset,user_id,score DESC,completed_at);
CREATE TABLE public.arcade_revisions (
 run_id uuid PRIMARY KEY REFERENCES private.arcade_runs(id),user_id uuid NOT NULL,revision bigint NOT NULL
);
CREATE TABLE private.arcade_recovery_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),token uuid,claimed boolean NOT NULL DEFAULT false,
 expires_at timestamptz,last_completed_at timestamptz,failure text
);
INSERT INTO private.arcade_recovery_state(singleton) VALUES(true);
ALTER TABLE private.arcade_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.arcade_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.arcade_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.arcade_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.arcade_recovery_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.arcade_rulesets,private.arcade_runs,private.arcade_command_receipts,private.arcade_results,private.arcade_recovery_state,public.arcade_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.arcade_revisions TO authenticated;
CREATE POLICY arcade_owner_revision ON public.arcade_revisions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION private.arcade_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
$$;
CREATE FUNCTION private.arcade_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='arcade_results' THEN RAISE EXCEPTION 'arcade:immutable_result';END IF;
 IF TG_TABLE_NAME='arcade_rulesets' AND (NEW.id,NEW.game,NEW.config) IS DISTINCT FROM (OLD.id,OLD.game,OLD.config) THEN RAISE EXCEPTION 'arcade:immutable_ruleset';END IF;
 IF TG_TABLE_NAME='arcade_runs' THEN
  IF (NEW.id,NEW.user_id,NEW.game,NEW.ruleset,NEW.config,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.game,OLD.ruleset,OLD.config,OLD.created_at) OR OLD.status<>'active' THEN RAISE EXCEPTION 'arcade:immutable_run';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER arcade_result_immutable BEFORE UPDATE OR DELETE ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION private.arcade_immutable();
CREATE TRIGGER arcade_rules_immutable BEFORE UPDATE ON private.arcade_rulesets FOR EACH ROW EXECUTE FUNCTION private.arcade_immutable();
CREATE TRIGGER arcade_run_identity BEFORE UPDATE ON private.arcade_runs FOR EACH ROW EXECUTE FUNCTION private.arcade_immutable();

CREATE FUNCTION public.arcade_start(p_actor uuid,p_request uuid,p_game text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; rules private.arcade_rulesets;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_game IS DISTINCT FROM 'run21' THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 IF EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true')
  AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:maintenance';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_game,0));
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF receipt.fingerprint<>'start:'||p_game THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=receipt.run_id;
 ELSE
  SELECT * INTO run FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active';
  IF NOT FOUND THEN
   SELECT * INTO rules FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,p_game,rules.id,rules.config,floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO run;
   INSERT INTO public.arcade_revisions VALUES(run.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,run.id,'start:'||p_game,run.revision);
 END IF;
 RETURN to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;

CREATE FUNCTION public.arcade_load(p_actor uuid,p_run uuid,p_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run AND user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 RETURN to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'receipt',CASE WHEN receipt.request_id IS NULL THEN NULL ELSE to_jsonb(receipt) END);
END $$;

CREATE FUNCTION public.arcade_commit(p_actor uuid,p_run uuid,p_revision bigint,p_state jsonb,p_due bigint,
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

CREATE FUNCTION public.arcade_leaderboard(p_actor uuid,p_game text,p_window text,p_result uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE version_i text;answer jsonb;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 SELECT id INTO version_i FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
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
 SELECT jsonb_build_object('ruleset',version_i,
  'rows',coalesce((SELECT jsonb_agg(item ORDER BY score DESC,completed_at,user_id) FROM(SELECT * FROM named ORDER BY score DESC,completed_at,user_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor),
  'personalBest',(SELECT max(score) FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND ruleset=version_i),
  'previousBests',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM(SELECT ruleset,max(score) score FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND ruleset<>version_i GROUP BY ruleset)b),'[]'),
  'activeRun',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active'),
  'latestResult',(SELECT jsonb_build_object('id',id,'score',score,'status',status) FROM private.arcade_runs WHERE id=p_result AND user_id=p_actor AND game=p_game AND status<>'active')) INTO answer;
 RETURN answer;
END $$;

CREATE FUNCTION private.arcade_dispatch_recovery() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.arcade_recovery_state;token_i uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT s FROM private.arcade_recovery_state WHERE singleton FOR UPDATE;
 IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN;END IF;
 UPDATE private.arcade_recovery_state SET token=token_i,claimed=false,expires_at=clock_timestamp()+interval '25 seconds' WHERE singleton;
 PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/arcade-recovery',
  headers:=jsonb_build_object('Content-Type','application/json','x-arcade-dispatch',token_i::text),body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
CREATE FUNCTION public.arcade_recovery_claim(p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.arcade_recovery_state SET claimed=true WHERE singleton AND token=p_token AND NOT claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000))) FROM(
  SELECT * FROM private.arcade_runs WHERE status='active' AND due_at<=extract(epoch FROM clock_timestamp())*1000 ORDER BY due_at,id LIMIT 20)r),'[]');
END $$;
CREATE FUNCTION public.arcade_recovery_complete(p_token uuid,p_failure text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.arcade_recovery_state SET token=NULL,claimed=false,failure=left(p_failure,160),
 last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END
 WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION private.arcade_allowed(uuid),private.arcade_immutable(),private.arcade_dispatch_recovery() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arcade_start(uuid,uuid,text),public.arcade_load(uuid,uuid,uuid),public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid),public.arcade_leaderboard(uuid,text,text,uuid),public.arcade_recovery_claim(uuid),public.arcade_recovery_complete(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arcade_start(uuid,uuid,text),public.arcade_load(uuid,uuid,uuid),public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid),public.arcade_leaderboard(uuid,text,text,uuid),public.arcade_recovery_claim(uuid),public.arcade_recovery_complete(uuid,text) TO service_role;
-- Platform installation is last, after the entire candidate proof passes.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.arcade_revisions;END IF;
END $$;
SELECT cron.schedule('arcade-recovery','5 seconds','SELECT private.arcade_dispatch_recovery()');
