-- Run after the candidate migration in BEGIN/ROLLBACK, or against the deployed
-- definition in BEGIN/ROLLBACK. This file never commits synthetic catalog rows.
BEGIN;
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '3s';

DO $proof$
DECLARE
  fixture_key text := 'presentation-mode-proof-' || gen_random_uuid()::text;
  mode text;
  before_catalog jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(d) ORDER BY game_type) INTO before_catalog
  FROM public.game_defaults d;
  IF NOT EXISTS (SELECT 1 FROM public.game_defaults WHERE game_type = 'run21' AND presentation_mode = 'fullscreen')
    OR EXISTS (SELECT 1 FROM public.game_defaults WHERE presentation_mode IS DISTINCT FROM
      CASE WHEN game_type = 'run21' THEN 'fullscreen' ELSE 'table' END)
  THEN RAISE EXCEPTION 'proof:classification'; END IF;

  -- Subtransaction rollback exercises real defaults, constraints and triggers
  -- without leaving any record or publishing a Realtime fixture event.
  BEGIN
    INSERT INTO public.game_defaults(game_type) VALUES (fixture_key)
    RETURNING presentation_mode INTO mode;
    IF mode IS DISTINCT FROM 'table' THEN RAISE EXCEPTION 'proof:default'; END IF;
    UPDATE public.game_defaults SET presentation_mode = 'fullscreen' WHERE game_type = fixture_key;
    SELECT presentation_mode INTO mode FROM public.game_defaults WHERE game_type = fixture_key;
    IF mode IS DISTINCT FROM 'fullscreen' THEN RAISE EXCEPTION 'proof:explicit_fullscreen'; END IF;
    BEGIN
      UPDATE public.game_defaults SET presentation_mode = 'invalid' WHERE game_type = fixture_key;
      RAISE EXCEPTION 'proof:invalid_value_accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE public.game_defaults SET presentation_mode = NULL WHERE game_type = fixture_key;
      RAISE EXCEPTION 'proof:null_accepted';
    EXCEPTION WHEN not_null_violation THEN NULL; END;
    RAISE EXCEPTION USING ERRCODE = 'PT001', MESSAGE = 'rollback_fixture';
  EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL; END;

  IF before_catalog IS DISTINCT FROM (
    SELECT jsonb_agg(to_jsonb(d) ORDER BY game_type) FROM public.game_defaults d
  ) THEN RAISE EXCEPTION 'proof:catalog_changed'; END IF;
END
$proof$;

SET LOCAL ROLE anon;
SELECT game_type, presentation_mode FROM public.game_defaults ORDER BY game_type;
DO $authorization$
BEGIN
  BEGIN
    INSERT INTO public.game_defaults(game_type) VALUES ('presentation-mode-denied-' || gen_random_uuid()::text);
    RAISE EXCEPTION 'proof:anonymous_write_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$authorization$;
RESET ROLE;
SELECT 'PASS: classifications, default, explicit mode, CHECK, NOT NULL, read access, write denial, fixture rollback' AS result;
ROLLBACK;
