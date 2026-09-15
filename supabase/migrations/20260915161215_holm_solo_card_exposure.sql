-- Holm solo showdown uses the same explicit public exposure contract as
-- multi-player showdown. No historical rows or policies are changed.
SET LOCAL lock_timeout = '2s';
DO $migration$
DECLARE definition text; old_fragment text := $old$  UPDATE public.rounds
  SET community_cards_revealed = greatest(coalesce(community_cards_revealed, 0), 4),$old$;
  new_fragment text := $new$  -- Publish only the solo stayer's tabled hand at the committed reveal boundary.
  -- The history exposure trigger records the same public grant atomically.
  UPDATE public.player_cards
  SET is_public = true
  WHERE round_id = v_round.id
    AND player_id = v_stayer.id
    AND is_public IS DISTINCT FROM true;

  UPDATE public.rounds
  SET community_cards_revealed = greatest(coalesce(community_cards_revealed, 0), 4),$new$;
BEGIN
  definition := pg_get_functiondef('public.holm_submit_decision_core(uuid,uuid,text)'::regprocedure);
  IF strpos(definition, new_fragment) > 0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 THEN
    RAISE EXCEPTION 'holm_solo_exposure:unexpected_resolver_shape';
  END IF;
  EXECUTE replace(definition,old_fragment,new_fragment);
END;
$migration$;
