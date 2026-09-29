ALTER TABLE private.run21_matches ADD COLUMN IF NOT EXISTS debug_harness text NOT NULL DEFAULT 'none'
  CHECK (debug_harness IN ('none','always_104','always_105'));

-- Capture only global, server-read configuration at setup, never p_config/client input.
-- Existing matches remain normal. The selection cannot change after insertion.
CREATE OR REPLACE FUNCTION private.run21_capture_harness() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.debug_harness IS DISTINCT FROM OLD.debug_harness THEN
      RAISE EXCEPTION 'run21:harness_frozen';
    END IF;
    RETURN NEW;
  END IF;
  NEW.debug_harness := 'none';
  IF EXISTS(SELECT 1 FROM public.games WHERE id=NEW.game_id AND real_money=false)
     AND EXISTS(SELECT 1 FROM public.system_settings WHERE key='harnesses_mode' AND value->'enabled'='true'::jsonb) THEN
    SELECT CASE WHEN debug_harness IN ('always_104','always_105') THEN debug_harness ELSE 'none' END
      INTO NEW.debug_harness FROM public.game_defaults WHERE game_type='run21';
    NEW.debug_harness := coalesce(NEW.debug_harness,'none');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_capture_harness() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_capture_harness BEFORE INSERT OR UPDATE OF debug_harness ON private.run21_matches
  FOR EACH ROW EXECUTE FUNCTION private.run21_capture_harness();
INSERT INTO public.game_defaults(game_type,debug_harness) VALUES('run21','none') ON CONFLICT(game_type) DO NOTHING;
