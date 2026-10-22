CREATE FUNCTION private.canasta_concurrency_fixture(money boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];players_i uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();d uuid;r uuid:=gen_random_uuid();seats_i jsonb;s jsonb;n jsonb;c jsonb;i integer;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Canasta concurrent '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money,1,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,ante_decision) SELECT players_i[j],g,users[j],j,100,false,'ante_up' FROM generate_series(1,2) j;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g,users[1],'canasta','{"ante_amount":10}') RETURNING id INTO d;
 UPDATE public.games SET current_game_uuid=d,game_type='canasta',status='in_progress',ante_amount=10 WHERE id=g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g,d,1,1,0,'betting',0);
 SELECT jsonb_agg(jsonb_build_object('id',players_i[j],'userId',users[j],'kind','human','seat',j)) INTO seats_i FROM generate_series(1,2) j;
 s:=jsonb_build_object('version','canasta-classic-two/1','id',d,'sessionId',g,'stake',10,'realMoney',money,'seats',seats_i,'revision',1,'updatedAt',at_ms,'automatic','[]'::jsonb,'pause',NULL,'pauseEpisode',0,'completed','[]'::jsonb,'winner',NULL,'totals',jsonb_build_object(players_i[1]::text,0,players_i[2]::text,0),
 'hand',jsonb_build_object('id',r,'number',1,'turn',1,'generation',1,'active',players_i[1],'phase','meld','deadline',at_ms+120000));
 INSERT INTO private.canasta_matches(dealer_game_id,game_id,first_round_id,state,revision,stake,seats) VALUES(d,g,r,s,1,10,seats_i);
 n:=s||jsonb_build_object('revision',2,'winner',players_i[1],'totals',jsonb_build_object(players_i[1]::text,5100,players_i[2]::text,-100),
  'completed',jsonb_build_array(jsonb_build_object('id',r,'number',1,'scores',jsonb_build_object(players_i[1]::text,5100,players_i[2]::text,-100))), 'hand',(s->'hand')||'{"phase":"complete"}'::jsonb);
 c:=jsonb_build_object('requestId',gen_random_uuid(),'matchId',d,'handId',r,'turn',1,'generation',1,'revision',1,'playerId',players_i[1],'action',jsonb_build_object('type','finish','groups','[]'::jsonb,'discard',NULL));
 RETURN jsonb_build_object('match',d,'round',r,'game',g,'players',players_i,'actor',users[1],'next',n,'command',c);
END $$;
