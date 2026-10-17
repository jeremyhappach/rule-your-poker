-- Only after the compatible production client is READY and proofs pass.
BEGIN;
UPDATE private.tri_towers_release SET celebration_enabled=true WHERE singleton;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/4';
COMMIT;
