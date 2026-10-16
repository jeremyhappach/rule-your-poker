-- Presentation metadata only. No gameplay, financial, or recovery authority changes.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('arcade-artwork','arcade-artwork',false,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE TABLE public.arcade_game_artwork (
 game text PRIMARY KEY CHECK(game IN('run21','tri-towers','yahtzee')),
 object_path text UNIQUE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 CHECK(object_path IS NULL OR object_path ~ ('^'||game||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'))
);
INSERT INTO public.arcade_game_artwork(game) VALUES('run21'),('tri-towers'),('yahtzee');
ALTER TABLE public.arcade_game_artwork ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_game_artwork FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE(object_path) ON public.arcade_game_artwork TO authenticated;
CREATE POLICY arcade_artwork_read ON public.arcade_game_artwork FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active));
CREATE POLICY arcade_artwork_update ON public.arcade_game_artwork FOR UPDATE TO authenticated
 USING ((SELECT public.is_admin(auth.uid())) AND NOT public.cutover_write_lock_active()
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active))
 WITH CHECK ((SELECT public.is_admin(auth.uid())) AND NOT public.cutover_write_lock_active()
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active));

CREATE FUNCTION private.arcade_artwork_validate() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.object_path IS NULL OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='arcade-artwork' AND name=NEW.object_path) THEN
  RAISE EXCEPTION 'arcade:artwork_not_uploaded';
 END IF;
 NEW.updated_at=clock_timestamp();NEW.updated_by=auth.uid();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.arcade_artwork_validate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER arcade_artwork_validate BEFORE UPDATE ON public.arcade_game_artwork FOR EACH ROW EXECUTE FUNCTION private.arcade_artwork_validate();

CREATE POLICY arcade_artwork_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='arcade-artwork' AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active));
CREATE POLICY arcade_artwork_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='arcade-artwork' AND (SELECT public.is_admin(auth.uid()))
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active)
  AND name ~ '^(run21|tri-towers|yahtzee)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$');
-- No UPDATE grant: replacements always have a new immutable object path.
CREATE POLICY arcade_artwork_cleanup ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='arcade-artwork' AND (SELECT public.is_admin(auth.uid()))
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active)
  AND NOT EXISTS(SELECT 1 FROM public.arcade_game_artwork WHERE object_path=storage.objects.name));

-- Read only: display the registry's actual frozen settings without copying defaults
-- or changing the existing leaderboard calculation/API.
CREATE FUNCTION public.arcade_rules_help(p_ruleset text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.arcade_allowed(auth.uid()) THEN RAISE EXCEPTION 'arcade:forbidden';END IF;
 SELECT config INTO result FROM private.arcade_rulesets
  WHERE game='run21' AND (CASE WHEN p_ruleset IS NULL THEN enabled ELSE id=p_ruleset END)
  ORDER BY id DESC LIMIT 1;
 IF result IS NULL THEN RAISE EXCEPTION 'arcade:unknown_ruleset';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.arcade_rules_help(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arcade_rules_help(text) TO authenticated;
NOTIFY pgrst,'reload schema';
