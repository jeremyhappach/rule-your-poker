BEGIN;
DO $proof$
DECLARE u uuid; g uuid; p uuid; r uuid; d uuid; frame jsonb; previous bigint; next_revision bigint; denied boolean; kind text;
BEGIN
 SELECT pr.id INTO u FROM public.profiles pr JOIN auth.users a ON a.id=pr.id WHERE pr.is_active AND NOT public.has_role(pr.id,'admin') ORDER BY pr.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 frame:=public.create_session(gen_random_uuid(),'Rollback coherent frame',false,1);
 g:=(frame->>'game_id')::uuid; p:=(frame->>'player_id')::uuid;
 frame:=public.read_session_frame(g);
 IF frame#>>'{game,id}'<>g::text OR frame#>>'{players,0,id}'<>p::text OR frame#>'{game,rounds}'<>'[]'::jsonb
 OR frame#>'{players,0,profiles}' ? 'email' THEN RAISE EXCEPTION 'proof:frame_identity_privacy'; END IF;
 previous:=(frame#>>'{game,_authorityRevision}')::bigint;
 UPDATE public.players SET deck_color_mode='four_color' WHERE id=p;
 frame:=public.read_session_frame(g);
 IF (frame#>>'{game,_authorityRevision}')::bigint<=previous OR frame#>>'{players,0,deck_color_mode}'<>'four_color'
 THEN RAISE EXCEPTION 'proof:coherent_player_revision'; END IF;
 denied:=false; BEGIN UPDATE public.players SET authority_revision=0 WHERE id=p; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'proof:revision_not_browser_writable'; END IF;
 EXECUTE 'RESET ROLE';
 previous:=private.session_authority_revision(g);
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,u,'horses') RETURNING id INTO d;
 UPDATE public.games SET current_game_uuid=d,game_type='horses' WHERE id=g;
 INSERT INTO public.rounds(game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
 VALUES(g,d,1,1,'betting',0,'{"gamePhase":"playing","actionSequence":0}'::jsonb) RETURNING id INTO r;
 IF private.session_authority_revision(g)<=previous THEN RAISE EXCEPTION 'proof:round_insert_revision'; END IF;
 SELECT authority_revision INTO previous FROM public.rounds WHERE id=r;
 UPDATE public.rounds SET horses_state=horses_state||'{"turnDeadline":"2099-01-01"}'::jsonb WHERE id=r;
 SELECT authority_revision INTO next_revision FROM public.rounds WHERE id=r;
 IF next_revision<>previous+1 OR (SELECT horses_state->>'_authorityRevision' FROM public.rounds WHERE id=r)<>next_revision::text
 OR (SELECT horses_state->>'_authorityScope' FROM public.rounds WHERE id=r)<>r::text THEN RAISE EXCEPTION 'proof:round_state_stamp'; END IF;
 previous:=private.session_authority_revision(g);
 DELETE FROM public.rounds WHERE id=r;
 IF private.session_authority_revision(g)<=previous THEN RAISE EXCEPTION 'proof:round_delete_regression'; END IF;
 previous:=private.session_authority_revision(g);
 INSERT INTO public.rounds(id,game_id,dealer_game_id,round_number,hand_number,status,cards_dealt,horses_state)
 VALUES(r,g,d,1,1,'betting',0,'{"gamePhase":"playing"}'::jsonb);
 IF private.session_authority_revision(g)<=previous THEN RAISE EXCEPTION 'proof:round_reuse_regression'; END IF;
 previous:=private.session_authority_revision(g);
 DELETE FROM public.players WHERE id=p;
 IF private.session_authority_revision(g)<=previous THEN RAISE EXCEPTION 'proof:player_delete_regression'; END IF;
 DELETE FROM public.games WHERE id=g;
 IF EXISTS(SELECT 1 FROM private.session_revision_tombstones WHERE game_id=g) THEN RAISE EXCEPTION 'proof:cascade_tombstones'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.read_session_frame(g) IS NOT NULL THEN RAISE EXCEPTION 'proof:deleted_frame'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.read_session_frame(uuid)'::regprocedure,'public.cribbage_get_state(uuid)'::regprocedure,'public.gin_rummy_get_state(uuid)'::regprocedure,'public.three_five_seven_current_frame(uuid)'::regprocedure) AND provolatile<>'s')
 THEN RAISE EXCEPTION 'proof:stable_read_snapshot'; END IF;
 IF has_function_privilege('anon','public.read_session_frame(uuid)','EXECUTE') THEN RAISE EXCEPTION 'proof:anonymous_read'; END IF;
END $proof$;
ROLLBACK;
