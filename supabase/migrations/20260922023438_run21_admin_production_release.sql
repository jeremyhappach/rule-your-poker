-- Run21 remains disabled until the operator approves this exact deployment.
ALTER TABLE private.run21_app_test_release DROP CONSTRAINT run21_app_test_release_project_ref_check;
ALTER TABLE private.run21_app_test_release ADD CONSTRAINT run21_app_test_release_project_ref_check
  CHECK(project_ref IS NULL OR project_ref='local' OR project_ref='xvhmbuppghwmwpwrkzao');
CREATE TABLE private.run21_release_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE private.run21_release_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_release_allowlist FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.run21_release_allowlist IS 'Operator-managed Run21 release. Membership never substitutes for current administrator status.';

CREATE FUNCTION private.run21_actor_allowed(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_user_id IS NOT NULL AND coalesce(public.is_admin(p_user_id),false)
 AND EXISTS(SELECT 1 FROM private.run21_release_allowlist WHERE user_id=p_user_id)
 AND EXISTS(SELECT 1 FROM private.run21_app_test_release WHERE singleton AND enabled AND qualified)
$$;
REVOKE ALL ON FUNCTION private.run21_actor_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.run21_server_authorize(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT private.run21_actor_allowed(p_user_id) $$;
REVOKE ALL ON FUNCTION public.run21_server_authorize(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_server_authorize(uuid) TO service_role;

-- Preserve the existing helper identity used by the Run21-only RPCs.
CREATE OR REPLACE FUNCTION private.run21_require_local() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.run21_app_test_release WHERE singleton AND enabled AND qualified)
    OR (auth.uid() IS NOT NULL AND NOT private.run21_actor_allowed(auth.uid())) THEN
   RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.run21_app_test_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.run21_actor_allowed(actor); ref text;
BEGIN
 SELECT project_ref INTO ref FROM private.run21_app_test_release WHERE singleton;
 IF p_session_id IS NOT NULL THEN
   allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money=false)
     AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND NOT is_bot AND NOT private.run21_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',1,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'project_ref',ref,'fake_money_only',true);
END $$;

-- Restrictive discovery policies preserve all existing rules for every other game.
CREATE FUNCTION public.run21_session_visible(p_game_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND game_type='run21')
 OR private.run21_actor_allowed(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.run21_session_visible(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_session_visible(uuid) TO anon,authenticated;
CREATE POLICY run21_release_visibility ON public.games AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.run21_session_visible(id));
CREATE POLICY run21_release_visibility ON public.players AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.run21_session_visible(game_id));
CREATE POLICY run21_release_visibility ON public.rounds AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.run21_session_visible(game_id));
CREATE POLICY run21_release_visibility ON public.dealer_games AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(public.run21_session_visible(session_id));

-- Canonical SECURITY DEFINER joins also pass through these identity checks.
CREATE FUNCTION private.run21_release_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE is_run21 boolean;
BEGIN
 IF TG_TABLE_NAME='games' THEN
   is_run21:=NEW.game_type='run21';
   IF is_run21 AND (NEW.real_money IS DISTINCT FROM false OR EXISTS(
     SELECT 1 FROM public.players WHERE game_id=NEW.id AND NOT is_bot AND status<>'left' AND NOT private.run21_actor_allowed(user_id))) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT game_type='run21' INTO is_run21 FROM public.games WHERE id=NEW.game_id;
   IF is_run21 AND NOT NEW.is_bot AND NOT private.run21_actor_allowed(NEW.user_id) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF is_run21 AND auth.uid() IS NOT NULL AND NOT private.run21_actor_allowed(auth.uid()) THEN
   RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_release_write_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_release_write_guard BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.run21_release_write_guard();
CREATE TRIGGER run21_release_write_guard BEFORE INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_release_write_guard();

-- Server-only cross-instance wakeups: no deck, cards, participants or balances.
CREATE TABLE public.run21_revisions (
 game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
 revision bigint NOT NULL
);
ALTER TABLE public.run21_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.run21_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.run21_revisions TO service_role;
CREATE FUNCTION private.run21_publish_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO public.run21_revisions(game_id,revision) VALUES(NEW.game_id,NEW.revision)
 ON CONFLICT(game_id) DO UPDATE SET revision=EXCLUDED.revision;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_publish_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_publish_revision AFTER INSERT OR UPDATE ON private.run21_matches FOR EACH ROW EXECUTE FUNCTION private.run21_publish_revision();
ALTER PUBLICATION supabase_realtime ADD TABLE public.run21_revisions;
COMMENT ON TABLE private.run21_app_test_release IS 'Run21 administrator-and-UUID release gate, fake-money only. Disable this row first if production smoke fails.';
