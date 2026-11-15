-- Run only after /7 client publication and candidate + installed rollback proofs.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='357-drop/7' AND config=private.drop357_v7_rules())
  OR private.arcade_score_group('357-drop','357-drop/7')<>private.arcade_score_group('357-drop','357-drop/6')
  OR private.drop357_lane(ARRAY[47,8,39,43,11,49,44],7,private.drop357_v7_rules())->>'score'<>'1584'
 THEN RAISE EXCEPTION '357:natty_release_unqualified';END IF;
END $$;
SELECT private.drop357_select_ruleset('357-drop/7'::text);
COMMIT;
