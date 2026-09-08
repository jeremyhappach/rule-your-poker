-- Restore the exact preflight state: no postgres/database tracking override.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_db_role_setting s
    WHERE s.setrole=(SELECT oid FROM pg_roles WHERE rolname='postgres')
      AND s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND EXISTS(SELECT 1 FROM unnest(s.setconfig) c
        WHERE c LIKE 'pg_stat_statements.track=%' AND c<>'pg_stat_statements.track=all')) THEN
    RAISE EXCEPTION 'recovery_rollout:unexpected_tracking_change';
  END IF;
END;
$guard$;
ALTER ROLE postgres IN DATABASE postgres RESET pg_stat_statements.track;
COMMIT;
