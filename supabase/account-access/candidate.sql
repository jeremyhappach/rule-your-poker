-- Account access is independent of Auth's confirmation timestamps.
CREATE TABLE public.account_access (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 ever_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (NOT enabled OR ever_enabled)
);
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_access TO authenticated;
CREATE POLICY account_access_own ON public.account_access FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_access;
INSERT INTO public.account_access(user_id,enabled,ever_enabled)
 SELECT u.id,p.is_active,true FROM auth.users u JOIN public.profiles p ON p.id=u.id;

CREATE TABLE private.account_access_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), previous_enabled boolean NOT NULL,
 enabled boolean NOT NULL, previous_status text NOT NULL, new_status text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX account_access_audit_user ON private.account_access_audit(user_id,changed_at DESC);
CREATE TABLE private.email_ownership(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), email text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), method text NOT NULL DEFAULT 'supabase_email_token' CHECK(method='supabase_email_token'));
CREATE TABLE private.email_verification_requests(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE private.account_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.email_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.email_verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_access_audit,private.email_ownership,private.email_verification_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.account_enabled(who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT enabled FROM public.account_access WHERE user_id=who),false)
$$;
REVOKE ALL ON FUNCTION private.account_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_enabled(uuid) TO authenticated;
CREATE FUNCTION private.account_registered(who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM auth.users WHERE id=who)
$$;
REVOKE ALL ON FUNCTION private.account_registered(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_registered(uuid) TO authenticated;
CREATE FUNCTION private.require_account_enabled(who uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
 -- Mutating requests hold this lock through commit: suspension and actions
 -- have a single database ordering, including old JWTs and service adapters.
 IF current_setting('transaction_read_only')='on' THEN
  SELECT enabled INTO allowed FROM public.account_access WHERE user_id=who;
 ELSE
  SELECT enabled INTO allowed FROM public.account_access WHERE user_id=who FOR SHARE;
 END IF;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'account:access_disabled' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.require_account_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.account_request_guard() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.jwt()->>'role'='anon' THEN RAISE EXCEPTION 'account:authentication_required' USING ERRCODE='42501'; END IF;
 IF auth.jwt()->>'role'='authenticated' AND trim(leading '/' FROM coalesce(current_setting('request.path',true),''))<>'rpc/account_access_snapshot' THEN
  IF trim(leading '/' FROM coalesce(current_setting('request.path',true),'')) IN('rpc/admin_set_account_access','rpc/admin_set_user_role') THEN
   IF NOT private.account_enabled(auth.uid()) THEN RAISE EXCEPTION 'account:access_disabled' USING ERRCODE='42501'; END IF;
  ELSE PERFORM private.require_account_enabled(auth.uid()); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.account_request_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_request_guard() TO authenticated,service_role;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.account_request_guard';

CREATE FUNCTION public.account_access_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('userId',u.id,'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'revision',a.revision,'email',u.email,'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'admin',a.enabled AND public.has_role(u.id,'admin'::public.app_role))
 FROM auth.users u JOIN public.account_access a ON a.user_id=u.id WHERE u.id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.account_access_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_access_snapshot() TO authenticated;

CREATE FUNCTION private.require_enabled_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.require_account_enabled(auth.uid());
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'account:admin_required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.require_enabled_admin() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_set_account_access(p_user_id uuid,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.account_access; old_status text;
BEGIN
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'account:invalid_request'; END IF;
 -- Role and account mutations serialize together, including concurrent admins.
 PERFORM pg_advisory_xact_lock(hashtextextended('ptown:admin-role',0));
 PERFORM private.require_enabled_admin();
 IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'account:cannot_change_self' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT old FROM public.account_access WHERE user_id=p_user_id FOR UPDATE;
 IF old.enabled=p_enabled THEN RETURN jsonb_build_object('changed',false); END IF;
 IF NOT p_enabled AND public.has_role(p_user_id,'admin'::public.app_role)
  AND NOT EXISTS(SELECT FROM public.account_access a JOIN public.user_roles r ON r.user_id=a.user_id WHERE a.enabled AND a.user_id<>p_user_id AND r.role='admin') THEN
  RAISE EXCEPTION 'account:last_enabled_admin' USING ERRCODE='42501';
 END IF;
 old_status:=CASE WHEN old.enabled THEN 'enabled' WHEN old.ever_enabled THEN 'suspended' ELSE 'pending' END;
 UPDATE public.account_access SET enabled=p_enabled,ever_enabled=ever_enabled OR p_enabled,revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 -- Preserve the established host succession and game recovery integration.
 UPDATE public.profiles SET is_active=p_enabled WHERE id=p_user_id;
 INSERT INTO private.account_access_audit(user_id,actor_id,previous_enabled,enabled,previous_status,new_status)
 VALUES(p_user_id,auth.uid(),old.enabled,p_enabled,old_status,CASE WHEN p_enabled THEN 'enabled' WHEN old.ever_enabled THEN 'suspended' ELSE 'pending' END);
 RETURN jsonb_build_object('changed',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_access(uuid,boolean) TO authenticated;

CREATE FUNCTION public.admin_account_directory() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.account_enabled(auth.uid()) OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'account:admin_required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',p.username,'email',u.email,'createdAt',u.created_at,'lastSeenAt',p.last_seen_at,
  'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'admin',public.has_role(u.id,'admin'::public.app_role),'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object('actorId',h.actor_id,'actor',ap.username,'at',h.changed_at,'from',h.previous_status,'to',h.new_status) ORDER BY h.changed_at DESC),'[]') FROM private.account_access_audit h JOIN public.profiles ap ON ap.id=h.actor_id WHERE h.user_id=u.id)
 ) ORDER BY u.created_at DESC),'[]') FROM auth.users u JOIN public.profiles p ON p.id=u.id JOIN public.account_access a ON a.user_id=u.id);
END $$;
REVOKE ALL ON FUNCTION public.admin_account_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_account_directory() TO authenticated;

-- Service-only email operations. Supabase's automatic confirmation is never evidence.
CREATE FUNCTION public.account_email_request(p_actor uuid,p_target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_email text;
BEGIN
 IF p_actor IS NULL OR (p_actor<>p_target AND (NOT private.account_enabled(p_actor) OR NOT public.has_role(p_actor,'admin'::public.app_role))) THEN RAISE EXCEPTION 'account:forbidden' USING ERRCODE='42501'; END IF;
 SELECT email INTO STRICT target_email FROM auth.users WHERE id=p_target;
 INSERT INTO private.email_verification_requests(user_id) VALUES(p_target) ON CONFLICT(user_id) DO UPDATE SET requested_at=clock_timestamp()
 WHERE private.email_verification_requests.requested_at<clock_timestamp()-interval '60 seconds';
 IF NOT FOUND THEN RAISE EXCEPTION 'account:resend_wait'; END IF;
 RETURN target_email;
END $$;
CREATE FUNCTION public.account_email_verified(p_user uuid,p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user AND email=p_email FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account:email_changed'; END IF;
 INSERT INTO private.email_ownership(user_id,email) VALUES(p_user,p_email) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=clock_timestamp();
 UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.account_email_request(uuid,uuid),public.account_email_verified(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_request(uuid,uuid),public.account_email_verified(uuid,text) TO service_role;

CREATE FUNCTION private.account_email_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email THEN
  DELETE FROM private.email_ownership WHERE user_id=NEW.id;
  UPDATE public.profiles SET email=NEW.email WHERE id=NEW.id;
  UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_email_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER account_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_email_changed();

CREATE FUNCTION private.account_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'account:immutable_audit'; END $$;
REVOKE ALL ON FUNCTION private.account_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER account_audit_immutable BEFORE UPDATE OR DELETE ON private.account_access_audit FOR EACH ROW EXECUTE FUNCTION private.account_audit_immutable();
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.account_access(user_id) VALUES(NEW.id);
  INSERT INTO public.profiles (id, username, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || substring(NEW.id::text from 1 for 8)),
    NEW.email, false
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.guard_profile_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF private.account_registered(NEW.id) AND NEW.is_active IS DISTINCT FROM private.account_enabled(NEW.id) THEN
  RAISE EXCEPTION 'account:use_access_command' USING ERRCODE='42501';
 END IF;
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile_authority:immutable_identity' USING ERRCODE='42501';
  END IF;
  IF NEW.is_superuser IS DISTINCT FROM public.has_role(NEW.id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'profile_authority:use_admin_role_command' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND current_user IN ('anon','authenticated')
     AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'profile_authority:admin_required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_changed integer:=0;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'admin_role:invalid_request' USING ERRCODE='22023';
  END IF;
  -- Serialize authorization changes so concurrent revocation cannot race a grant.
  PERFORM pg_advisory_xact_lock(hashtextextended('ptown:admin-role',0));
  IF v_actor IS NULL OR NOT private.account_enabled(v_actor) OR NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_role:admin_required' USING ERRCODE='42501';
  END IF;
  IF p_user_id=v_actor THEN
    RAISE EXCEPTION 'admin_role:cannot_change_own_role' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_role:profile_not_found' USING ERRCODE='22023'; END IF;
  IF NOT p_enabled AND private.account_enabled(p_user_id) AND NOT EXISTS(
 SELECT FROM public.account_access a JOIN public.user_roles r ON r.user_id=a.user_id
 WHERE a.enabled AND a.user_id<>p_user_id AND r.role='admin') THEN
 RAISE EXCEPTION 'account:last_enabled_admin' USING ERRCODE='42501'; END IF;
 IF p_enabled THEN
    INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'admin'::public.app_role)
    ON CONFLICT (user_id,role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id=p_user_id AND role='admin'::public.app_role;
  END IF;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN jsonb_build_object('user_id',p_user_id,'enabled',p_enabled,'changed',v_changed>0);
END;
$function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_trip_flip_step
CREATE OR REPLACE FUNCTION public.arcade_trip_flip_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'trip-flip' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('move','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_trip_flip_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.trip_flip_board_deal(jsonb_build_object('rules',run.config,'highScore',private.trip_flip_high_score(run.user_id),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_trip_flip_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.trip_flip_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_trip_flip_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_trip_flip_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_load
CREATE OR REPLACE FUNCTION public.arcade_load(p_actor uuid, p_run uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run AND user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 RETURN private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000),'receipt',CASE WHEN receipt.request_id IS NULL THEN NULL ELSE to_jsonb(receipt) END);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_start
CREATE OR REPLACE FUNCTION public.arcade_start(p_actor uuid, p_request uuid, p_game text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; rules private.arcade_rulesets;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_game IS NULL OR p_game NOT IN ('quintzee','run21','tri-towers','eleven-up','royal-flash','take-two','trip-flip','boxdrop') THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
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
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,p_game,rules.id,CASE WHEN p_game='quintzee' THEN rules.config||jsonb_build_object('theme',coalesce(nullif(current_setting('app.quintzee_theme',true),''),'modern')) ELSE rules.config END,floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO run;
   INSERT INTO public.arcade_revisions VALUES(run.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,run.id,'start:'||p_game,run.revision);
 END IF;
 RETURN to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_boxdrop_step
CREATE OR REPLACE FUNCTION public.arcade_boxdrop_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'boxdrop' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('place','recycle','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_boxdrop_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.boxdrop_board_deal(jsonb_build_object('rules',run.config,'highScore',private.boxdrop_high_score(run.user_id),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_boxdrop_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.boxdrop_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_boxdrop_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_boxdrop_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: delayed_commit
CREATE OR REPLACE FUNCTION public.delayed_commit(p_child uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_event text, p_at bigint, p_advanced boolean, p_request uuid DEFAULT NULL::uuid, p_fingerprint jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: mega_live_finish
CREATE OR REPLACE FUNCTION public.mega_live_finish(p_match uuid, p_actor uuid, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.mega_live_matches;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 PERFORM private.mega_live_finish_postgame(p_match);
 SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 RETURN private.mega_live_record(m,p_actor);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_eleven_step
CREATE OR REPLACE FUNCTION public.arcade_eleven_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'eleven-up' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('group','pass','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.eleven_up_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_eleven_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.eleven_up_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_eleven_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_royal_step
CREATE OR REPLACE FUNCTION public.arcade_royal_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'royal-flash' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('place','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_royal_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.royal_flash_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_royal_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.royal_flash_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_royal_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_royal_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_commit
CREATE OR REPLACE FUNCTION public.arcade_commit(p_actor uuid, p_run uuid, p_revision bigint, p_state jsonb, p_due bigint, p_request uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;status_i text:=p_state->>'status';score_i bigint:=(p_state->>'score')::bigint;prior_best bigint;record_i jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run));
  END IF;
 END IF;
 IF run.revision<>p_revision OR run.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',private.arcade_record(run));END IF;
 -- A request computed before expiry may acquire this lock after expiry.
 -- Only the new clock policy changes; worker synchronization can commit its timeout.
 IF p_request IS NOT NULL AND run.config->>'clockStart'='intro_end'
  AND run.state->'board'->'result'='null'::jsonb
  AND (run.state->'board'->>'deadline')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RETURN jsonb_build_object('outcome','deadline','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
 END IF;
 IF p_state->>'runId' IS DISTINCT FROM run.id::text OR p_state->>'userId' IS DISTINCT FROM run.user_id::text
  OR p_state->'config' IS DISTINCT FROM run.config OR status_i NOT IN('active','completed','expired','abandoned')
  OR score_i IS NULL OR score_i<0 OR (p_state->>'round')::integer NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF run.game='quintzee' AND status_i='completed' AND private.arcade_quintzee_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='boxdrop' AND status_i='completed' AND private.arcade_boxdrop_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='trip-flip' AND status_i='completed' AND private.arcade_trip_flip_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='take-two' AND status_i='completed' AND private.arcade_take_two_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='royal-flash' AND status_i='completed' AND private.arcade_royal_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='eleven-up' AND status_i='completed' AND private.arcade_eleven_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='tri-towers' AND status_i='completed' AND private.arcade_tri_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='run21' AND status_i='completed' AND ((p_state->>'round')::integer<>3 OR jsonb_array_length(p_state->'results')<>3
  OR score_i<>(SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(p_state->'results') x)) THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,
  due_at=CASE WHEN status_i='active' THEN p_due END,updated_at=clock_timestamp(),
  ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=p_run RETURNING * INTO run;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(run.user_id,p_request,p_run,p_fingerprint,run.revision);END IF;
 IF status_i='completed' THEN
  -- One active run per user/game and the existing row lock serialize completions.
  -- Read before insertion, explicitly excluding this immutable result identity.
  SELECT max(score) INTO prior_best FROM private.arcade_results
   WHERE user_id=run.user_id AND game=run.game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(run.game,run.ruleset) AND run_id<>run.id;
  record_i:=jsonb_build_object('priorBest',prior_best,'kind',CASE
   WHEN prior_best IS NULL THEN 'first' WHEN run.score>prior_best THEN 'broken'
   WHEN run.score=prior_best THEN 'matched' ELSE 'lower' END);
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record)
   VALUES(run.id,run.user_id,run.game,run.ruleset,run.score,run.revision,run.ended_at,p_state,record_i);
 END IF;
 UPDATE public.arcade_revisions SET revision=run.revision WHERE run_id=p_run;
 RETURN jsonb_build_object('outcome','committed','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_mega_save
CREATE OR REPLACE FUNCTION public.arcade_mega_save(p_actor uuid, p_course text, p_revision bigint, p_settings jsonb, p_choice text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old private.arcade_mega_configs;next private.arcade_mega_configs;key_i text;v numeric;changed boolean;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
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
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_mega_commit
CREATE OR REPLACE FUNCTION public.arcade_mega_commit(p_actor uuid, p_run uuid, p_revision bigint, p_state jsonb, p_request uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.arcade_runs;receipt private.arcade_command_receipts;at_ms bigint;status_i text;score_i bigint;holes_i integer;result_i jsonb;count_i integer:=0;sum_i bigint:=0;prior bigint;old_results jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
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
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_mega_start
CREATE OR REPLACE FUNCTION public.arcade_mega_start(p_actor uuid, p_request uuid, p_course text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r private.arcade_runs;c private.arcade_mega_configs;receipt private.arcade_command_receipts;ruleset_i text;fingerprint text:='mega:start:'||p_course;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
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
   SELECT id INTO ruleset_i FROM private.arcade_rulesets WHERE game='mega-card-golf' AND id IN('mega-card-golf/1','mega-card-golf/2','mega-card-golf/3','mega-card-golf/4') AND enabled ORDER BY id DESC LIMIT 1;
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

-- Fresh access lock before existing gameplay/recovery ownership: run21_server_close
CREATE OR REPLACE FUNCTION public.run21_server_close(p_dealer_game_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF p_user_id IS NOT NULL THEN PERFORM private.require_account_enabled(p_user_id); END IF;
 IF NOT public.run21_server_authorize(p_user_id) OR NOT EXISTS(
  SELECT FROM private.run21_matches m, jsonb_array_elements(m.participants) p
  WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=p_user_id::text AND p->>'kind'='human'
 ) THEN RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 PERFORM private.run21_finish_postgame(p_dealer_game_id);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_tri_step
CREATE OR REPLACE FUNCTION public.arcade_tri_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'tri-towers' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('remove','draw','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_index)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.tri_towers_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_tri_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.tri_towers_board_reduce(s->'board',p_action,p_index,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_tri_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_quintzee_step
CREATE OR REPLACE FUNCTION public.arcade_quintzee_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'quintzee' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('start','roll','score','score_zero','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_quintzee_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.quintzee_board_deal(jsonb_build_object('rules',run.config,'highScore',private.quintzee_high_score(run.user_id),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_quintzee_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.quintzee_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_quintzee_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_quintzee_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: run21_server_commit_admitted
CREATE OR REPLACE FUNCTION public.run21_server_commit_admitted(p_verified_user_id uuid, p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE m private.run21_matches; g public.games;
BEGIN
 IF p_verified_user_id IS NOT NULL THEN PERFORM private.require_account_enabled(p_verified_user_id); END IF;
 IF NOT private.run21_actor_allowed(p_verified_user_id) THEN
  RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p
   JOIN public.players seat ON seat.id=(p->>'id')::uuid AND seat.game_id=m.game_id
   WHERE p->>'userId'=p_verified_user_id::text AND p->>'kind'='human'
     AND seat.user_id=p_verified_user_id AND NOT seat.is_bot AND seat.status<>'left') THEN
  RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
 END IF;
 IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.game_type IS DISTINCT FROM 'run21'
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
  RAISE EXCEPTION 'run21:inactive_identity';
 END IF;
 IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
 -- A duplicate/rejected action still checks fresh admission and CAS but writes nothing.
 IF p_state IS NULL THEN RETURN jsonb_build_object('outcome','committed','record',to_jsonb(m)); END IF;
 RETURN public.run21_server_commit(p_dealer_game_id,p_expected_revision,p_state,p_bot_due_at);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_quintzee_start
CREATE OR REPLACE FUNCTION public.arcade_quintzee_start(p_actor uuid, p_request uuid, p_theme text DEFAULT 'modern'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v jsonb;old text:=current_setting('app.quintzee_theme',true);BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_theme NOT IN('classic','modern') OR p_theme IS NULL THEN RAISE EXCEPTION 'quintzee:theme';END IF;
 PERFORM set_config('app.quintzee_theme',p_theme,true);v:=public.arcade_start(p_actor,p_request,'quintzee');PERFORM set_config('app.quintzee_theme',coalesce(old,''),true);RETURN v;END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: arcade_take_two_step
CREATE OR REPLACE FUNCTION public.arcade_take_two_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_items integer[] DEFAULT NULL::integer[], p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'take-two' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('pair','draw','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_take_two_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.take_two_board_deal(jsonb_build_object('rules',run.config,'highScore',private.take_two_high_score(run.user_id,run.ruleset),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_take_two_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.take_two_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_take_two_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_take_two_projection(run,at_ms));
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: delayed_load
CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind='attempt'),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: mega_live_load
CREATE OR REPLACE FUNCTION public.mega_live_load(p_match uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.mega_live_matches;r private.mega_live_requests;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 IF p_actor IS NULL THEN RAISE EXCEPTION 'mega:authentication_required';END IF;
 PERFORM private.mega_live_authorize(m,p_actor);
 SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
 RETURN private.mega_live_record(m,p_actor)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

-- Fresh access lock before existing gameplay/recovery ownership: mega_live_commit
CREATE OR REPLACE FUNCTION public.mega_live_commit(p_match uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_request uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.mega_live_matches;g public.games;r private.mega_live_requests;at_ms bigint;i integer:=0;result jsonb;person jsonb;prior jsonb;total bigint;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match FOR UPDATE;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
  IF FOUND THEN
   IF r.actor IS DISTINCT FROM p_actor OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'mega:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.mega_live_record(m,p_actor));
  END IF;
 END IF;
 IF m.revision IS DISTINCT FROM p_revision OR m.settlement IS NOT NULL OR m.finished THEN RETURN jsonb_build_object('outcome','conflict','record',private.mega_live_record(m,p_actor));END IF;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'mega-card-golf' THEN RAISE EXCEPTION 'mega:inactive';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_request IS NOT NULL THEN
  IF p_actor IS NULL OR p_fingerprint IS NULL OR m.state->'players'->(m.state->>'turnIndex')::integer->>'userId' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'mega:not_actor';END IF;
  IF at_ms>=(m.state->>'deadline')::bigint THEN RETURN jsonb_build_object('outcome','deadline','record',private.mega_live_record(m,p_actor));END IF;
 ELSE IF at_ms<(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'mega:early_recovery';END IF;END IF;
 IF p_state->'identity' IS DISTINCT FROM m.state->'identity' OR p_state->'rules' IS DISTINCT FROM m.state->'rules' OR p_state->'players' IS DISTINCT FROM m.state->'players' THEN RAISE EXCEPTION 'mega:identity_changed';END IF;
 IF p_state->'board' IS NOT NULL AND p_state->'board'<>'null'::jsonb THEN
  prior:=CASE WHEN p_state#>>'{board,id}'=m.state#>>'{board,id}' THEN m.state->'board' ELSE m.state->'runs'->(p_state#>>'{board,owner}') END;
  PERFORM private.mega_assert_board(p_state->'board',p_state->'rules',prior);
 END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(p_state->'results') LOOP
  i:=i+1;
  IF (result->>'score')::bigint IS DISTINCT FROM private.golf_score(result->'cards') OR (i<=jsonb_array_length(m.state->'results') AND result IS DISTINCT FROM m.state->'results'->(i-1)) THEN RAISE EXCEPTION 'mega:invalid_result';END IF;
 END LOOP;
 IF i<jsonb_array_length(m.state->'results') OR i>jsonb_array_length(m.state->'results')+1 THEN RAISE EXCEPTION 'mega:result_count';END IF;
 FOR person IN SELECT value FROM jsonb_array_elements(p_state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0) INTO total FROM jsonb_array_elements(p_state->'results') WHERE value->>'actor'=person->>'id';
  IF (p_state->'scores'->>(person->>'id'))::bigint IS DISTINCT FROM total THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF p_state->>'phase'='complete' AND (i<>(p_state#>>'{rules,course,holes}')::int*jsonb_array_length(p_state->'players') OR jsonb_array_length(p_state->'holes')<>(p_state#>>'{rules,course,holes}')::int) THEN RAISE EXCEPTION 'mega:incomplete';END IF;
 UPDATE private.mega_live_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_match RETURNING * INTO m;
 IF p_request IS NOT NULL THEN INSERT INTO private.mega_live_requests VALUES(p_match,p_request,p_actor,p_fingerprint);END IF;
 IF p_state->>'phase'='complete' THEN PERFORM private.mega_live_settle(p_match);SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.mega_live_record(m,p_actor));
END $function$
;

CREATE OR REPLACE FUNCTION public.canasta_server_commit(p_match uuid, p_revision bigint, p_state jsonb, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.canasta_matches;g public.games;at_ms bigint;actor uuid;command jsonb;request uuid;prior private.canasta_receipts;
 winner uuid;loser uuid;result_id uuid;batch_id uuid;changes jsonb;scores jsonb;first_hand uuid;automatic_id uuid;
BEGIN
 IF p_context->>'kind'<>'recover' THEN PERFORM private.require_account_enabled((p_context->>'userId')::uuid); END IF;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match;
 -- Preserve canonical lock order: round, game, private match, participants.
 PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match FOR UPDATE;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RAISE EXCEPTION 'canasta:closed';END IF;
 IF p_context->>'kind' NOT IN('command','recover','control') THEN RAISE EXCEPTION 'canasta:context';END IF;
 IF p_context->>'kind'<>'recover' THEN
  actor:=(p_context->>'userId')::uuid;
  IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id AND p.user_id=actor AND NOT p.is_bot AND p.status<>'left' AND pr.is_active
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text AND s->>'userId'=actor::text)) THEN RAISE EXCEPTION 'canasta:unauthorized' USING ERRCODE='42501';END IF;
 END IF;
 IF p_context->>'kind'='command' THEN
  command:=p_context->'command';request:=(command->>'requestId')::uuid;
  IF request IS NULL OR command->>'matchId' IS DISTINCT FROM p_match::text OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s
    WHERE s->>'id'=command->>'playerId' AND s->>'userId'=actor::text) THEN RAISE EXCEPTION 'canasta:command_identity';END IF;
  SELECT * INTO prior FROM private.canasta_receipts WHERE dealer_game_id=p_match AND request_id=request;
  IF FOUND THEN
   IF prior.actor<>actor OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'canasta:receipt_conflict';END IF;
   RETURN public.canasta_server_load(p_match,actor);
  END IF;
 END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF m.finished OR m.settlement IS NOT NULL OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'canasta'
  OR g.status<>'in_progress' THEN RAISE EXCEPTION 'canasta:inactive';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_match AND session_id=m.game_id AND (config->>'ante_amount')::integer=m.stake)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE NOT EXISTS(SELECT 1 FROM public.players p WHERE p.id=(s->>'id')::uuid AND p.game_id=m.game_id
    AND p.position=(s->>'seat')::integer AND p.is_bot=(s->>'kind'='bot') AND (p.is_bot OR p.user_id=(s->>'userId')::uuid))) THEN RAISE EXCEPTION 'canasta:frozen_identity';END IF;
 IF g.is_paused AND p_context->>'kind'<>'control' THEN RAISE EXCEPTION 'canasta:paused';END IF;
 IF p_context->>'kind'='recover' AND nullif(p_state->'pause','null'::jsonb) IS NULL
  AND (p_state->'automatic') ? (m.state#>>'{hand,active}')
  AND g.real_money THEN RAISE EXCEPTION 'canasta:conflict';END IF;
 IF command IS NOT NULL THEN
  IF command->>'handId' IS DISTINCT FROM m.state#>>'{hand,id}' OR command->>'turn' IS DISTINCT FROM m.state#>>'{hand,turn}'
   OR command->>'generation' IS DISTINCT FROM m.state#>>'{hand,generation}' OR command->>'playerId' IS DISTINCT FROM m.state#>>'{hand,active}'
   OR (command->>'revision')::bigint<>m.revision THEN RAISE EXCEPTION 'canasta:stale_command';END IF;
  -- Fresh time AFTER row locks. Equality expires; a completed receipt returned above wins.
  IF at_ms>=(m.state#>>'{hand,deadline}')::bigint THEN RAISE EXCEPTION 'canasta:deadline';END IF;
 END IF;
 IF p_state->>'id' IS DISTINCT FROM p_match::text OR p_state->>'sessionId' IS DISTINCT FROM m.game_id::text
  OR p_state->>'version' IS DISTINCT FROM 'canasta-classic-two/1' OR p_state->'seats' IS DISTINCT FROM m.seats OR nullif(p_state->'config','null'::jsonb) IS DISTINCT FROM nullif(m.state->'config','null'::jsonb)
  OR (p_state->>'stake')::integer IS DISTINCT FROM m.stake OR (p_state->>'realMoney')::boolean IS DISTINCT FROM g.real_money
  OR (p_state->>'revision')::bigint<=m.revision THEN RAISE EXCEPTION 'canasta:state_identity';END IF;
 -- A newly admitted turn receives its whole budget at database commit; other actions never reset it.
 IF p_state#>>'{hand,id}' IS DISTINCT FROM m.state#>>'{hand,id}' OR p_state#>>'{hand,turn}' IS DISTINCT FROM m.state#>>'{hand,turn}' THEN
  p_state:=jsonb_set(p_state,'{hand,deadline}',to_jsonb(at_ms+coalesce((m.state#>>'{config,turnMs}')::bigint,120000)));
 END IF;
 p_state:=jsonb_set(p_state,'{updatedAt}',to_jsonb(at_ms));
 IF p_state#>>'{hand,id}' IS NOT NULL THEN
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
   VALUES((p_state#>>'{hand,id}')::uuid,m.game_id,p_match,1,(p_state#>>'{hand,number}')::integer,0,'betting',0) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(p_state#>>'{hand,id}')::uuid AND game_id=m.game_id AND dealer_game_id=p_match AND hand_number=1
    AND round_number=(p_state#>>'{hand,number}')::integer) THEN RAISE EXCEPTION 'canasta:round_identity';END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match AND id IN(SELECT (h->>'id')::uuid FROM jsonb_array_elements(p_state->'completed') h);
  UPDATE public.games SET current_round=(p_state#>>'{hand,number}')::integer WHERE id=m.game_id;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE
   (SELECT coalesce(sum((r->'scores'->>(s->>'id'))::bigint),0) FROM jsonb_array_elements(p_state->'completed') r)
    IS DISTINCT FROM (p_state->'totals'->>(s->>'id'))::bigint) THEN RAISE EXCEPTION 'canasta:score_totals';END IF;
 winner:=nullif(p_state->>'winner','')::uuid;
 IF winner IS NOT NULL THEN
  SELECT (s->>'id')::uuid INTO STRICT loser FROM jsonb_array_elements(m.seats) s WHERE s->>'id'<>winner::text;
  IF p_state#>>'{hand,phase}' IS DISTINCT FROM 'complete' OR (p_state->'totals'->>winner::text)::bigint<5000
   OR (p_state->'totals'->>winner::text)::bigint<=(p_state->'totals'->>loser::text)::bigint THEN RAISE EXCEPTION 'canasta:winner';END IF;
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND id IN(winner,loser))<>2
   OR (g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE id IN(winner,loser) AND is_bot)) THEN RAISE EXCEPTION 'canasta:participants';END IF;
  result_id:=gen_random_uuid();changes:=jsonb_build_object(winner::text,m.stake,loser::text,-m.stake);
  INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
   VALUES(result_id,m.game_id,p_match,1,'canasta_terminal','canasta',winner,
    (SELECT coalesce(pr.username,'Player') FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.id=winner),
    'Canasta: '||(p_state->'totals')::text,m.stake,changes,false);
  PERFORM public.settle_gameplay_chip_transfers(m.game_id,jsonb_build_array(jsonb_build_object(
    'from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',m.stake)),'win');
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize IMMEDIATE;
  SELECT id INTO STRICT batch_id FROM public.gameplay_transfer_batches WHERE game_id=m.game_id AND dealer_game_id=p_match
    AND cursor=(SELECT chip_transfer_cursor FROM public.games WHERE id=m.game_id);
  SET CONSTRAINTS public.gameplay_transfer_pending_finalize DEFERRED;
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
   SELECT p.game_id,p_match,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
   WHERE p.game_id=m.game_id ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO NOTHING;
  m.settlement:=jsonb_build_object('key','canasta:'||p_match,'resultId',result_id,'transferBatchId',batch_id,'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE id=batch_id),'winner',winner,'loser',loser,'amount',m.stake,'scores',p_state->'totals','startedAt',at_ms,'deadline',at_ms+3000);
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=p_match;
  UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
    session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
    pending_session_end=false,game_over_at=clock_timestamp(),last_round_result='Canasta complete',awaiting_next_round=false WHERE id=m.game_id;
 END IF;
 UPDATE private.canasta_matches SET state=p_state,revision=(p_state->>'revision')::bigint,settlement=m.settlement,
   bot_due_at=CASE WHEN (EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p_state#>>'{hand,active}' AND s->>'kind'='bot')
     OR (p_state->'automatic') ? (p_state#>>'{hand,active}'))
     AND p_state->'pause'='null'::jsonb AND p_state#>>'{hand,phase}'<>'complete' THEN at_ms+750 END WHERE dealer_game_id=p_match;
 -- Project automatic status through canonical player controls; no participant is removed between hands.
 UPDATE public.players p SET auto_fold=EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text),
   sit_out_next_hand=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN false
     WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_state->'automatic') a WHERE a=p.id::text) THEN true ELSE p.sit_out_next_hand END,
   stand_up_next_hand=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN false ELSE p.stand_up_next_hand END,
   auto_play_stop_round_id=CASE WHEN p_context->>'kind'='control' AND p.user_id=actor THEN NULL ELSE p.auto_play_stop_round_id END
  WHERE p.game_id=m.game_id AND NOT p.is_bot AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text);
 IF nullif(p_state->'pause','null'::jsonb) IS NOT NULL AND NOT g.is_paused THEN
  IF g.real_money AND p_state#>>'{pause,reason}'='inactivity' THEN UPDATE public.players SET sitting_out=true,sit_out_next_hand=true WHERE id=(p_state#>>'{hand,active}')::uuid;END IF;
  PERFORM public.set_game_paused(g.id,true,p_match,g.pause_version);
 END IF;
 IF command IS NOT NULL THEN INSERT INTO private.canasta_receipts VALUES(p_match,request,actor,command,(p_state->>'revision')::bigint);END IF;
 RETURN public.canasta_server_load(p_match,actor);
END $function$
;

CREATE OR REPLACE FUNCTION public.canasta_server_load(p_match uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.canasta_matches;g public.games;humans jsonb;
BEGIN
 IF p_user IS NOT NULL THEN PERFORM private.require_account_enabled(p_user); END IF;
 SELECT * INTO STRICT m FROM private.canasta_matches WHERE dealer_game_id=p_match;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF NOT EXISTS(SELECT 1 FROM private.canasta_release WHERE enabled) THEN RAISE EXCEPTION 'canasta:closed';END IF;
 IF p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=p_user AND pr.is_active AND (
  EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=p_user AND NOT p.is_bot AND p.status<>'left')
  OR (m.settlement IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) seat WHERE seat->>'userId'=p_user::text)))) THEN RAISE EXCEPTION 'canasta:unauthorized' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(p.id),'[]'::jsonb) INTO humans FROM public.players p WHERE p.game_id=m.game_id AND NOT p.is_bot AND p.status='active'
  AND NOT p.sitting_out AND NOT p.auto_fold AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.seats) s WHERE s->>'id'=p.id::text);
 RETURN jsonb_build_object('state',m.state,'firstRoundId',m.first_round_id,'activeHumans',humans,'botDue',m.bot_due_at,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
  'finished',m.finished,'settlement',m.settlement);
END $function$
;
CREATE POLICY account_access_required ON "public"."player_actions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."debug_sync_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."battle31_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."tri_towers_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."trip_flip_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."quintzee_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."user_roles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."dealer_games" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."system_settings" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."custom_game_names" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_messages" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chip_stack_emoticons" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."session_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."sitting_out_debug_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."session_player_snapshots" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."timing_debug_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."player_transactions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."dice_trace_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."trace_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."dice_trace_samples" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."players" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."performance_traces" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."dice_roll_audit" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."profiles" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."player_cards" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."cribbage_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."game_state_debug_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."insert_audit_log" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."network_sim_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."cribbage_hand_archive" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."debug_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."visual_bug_reports" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."geometry_overrides" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."client_runtime_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_message_delivery_trace" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."client_runtime_instances" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."client_runtime_event_outbox" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."client_runtime_incidents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."arcade_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."take_two_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."client_runtime_incident_reports" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."voice_operation_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."voice_operation_incidents" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."voice_operation_reports" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."voice_peer_witness_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."voice_presence_heartbeats" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_operation_reports" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_send_operations" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."game_results" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_diagnostic_sessions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."chat_message_diagnostic_events" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."rounds" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."games" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."royal_flash_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."boxdrop_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."gameplay_transfer_batches" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."arcade_game_artwork" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."three_five_seven_frame_notices" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."eleven_up_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."canasta_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."race_poker_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."ptown_words_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."golf_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."platform_notifications" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."delayed_match_updates" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "storage"."objects" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."game_defaults" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));
CREATE POLICY account_access_required ON "public"."mega_live_revisions" AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));

CREATE FUNCTION public.account_assert_enabled(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 BEGIN PERFORM private.require_account_enabled(p_actor); END $$;
 REVOKE ALL ON FUNCTION public.account_assert_enabled(uuid) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.account_assert_enabled(uuid) TO service_role;
ALTER TABLE private.push_defaults ADD COLUMN registrations_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE private.push_events ADD COLUMN registration_user_id uuid REFERENCES auth.users(id);
ALTER TABLE private.push_events DROP CONSTRAINT push_events_kind_check, DROP CONSTRAINT push_events_check;
ALTER TABLE private.push_events ADD CONSTRAINT push_events_kind_check CHECK(kind IN('invite','turn','last_call','table_open','registration')),
 ADD CONSTRAINT push_events_check CHECK(
 (kind='registration' AND registration_user_id IS NOT NULL AND match_id IS NULL AND table_id IS NULL AND epoch=0) OR
 (kind='table_open' AND registration_user_id IS NULL AND table_id IS NOT NULL AND match_id IS NULL AND epoch=0) OR
 (kind IN('invite','turn','last_call') AND registration_user_id IS NULL AND table_id IS NULL AND match_id IS NOT NULL));
CREATE UNIQUE INDEX push_registration_recipient ON private.push_events(registration_user_id,user_id) WHERE kind='registration';
CREATE FUNCTION private.account_registered_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid; event_i uuid;
BEGIN
 FOR recipient IN SELECT d.user_id FROM private.push_defaults d JOIN public.account_access a ON a.user_id=d.user_id
  WHERE d.registrations_enabled AND a.enabled AND public.has_role(d.user_id,'admin'::public.app_role) LOOP
  INSERT INTO private.push_events(user_id,registration_user_id,epoch,kind,keys) VALUES(recipient,NEW.id,0,'registration','{}')
  ON CONFLICT(registration_user_id,user_id) WHERE kind='registration' DO NOTHING RETURNING id INTO event_i;
  IF event_i IS NOT NULL THEN
   INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
   SELECT event_i,id,binding FROM private.push_subscriptions WHERE user_id=recipient AND NOT disabled ON CONFLICT DO NOTHING;
  END IF;
 END LOOP; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_registered_push() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_account_registered_push AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_registered_push();

CREATE OR REPLACE FUNCTION public.async_push_authorize(p_event uuid, p_subscription uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; p private.push_defaults; expiry timestamptz;
BEGIN
 SELECT * INTO d FROM private.push_deliveries WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO e FROM private.push_events WHERE id=p_event; SELECT * INTO s FROM private.push_subscriptions WHERE id=p_subscription;
 IF s.binding<>d.binding OR NOT private.push_eligible(e,s) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=e.user_id;
 IF private.push_quiet_at(p,clock_timestamp()) THEN
  UPDATE private.push_deliveries SET state=CASE WHEN e.kind='table_open' THEN 'skipped' ELSE 'pending' END,
   retry_at=private.push_quiet_transition(p,clock_timestamp(),false),lease=NULL,lease_until=NULL
   WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending';
  RETURN NULL;
 END IF;
 -- Persist suppression before returning, including a lost worker receipt.
 IF e.kind<>'registration' AND private.push_user_active(e.user_id) THEN
  UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL
   WHERE event_id=e.id AND state IN('pending','sending');
  RETURN NULL;
 END IF;
 expiry:=least(clock_timestamp()+interval '60 seconds',private.push_quiet_transition(p,clock_timestamp(),true));
 IF e.kind='registration' THEN NULL; ELSIF e.kind='table_open' THEN expiry:=least(expiry,e.created_at+interval '5 minutes');
 ELSIF e.kind='invite' THEN SELECT least(expiry,m.expires_at) INTO expiry FROM private.delayed_matches m WHERE m.id=e.match_id;
 ELSE
  SELECT least(expiry,min(least(c.expires_at,coalesce(c.gameplay_due_at,'infinity')))) INTO expiry
   FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
    AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys)) AND c.expires_at>clock_timestamp() AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp());
 END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('registrationUserId',e.registration_user_id,'username',CASE WHEN e.kind='registration' THEN (SELECT username FROM public.profiles WHERE id=e.registration_user_id) END,'eventId',e.id,'matchId',e.match_id,'tableId',e.table_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM expiry)*1000)));
END $function$
;

CREATE OR REPLACE FUNCTION public.async_push_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; token uuid; p private.push_defaults;
BEGIN
 -- Serialize only the short claim/coalescing transaction, never an HTTP send.
 IF NOT pg_try_advisory_xact_lock(914,6021) THEN RETURN NULL; END IF;
 FOR d IN SELECT * FROM private.push_deliveries WHERE state IN('pending','sending') AND retry_at<=clock_timestamp()
  AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY retry_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO e FROM private.push_events WHERE id=d.event_id;
  SELECT * INTO s FROM private.push_subscriptions WHERE id=d.subscription_id;
  -- A Last Call is eligible only when the current pending turn actually reaches 24h.
  IF e.kind='last_call' AND EXISTS(SELECT FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND id::text||':'||segment=ANY(e.keys))
   AND NOT EXISTS(SELECT FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND last_call_at<=clock_timestamp() AND id::text||':'||segment=ANY(e.keys)) THEN
   UPDATE private.push_deliveries SET retry_at=(SELECT min(last_call_at) FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND id::text||':'||segment=ANY(e.keys)) WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
   CONTINUE;
  END IF;
  IF s.binding<>d.binding OR NOT private.push_eligible(e,s) OR d.attempts>=8 THEN
   UPDATE private.push_deliveries SET state='skipped' WHERE event_id=d.event_id AND subscription_id=d.subscription_id; CONTINUE;
  END IF;
  SELECT * INTO p FROM private.push_defaults WHERE user_id=e.user_id;
  IF private.push_quiet_at(p,clock_timestamp()) THEN
   UPDATE private.push_deliveries SET state=CASE WHEN e.kind='table_open' THEN 'skipped' ELSE 'pending' END,
    retry_at=private.push_quiet_transition(p,clock_timestamp(),false),lease=NULL,lease_until=NULL
    WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
   CONTINUE;
  END IF;
  IF e.match_id IS NOT NULL THEN
   IF EXISTS(SELECT FROM private.push_deliveries x JOIN private.push_events y ON y.id=x.event_id
    WHERE x.subscription_id=s.id AND y.match_id=e.match_id AND x.event_id<>e.id
     AND x.state='sending' AND x.lease_until>clock_timestamp()) THEN CONTINUE; END IF;
   -- Select only the newest still-actionable due reminder for this device/match.
   -- This also handles worker downtime spanning the whole quiet window.
   IF EXISTS(SELECT FROM private.push_deliveries x JOIN private.push_events y ON y.id=x.event_id
    WHERE x.subscription_id=s.id AND x.binding=s.binding AND y.match_id=e.match_id AND y.user_id=e.user_id
     AND x.state IN('pending','sending') AND private.push_eligible(y,s)
     AND (y.epoch,CASE WHEN y.kind='last_call' THEN 1 ELSE 0 END)>(e.epoch,CASE WHEN e.kind='last_call' THEN 1 ELSE 0 END)) THEN
    UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
    CONTINUE;
   END IF;
   UPDATE private.push_deliveries x SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events y
    WHERE y.id=x.event_id AND x.subscription_id=s.id AND y.match_id=e.match_id AND y.user_id=e.user_id
     AND x.state IN('pending','sending') AND y.id<>e.id AND private.push_eligible(y,s)
     AND (y.epoch,CASE WHEN y.kind='last_call' THEN 1 ELSE 0 END)<(e.epoch,CASE WHEN e.kind='last_call' THEN 1 ELSE 0 END);
  END IF;
  IF e.kind<>'registration' AND private.push_user_active(e.user_id) THEN
   UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE event_id=e.id AND state IN('pending','sending'); CONTINUE;
  END IF;
  token:=gen_random_uuid();
  UPDATE private.push_deliveries SET state='sending',lease=token,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1
   WHERE event_id=d.event_id AND subscription_id=d.subscription_id AND state IN('pending','sending');
  IF NOT FOUND THEN CONTINUE; END IF;
  RETURN jsonb_build_object('eventId',e.id,'subscriptionId',s.id,'lease',token);
 END LOOP;
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.notification_preferences(p_patch jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE who uuid:=auth.uid(); p private.push_defaults; k text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_patch IS NOT NULL THEN
  IF jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
   IF k IN('registrations','invitations','asyncDefault','newTable','quietEnabled') THEN
    IF jsonb_typeof(p_patch->k)<>'boolean' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
   ELSIF k IN('quietStart','quietEnd') THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR p_patch->>k !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'push:invalid_time'; END IF;
   ELSIF k='quietZone' THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR NOT EXISTS(SELECT FROM private.push_timezone_names WHERE name=p_patch->>k) THEN RAISE EXCEPTION 'push:invalid_timezone'; END IF;
   ELSE RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  END LOOP;
  IF p_patch ? 'registrations' AND NOT public.has_role(who,'admin'::public.app_role) THEN RAISE EXCEPTION 'push:admin_required' USING ERRCODE='42501'; END IF;
  INSERT INTO private.push_defaults(user_id) VALUES(who) ON CONFLICT DO NOTHING;
  UPDATE private.push_defaults SET registrations_enabled=coalesce((p_patch->>'registrations')::boolean,registrations_enabled), invitations_enabled=coalesce((p_patch->>'invitations')::boolean,invitations_enabled), enabled=coalesce((p_patch->>'asyncDefault')::boolean,enabled),
   new_table_enabled=coalesce((p_patch->>'newTable')::boolean,new_table_enabled),
   quiet_enabled=coalesce((p_patch->>'quietEnabled')::boolean,quiet_enabled),
   quiet_start=coalesce((p_patch->>'quietStart')::time,quiet_start),quiet_end=coalesce((p_patch->>'quietEnd')::time,quiet_end),
   quiet_zone=coalesce(p_patch->>'quietZone',quiet_zone) WHERE user_id=who;
  -- Wake deferred work after zone/window edits; Last Call still checks its real due time.
  UPDATE private.push_deliveries d SET retry_at=clock_timestamp() FROM private.push_events e
   WHERE e.id=d.event_id AND e.user_id=who AND d.state='pending';
  -- An explicit opt-out cancels old pending work, even if the user later opts in again.
  IF p_patch->>'invitations'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='invite' AND d.state IN('pending','sending');
  END IF;
  IF p_patch->>'registrations'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='registration' AND d.state IN('pending','sending');
  END IF;
  IF p_patch->>'newTable'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='table_open' AND d.state IN('pending','sending');
  END IF;
 END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=who;
 RETURN CASE WHEN public.has_role(who,'admin'::public.app_role) THEN jsonb_build_object('registrations',coalesce(p.registrations_enabled,false)) ELSE '{}'::jsonb END || jsonb_build_object('invitations',coalesce(p.invitations_enabled,false),'asyncDefault',coalesce(p.enabled,false),'newTable',coalesce(p.new_table_enabled,false),
  'quietEnabled',coalesce(p.quiet_enabled,false),'quietStart',coalesce(to_char(p.quiet_start,'HH24:MI'),'22:00'),
  'quietEnd',coalesce(to_char(p.quiet_end,'HH24:MI'),'07:00'),'quietZone',coalesce(p.quiet_zone,'UTC'));
END $function$
;

CREATE OR REPLACE FUNCTION private.push_eligible(e private.push_events, s private.push_subscriptions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT NOT s.disabled AND s.user_id=e.user_id
 AND EXISTS(SELECT FROM auth.sessions WHERE id=s.session_id AND user_id=s.user_id AND (not_after IS NULL OR not_after>clock_timestamp()))
 AND EXISTS(SELECT FROM public.profiles WHERE id=s.user_id AND is_active)
 AND ((e.kind='registration' AND public.has_role(e.user_id,'admin'::public.app_role)
   AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND registrations_enabled)
   AND EXISTS(SELECT FROM public.account_access WHERE user_id=e.registration_user_id AND NOT enabled AND NOT ever_enabled))
 OR (e.kind='table_open'
  AND e.created_at+interval '5 minutes'>clock_timestamp()
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND new_table_enabled)
  AND EXISTS(SELECT FROM private.push_table_openings WHERE session_id=e.table_id AND host_id IS DISTINCT FROM e.user_id)
  AND private.push_table_allowed(e.table_id,e.user_id)
  -- Drop a table alert if any quiet minute has elapsed since its opening, even
  -- when the worker was asleep for that entire (short) window. No morning backlog.
  AND NOT EXISTS(SELECT FROM private.push_defaults p, LATERAL generate_series(date_trunc('minute',e.created_at),clock_timestamp(),interval '1 minute') t
   WHERE p.user_id=e.user_id AND private.push_quiet_at(p,t)))
 OR (e.kind='invite'
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND invitations_enabled)
  AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND m.opponent=e.user_id
   AND m.status='invited' AND m.accepted_at IS NULL AND m.expires_at>clock_timestamp()
   AND NOT private.delayed_held(m.id) AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)))
 OR (e.kind IN('turn','last_call') AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND ((e.kind='turn' AND turn_epoch=e.epoch AND cardinality(keys)>0) OR (e.kind='last_call' AND keys&&e.keys)))
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys))
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND c.expires_at>clock_timestamp() AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$function$
;

NOTIFY pgrst,'reload schema';
