-- Repair only the malformed trophy literal produced when the initial function
-- body crossed a legacy console encoding boundary. Fresh UTF-8 deployments are
-- already correct and leave this migration as a no-op.

DO $repair$
DECLARE
  v_definition text;
  v_bad_trophy text := chr(240) || chr(376) || chr(143) || chr(8224);
  v_old_clause text;
  v_new_clause text :=
    'ELSE chr(127942) || '' '' || v_winner_username || '' won the game!''';
BEGIN
  SELECT pg_get_functiondef(
    'public.three_five_seven_settle_game(uuid,uuid,uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_old_clause := 'ELSE ' || quote_literal(v_bad_trophy || ' ')
    || ' || v_winner_username || '' won the game!''';

  IF position(v_bad_trophy IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_clause, v_new_clause);
    IF position(v_bad_trophy IN v_definition) > 0
       OR position(v_new_clause IN v_definition) = 0 THEN
      RAISE EXCEPTION 'three_five_seven_terminal_trophy_encoding_repair_failed';
    END IF;
    EXECUTE v_definition;
  END IF;
END;
$repair$;
