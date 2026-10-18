-- Owner-approved leaderboard policy: TriTowers versions 2–5 compete together.
-- Preserve recorded rules, scores, receipts and gameplay behavior.
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text, ruleset text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN 'tri-towers/2'
 WHEN game='run21' AND ruleset IN ('run21/2','run21/3') THEN 'run21/2' ELSE ruleset END
$$;
