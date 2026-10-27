-- Run only after the qualified client SHA is READY and its public manifest matches.
BEGIN;
SET LOCAL lock_timeout='100ms';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026234550' AND name='ptown_words_fake_money_bots')
  OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026235142' AND name='ptown_words_bot_accepted_human_guard')
  OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled)
  OR to_regprocedure('private.ptown_words_bot_choice(jsonb,bigint)') IS NULL
 THEN RAISE EXCEPTION 'Ptown Words bot release prerequisites missing';END IF;
 UPDATE private.ptown_words_release SET bots_enabled=true WHERE singleton;
END $$;
COMMIT;
SELECT enabled,admission_enabled,bots_enabled FROM private.ptown_words_release WHERE singleton;
