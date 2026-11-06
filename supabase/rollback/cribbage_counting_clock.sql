-- Preserve the installed rules, privileges and all existing hand snapshots.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.cribbage_finalize_counting(uuid)'::regprocedure);
BEGIN
  IF md5(definition) = 'eb808edbfd9fd083ee82a8984f90db34' THEN RETURN; END IF;
  IF md5(definition) <> '031bfe884fdf55cf581128e6ff085399' THEN
    RAISE EXCEPTION 'Unexpected Cribbage counting authority definition';
  END IF;
  definition := replace(definition,
    $before$jsonb_set(v_state,'{countingResolution}',v_resolution || jsonb_build_object('originalReleaseAt',v_resolution->'presentationReleaseAt'),true)$before$,
    $after$jsonb_set(v_state,'{countingResolution}',v_resolution,true)$after$);
  IF md5(definition) <> 'eb808edbfd9fd083ee82a8984f90db34' THEN RAISE EXCEPTION 'Counting migration mismatch'; END IF;
  EXECUTE definition;
END;
$migration$;
