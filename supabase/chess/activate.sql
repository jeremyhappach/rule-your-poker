-- Approved November 12, 2026, after the installed rollback financial proof PASS
-- and hosted live/Async qualification on c621de788. Apply after the matching
-- production application is READY. This changes admission, not game rules/data.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$BEGIN
 IF NOT EXISTS(SELECT FROM supabase_migrations.schema_migrations WHERE version='20261113001204')
 OR NOT EXISTS(SELECT FROM private.chess_release WHERE singleton AND enabled AND admission_enabled AND async_enabled AND NOT bots_enabled)
 THEN RAISE EXCEPTION 'chess:unexpected_release_baseline';END IF;
END $$;
UPDATE private.chess_release SET preview_only=false,real_qualified=true WHERE singleton;
COMMIT;
SELECT to_jsonb(r) AS chess_release FROM private.chess_release r WHERE singleton;
