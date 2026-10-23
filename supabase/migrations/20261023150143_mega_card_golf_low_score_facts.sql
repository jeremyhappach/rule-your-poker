-- Mega supplies authoritative course/board-specific low-score facts in its commit.
-- Preserve the existing high-score trigger for every other Arcade game.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='private.arcade_results'::regclass AND tgname='arcade_score_facts') IS DISTINCT FROM 'CREATE TRIGGER arcade_score_facts BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION private.arcade_score_facts()' THEN RAISE EXCEPTION 'mega:score_trigger_drift';END IF;
 IF (SELECT enabled FROM private.arcade_rulesets WHERE id='mega-card-golf/1') IS DISTINCT FROM false THEN RAISE EXCEPTION 'mega:admission_must_be_closed';END IF;
END $$;
DROP TRIGGER arcade_score_facts ON private.arcade_results;
CREATE TRIGGER arcade_score_facts BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN(NEW.game<>'mega-card-golf') EXECUTE FUNCTION private.arcade_score_facts();
