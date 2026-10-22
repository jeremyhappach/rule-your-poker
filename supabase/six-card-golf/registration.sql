-- Add Golf to the inspected Battle 31 / Race Poker v2 / 11 Up baseline.
-- Preserve every other branch, control, permission and financial owner.
DO $golf_registration$
DECLARE f record; original text; updated text; needle text; addition text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','7b6ca8feaa35c1fcce8b00491783e9d4'),
  ('private.megatouch_frozen_stake()','66207ae4a79447ec634f8b3afaff9512')
 ) expected(signature,hash) LOOP
  original:=replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13)||chr(10),chr(10));
  IF md5(original) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'golf:registration_owner_drift:%',f.signature;END IF;
  IF f.signature='private.megatouch_frozen_stake()' THEN
   needle:=$before$,'battle-31')$before$;
   addition:=$after$,'battle-31','six-card-golf')$after$;
  ELSE
   needle:=$before$    WHEN v_game.game_type='farkle' THEN$before$;
   addition:=$after$    WHEN v_game.game_type='six-card-golf' THEN
      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN$after$;
  END IF;
  IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'golf:registration_anchor_count:%',f.signature;END IF;
  updated:=replace(original,needle,addition);
  EXECUTE updated;
 END LOOP;
END $golf_registration$;
