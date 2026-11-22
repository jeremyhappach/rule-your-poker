-- Run after core-proof.sql and a pg_temp.words_baseline copy of the preimage,
-- always inside BEGIN ... ROLLBACK. No application rows are created or changed.
DO $proof$
#variable_conflict use_column
DECLARE s jsonb; before_s jsonb; r jsonb; t jsonb; prior jsonb; items jsonb; rack jsonb; ver text; i int; b jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
 SELECT jsonb_agg(pg_temp.words_tile(i,substr('CAT',i+1,1))) INTO rack FROM generate_series(0,2)i;
 items:='[{"tileId":0,"square":111,"letter":"C"},{"tileId":1,"square":112,"letter":"A"},{"tileId":2,"square":113,"letter":"T"}]';
 FOR i IN 1..5 LOOP
  ver:='ptown-words/'||i;
  IF private.ptown_words_rules_for(ver) IS NULL THEN CONTINUE;END IF;
  s:=pg_temp.words_state(rack)||jsonb_build_object('rules',private.ptown_words_rules_for(ver));
  before_s:=s;
  r:=public.ptown_words_preview(ver,s->'board',rack,items);
  t:=private.ptown_words_reduce(s,'place',items,2000);prior:=pg_temp.words_baseline(s,'place',items,2000);
  PERFORM pg_temp.words_assert(r->>'points'='10' AND r->'invalidWords'='[]'::jsonb,'valid preview '||ver);
  PERFORM pg_temp.words_assert(t=prior AND s=before_s,'full reducer output and input parity '||ver);
  PERFORM pg_temp.words_assert(public.ptown_words_preview(ver,s->'board',rack,items)=r,'preview replay '||ver);
  PERFORM pg_temp.words_assert(private.ptown_words_reduce(s,'pass',NULL,2000)=pg_temp.words_baseline(s,'pass',NULL,2000),'pass parity '||ver);
  IF i<>3 THEN
   PERFORM pg_temp.words_assert(private.ptown_words_reduce(s,'tick',NULL,(s->>'deadline')::bigint)=pg_temp.words_baseline(s,'tick',NULL,(s->>'deadline')::bigint),'timeout parity '||ver);
  END IF;
  IF i IN(2,4) THEN
   PERFORM pg_temp.words_assert(private.ptown_words_reduce(s,'time_bank','[{"slot":0}]',2000)=pg_temp.words_baseline(s,'time_bank','[{"slot":0}]',2000),'bank parity '||ver);
  END IF;
  t:=private.ptown_words_reduce(s,'exchange','[{"tileId":0}]',2000);prior:=pg_temp.words_baseline(s,'exchange','[{"tileId":0}]',2000);
  PERFORM pg_temp.words_assert((t-'bag')=(prior-'bag') AND (t->'bag') @> (prior->'bag') AND (prior->'bag') @> (t->'bag'),'exchange parity except existing shuffle '||ver);
  s:=s||'{"bag":[]}'::jsonb;
  t:=private.ptown_words_reduce(s,'place',items,2000);
  PERFORM pg_temp.words_assert(t=pg_temp.words_baseline(s,'place',items,2000),'terminal deductions parity '||ver);
  r:=public.ptown_words_preview(ver,s->'board',rack,items);
  PERFORM pg_temp.words_assert(r->>'points'='10','preview is placement score, not terminal deductions '||ver);
 END LOOP;
 -- Terminal winner/tie and successive-turn outputs retain the preimage.
 s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'A')));
 s:=jsonb_set(s,'{racks,p2}',jsonb_build_array(pg_temp.words_tile(99,'A')));
 s:=s||'{"passes":3}'::jsonb;
 t:=private.ptown_words_reduce(s,'pass',NULL,2000);
 PERFORM pg_temp.words_assert(t=pg_temp.words_baseline(s,'pass',NULL,2000) AND jsonb_array_length(t->'winnerIds')=2,'terminal shared tie unchanged');
 s:=pg_temp.words_state(rack);t:=private.ptown_words_reduce(s,'pass',NULL,2000);
 PERFORM pg_temp.words_assert(private.ptown_words_reduce(t,'pass',NULL,2001)=pg_temp.words_baseline(t,'pass',NULL,2001),'successor turn unchanged');
 -- Blank, bingo and every kind of premium use exactly the same evaluator.
 FOR i IN 0..224 LOOP
  s:=pg_temp.words_state(jsonb_build_array(pg_temp.words_tile(0,'?')));
  IF i%15=0 THEN CONTINUE;END IF;
  s:=jsonb_set(s,ARRAY['board',(i-1)::text],pg_temp.words_tile(50,'A','A'));
  items:=jsonb_build_array(jsonb_build_object('tileId',0,'square',i,'letter','T'));
  r:=public.ptown_words_preview(s#>>'{rules,version}',s->'board',s#>'{racks,p1}',items);
  t:=private.ptown_words_reduce(s,'place',items,2000);
  PERFORM pg_temp.words_assert(t=pg_temp.words_baseline(s,'place',items,2000) AND r->>'points'=t#>>'{event,points}','premium blank parity square '||i);
 END LOOP;
 SELECT jsonb_agg(pg_temp.words_tile(i,substr('RETAINS',i+1,1))),jsonb_agg(jsonb_build_object('tileId',i,'square',109+i,'letter',substr('RETAINS',i+1,1))) INTO rack,items FROM generate_series(0,6)i;
 s:=pg_temp.words_state(rack);
 PERFORM pg_temp.words_assert(public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items)->>'points'='64','bingo preview');
 -- AX is valid; both crossing words QX/ZA are invalid, all must be reported.
 rack:=jsonb_build_array(pg_temp.words_tile(0,'A'),pg_temp.words_tile(1,'X'));
 s:=pg_temp.words_state(rack);
 s:=jsonb_set(jsonb_set(s,'{board,97}',pg_temp.words_tile(50,'Z','Z')),'{board,98}',pg_temp.words_tile(51,'Q','Q'));
 items:='[{"tileId":0,"square":112,"letter":"A"},{"tileId":1,"square":113,"letter":"X"}]';
 r:=public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items);
 PERFORM pg_temp.words_assert(r->>'points'='58' AND r->'invalidWords'='["ZA","QX"]'::jsonb,'all invalid crosswords with potential score');
 BEGIN
  PERFORM private.ptown_words_reduce(s,'place',items,2000);
  RAISE EXCEPTION 'invalid words accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'ptown_words:invalid_word:ZA,QX' THEN RAISE;END IF;
 END;
 -- Structural errors take precedence over dictionary feedback.
 s:=pg_temp.words_state(rack);
 items:='[{"tileId":0,"square":112,"letter":"A"},{"tileId":1,"square":114,"letter":"X"}]';
 PERFORM pg_temp.words_assert(public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items)->>'error'='ptown_words:gap','gap has no invented points');
 items:='[{"tileId":0,"square":112,"letter":"A"},{"tileId":0,"square":113,"letter":"A"}]';
 PERFORM pg_temp.words_assert(public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items)->>'error'='ptown_words:tile_not_owned','duplicate tile rejected');
 items:='[{"tileId":99,"square":112,"letter":"Q"}]';
 PERFORM pg_temp.words_assert(public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items)->>'error'='ptown_words:tile_not_owned','unowned tile rejected');
 s:=jsonb_set(s,'{board,0}',pg_temp.words_tile(50,'A','A'));
 items:='[{"tileId":0,"square":112,"letter":"A"},{"tileId":1,"square":113,"letter":"X"}]';
 PERFORM pg_temp.words_assert(public.ptown_words_preview(s#>>'{rules,version}',s->'board',rack,items)->>'error'='ptown_words:disconnected','disconnected rejected');
 PERFORM pg_temp.words_assert(NOT has_function_privilege('anon','public.ptown_words_preview(text,jsonb,jsonb,jsonb)','execute'),'anonymous ACL');
 PERFORM pg_temp.words_assert(NOT has_function_privilege('authenticated','private.ptown_words_evaluate(jsonb,jsonb)','execute'),'private evaluator ACL');
 PERFORM pg_temp.words_assert((SELECT provolatile='s' FROM pg_proc WHERE oid='public.ptown_words_preview(text,jsonb,jsonb,jsonb)'::regprocedure),'preview read-only stable');
END $proof$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.words_assert(public.ptown_words_preview('ptown-words/4',
 (SELECT jsonb_agg(NULL::text) FROM generate_series(1,225)),
 '[{"id":0,"face":"A","value":1},{"id":1,"face":"T","value":1}]',
 '[{"tileId":0,"square":112,"letter":"A"},{"tileId":1,"square":113,"letter":"T"}]')->>'points'='4','authenticated RPC');
RESET ROLE;
SELECT 'PASS: shared placement preview, invalid words, all premiums, four supported frozen versions, unchanged reducer and ACL' proof;
