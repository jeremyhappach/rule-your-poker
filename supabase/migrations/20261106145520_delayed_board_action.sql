-- Service-only fast path. The application projects the returned private record
-- with the existing viewer disclosure rules. Boundary work stays in the adapter.
CREATE OR REPLACE FUNCTION public.delayed_board_action(
 p_child uuid, p_actor uuid, p_game text, p_request uuid, p_revision bigint, p_segment bigint, p_intent jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 r jsonb; s jsonb; board jsonb; reduced jsonb; committed jsonb; visible jsonb;
 saved jsonb; own_boards jsonb:='[]'; items integer[]; action text:=p_intent->>'type';
 fingerprint jsonb:=jsonb_build_object('child',p_child,'revision',p_revision,'segment',p_segment,'intent',p_intent);
 at_ms bigint;
BEGIN
 IF p_actor IS NULL OR p_request IS NULL OR p_revision IS NULL OR p_segment IS NULL
    OR p_game IS NULL OR p_game NOT IN('take-two','quintzee','boxdrop') THEN RAISE EXCEPTION 'delayed:invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 r:=public.delayed_load(p_child,p_actor,p_request);
 IF r->>'game_type' IS DISTINCT FROM p_game THEN RAISE EXCEPTION 'delayed:wrong_game'; END IF;
 s:=r->'state'; board:=s->'board'; at_ms:=(r->>'server_at')::bigint;
 IF nullif(r->'receipt','null') IS NOT NULL OR (r->>'held')::boolean OR (r->>'terminal')::boolean
    OR r->>'actor' IS DISTINCT FROM p_actor::text OR (r->>'revision')::bigint<>p_revision OR (r->>'segment')::bigint<>p_segment
    OR nullif(board,'null') IS NULL OR least((board->>'deadline')::bigint,floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000)::bigint)<=at_ms
 THEN RETURN jsonb_build_object('fallback',true); END IF;
 IF s->>'child' IS DISTINCT FROM p_child::text OR s->>'game' IS DISTINCT FROM p_game
    OR s->'players'->>((s->>'turn')::integer) IS DISTINCT FROM p_actor::text OR (s->>'completed')::boolean THEN RAISE EXCEPTION 'delayed:identity'; END IF;
 IF action IS NULL OR NOT (CASE p_game WHEN 'take-two' THEN action IN('pair','draw','take_score')
  WHEN 'quintzee' THEN action IN('roll','score','score_zero') ELSE action IN('place','recycle','take_score') END)
 THEN RAISE EXCEPTION 'delayed:invalid_action'; END IF;
 IF p_intent ? 'items' THEN
  IF jsonb_typeof(p_intent->'items')<>'array' OR jsonb_array_length(p_intent->'items')>5 THEN RAISE EXCEPTION 'delayed:invalid_items';END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(p_intent->'items') i WHERE jsonb_typeof(i)<>'number' OR i::text !~ '^-?[0-9]+$'
    OR i::text::numeric NOT BETWEEN (CASE WHEN action='pair' THEN -1 ELSE 0 END) AND (CASE WHEN action='pair' THEN 32 ELSE 2147483647 END)) THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
  items:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(p_intent->'items') WITH ORDINALITY ORDER BY ordinality);
 ELSIF action IN('pair','roll','score','score_zero','place','recycle') THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
 IF action='pair' AND (cardinality(items)<>2 OR items[1]=items[2]) THEN RAISE EXCEPTION 'delayed:invalid_items'; END IF;
 IF p_game='take-two' THEN
  reduced:=public.delayed_take_two_core(p_child,'reduce',(s->>'round')::int,(s->'totals'->>p_actor::text)::bigint,board,action,items,at_ms);
 ELSE
  reduced:=public.delayed_board_core(p_game,'reduce',r->'config',(s->'totals'->>p_actor::text)::bigint,board,action,items,at_ms);
 END IF;
 -- Reuse this exact roll/deal at a stage boundary. The existing adapter owns
 -- advancement, bonuses, authoritative settlement and revision conflict recovery.
 IF reduced->>'phase'='stage_complete' THEN RETURN jsonb_build_object('boundary',r,'reduced',reduced); END IF;
 committed:=public.delayed_commit(p_child,p_actor,p_revision,jsonb_set(s,'{board}',reduced),'action',at_ms,false,p_request,fingerprint);
 IF committed->>'outcome'<>'committed' THEN RETURN jsonb_build_object('fallback',true); END IF;
 r:=(committed->'record')||jsonb_build_object('reviewed',r->'reviewed');
 IF p_game='take-two' THEN visible:=public.delayed_take_two_core(p_child,'visible',p_board=>reduced);
 ELSE visible:=public.delayed_board_core(p_game,'visible',p_board=>reduced); END IF;
 FOR saved IN SELECT value->'board' FROM jsonb_array_elements(s->'attempts') WHERE value->>'actor'=p_actor::text LOOP
  own_boards:=own_boards||jsonb_build_array(CASE WHEN p_game='take-two' THEN public.delayed_take_two_core(p_child,'visible',p_board=>saved)
   ELSE public.delayed_board_core(p_game,'visible',p_board=>saved) END);
 END LOOP;
 RETURN jsonb_build_object('record',r,'visible',visible,'ownBoards',own_boards);
END $$;
REVOKE ALL ON FUNCTION public.delayed_board_action(uuid,uuid,text,uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_board_action(uuid,uuid,text,uuid,bigint,bigint,jsonb) TO service_role;
