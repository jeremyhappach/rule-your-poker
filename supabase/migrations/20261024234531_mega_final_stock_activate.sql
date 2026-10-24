-- Apply only after compatible API/client/worker and exact-SHA release verification.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='mega-card-golf/3' AND config='{"engine":"mega-card-golf/3","opening":"sequential","finalDraw":"stand-pat-or-replace","score":"canonical-golf"}'::jsonb) THEN RAISE EXCEPTION 'mega:ruleset_missing';END IF;
END $$;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/3';
