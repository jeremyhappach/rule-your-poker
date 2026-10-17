BEGIN;
UPDATE private.tri_towers_release SET intro_enabled=true WHERE singleton;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/3';
COMMIT;
