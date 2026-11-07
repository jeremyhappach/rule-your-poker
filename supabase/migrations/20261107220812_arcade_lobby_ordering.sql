-- Presentation only: a singleton row publishes both sections atomically.
-- Does not grant visibility, change admission or touch gameplay/financial state.
CREATE TABLE IF NOT EXISTS public.arcade_lobby_layout (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 layout jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
ALTER TABLE public.arcade_lobby_layout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_lobby_layout FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE(layout) ON public.arcade_lobby_layout TO authenticated;

CREATE OR REPLACE FUNCTION private.validate_arcade_lobby_layout() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ids jsonb; item jsonb;
BEGIN
 IF jsonb_typeof(NEW.layout) IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.layout->'originals') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.layout->'other') IS DISTINCT FROM 'array'
    OR NEW.layout - 'originals' - 'other' <> '{}'::jsonb THEN
  RAISE EXCEPTION 'arcade:invalid_layout' USING ERRCODE='22023';
 END IF;
 ids := (NEW.layout->'originals') || (NEW.layout->'other');
 IF jsonb_array_length(ids)>500 THEN
  RAISE EXCEPTION 'arcade:invalid_layout' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(ids) LOOP
  IF jsonb_typeof(item)<>'string' OR (item #>> '{}') !~ '^[a-z0-9][a-z0-9-]{0,79}$' THEN
   RAISE EXCEPTION 'arcade:invalid_game_key' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF (SELECT count(*) <> count(DISTINCT value) FROM jsonb_array_elements_text(ids)) THEN
  RAISE EXCEPTION 'arcade:duplicate_game' USING ERRCODE='22023';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.layout=OLD.layout THEN RETURN OLD; END IF;
  NEW.revision := OLD.revision+1;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_arcade_lobby_layout() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS validate_arcade_lobby_layout ON public.arcade_lobby_layout;
CREATE TRIGGER validate_arcade_lobby_layout BEFORE INSERT OR UPDATE ON public.arcade_lobby_layout
 FOR EACH ROW EXECUTE FUNCTION private.validate_arcade_lobby_layout();

DROP POLICY IF EXISTS arcade_layout_read ON public.arcade_lobby_layout;
CREATE POLICY arcade_layout_read ON public.arcade_lobby_layout FOR SELECT TO authenticated
 USING ((SELECT private.account_enabled(auth.uid()))
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active));
DROP POLICY IF EXISTS arcade_layout_update ON public.arcade_lobby_layout;
CREATE POLICY arcade_layout_update ON public.arcade_lobby_layout FOR UPDATE TO authenticated
 USING ((SELECT public.is_admin(auth.uid())) AND NOT public.cutover_write_lock_active()
  AND (SELECT private.account_enabled(auth.uid()))
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active))
 WITH CHECK ((SELECT public.is_admin(auth.uid())) AND NOT public.cutover_write_lock_active()
  AND (SELECT private.account_enabled(auth.uid()))
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active));

-- Existing ribbons/designations; preserve the catalog's relative order in each.
-- ON CONFLICT keeps an already-published admin layout intact on reapplication.
INSERT INTO public.arcade_lobby_layout(id,layout) VALUES(true,
 '{"originals":["horses-blitz","357-drop","crib-lab","chucky-showdown"],
   "other":["run21","tri-towers","eleven-up","boxdrop","trip-flip","take-two","royal-flash","mega-card-golf","quintzee"]}')
ON CONFLICT(id) DO NOTHING;
NOTIFY pgrst,'reload schema';
