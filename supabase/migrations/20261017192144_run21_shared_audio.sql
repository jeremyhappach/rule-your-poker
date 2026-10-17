-- Presentation-only successor: scoring, qualification, dealing and playing clock stay identical.
INSERT INTO private.gameplay_rulesets(id,game,config)
 SELECT 'run21/3',game,config||'{"preset":"run21/3","silverCelebrationMs":3000,"goldCelebrationMs":3800}'::jsonb
 FROM private.gameplay_rulesets WHERE id='run21/2' ON CONFLICT(id) DO NOTHING;
INSERT INTO private.arcade_rulesets(id,game,config,enabled)
 SELECT id,game,config||'{"roundDurationMs":106800,"scorePresentationMs":5000}'::jsonb,false
 FROM private.gameplay_rulesets WHERE id='run21/3' ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF (SELECT config-ARRAY['preset','silverCelebrationMs','goldCelebrationMs'] FROM private.gameplay_rulesets WHERE id='run21/3')
 IS DISTINCT FROM (SELECT config-'preset' FROM private.gameplay_rulesets WHERE id='run21/2')
 OR NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='run21/3' AND config->>'silverCelebrationMs'='3000' AND config->>'scorePresentationMs'='5000')
 THEN RAISE EXCEPTION 'run21:audio_rules_conflict';END IF;
END $$;
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text,ruleset text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3','tri-towers/4') THEN 'tri-towers/2'
 WHEN game='run21' AND ruleset IN ('run21/2','run21/3') THEN 'run21/2' ELSE ruleset END
$$;
