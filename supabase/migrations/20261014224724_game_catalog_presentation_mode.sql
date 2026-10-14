-- Phase 1 metadata only. public.games contains sessions; the per-game catalog
-- is public.game_defaults, whose unique authoritative key is game_type.
-- Fail immediately on catalog contention rather than queue ahead of gameplay.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '3s';

DO $migration$
DECLARE
  prior_catalog jsonb;
BEGIN
  LOCK TABLE public.game_defaults IN ACCESS EXCLUSIVE MODE NOWAIT;
  IF (SELECT count(*) FROM public.game_defaults) > 1000 THEN
    RAISE EXCEPTION 'presentation_mode:catalog_size_requires_review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_defaults WHERE game_type = 'run21') THEN
    RAISE EXCEPTION 'presentation_mode:run21_catalog_entry_missing';
  END IF;

  SELECT jsonb_agg(to_jsonb(d) - ARRAY['presentation_mode', 'updated_at'] ORDER BY game_type)
  INTO prior_catalog FROM public.game_defaults d;

  ALTER TABLE public.game_defaults
    ADD COLUMN IF NOT EXISTS presentation_mode text NOT NULL DEFAULT 'table'
      CONSTRAINT game_defaults_presentation_mode_check
      CHECK (presentation_mode IN ('table', 'fullscreen'));

  -- A replay is harmless, but an incompatible pre-existing definition is not.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'game_defaults'
      AND column_name = 'presentation_mode' AND data_type = 'text'
      AND is_nullable = 'NO' AND column_default = '''table''::text'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.game_defaults'::regclass
      AND conname = 'game_defaults_presentation_mode_check' AND convalidated
      AND pg_get_constraintdef(oid) =
        'CHECK ((presentation_mode = ANY (ARRAY[''table''::text, ''fullscreen''::text])))'
  ) THEN
    RAISE EXCEPTION 'presentation_mode:definition_drift';
  END IF;

  UPDATE public.game_defaults SET presentation_mode = 'fullscreen'
  WHERE game_type = 'run21' AND presentation_mode IS DISTINCT FROM 'fullscreen';

  IF EXISTS (
    SELECT 1 FROM public.game_defaults
    WHERE presentation_mode IS DISTINCT FROM
      CASE WHEN game_type = 'run21' THEN 'fullscreen' ELSE 'table' END
  ) THEN
    RAISE EXCEPTION 'presentation_mode:classification_mismatch';
  END IF;
  IF prior_catalog IS DISTINCT FROM (
    SELECT jsonb_agg(to_jsonb(d) - ARRAY['presentation_mode', 'updated_at'] ORDER BY game_type)
    FROM public.game_defaults d
  ) THEN
    RAISE EXCEPTION 'presentation_mode:existing_metadata_changed';
  END IF;
  -- Includes writes made by triggers: no session, hand, player or ledger DML.
  IF EXISTS (
    SELECT 1 FROM pg_stat_xact_user_tables
    WHERE schemaname IN ('public', 'private')
      AND relid <> 'public.game_defaults'::regclass
      AND n_tup_ins + n_tup_upd + n_tup_del > 0
  ) THEN
    RAISE EXCEPTION 'presentation_mode:unexpected_application_write';
  END IF;
END
$migration$;
