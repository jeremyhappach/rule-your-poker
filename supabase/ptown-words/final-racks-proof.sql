-- Run after final-racks.sql inside BEGIN/ROLLBACK. Read-only checks of installed
-- historical states: no user game, receipt, balance or acknowledgement is changed.
DO $$
DECLARE m record;who uuid;v jsonb;denied boolean;active_count int:=0;ended_count int:=0;
BEGIN
 IF has_function_privilege('anon','public.ptown_words_final_racks(text,uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.ptown_words_final_racks(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'unexpected grant';END IF;
 FOR m IN
  SELECT 'live' mode,dealer_game_id id,state,settlement IS NOT NULL AND state->>'phase'='complete' terminal FROM private.ptown_words_matches
  UNION ALL SELECT 'async',id,state,terminal FROM private.delayed_children WHERE game_type='ptown-words'
 LOOP
  SELECT (p->>'userId')::uuid INTO who FROM jsonb_array_elements(m.state->'players') p WHERE NOT coalesce((p->>'isBot')::boolean,false) LIMIT 1;
  IF who IS NULL THEN CONTINUE;END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied:=false;
  BEGIN PERFORM public.ptown_words_final_racks(m.mode,m.id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'nonmember rack disclosure';END IF;
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  IF m.terminal THEN
   v:=public.ptown_words_final_racks(m.mode,m.id);
   IF v->'racks' IS DISTINCT FROM m.state->'racks' OR v->'scores' IS DISTINCT FROM m.state->'scores'
    OR v->'before' IS DISTINCT FROM coalesce(m.state->'preAdjustmentScores',m.state->'scores')
    OR v ? 'bag' THEN RAISE EXCEPTION 'incorrect final disclosure';END IF;
   ended_count:=ended_count+1;
  ELSE
   denied:=false;
   BEGIN PERFORM public.ptown_words_final_racks(m.mode,m.id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
   IF NOT denied THEN RAISE EXCEPTION 'active rack disclosure';END IF;
   active_count:=active_count+1;
  END IF;
 END LOOP;
 IF active_count=0 OR ended_count=0 THEN RAISE EXCEPTION 'missing active/completed coverage';END IF;
 RAISE NOTICE 'PASS: % active games denied, % completed games exact; all nonmembers denied',active_count,ended_count;
END $$;
