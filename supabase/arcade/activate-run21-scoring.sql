-- Run only after the compatible app and recovery worker are deployed.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='run21/arcade-2' AND config->>'clockStart'='intro_end') THEN
  RAISE EXCEPTION 'arcade:scoring_ruleset_missing';
 END IF;
END $$;
UPDATE private.arcade_rulesets SET enabled=false WHERE id='run21/arcade-1';
UPDATE private.arcade_rulesets SET enabled=true WHERE id='run21/arcade-2';
COMMIT;
