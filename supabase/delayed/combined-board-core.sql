-- Trusted adapter calls only: existing shared reducers retain rules/randomness.
CREATE FUNCTION public.delayed_board_core(p_game text,p_operation text,p_config jsonb DEFAULT NULL,
 p_score bigint DEFAULT 0,p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,
 p_items integer[] DEFAULT NULL,p_at bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;
BEGIN
 IF p_game='quintzee' THEN
  CASE p_operation
  WHEN 'deal' THEN
   b:=private.quintzee_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
   -- Begin round is the player's explicit Start; use the unchanged Start reducer.
   RETURN private.quintzee_board_reduce(b,'start',ARRAY[]::integer[],p_at);
  WHEN 'reduce' THEN RETURN private.quintzee_board_reduce(p_board,p_action,p_items,p_at);
  WHEN 'visible' THEN RETURN private.quintzee_present_board(p_board);
  WHEN 'rounds' THEN RETURN to_jsonb(private.quintzee_required_rounds(p_score));
  ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
 ELSIF p_game='boxdrop' THEN
  CASE p_operation
  WHEN 'deal' THEN RETURN private.boxdrop_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
  WHEN 'reduce' THEN RETURN private.boxdrop_board_reduce(p_board,p_action,p_items,p_at);
  WHEN 'visible' THEN RETURN private.boxdrop_visible(p_board);
  WHEN 'rounds' THEN RETURN to_jsonb(private.boxdrop_required_rounds(p_score));
  ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';END CASE;
 ELSE RAISE EXCEPTION 'delayed:invalid_game';END IF;
END $$;
REVOKE ALL ON FUNCTION public.delayed_board_core(text,text,jsonb,bigint,jsonb,text,integer[],bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_board_core(text,text,jsonb,bigint,jsonb,text,integer[],bigint) TO service_role;
