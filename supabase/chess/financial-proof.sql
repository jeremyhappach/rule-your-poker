-- Run inside a rollback transaction, with the candidate installed in that transaction.
-- Synthetic terminal positions exercise real financial owners, as in the Golf proof.
CREATE FUNCTION pg_temp.chess_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'chess proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.chess_rpc(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;EXECUTE command INTO answer;RESET ROLE;RETURN answer;
END $$;
UPDATE private.chess_release SET enabled=true,admission_enabled=true,async_enabled=true,real_qualified=true;
DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()]; ids uuid[];g uuid;d uuid;v jsonb;s jsonb;
 offer timestamptz;mode_i integer;draw_i integer;i integer;expected jsonb;failed boolean;before_revision bigint;
 parent uuid;child uuid;offer_hash_i text;request_i uuid;fp jsonb:='{"proof":"terminal"}';terminal_s jsonb;
BEGIN
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];
  UPDATE public.profiles SET is_active=true,username='Chess rollback proof '||users[i] WHERE id=users[i];
  INSERT INTO private.chess_preview_users VALUES(users[i]);
 END LOOP;
 FOR mode_i IN 0..1 LOOP FOR draw_i IN 0..1 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
   VALUES(g,'game_selection',mode_i=1,2,offer,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,false FROM generate_series(1,2)j;
  failed:=false;
  BEGIN PERFORM pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":0}''::jsonb,%L)',g,ids[1],offer));
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess:config' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'invalid stake rejected');
  v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_configure(%L,%L,2,''chess'',''{"ante_amount":5}''::jsonb,%L)',g,ids[1],offer));d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.chess_rpc(users[2],format('SELECT to_jsonb(public.submit_ante_decision(%L,%L,%L,''ante_up''))',g,d,ids[2]));
  SELECT state,revision INTO s,before_revision FROM private.chess_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.chess_assert(s->>'backgroundId' IS NOT NULL AND s#>>'{rules,turnMs}'='300000','seed freezes background and rules');
  failed:=false;
  BEGIN PERFORM pg_temp.chess_rpc(users[1],format('SELECT public.chess_load(''live'',%L,%L)',d,users[1]));
  EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'browser cannot call service entry');
  failed:=false;
  BEGIN PERFORM public.chess_load('live',d,gen_random_uuid());EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.chess_assert(failed,'nonmember denied');
  terminal_s:=s||jsonb_build_object('phase','complete','reason',CASE WHEN draw_i=1 THEN 'stalemate' ELSE 'checkmate' END,'winnerIds',CASE WHEN draw_i=1 THEN to_jsonb(ids) ELSE jsonb_build_array(ids[1]) END,'scores',jsonb_build_object(ids[1]::text,1-draw_i,ids[2]::text,0));
  UPDATE private.chess_matches SET state=terminal_s WHERE dealer_game_id=d;
  IF draw_i=0 THEN
   CREATE OR REPLACE FUNCTION pg_temp.chess_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $f$
   BEGIN
    IF NOT EXISTS(SELECT FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'injection_before_chips';END IF;
    RAISE EXCEPTION 'chess_injected_after_chips';
   END $f$;
   CREATE TRIGGER chess_proof_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.chess_fail_snapshot();
   failed:=false;
   BEGIN PERFORM private.chess_settle(d);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'chess_injected_after_chips' THEN RAISE;END IF;failed:=true;END;
   DROP TRIGGER chess_proof_failure ON public.session_player_snapshots;
   PERFORM pg_temp.chess_assert(failed AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'failure restores canonical chips');
   PERFORM pg_temp.chess_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE dealer_game_id=d) AND (SELECT settlement IS NULL FROM private.chess_matches WHERE dealer_game_id=d),'failure restores results, transfers and snapshots');
  END IF;
  UPDATE public.games SET pending_session_end=draw_i=1 WHERE id=g;
  PERFORM private.chess_settle(d);PERFORM private.chess_settle(d);
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  expected:=jsonb_build_object(ids[1]::text,CASE WHEN draw_i=1 THEN 0 ELSE 5 END,ids[2]::text,CASE WHEN draw_i=1 THEN 0 ELSE -5 END);
  PERFORM pg_temp.chess_assert((SELECT bool_and(chips=100+(expected->>id::text)::int) AND sum(chips)=200 FROM public.players WHERE game_id=g),'actual balanced chips');
  PERFORM pg_temp.chess_assert((SELECT count(*)=1 AND bool_and(player_chip_changes=expected) FROM public.game_results WHERE dealer_game_id=d),'one immutable result');
  PERFORM pg_temp.chess_assert((SELECT count(*)=2 AND bool_and(chips=100+(expected->>player_id::text)::int) FROM public.session_player_snapshots WHERE dealer_game_id=d),'post-settlement snapshots');
  PERFORM pg_temp.chess_assert((SELECT count(*)=1-draw_i AND coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'balanced canonical receipt or zero transfer draw');
  UPDATE private.chess_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  PERFORM private.chess_finish_postgame(d);PERFORM private.chess_finish_postgame(d);
  PERFORM pg_temp.chess_assert((SELECT finished FROM private.chess_matches WHERE dealer_game_id=d),'duplicate continuation');
  PERFORM pg_temp.chess_assert((SELECT CASE WHEN draw_i=1 THEN status='session_ended' ELSE status='game_selection' AND current_game_uuid IS NULL END FROM public.games WHERE id=g),'terminal closure and ordinary successor boundary');
  -- A stale terminal commit must leave the current financial outcome untouched.
  v:=public.chess_commit('live',d,users[1],before_revision,terminal_s,gen_random_uuid(),fp);
  PERFORM pg_temp.chess_assert(v->>'outcome'='stale','late terminal request rejected');
  parent:=(pg_temp.chess_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,%L,''[{"game":"chess","stake":7}]''::jsonb))',gen_random_uuid(),users[2],mode_i=1))#>>'{}')::uuid;
  SELECT offer_hash INTO offer_hash_i FROM private.delayed_matches WHERE id=parent;
  PERFORM pg_temp.chess_rpc(users[2],format('SELECT public.delayed_respond(%L,%L,%L,''accept'')',parent,gen_random_uuid(),offer_hash_i));
  SELECT id,state,revision INTO child,s,before_revision FROM private.delayed_children WHERE match_id=parent;
  PERFORM pg_temp.chess_assert(s->>'opened'='false' AND s->>'backgroundId' IS NOT NULL,'Async unopened availability and background');
  IF draw_i=1 THEN
   terminal_s:=s||jsonb_build_object('phase','complete','reason','stalemate','winnerIds',jsonb_build_array(users[1],users[2]));request_i:=gen_random_uuid();
   v:=public.chess_commit('async',child,(s#>>'{players,0,userId}')::uuid,before_revision,terminal_s,request_i,fp);
   PERFORM pg_temp.chess_assert(v->>'outcome'='committed','Async draw commit');
   v:=public.chess_commit('async',child,(s#>>'{players,0,userId}')::uuid,before_revision,terminal_s,request_i,fp);
   PERFORM pg_temp.chess_assert(v->>'outcome'='duplicate','terminal replay exactly once');
  ELSE
   UPDATE private.delayed_children SET state=jsonb_set(state,'{deadline}','0'),gameplay_due_at=clock_timestamp()-interval '1 second' WHERE id=child;
   PERFORM private.chess_sync('async',child);PERFORM private.chess_sync('async',child);
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chess_assert((SELECT count(*)=1 AND bool_and(organizer_delta+opponent_delta=0) FROM private.delayed_outcomes WHERE child_id=child),'Async exactly one balanced outcome');
  IF mode_i=1 THEN PERFORM pg_temp.chess_assert((SELECT coalesce(sum(amount),0)=0 AND coalesce(sum(abs(amount)),0)=CASE WHEN draw_i=1 THEN 0 ELSE 14 END FROM public.player_transactions WHERE source_game_id=parent AND transaction_type='SessionResult'),'Async canonical real ledger');END IF;
 END LOOP;END LOOP;
END $proof$;
SELECT 'PASS: both money modes, win/draw, canonical chips/ledger/snapshots, injected rollback, invalid stake, authorization, late/duplicate terminal, continuation and Async recovery' result;
