-- Holm final awards settle immediately, but the winning player's locked stay
-- remains visible until the connected clients complete terminal presentation.
-- This migration makes only that invocation change; the settlement, replay,
-- authorization, and lifecycle implementation remain the accepted version.
DO $$
DECLARE
  v_definition text;
  v_before text := E'v_stayer.id, v_username, false, v_round_pot, true, v_round_pot, false, true\n    ) INTO v_settlement;';
  v_after text := E'v_stayer.id, v_username, false, v_round_pot, true, v_round_pot, false, false\n    ) INTO v_settlement;';
BEGIN
  SELECT pg_get_functiondef('public.holm_submit_decision(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  IF position(v_after IN v_definition) > 0 AND position(v_before IN v_definition) = 0 THEN
    RETURN;
  END IF;

  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'holm_submit_decision terminal presentation call did not match the accepted definition';
  END IF;

  v_definition := replace(v_definition, v_before, v_after);
  EXECUTE v_definition;
END;
$$;
