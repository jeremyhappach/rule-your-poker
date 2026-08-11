-- Rabbit Hunt is part of the authoritative all-fold settlement, not a
-- follow-up client presentation write. Keep the reveal in the same database
-- transaction as the pussy-tax claim so disconnects and server-resolved
-- decisions cannot strand cards three and four face-down.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'    pot                   = COALESCE(p_round_pot, pot),\n    chucky_active         = CASE WHEN p_clear_chucky_active THEN false ELSE chucky_active END,';
  v_after text := E'    pot                   = COALESCE(p_round_pot, pot),\n    community_cards_revealed = CASE\n      WHEN p_event_kind = ''pussy_tax_carryforward''\n       AND COALESCE(v_game.rabbit_hunt, false)\n+        THEN GREATEST(COALESCE(community_cards_revealed, 0), 4)\n+      ELSE community_cards_revealed\n+    END,\n    chucky_active         = CASE WHEN p_clear_chucky_active THEN false ELSE chucky_active END,';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  IF position(v_after IN v_definition) > 0 AND position(v_before IN v_definition) = 0 THEN
    RETURN;
  END IF;

  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'holm_settle_hand round update did not match the accepted definition';
  END IF;

  v_definition := replace(v_definition, v_before, v_after);
  EXECUTE v_definition;
END;
$migration$;
