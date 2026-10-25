-- Approved separate activation, gated on matching site and release signal.
-- Apply only after compatible API/client/worker and exact-SHA release verification.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='mega-card-golf/4' AND config='{"engine":"mega-card-golf/4","opening":"sequential","finalDraw":"stand-pat-or-replace","standPat":"playable-hole","score":"canonical-golf"}'::jsonb) THEN RAISE EXCEPTION 'mega:ruleset_missing';END IF;
END $$;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/4';
