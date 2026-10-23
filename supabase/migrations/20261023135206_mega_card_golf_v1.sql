-- Mega Card Golf /1. Existing games and boards preserved; new admission CLOSED.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
IF md5(pg_get_functiondef('private.arcade_allowed(uuid)'::regprocedure)) IS DISTINCT FROM '13dfa2faecc106360ca1270d0ca5cb96' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF md5(pg_get_functiondef('arcade_load(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'f06be670696b821e9e2e1dcbd88345f7' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF md5(pg_get_functiondef('arcade_recovery_claim(uuid)'::regprocedure)) IS DISTINCT FROM '08fbb344c0cd1493b5160203c4630e26' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF md5(pg_get_functiondef('private.golf_score(jsonb)'::regprocedure)) IS DISTINCT FROM '09f8e17f45c16d30983c8172128bac8b' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF to_regclass('private.arcade_mega_configs') IS NOT NULL THEN RAISE EXCEPTION 'mega:already_installed';END IF;
END $$;
-- LOCAL CANDIDATE ONLY. Apply inside a transaction after rollback qualification.
-- Reuses Arcade runs, receipts, results, revisions and recovery. Admission stays CLOSED.
DO $$ BEGIN
 IF to_regprocedure('private.golf_score(jsonb)') IS NULL THEN RAISE EXCEPTION 'mega:canonical_golf_scorer_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='private' AND indexname='arcade_one_unfinished') THEN RAISE EXCEPTION 'mega:arcade_index_required';END IF;
END $$;
ALTER TABLE private.arcade_runs DROP CONSTRAINT IF EXISTS arcade_runs_score_check;
ALTER TABLE private.arcade_runs ADD CONSTRAINT arcade_runs_score_check CHECK(game='mega-card-golf' OR score>=0);
ALTER TABLE private.arcade_results DROP CONSTRAINT IF EXISTS arcade_results_score_check;
ALTER TABLE private.arcade_results ADD CONSTRAINT arcade_results_score_check CHECK(game='mega-card-golf' OR score>=0);
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/1','mega-card-golf','{"engine":"mega-card-golf/1","opening":"player-selected","finalDraw":"resolve","score":"canonical-golf"}',false) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.arcade_mega_configs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course text NOT NULL CHECK(course IN('sunny-meadows','coastal-links','devils-canyon')),
 board_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),settings jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid REFERENCES auth.users(id),UNIQUE(course,revision)
);
CREATE TABLE IF NOT EXISTS private.arcade_mega_courses(id text PRIMARY KEY,config_id uuid NOT NULL REFERENCES private.arcade_mega_configs(id));
ALTER TABLE private.arcade_mega_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.arcade_mega_courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.arcade_mega_configs,private.arcade_mega_courses FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.mega_config_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'arcade:immutable_config';END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='mega_config_immutable' AND tgrelid='private.arcade_mega_configs'::regclass) THEN
 CREATE TRIGGER mega_config_immutable BEFORE UPDATE OR DELETE ON private.arcade_mega_configs FOR EACH ROW EXECUTE FUNCTION private.mega_config_immutable();END IF;END $$;
CREATE OR REPLACE FUNCTION private.mega_config(c private.arcade_mega_configs) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT c.settings||jsonb_build_object('id',c.course,'configId',c.id,'boardId',c.board_id,'revision',c.revision)
$$;
DO $$ DECLARE course_i text;settings_i jsonb;id_i uuid;idx integer:=0; BEGIN
 FOREACH course_i IN ARRAY ARRAY['sunny-meadows','coastal-links','devils-canyon'] LOOP
  idx:=idx+1;
  IF NOT EXISTS(SELECT 1 FROM private.arcade_mega_courses WHERE id=course_i) THEN
   settings_i:=jsonb_build_object('enabled',true,'name',(ARRAY['Sunny Meadows','Coastal Links','Devil''s Canyon'])[idx],'difficulty',(ARRAY['Easy','Medium','Hard'])[idx],
    'holes',9,'stockAllowance',(ARRAY[16,12,8])[idx],'discardAllowance',(ARRAY[5,3,1])[idx],'initialExposed',2,'completionSeconds',300);
   INSERT INTO private.arcade_mega_configs(course,board_id,revision,settings) VALUES(course_i,gen_random_uuid(),1,settings_i) RETURNING id INTO id_i;
   INSERT INTO private.arcade_mega_courses VALUES(course_i,id_i);
  END IF;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS arcade_mega_board ON private.arcade_results((final_state#>>'{config,id}'),(final_state#>>'{config,boardId}'),score,completed_at,run_id) WHERE game='mega-card-golf';

CREATE OR REPLACE FUNCTION public.arcade_mega_save(p_actor uuid,p_course text,p_revision bigint,p_settings jsonb,p_choice text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old private.arcade_mega_configs;next private.arcade_mega_configs;key_i text;v numeric;changed boolean;
BEGIN
 IF NOT private.arcade_allowed(p_actor) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:admin_required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.arcade_mega_courses WHERE id=p_course FOR UPDATE;
 SELECT c.* INTO old FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id WHERE p.id=p_course;
 IF NOT FOUND OR old.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'arcade:stale_config';END IF;
 IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p_settings->'name') IS DISTINCT FROM 'string' OR length(trim(p_settings->>'name')) NOT BETWEEN 1 AND 60
  OR coalesce(p_settings->>'difficulty','') NOT IN('Easy','Medium','Hard') THEN RAISE EXCEPTION 'arcade:invalid_config';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_settings))<>8 THEN RAISE EXCEPTION 'arcade:invalid_config';END IF;
 FOREACH key_i IN ARRAY ARRAY['holes','stockAllowance','discardAllowance','initialExposed','completionSeconds'] LOOP
  IF jsonb_typeof(p_settings->key_i) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'arcade:invalid_config';END IF;
  v:=(p_settings->>key_i)::numeric;
  IF v<>trunc(v) OR v<(CASE WHEN key_i IN('discardAllowance','initialExposed') THEN 0 WHEN key_i='completionSeconds' THEN 60 ELSE 1 END)
   OR v>(CASE key_i WHEN 'holes' THEN 18 WHEN 'initialExposed' THEN 5 WHEN 'completionSeconds' THEN 3600 ELSE 46 END) THEN RAISE EXCEPTION 'arcade:invalid_config';END IF;
 END LOOP;
 IF (p_settings->>'discardAllowance')::integer>(p_settings->>'stockAllowance')::integer THEN RAISE EXCEPTION 'arcade:invalid_config';END IF;
 changed:=(old.settings-ARRAY['name','difficulty','enabled']) IS DISTINCT FROM (p_settings-ARRAY['name','difficulty','enabled']);
 IF (changed AND p_choice IS NULL) OR (p_choice IS NOT NULL AND p_choice NOT IN('retain','archive')) THEN RAISE EXCEPTION 'arcade:board_choice_required';END IF;
 INSERT INTO private.arcade_mega_configs(course,board_id,revision,settings,created_by)
 VALUES(p_course,CASE WHEN p_choice='archive' THEN gen_random_uuid() ELSE old.board_id END,old.revision+1,p_settings,p_actor) RETURNING * INTO next;
 UPDATE private.arcade_mega_courses SET config_id=next.id WHERE id=p_course;
 RETURN private.mega_config(next);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_mega_start(p_actor uuid,p_request uuid,p_course text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.arcade_runs;c private.arcade_mega_configs;receipt private.arcade_command_receipts;fingerprint text:='mega:start:'||p_course;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_course IS NULL THEN RAISE EXCEPTION 'arcade:invalid_request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||'mega-card-golf',0));
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
  SELECT * INTO STRICT r FROM private.arcade_runs WHERE id=receipt.run_id;
 ELSE
  SELECT * INTO r FROM private.arcade_runs WHERE user_id=p_actor AND game='mega-card-golf' AND status='active';
  IF FOUND THEN
   IF r.config->>'id' IS DISTINCT FROM p_course THEN RAISE EXCEPTION 'arcade:other_course_active';END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='mega-card-golf/1' AND enabled) THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   IF EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:maintenance';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
   PERFORM 1 FROM private.arcade_mega_courses WHERE id=p_course FOR SHARE;
   SELECT cfg.* INTO c FROM private.arcade_mega_configs cfg JOIN private.arcade_mega_courses p ON p.config_id=cfg.id WHERE p.id=p_course;
   IF NOT FOUND OR c.settings->>'enabled'<>'true' THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,'mega-card-golf','mega-card-golf/1',private.mega_config(c),floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO r;
   INSERT INTO public.arcade_revisions VALUES(r.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,r.id,fingerprint,r.revision);
 END IF;
 RETURN to_jsonb(r)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_mega_commit(p_actor uuid,p_run uuid,p_revision bigint,p_state jsonb,p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.arcade_runs;receipt private.arcade_command_receipts;at_ms bigint;status_i text;score_i bigint;holes_i integer;result_i jsonb;count_i integer:=0;sum_i bigint:=0;prior bigint;old_results jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM private.arcade_runs WHERE id=p_run FOR UPDATE;at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT FOUND OR r.game<>'mega-card-golf' OR (p_actor IS NOT NULL AND r.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=r.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>r.id OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));
  END IF;
 END IF;
 IF r.revision IS DISTINCT FROM p_revision OR r.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));END IF;
 IF p_request IS NOT NULL AND r.due_at<=at_ms THEN RETURN jsonb_build_object('outcome','deadline','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));END IF;
 status_i:=p_state->>'status';score_i:=(p_state->>'score')::bigint;holes_i:=(r.config->>'holes')::integer;
 IF p_state->>'id' IS DISTINCT FROM r.id::text OR p_state->>'owner' IS DISTINCT FROM r.user_id::text OR p_state->>'ruleset' IS DISTINCT FROM r.ruleset OR p_state->'config' IS DISTINCT FROM r.config
  OR coalesce(status_i,'') NOT IN('active','completed','abandoned') OR score_i IS NULL OR (p_state->>'hole')::integer NOT BETWEEN 1 AND holes_i
  OR jsonb_typeof(p_state->'results') IS DISTINCT FROM 'array' OR jsonb_typeof(p_state->'decks') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_state->'decks')<>holes_i THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF r.state IS NOT NULL AND r.state->'decks' IS DISTINCT FROM p_state->'decks' THEN RAISE EXCEPTION 'arcade:immutable_decks';END IF;
 old_results:=coalesce(r.state->'results','[]');
 FOR result_i IN SELECT value FROM jsonb_array_elements(p_state->'results') LOOP
  count_i:=count_i+1;
  IF (result_i->>'hole')::integer IS DISTINCT FROM count_i OR (result_i->>'score')::bigint IS DISTINCT FROM private.golf_score(result_i->'cards')
   OR (count_i<=jsonb_array_length(old_results) AND result_i IS DISTINCT FROM old_results->(count_i-1)) THEN RAISE EXCEPTION 'arcade:invalid_result';END IF;
  sum_i:=sum_i+(result_i->>'score')::bigint;
  IF (result_i->>'total')::bigint IS DISTINCT FROM sum_i THEN RAISE EXCEPTION 'arcade:invalid_result';END IF;
 END LOOP;
 IF score_i<>sum_i OR count_i<jsonb_array_length(old_results) OR count_i>holes_i OR (status_i='completed' AND (count_i<>holes_i OR (p_state->>'hole')::integer<>holes_i)) OR (status_i='active' AND count_i>=holes_i) THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,due_at=CASE WHEN status_i='active' THEN (p_state->>'deadline')::bigint END,
  updated_at=clock_timestamp(),ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=r.id RETURNING * INTO r;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(r.user_id,p_request,r.id,p_fingerprint,r.revision);END IF;
 IF status_i='completed' THEN
  SELECT min(score) INTO prior FROM private.arcade_results WHERE user_id=r.user_id AND game=r.game AND final_state#>>'{config,id}'=r.config->>'id' AND final_state#>>'{config,boardId}'=r.config->>'boardId';
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record) VALUES(r.id,r.user_id,r.game,r.ruleset,r.score,r.revision,r.ended_at,p_state,
   jsonb_build_object('priorBest',prior,'kind',CASE WHEN prior IS NULL THEN 'first' WHEN r.score<prior THEN 'broken' WHEN r.score=prior THEN 'matched' ELSE 'higher' END));
 END IF;
 UPDATE public.arcade_revisions SET revision=r.revision WHERE run_id=r.id;
 RETURN jsonb_build_object('outcome','committed','record',to_jsonb(r)||jsonb_build_object('server_at',at_ms));
END $$;

CREATE OR REPLACE FUNCTION public.arcade_mega_board(p_actor uuid,p_course text,p_board uuid DEFAULT NULL,p_window text DEFAULT '30') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE board_i uuid:=p_board;answer jsonb; BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_window IS NULL OR p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 IF board_i IS NULL THEN SELECT c.board_id INTO board_i FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id WHERE p.id=p_course;END IF;
 IF NOT EXISTS(SELECT 1 FROM private.arcade_mega_configs WHERE course=p_course AND board_id=board_i) THEN RAISE EXCEPTION 'arcade:invalid_board';END IF;
 WITH eligible AS(SELECT r.*,rank() OVER(ORDER BY score) place FROM private.arcade_results r WHERE game='mega-card-golf' AND final_state#>>'{config,id}'=p_course AND final_state#>>'{config,boardId}'=board_i::text AND (p_window='all' OR completed_at>=statement_timestamp()-interval '30 days')),
 named AS(SELECT e.*,jsonb_build_object('runId',e.run_id,'name',coalesce(p.username,'Player'),'score',e.score,'rank',place,'configId',final_state#>>'{config,configId}','completedAt',completed_at) item FROM eligible e LEFT JOIN public.profiles p ON p.id=e.user_id)
 SELECT jsonb_build_object('id',p_course,'boardId',board_i,'rows',coalesce((SELECT jsonb_agg(item ORDER BY score,completed_at,run_id) FROM(SELECT * FROM named ORDER BY score,completed_at,run_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor ORDER BY score,completed_at,run_id LIMIT 1),
  'personalBest',(SELECT min(score) FROM private.arcade_results WHERE game='mega-card-golf' AND user_id=p_actor AND final_state#>>'{config,id}'=p_course AND final_state#>>'{config,boardId}'=board_i::text)) INTO answer;
 RETURN answer;
END $$;
CREATE OR REPLACE FUNCTION public.arcade_mega_catalog(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('admission',EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='mega-card-golf/1' AND enabled),
  'isAdmin',EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser),
  'courses',(SELECT jsonb_agg(private.mega_config(c) ORDER BY CASE c.course WHEN 'sunny-meadows' THEN 1 WHEN 'coastal-links' THEN 2 ELSE 3 END) FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id),
  'boards',(SELECT jsonb_agg(public.arcade_mega_board(p_actor,id)) FROM private.arcade_mega_courses),
  'archives',coalesce((SELECT jsonb_agg(jsonb_build_object('config',private.mega_config(c),'rows',public.arcade_mega_board(p_actor,c.course,c.board_id,'all')->'rows')) FROM(SELECT DISTINCT ON(c.board_id) c.* FROM private.arcade_mega_configs c WHERE NOT EXISTS(SELECT 1 FROM private.arcade_mega_courses p JOIN private.arcade_mega_configs active ON active.id=p.config_id WHERE active.board_id=c.board_id) ORDER BY c.board_id,c.revision)c),'[]'),
  'active',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game='mega-card-golf' AND status='active'));
END $$;
REVOKE ALL ON FUNCTION private.mega_config_immutable(),private.mega_config(private.arcade_mega_configs) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.arcade_mega_save(uuid,text,bigint,jsonb,text),public.arcade_mega_start(uuid,uuid,text),public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.arcade_mega_board(uuid,text,uuid,text),public.arcade_mega_catalog(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arcade_mega_save(uuid,text,bigint,jsonb,text),public.arcade_mega_start(uuid,uuid,text),public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.arcade_mega_board(uuid,text,uuid,text),public.arcade_mega_catalog(uuid) TO service_role;

NOTIFY pgrst,'reload schema';
