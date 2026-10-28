-- Bots receive the same already-visible dice/category potentials as human players.
CREATE OR REPLACE FUNCTION private.quintzee_bot_choice(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b jsonb:=s#>'{core,board}'; category text;
BEGIN
 IF b->>'phase'<>'playing' OR at_ms>=(b->>'deadline')::bigint THEN RETURN NULL;END IF;
 SELECT key INTO category FROM jsonb_each_text(b->'potentials') ORDER BY value::integer DESC,key LIMIT 1;
 IF category IS NOT NULL THEN RETURN jsonb_build_object('action','score','items',jsonb_build_array(array_position(private.quintzee_v1_categories(),category)-1));END IF;
 IF (b->>'rollsRemaining')::integer>0 THEN RETURN jsonb_build_object('action','roll','items','[]'::jsonb);END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.quintzee_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
