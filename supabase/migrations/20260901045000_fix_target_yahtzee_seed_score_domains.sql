-- Every preseeded terminal score must satisfy the same domain checks as an
-- ordinarily played scorecard. Chance cannot be scratched and has minimum 5.

DO $migration$
DECLARE
  v_definition text;
  v_old text:='"chance":0';
  v_new text:='"chance":5';
BEGIN
  SELECT pg_get_functiondef('private.target_yahtzee_seed_scores(text,boolean)'::regprocedure)
    INTO v_definition;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'fix_target_yahtzee_seed_score_domains:shape_mismatch';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$migration$;
