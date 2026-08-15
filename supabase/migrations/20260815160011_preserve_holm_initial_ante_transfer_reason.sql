-- Restore the canonical ante journal classification after the H1 Buck event
-- function replacement while retaining every other installed behavior.

DO $migration$
DECLARE
  v_function_sql text;
  v_old text := $old$
  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);
$old$;
  v_new text := $new$
  -- The initial Holm hand is an ante, never a terminal replacement-pot
  -- transfer. Both player and pot journal rows must carry the same reason.
  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_holm_initial_hand(uuid,boolean)'::regprocedure
  ) INTO v_function_sql;

  IF v_function_sql LIKE '%ptown.chip_transfer_reason'', ''ante''%' THEN
    RETURN;
  END IF;
  IF position(v_old IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'preserve_holm_initial_ante_reason:update_not_found';
  END IF;

  EXECUTE replace(v_function_sql, v_old, v_new);
END;
$migration$;
