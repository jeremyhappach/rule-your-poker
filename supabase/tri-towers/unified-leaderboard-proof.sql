-- Run inside BEGIN/ROLLBACK, after the candidate migration when validating it.
DO $$
DECLARE actor uuid;period text;board jsonb;older jsonb;expected jsonb;best bigint;facts jsonb;sample record;before_data text;before_rules text;
BEGIN
 SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY run_id)::text) INTO before_data FROM private.arcade_results r WHERE game='tri-towers';
 SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) INTO before_rules FROM private.arcade_rulesets r;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5']) v WHERE private.arcade_score_group('tri-towers',v)<>'tri-towers/2') THEN RAISE EXCEPTION 'unified:version group';END IF;
 IF private.arcade_score_group('tri-towers','tri-towers/1')='tri-towers/2' OR private.arcade_score_group('tri-towers','tri-towers/6')='tri-towers/2' OR private.arcade_score_group('run21','run21/3')<>'run21/2' OR private.arcade_score_group('eleven-up','eleven-up/3')<>'eleven-up/3' THEN RAISE EXCEPTION 'unified:unrelated compatibility';END IF;
 SELECT user_id INTO STRICT actor FROM private.arcade_results WHERE game='tri-towers' AND private.arcade_allowed(user_id) ORDER BY completed_at DESC LIMIT 1;
 SELECT max(score) INTO best FROM private.all_score_results WHERE game='tri-towers' AND ruleset IN('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') AND user_id=actor;
 FOREACH period IN ARRAY ARRAY['30','all'] LOOP
  board:=public.arcade_leaderboard(actor,'tri-towers',period);
  older:=public.arcade_leaderboard(actor,'tri-towers',period,NULL,'tri-towers/4');
  WITH ranked AS (
   SELECT *,rank() OVER(ORDER BY score DESC) place FROM private.all_score_results WHERE game='tri-towers' AND ruleset IN('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') AND (period='all' OR completed_at>=statement_timestamp()-interval '30 days')
  ), top_ten AS (SELECT * FROM ranked ORDER BY score DESC,completed_at,run_id LIMIT 10)
  SELECT coalesce(jsonb_agg(jsonb_build_object('runId',run_id,'score',score,'rank',place) ORDER BY score DESC,completed_at,run_id),'[]') INTO expected FROM top_ten;
  IF (SELECT coalesce(jsonb_agg(jsonb_build_object('runId',r->'runId','score',r->'score','rank',r->'rank') ORDER BY ord),'[]') FROM jsonb_array_elements(board->'rows') WITH ORDINALITY t(r,ord)) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'unified:combined rank/order %',period;END IF;
  IF board->'rows' IS DISTINCT FROM older->'rows' OR (board->>'personalBest')::bigint IS DISTINCT FROM best OR board->'personalBest' IS DISTINCT FROM older->'personalBest' THEN RAISE EXCEPTION 'unified:legacy/current standings and personal best';END IF;
  IF board->>'currentRuleset'<>'tri-towers/5' OR board->>'ruleset'<>'tri-towers/5' OR board->'compatibleRulesets'<>'["tri-towers/2","tri-towers/3","tri-towers/4","tri-towers/5"]'::jsonb OR board->'availableRulesets'<>'["tri-towers/5"]'::jsonb THEN RAISE EXCEPTION 'unified:one current board';END IF;
 END LOOP;
 FOR sample IN SELECT DISTINCT ON(ruleset) run_id,user_id,score FROM private.arcade_results WHERE game='tri-towers' AND ruleset IN('tri-towers/4','tri-towers/5') AND private.arcade_allowed(user_id) ORDER BY ruleset,completed_at DESC LOOP
  board:=public.arcade_leaderboard(sample.user_id,'tri-towers','all',sample.run_id);
  IF (board#>>'{latestResult,rank}')::bigint IS DISTINCT FROM (SELECT 1+count(*) FROM private.all_score_results WHERE game='tri-towers' AND ruleset IN('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') AND score>sample.score) THEN RAISE EXCEPTION 'unified:completed score rank';END IF;
 END LOOP;
 facts:=private.score_record('tri-towers','tri-towers/5',actor,best);
 IF (facts->>'priorBest')::bigint IS DISTINCT FROM best OR facts->>'kind'<>'matched' OR (facts->>'overallPriorBest')::bigint IS DISTINCT FROM (SELECT max(score) FROM private.all_score_results WHERE game='tri-towers' AND ruleset IN('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5')) THEN RAISE EXCEPTION 'unified:future personal/overall records';END IF;
 IF before_data IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY run_id)::text) FROM private.arcade_results r WHERE game='tri-towers') OR before_rules IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY id)::text) FROM private.arcade_rulesets r) THEN RAISE EXCEPTION 'unified:history/rules changed';END IF;
END $$;
SELECT 'combined leaderboard, exact ranks, personal/overall bests, legacy lookup and unchanged history/rules passed' proof;
