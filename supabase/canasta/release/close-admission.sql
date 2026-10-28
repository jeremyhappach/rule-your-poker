-- Incident containment only after approval to operate the installed release.
-- Preserve execution/recovery for every already accepted stake and historical result.
BEGIN;
UPDATE private.canasta_release SET admission_enabled=false WHERE singleton;
COMMIT;
