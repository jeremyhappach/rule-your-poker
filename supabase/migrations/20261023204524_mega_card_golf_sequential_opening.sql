-- Register /2 disabled. New starts prefer enabled /2; active runs and receipts retain their version.
-- Deploy the compatible API/client and recovery worker before the separate activation.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
IF md5(pg_get_functiondef('public.arcade_mega_catalog(uuid)'::regprocedure))<>'eac2d050c5fa7bf13547be7914650d58' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF md5(pg_get_functiondef('public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)'::regprocedure))<>'5cafb47e80ad5767a4d791e883ff14a0' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
IF md5(pg_get_functiondef('public.arcade_mega_start(uuid,uuid,text)'::regprocedure))<>'0f198d81c00e6a3ba5e9ea694bcb08e2' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;
END $$;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/2','mega-card-golf','{"engine":"mega-card-golf/2","opening":"sequential","finalDraw":"resolve","score":"canonical-golf"}',false) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.arcade_mega_start(p_actor uuid, p_request uuid, p_course text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.arcade_runs;c private.arcade_mega_configs;receipt private.arcade_command_receipts;ruleset_i text;fingerprint text:='mega:start:'||p_course;
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
   SELECT id INTO ruleset_i FROM private.arcade_rulesets WHERE game='mega-card-golf' AND id IN('mega-card-golf/1','mega-card-golf/2') AND enabled ORDER BY id DESC LIMIT 1;
   IF ruleset_i IS NULL THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   IF EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:maintenance';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
   PERFORM 1 FROM private.arcade_mega_courses WHERE id=p_course FOR SHARE;
   SELECT cfg.* INTO c FROM private.arcade_mega_configs cfg JOIN private.arcade_mega_courses p ON p.config_id=cfg.id WHERE p.id=p_course;
   IF NOT FOUND OR c.settings->>'enabled'<>'true' THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,'mega-card-golf',ruleset_i,private.mega_config(c),floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO r;
   INSERT INTO public.arcade_revisions VALUES(r.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,r.id,fingerprint,r.revision);
 END IF;
 RETURN to_jsonb(r)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;
CREATE OR REPLACE FUNCTION public.arcade_mega_catalog(p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('admission',EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE game='mega-card-golf' AND id IN('mega-card-golf/1','mega-card-golf/2') AND enabled),
  'isAdmin',EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser),
  'courses',(SELECT jsonb_agg(private.mega_config(c) ORDER BY CASE c.course WHEN 'sunny-meadows' THEN 1 WHEN 'coastal-links' THEN 2 ELSE 3 END) FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id),
  'boards',(SELECT jsonb_agg(public.arcade_mega_board(p_actor,id)) FROM private.arcade_mega_courses),
  'archives',coalesce((SELECT jsonb_agg(jsonb_build_object('config',private.mega_config(c),'rows',public.arcade_mega_board(p_actor,c.course,c.board_id,'all')->'rows')) FROM(SELECT DISTINCT ON(c.board_id) c.* FROM private.arcade_mega_configs c WHERE NOT EXISTS(SELECT 1 FROM private.arcade_mega_courses p JOIN private.arcade_mega_configs active ON active.id=p.config_id WHERE active.board_id=c.board_id) ORDER BY c.board_id,c.revision)c),'[]'),
  'active',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game='mega-card-golf' AND status='active'));
END $function$
;
NOTIFY pgrst,'reload schema';
