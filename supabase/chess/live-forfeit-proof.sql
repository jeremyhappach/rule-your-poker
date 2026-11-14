SAVEPOINT live_forfeit;
CREATE FUNCTION pg_temp.chess_as(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;EXECUTE command INTO answer;RESET ROLE;RETURN answer;
END $$;
DO $proof$
DECLARE users uuid[]:=ARRAY['d7dc1928-3727-4351-b0ff-0e80c81c2953'::uuid,'e13e2dd9-6b38-4073-a313-2286877af40c'::uuid];
 ids uuid[];g uuid;d uuid;v jsonb;s jsonb;offer timestamptz;mode_i int;actor_index int;actor_id uuid;
 expected jsonb;rev bigint;req uuid;fp jsonb;txs bigint;
BEGIN
 FOR mode_i IN 0..1 LOOP FOR actor_index IN 1..2 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
   VALUES(g,'game_selection',mode_i=1,2,offer,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,false FROM generate_series(1,2)j;
  v:=pg_temp.chess_as(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.chess_as(users[2],format('SELECT to_jsonb(public.submit_ante_decision(%L,%L,%L,''ante_up''))',g,d,ids[2]));
  SELECT state,revision INTO s,rev FROM private.chess_matches WHERE dealer_game_id=d;
  actor_id:=ids[actor_index];req:=gen_random_uuid();fp:=jsonb_build_object('revision',rev,'intent',jsonb_build_object('type','resign'));
  s:=s||jsonb_build_object('phase','complete','reason','resignation','winnerIds',jsonb_build_array(ids[3-actor_index]),'scores',jsonb_build_object(actor_id::text,0,ids[3-actor_index]::text,1));
  BEGIN PERFORM public.chess_commit('live',d,gen_random_uuid(),rev,s,req,fp);RAISE EXCEPTION 'missing_member_guard';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  BEGIN PERFORM pg_temp.chess_as(users[actor_index],format('SELECT public.chess_commit(''live'',%L,%L,%s,%L::jsonb,%L,%L::jsonb)',d,users[actor_index],rev,s,req,fp));RAISE EXCEPTION 'missing_service_guard';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  UPDATE public.games SET pending_session_end=true WHERE id=g;
  v:=public.chess_commit('live',d,users[actor_index],rev,s,req,fp);
  PERFORM pg_temp.assert_chess(v->>'outcome'='committed','live either participant forfeit commits');
  PERFORM pg_temp.assert_chess(public.chess_commit('live',d,users[actor_index],rev,s,req,fp)->>'outcome'='duplicate','live duplicate forfeit');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  expected:=jsonb_build_object(actor_id::text,-5,ids[3-actor_index]::text,5);
  PERFORM pg_temp.assert_chess((SELECT sum(chips)=200 AND bool_and(chips=100+(expected->>id::text)::int) FROM public.players WHERE game_id=g),'live canonical chips balanced');
  PERFORM pg_temp.assert_chess((SELECT count(*)=1 AND bool_and(player_chip_changes=expected) FROM public.game_results WHERE dealer_game_id=d),'live immutable result once');
  PERFORM pg_temp.assert_chess((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'live balanced transfer');
  PERFORM pg_temp.assert_chess((SELECT count(*)=2 AND bool_and(chips=100+(expected->>player_id::text)::int) FROM public.session_player_snapshots WHERE dealer_game_id=d),'live final snapshots');
  UPDATE private.chess_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  PERFORM private.chess_finish_postgame(d);PERFORM private.chess_finish_postgame(d);
  PERFORM pg_temp.assert_chess((SELECT status='session_ended' FROM public.games WHERE id=g),'live terminal continuation');
 END LOOP;END LOOP;
END $proof$;
ROLLBACK TO live_forfeit;
