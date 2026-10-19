-- Only the public projection enters this policy; no stock inspection.
CREATE OR REPLACE FUNCTION private.take_two_bot_choice(visible jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_array_length(visible->'legalPairs')>0 THEN jsonb_build_object('action','pair','items',visible->'legalPairs'->0)
 WHEN (visible->>'stockRemaining')::integer>0 THEN jsonb_build_object('action','draw')
 ELSE jsonb_build_object('action','take_score') END
$$;
REVOKE ALL ON FUNCTION private.take_two_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
