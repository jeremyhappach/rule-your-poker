DO $guard$ BEGIN IF md5(pg_get_functiondef('private.royal_flash_board_finish(jsonb,text,bigint)'::regprocedure)) NOT IN ('5be6a7c680cf9470869e69d5164d397e','b0c62c28462c9fa9b4415416af7412cf') THEN RAISE EXCEPTION 'Royal Flash presentation: unexpected deployed finish definition'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.royal_flash_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bonus bigint:=0;total bigint;result jsonb;full_i boolean;
BEGIN
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots')x WHERE x='null'::jsonb) INTO full_i;
 IF full_i AND reason IN('take_score','exhausted') THEN bonus:=greatest(0,(b->>'deadline')::bigint-at_ms)/1000*(b#>>'{rules,timePerSecond}')::bigint;END IF;
 total:=(b->>'scoreBefore')::bigint+(b->>'handPoints')::bigint+bonus;
 result:=jsonb_build_object('scoreBefore',(b->>'scoreBefore')::bigint,'score',total,'displayScore',total,'stageScore',total-(b->>'scoreBefore')::bigint,'handPoints',(b->>'handPoints')::bigint,'timeBonus',bonus,'reason',reason,'completedAt',at_ms,'presentationMs',15000,'lines',b->'lines','slots',b->'slots');
 RETURN b||jsonb_build_object('score',total,'result',result,'phase','stage_complete','deadline',at_ms+greatest(15000,(b#>>'{rules,holdMs}')::bigint),
 'event',jsonb_build_object('label',CASE reason WHEN 'timeout' THEN 'Time expired' WHEN 'ready_timeout' THEN 'Round not started' WHEN 'exhausted' THEN 'Deck complete' ELSE 'Score taken' END,'points',bonus));
END $$;

