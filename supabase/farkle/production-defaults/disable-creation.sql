-- Forward recovery preserves approved defaults and existing immutable games.
BEGIN;
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
COMMIT;
