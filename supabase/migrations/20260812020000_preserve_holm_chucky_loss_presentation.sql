-- A solo loss to Chucky is financially settled in the same transaction as
-- its result, but its completed round must remain a presentation source until
-- the next hand begins.  Replacing this exact call preserves all settlement
-- inputs, idempotency, and continuation ownership while retaining Chucky's
-- already-authoritative cards for the live client.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'      NULL, \'Chucky Win\', false, 0, true, v_round_pot + v_pot_match, true, false\n    ) INTO v_settlement;';
  v_after text := E'      NULL, \'Chucky Win\', false, 0, true, v_round_pot + v_pot_match, false, false\n    ) INTO v_settlement;';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_submit_decision(uuid,uuid,text)'::regprocedure
  ) INTO v_definition;

  IF position(v_after IN v_definition) > 0 AND position(v_before IN v_definition) = 0 THEN
    RETURN;
  END IF;

  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'holm_chucky_loss_presentation:unexpected_holm_submit_decision_definition';
  END IF;

  v_definition := replace(v_definition, v_before, v_after);
  EXECUTE v_definition;
END;
$migration$;
