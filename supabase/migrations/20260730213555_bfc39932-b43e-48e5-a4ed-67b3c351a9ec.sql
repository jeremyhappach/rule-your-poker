DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'holm_settle_hand';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'holm_settle_hand not found';
  END IF;

  v_new := replace(
    v_def,
    E'IF v_round.status NOT IN (\'completed\',\'in_progress\',\'showdown\',\'revealing\',\'betting\',\'dealing\') THEN',
    E'IF v_round.status NOT IN (\'completed\',\'in_progress\',\'showdown\',\'revealing\',\'betting\',\'dealing\',\'processing\') THEN'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'holm_settle_hand eligibility guard not found - aborting';
  END IF;

  EXECUTE v_new;
END
$mig$;