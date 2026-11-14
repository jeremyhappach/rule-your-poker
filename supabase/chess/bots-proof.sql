-- Append to financial-proof.sql inside one rollback transaction.
UPDATE private.chess_release SET bots_enabled=true;
UPDATE private.chess_bot_recovery SET last_completed_at=clock_timestamp(),failure=NULL;
DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;offer timestamptz;ante_due timestamptz;
 s jsonb;next_s jsonb;v jsonb;claim jsonb;lease_i uuid;revision_i bigint;actor uuid;difficulty text;failed boolean;i int;draw_i int;expected jsonb;human uuid;
BEGIN
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];
  UPDATE public.profiles SET is_active=true,username='Chess bot proof '||users[i] WHERE id=users[i];
 END LOOP;
 FOREACH difficulty IN ARRAY ARRAY['easy','medium','expert'] LOOP FOR draw_i IN 0..1 LOOP
  UPDATE public.game_defaults SET chess_bot_difficulty=difficulty WHERE game_type='chess';
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES(g,'game_selection',false,2,offer,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,j=2 FROM generate_series(1,2)j;
  UPDATE private.chess_release SET bots_enabled=false;failed:=false;
  BEGIN PERFORM pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:bots_fake_money_only' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'closed bot admission');UPDATE private.chess_release SET bots_enabled=true;
  UPDATE public.games SET real_money=true WHERE id=g;failed:=false;
  BEGIN PERFORM pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:bots_fake_money_only' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'real-money bots rejected');UPDATE public.games SET real_money=false WHERE id=g;
  v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));d:=(v#>>'{dealer_game,id}')::uuid;
  UPDATE public.game_defaults SET chess_bot_difficulty=CASE WHEN difficulty='expert' THEN 'easy' ELSE 'expert' END WHERE game_type='chess';
  SELECT ante_decision_deadline INTO ante_due FROM public.games WHERE id=g;
  PERFORM private.advance_ante_phase_exact(g,d,ante_due,clock_timestamp());
  SELECT state,revision INTO STRICT s,revision_i FROM private.chess_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.chess_assert(s#>>'{bot,difficulty}'=difficulty AND s#>>'{bot,version}'='ptown-chess-bot/1','difficulty frozen at configuration');
  actor:=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid;
  PERFORM pg_temp.chess_assert(actor=ids[2] AND s#>>'{players,0,isBot}'='true','bot admitted by canonical consent');
  s:=jsonb_set(s,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+290000));
  UPDATE private.chess_matches SET state=s WHERE dealer_game_id=d;
  lease_i:=gen_random_uuid();UPDATE private.chess_bot_recovery SET token=lease_i,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,matches='{}' WHERE singleton;
  -- Qualify the lease and its single claim, including denied browser entry.
  claim:=public.chess_bot_claim(lease_i);PERFORM pg_temp.chess_assert((claim->>'accepted')::boolean AND claim->'matches' ? d::text,'due bot claim');
  PERFORM pg_temp.chess_assert(public.chess_bot_claim(lease_i)->>'accepted'='false','duplicate lease claim denied');
  failed:=false;BEGIN PERFORM pg_temp.chess_rpc(users[1],format('SELECT public.chess_bot_load(%L,%L)',lease_i,d));EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'browser bot transport denied');
  failed:=false;BEGIN PERFORM public.chess_bot_load(gen_random_uuid(),d);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'invalid lease denied');
  UPDATE public.games SET is_paused=true WHERE id=g;
  PERFORM pg_temp.chess_assert(public.chess_bot_load(lease_i,d) IS NULL,'paused load skipped');
  UPDATE public.games SET is_paused=false WHERE id=g;
  v:=public.chess_bot_load(lease_i,d);s:=v->'state';revision_i:=(v->>'revision')::bigint;
  -- The trusted worker's final state is synthetic here to exercise financial commit atomically.
  next_s:=s||jsonb_build_object('phase','complete','reason',CASE WHEN draw_i=1 THEN 'stalemate' ELSE 'checkmate' END,'winnerIds',CASE WHEN draw_i=1 THEN to_jsonb(ids) ELSE jsonb_build_array(actor) END,'scores',jsonb_build_object(actor::text,1-draw_i,ids[1]::text,0));
  failed:=false;BEGIN PERFORM public.chess_bot_commit(lease_i,d,revision_i,actor,jsonb_set(next_s,'{bot,difficulty}','"bad"'),'{"type":"move"}');EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:bot_config_changed' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'frozen policy immutable');
  v:=public.chess_bot_commit(lease_i,d,revision_i-1,actor,next_s,'{"type":"move"}');PERFORM pg_temp.chess_assert(v->>'outcome'='stale','stale bot revision');
  UPDATE public.games SET pending_session_end=draw_i=1 WHERE id=g;
  v:=public.chess_bot_commit(lease_i,d,revision_i,actor,next_s,'{"type":"move"}');PERFORM pg_temp.chess_assert(v->>'outcome'='committed','bot terminal commit');
  v:=public.chess_bot_commit(lease_i,d,revision_i,actor,next_s,'{"type":"move"}');PERFORM pg_temp.chess_assert(v->>'outcome'='duplicate','bot replay once');
  failed:=false;BEGIN PERFORM public.chess_bot_commit(lease_i,d,revision_i,actor,next_s,'{"type":"move","to":"a1"}');EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:request_conflict' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'conflicting bot replay denied');
  expected:=jsonb_build_object(ids[1]::text,CASE WHEN draw_i=1 THEN 0 ELSE -5 END,ids[2]::text,CASE WHEN draw_i=1 THEN 0 ELSE 5 END);
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chess_assert((SELECT sum(chips)=200 AND bool_and(chips=100+(expected->>id::text)::int) FROM public.players WHERE game_id=g),'bot balanced actual chips');
  PERFORM pg_temp.chess_assert((SELECT count(*)=1 AND bool_and(player_chip_changes=expected) FROM public.game_results WHERE dealer_game_id=d),'one bot financial outcome');
  PERFORM pg_temp.chess_assert((SELECT count(*)=2 AND bool_and(chips=100+(expected->>player_id::text)::int) FROM public.session_player_snapshots WHERE dealer_game_id=d),'bot final snapshots');
  PERFORM pg_temp.chess_assert((SELECT count(*)=1-draw_i AND coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'bot balanced transfers');
  UPDATE private.chess_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  PERFORM private.chess_finish_postgame(d);PERFORM private.chess_finish_postgame(d);
  PERFORM pg_temp.chess_assert((SELECT finished FROM private.chess_matches WHERE dealer_game_id=d),'bot postgame finished');
  PERFORM pg_temp.chess_assert((SELECT CASE WHEN draw_i=1 THEN status='session_ended' ELSE status='game_selection' AND dealer_position=2 END FROM public.games WHERE id=g),'human next dealer or session ended');
  v:=public.chess_bot_commit(lease_i,d,revision_i,actor,next_s,'{"type":"move"}');PERFORM pg_temp.chess_assert(v->>'outcome'='duplicate','late exact receipt');
  PERFORM public.chess_bot_complete(lease_i,NULL);
  failed:=false;BEGIN PERFORM public.chess_bot_load(lease_i,d);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'completed lease retired');
 END LOOP;END LOOP;
END $proof$;
SELECT 'PASS: three frozen levels, fake-money admission, bot consent, lease/auth/pause/replay/stale guards, canonical chips/transfers/results/snapshots, continuation and terminal closure' result;
