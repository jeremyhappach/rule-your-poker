-- Add a public-safe view of already-banked evidence; no rules or writes change.
CREATE OR REPLACE FUNCTION private.drop357_round_scores(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'round',(e->>'round')::integer,'score',(e->>'score')::bigint,
  'handPoints',(e#>>'{result,base}')::bigint-(e#>>'{result,allBonus}')::bigint-natural_bonus,
  'naturalBonus',natural_bonus,'allBonus',(e#>>'{result,allBonus}')::bigint,
  'timeBonus',(e#>>'{result,timeBonus}')::bigint) ORDER BY ordinal),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(s->'rounds','[]'::jsonb)) WITH ORDINALITY AS history(e,ordinal)
 CROSS JOIN LATERAL (SELECT coalesce(sum((lane->>'bonus')::bigint),0)::bigint natural_bonus
  FROM jsonb_array_elements(e->'laneResults') AS lanes(lane)) bonuses;
$$;
REVOKE ALL ON FUNCTION private.drop357_round_scores(jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE definition text:=pg_get_functiondef('public.arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'::regprocedure);
 anchor text:='''result'',s->''result'',''completion'',';
 replacement text:='''result'',s->''result'',''roundScores'',private.drop357_round_scores(s),''completion'',';
BEGIN
 IF position(replacement IN definition)>0 THEN RETURN;END IF;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION '357:projection_owner_changed';END IF;
 EXECUTE replace(definition,anchor,replacement);
END $$;
