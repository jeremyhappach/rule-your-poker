-- Read-only presentation totals from the exact frozen scorer; no new awards or state writes.
CREATE OR REPLACE FUNCTION private.quintzee_present_board(b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE r jsonb; BEGIN
 IF b->>'phase'='stage_complete' THEN r:=b->'result';
 ELSIF b#>>'{rules,version}'='quintzee/2' THEN r:=private.quintzee_v2_finish(b||'{"phase":"playing"}'::jsonb,'timeout',(b->>'deadline')::bigint)->'result';
 ELSE r:=private.quintzee_v1_finish(b||'{"phase":"playing"}'::jsonb,'timeout',(b->>'deadline')::bigint)->'result';END IF;
 RETURN b||jsonb_build_object('baseScore',r->'rawSubtotal','upperBonusAwarded',r->'upperBonus');
END $$;
REVOKE ALL ON FUNCTION private.quintzee_present_board(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.quintzee_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_set(s,'{core,board}',private.quintzee_present_board(s#>'{core,board}'))
$$;
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.arcade_quintzee_projection(private.arcade_runs,bigint)'::regprocedure);
 IF position('private.quintzee_present_board' IN s)=0 THEN
 IF position('v:=b;' IN s)=0 THEN RAISE EXCEPTION 'quintzee:projection_drift';END IF;
 EXECUTE replace(s,'v:=b;','v:=private.quintzee_present_board(b);');END IF;END $patch$;
