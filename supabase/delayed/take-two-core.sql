-- Only the authenticated server adapter can load persisted challenges or reduce boards.
CREATE OR REPLACE FUNCTION public.delayed_take_two_core(
 p_child uuid,p_operation text,p_round integer DEFAULT NULL,p_score bigint DEFAULT 0,
 p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_at bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;deck_i jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 IF c.game_type<>'take-two' OR c.config IS DISTINCT FROM private.take_two_rules('take-two/2') THEN RAISE EXCEPTION 'take_two:child';END IF;
 CASE p_operation
 WHEN 'deal' THEN
  SELECT deck INTO STRICT deck_i FROM private.delayed_take_two_deals WHERE child_id=c.id AND round=p_round;
  RETURN private.take_two_board_from_deck(jsonb_build_object('rules',c.config,'stage',p_round,'score',p_score,'highScore',0),p_at,deck_i);
 WHEN 'reduce' THEN
  IF p_board->'rules' IS DISTINCT FROM c.config THEN RAISE EXCEPTION 'take_two:rules';END IF;
  RETURN private.take_two_board_reduce(p_board,p_action,p_items,p_at);
 WHEN 'visible' THEN RETURN private.take_two_visible(p_board)-'activePlayerId';
 ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
END $$;
REVOKE ALL ON FUNCTION public.delayed_take_two_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_take_two_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint) TO service_role;
