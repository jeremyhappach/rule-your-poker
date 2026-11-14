-- Execute in one connection. Only temporary functions/JSON fixtures are written;
-- the installed reducer, live matches, receipts and balances are never changed.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $prepare$
DECLARE source text; candidate text;
BEGIN
 source:=pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure);
 EXECUTE replace(source,'private.ptown_words_reduce','pg_temp.words_timeout_baseline');
 candidate:=replace(source,'DECLARE board jsonb','DECLARE was_timeout boolean:=action=''tick''; board jsonb');
 candidate:=replace(candidate,'''points'',points)),''event''',
  '''points'',points)||CASE WHEN was_timeout THEN jsonb_build_object(''reason'',''timeout'') ELSE ''{}''::jsonb END),''event''');
 EXECUTE replace(candidate,'private.ptown_words_reduce','pg_temp.words_timeout_candidate');
END $prepare$;
DO $proof$
DECLARE s jsonb; old jsonb; candidate jsonb; version text; action text; passes int; at_ms bigint; last_index text;
BEGIN
 FOREACH version IN ARRAY ARRAY['ptown-words/1','ptown-words/2'] LOOP
  FOR passes IN 0..3 LOOP
   s:=jsonb_build_object('rules',private.ptown_words_rules_for(version),'phase','playing',
    'players',jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-000000000001'),jsonb_build_object('id','00000000-0000-0000-0000-000000000002')),
    'turnIndex',0,'turn',5,'passes',passes,'deadline',2000,
    'board',(SELECT jsonb_agg(NULL::text) FROM generate_series(1,225)),
    'racks',jsonb_build_object('00000000-0000-0000-0000-000000000001','[]'::jsonb,'00000000-0000-0000-0000-000000000002','[]'::jsonb),
    'bag','[]'::jsonb,'moves',jsonb_build_array(jsonb_build_object('turn',3,'action','pass','words','[]'::jsonb)),
    'scores',jsonb_build_object('00000000-0000-0000-0000-000000000001',10,'00000000-0000-0000-0000-000000000002',CASE WHEN passes%2=0 THEN 10 ELSE 5 END));
   FOREACH action IN ARRAY ARRAY['pass','tick'] LOOP
    at_ms:=CASE WHEN action='tick' THEN 2000 ELSE 1000 END;
    old:=pg_temp.words_timeout_baseline(s,action,NULL,at_ms);
    candidate:=pg_temp.words_timeout_candidate(s,action,NULL,at_ms);
    IF candidate->'moves'->0 IS DISTINCT FROM s->'moves'->0 THEN RAISE EXCEPTION 'Historical move changed'; END IF;
    IF action='tick' THEN
     IF candidate->'moves'->-1->>'reason' IS DISTINCT FROM 'timeout' OR candidate->'moves'->-1->>'action'<>'pass' THEN RAISE EXCEPTION 'Timeout provenance missing'; END IF;
     last_index:=(jsonb_array_length(candidate->'moves')-1)::text;
     candidate:=jsonb_set(candidate,ARRAY['moves',last_index],(candidate->'moves'->-1)-'reason');
     old:=jsonb_set(old,ARRAY['moves',last_index],(old->'moves'->-1)-'reason');
    ELSIF candidate->'moves'->-1 ? 'reason' THEN RAISE EXCEPTION 'Voluntary pass mislabeled'; END IF;
    IF candidate IS DISTINCT FROM old THEN RAISE EXCEPTION 'Rules, score, continuation, or terminal output changed'; END IF;
    IF pg_temp.words_timeout_candidate(s,action,NULL,at_ms) IS DISTINCT FROM pg_temp.words_timeout_candidate(s,action,NULL,at_ms) THEN RAISE EXCEPTION 'Replay differs'; END IF;
   END LOOP;
   IF pg_temp.words_timeout_candidate(s,'tick',NULL,1999) IS DISTINCT FROM s THEN RAISE EXCEPTION 'Early tick mutated state'; END IF;
   IF passes=3 THEN
    BEGIN PERFORM pg_temp.words_timeout_candidate(candidate,'tick',NULL,3000);RAISE EXCEPTION 'Terminal accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:phase' THEN RAISE; END IF; END;
   ELSE
    IF pg_temp.words_timeout_candidate(candidate,'tick',NULL,2000) IS DISTINCT FROM candidate THEN RAISE EXCEPTION 'Duplicate expiry advanced successor'; END IF;
   END IF;
  END LOOP;
 END LOOP;
END $proof$;
SELECT 'PASS: timeout provenance; voluntary pass; historical preservation; exact output parity; winner/tie; terminal/continuation; early, duplicate and replay ticks; no installed changes' AS result;
ROLLBACK;
