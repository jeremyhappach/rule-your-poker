BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.gameplay_rulesets WHERE id='run21/2') OR NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='run21/2') THEN RAISE EXCEPTION 'run21:shared_rules_missing';END IF;
END $$;
ALTER TABLE private.run21_matches ALTER COLUMN gameplay_ruleset SET DEFAULT 'run21/2';
UPDATE private.arcade_rulesets SET enabled=(id='run21/2') WHERE game='run21';
COMMIT;
