-- A folded player's cards remain out of the deck. The single-stayer resolver
-- must use the whole round's dealt cohort, just like the showdown resolver.
-- This changes future draws only; existing hands and settlement receipts stay put.
DO $migration$
DECLARE definition text; old_call text; new_call text;
BEGIN
  SELECT pg_get_functiondef('public.holm_submit_decision_core(uuid,uuid,text)'::regprocedure) INTO definition;
  old_call := $old$      v_player_cards || v_community_cards,$old$;
  new_call := $new$      (SELECT coalesce(jsonb_agg(dealt.card), '[]'::jsonb)
       FROM public.player_cards pc
       CROSS JOIN LATERAL jsonb_array_elements(pc.cards) AS dealt(card)
       WHERE pc.round_id = v_round.id) || v_community_cards,$new$;
  IF position(new_call IN definition) = 0 THEN
    IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call) <> 1 THEN
      RAISE EXCEPTION 'holm_chucky_cohort:unexpected_function_shape';
    END IF;
    EXECUTE replace(definition,old_call,new_call);
  END IF;
END;
$migration$;
