-- Execute inside BEGIN/ROLLBACK, with the candidate installed in that transaction.
CREATE FUNCTION pg_temp.board_check(ok boolean,why text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'board action proof: %',why; END IF;END $$;
DO $$
DECLARE g text; a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();m uuid;c private.delayed_children;
 board jsonb;s jsonb;r jsonb;v jsonb;cmd jsonb;req uuid;initial_rev bigint;at_ms bigint;other uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b),(outsider);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id IN(a,b,outsider);
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b,outsider);
 PERFORM pg_temp.board_check(NOT has_function_privilege('anon','public.delayed_board_action(uuid,uuid,text,uuid,bigint,bigint,jsonb)','execute') AND NOT has_function_privilege('authenticated','public.delayed_board_action(uuid,uuid,text,uuid,bigint,bigint,jsonb)','execute'),'service-only operation');
 FOREACH g IN ARRAY ARRAY['take-two','quintzee','boxdrop'] LOOP
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,false,jsonb_build_array(jsonb_build_object('game',g,'stake',7)));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM public.delayed_respond(m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept');
 SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
 other:=CASE WHEN c.actor=a THEN b ELSE a END;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 board:=CASE WHEN g='take-two' THEN public.delayed_take_two_core(c.id,'deal',1,0,NULL,NULL,NULL,at_ms) ELSE public.delayed_board_core(g,'deal',c.config,0,NULL,NULL,NULL,at_ms) END;
 IF g<>'quintzee' THEN board:=board||jsonb_build_object('phase','playing','deadline',at_ms+100000); END IF;
 s:=jsonb_build_object('version','delayed/1','game',g,'child',c.id,'players',jsonb_build_array(c.actor,other),'round',1,'turn',0,'totals',jsonb_build_object(a,0,b,0),'attempts','[]'::jsonb,'board',board,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',at_ms);
 UPDATE private.delayed_children SET state=s,started_at=clock_timestamp(),gameplay_due_at=to_timestamp((board->>'deadline')::bigint/1000.0) WHERE id=c.id;
 cmd:=CASE g WHEN 'take-two' THEN '{"type":"draw"}'::jsonb WHEN 'quintzee' THEN '{"type":"roll","items":[]}'::jsonb ELSE jsonb_build_object('type','place','items',jsonb_build_array(0,board#>'{current,id}')) END;
 req:=gen_random_uuid();initial_rev:=c.revision;
 BEGIN PERFORM public.delayed_board_action(c.id,outsider,g,req,c.revision,c.segment,cmd);RAISE EXCEPTION 'outsider admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.board_check((public.delayed_board_action(c.id,other,g,req,c.revision,c.segment,cmd)->>'fallback')::boolean,'wrong turn routed to existing rejection');
 v:=public.delayed_board_action(c.id,c.actor,g,req,c.revision,c.segment,cmd);
 PERFORM pg_temp.board_check((v#>>'{record,revision}')::bigint=c.revision+1 AND v->'visible' IS NOT NULL,'one ordinary commit and projection');
 PERFORM pg_temp.board_check(NOT(v->'visible' ?| ARRAY['deck','bag','stock','order','rng','seed']),'projected board hides future randomness');
 PERFORM pg_temp.board_check((SELECT count(*)=1 FROM private.delayed_commands WHERE actor=c.actor AND request_id=req),'one canonical receipt');
 PERFORM pg_temp.board_check((public.delayed_board_action(c.id,c.actor,g,req,c.revision,c.segment,cmd)->>'fallback')::boolean,'duplicate routed to existing receipt authority');
 PERFORM pg_temp.board_check((public.delayed_board_action(c.id,c.actor,g,gen_random_uuid(),c.revision,c.segment,cmd)->>'fallback')::boolean,'stale revision rejected by existing authority');
 PERFORM pg_temp.board_check((SELECT revision=initial_rev+1 FROM private.delayed_children WHERE id=c.id),'no replay mutation');
 PERFORM pg_temp.board_check((SELECT (state#>>'{board,deadline}')::bigint=floor(extract(epoch FROM gameplay_due_at)*1000)::bigint FROM private.delayed_children WHERE id=c.id),'canonical deadline');
 -- Exercise the unchanged terminal owner after an ordinary move, including a late replay.
 UPDATE private.delayed_children SET available_at=c.available_at-interval '37 hours',last_call_at=c.last_call_at-interval '37 hours',expires_at=c.expires_at-interval '37 hours' WHERE id=c.id RETURNING * INTO c;
 PERFORM pg_temp.board_check(private.delayed_expire(c.id,c.segment,c.expires_at),'availability recovery');
 PERFORM pg_temp.board_check((SELECT count(*)=1 FROM private.delayed_settlements WHERE match_id=m) AND (SELECT count(*)=2 AND sum(chips)=0 AND max(chips)=7 FROM public.players WHERE game_id=m),'one balanced settlement');
 PERFORM pg_temp.board_check((public.delayed_board_action(c.id,c.actor,g,req,initial_rev,c.segment,cmd)->>'fallback')::boolean,'late replay uses old receipt');
 END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'passed' AS three_board_authorities;
