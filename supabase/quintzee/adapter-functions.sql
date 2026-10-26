-- Canonical adapter shape only. All game decisions use the shared quintzee/1 core.
CREATE OR REPLACE FUNCTION private.quintzee_required_rounds(score bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN score>=80000 THEN 3 ELSE 2 END $$;

CREATE OR REPLACE FUNCTION private.quintzee_board_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.quintzee_v1_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0))
$$;

CREATE OR REPLACE FUNCTION private.quintzee_match_projection(s jsonb,q jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT s||jsonb_build_object('core',q,'phase',CASE WHEN (q->>'finished')::boolean THEN 'complete' ELSE q#>>'{board,phase}' END,
  'deadline',q#>'{board,deadline}','startedAt',q#>'{board,startedAt}','turnIndex',q->'turnIndex','stage',q->'round',
  'scores',q->'scores','score',q#>'{board,score}','qualified',q->'qualified',
  'stages',coalesce((SELECT jsonb_agg(r||jsonb_build_object('stage',r->'round','id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',r->>'playerId',r->>'round'))) FROM jsonb_array_elements(q->'results') r),'[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION private.quintzee_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ids uuid[]; q jsonb;
BEGIN
 SELECT array_agg((p->>'id')::uuid ORDER BY n) INTO ids FROM jsonb_array_elements(s->'players') WITH ORDINALITY t(p,n);
 q:=private.quintzee_v1_start(ids,s->'rules',at_ms);
 RETURN private.quintzee_match_projection(s,q);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_match_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE q jsonb;
BEGIN
 q:=private.quintzee_v1_reduce(s->'core',action,items,at_ms);
 RETURN private.quintzee_match_projection(s,q);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT s $$;

CREATE OR REPLACE FUNCTION private.quintzee_high_score(actor uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(score),0) FROM (
 SELECT score FROM private.arcade_results WHERE user_id=actor AND game='quintzee' AND ruleset='quintzee/1'
 UNION ALL SELECT score FROM private.multiplayer_score_results WHERE user_id=actor AND game='quintzee' AND ruleset='quintzee/1'
 ) scores
$$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname LIKE 'quintzee_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
