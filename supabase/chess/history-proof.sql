BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';CREATE TEMP TABLE chess_status_baseline AS SELECT (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.games) games,(SELECT count(*) FROM public.player_transactions) transactions,(SELECT count(*) FROM public.game_results) results;SAVEPOINT chess_status_proof;
-- Read-only final positions. Membership comes from the immutable game roster,
-- so standing up or ending a session does not erase a participant's history.
CREATE OR REPLACE FUNCTION public.chess_history(p_mode text,p_match uuid DEFAULT NULL,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); answer jsonb;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'chess:authentication_required' USING ERRCODE='42501';END IF;
 IF p_mode NOT IN ('live','async') OR p_mode IS NULL OR (p_match IS NULL AND p_id IS NULL) THEN RAISE EXCEPTION 'chess:invalid_history_request';END IF;
 WITH saved AS (
  SELECT m.dealer_game_id id,m.game_id session_id,m.state,
   (m.state#>>'{terminal,startedAt}')::bigint completed_at
  FROM private.chess_matches m
  WHERE p_mode='live' AND m.settlement IS NOT NULL AND m.state->>'phase'='complete'
   AND (p_match IS NULL OR m.game_id=p_match) AND (p_id IS NULL OR m.dealer_game_id=p_id)
  UNION ALL
  SELECT c.id,c.match_id,c.state,floor(extract(epoch FROM o.completed_at)*1000)::bigint
  FROM private.delayed_children c JOIN private.delayed_outcomes o ON o.child_id=c.id
  WHERE p_mode='async' AND c.game_type='chess' AND c.terminal AND c.state->>'phase'='complete'
   AND (p_match IS NULL OR c.match_id=p_match) AND (p_id IS NULL OR c.id=p_id)
 ), allowed AS (
  SELECT s.*,p->>'id' viewer_id FROM saved s
  CROSS JOIN LATERAL jsonb_array_elements(s.state->'players') p
  WHERE p->>'userId'=who::text AND coalesce((p->>'isBot')::boolean,false)=false
  ORDER BY s.completed_at DESC,s.id DESC LIMIT 50
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'completedAt',completed_at,
  'state',state||jsonb_build_object('viewerId',viewer_id)) ORDER BY completed_at DESC,id DESC),'[]'::jsonb) INTO answer FROM allowed;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.chess_history(text,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.chess_history(text,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.chess_history(text,uuid,uuid) IS 'Participant-only immutable completed Chess positions; does not load/sync gameplay or settle/continue sessions.';

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
  v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_history(''live'',%L,%L)',g,d));PERFORM pg_temp.chess_assert(v='[]','unfinished game excluded from history');
  terminal_s:=s||jsonb_build_object('phase','complete','reason',CASE WHEN draw_i=1 THEN 'stalemate' ELSE 'checkmate' END,'winnerIds',CASE WHEN draw_i=1 THEN to_jsonb(ids) ELSE jsonb_build_array(ids[1]) END,'scores',jsonb_build_object(ids[1]::text,1-draw_i,ids[2]::text,0));
  terminal_s:=terminal_s||jsonb_build_object('movePresentation',jsonb_build_object('readyAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+5000));
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
  PERFORM private.chess_finish_postgame(d);PERFORM pg_temp.chess_assert((SELECT NOT finished AND (state#>>'{terminal,startedAt}')::bigint>=(state#>>'{movePresentation,readyAt}')::bigint FROM private.chess_matches WHERE dealer_game_id=d),'server preserves checkmate presentation before automatic continuation');
  v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_history(''live'',%L,%L)',g,d));PERFORM pg_temp.chess_assert(jsonb_array_length(v)=1 AND v->0->'state'->>'fen'=s->>'fen' AND v->0->'state'->>'viewerId'=ids[1]::text,'winner or tie reads exact final board');
  v:=pg_temp.chess_rpc(users[2],format('SELECT public.chess_history(''live'',%L,%L)',g,d));PERFORM pg_temp.chess_assert(jsonb_array_length(v)=1,'other participant reads result');
  v:=pg_temp.chess_rpc(gen_random_uuid(),format('SELECT public.chess_history(''live'',%L,%L)',g,d));PERFORM pg_temp.chess_assert(v='[]','outsider cannot read board');
  UPDATE private.chess_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  PERFORM private.chess_finish_postgame(d);PERFORM private.chess_finish_postgame(d);
  PERFORM pg_temp.chess_assert((SELECT finished FROM private.chess_matches WHERE dealer_game_id=d),'duplicate continuation');
  PERFORM pg_temp.chess_assert((SELECT CASE WHEN draw_i=1 THEN status='session_ended' ELSE status='game_selection' AND current_game_uuid IS NULL END FROM public.games WHERE id=g),'terminal closure and ordinary successor boundary');
  UPDATE public.players SET status='left' WHERE id=ids[2];
  v:=pg_temp.chess_rpc(users[2],format('SELECT public.chess_history(''live'',%L,%L)',g,d));PERFORM pg_temp.chess_assert(jsonb_array_length(v)=1,'history survives departure and successor/session end');
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
  v:=pg_temp.chess_rpc(users[1],format('SELECT public.chess_history(''async'',%L,%L)',parent,child));PERFORM pg_temp.chess_assert(jsonb_array_length(v)=1 AND v->0->'state'->>'fen'=s->>'fen','Async saved final board retained');
  v:=pg_temp.chess_rpc(gen_random_uuid(),format('SELECT public.chess_history(''async'',%L,%L)',parent,child));PERFORM pg_temp.chess_assert(v='[]','Async outsider denied');
 END LOOP;END LOOP;
END $proof$;
SELECT 'PASS: both money modes, win/draw, canonical chips/ledger/snapshots, injected rollback, invalid stake, authorization, late/duplicate terminal, continuation and Async recovery' result;

DO $$BEGIN IF has_function_privilege('anon','public.chess_history(text,uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','public.chess_history(text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'history grants';END IF;PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);BEGIN PERFORM public.chess_history('live',gen_random_uuid());RAISE EXCEPTION 'anonymous accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;ROLLBACK TO chess_status_proof;DO $$BEGIN IF (SELECT users<>(SELECT count(*) FROM auth.users) OR games<>(SELECT count(*) FROM public.games) OR transactions<>(SELECT count(*) FROM public.player_transactions) OR results<>(SELECT count(*) FROM public.game_results) FROM chess_status_baseline) THEN RAISE EXCEPTION 'rollback containment';END IF;END $$;ROLLBACK;SELECT 'PASS: history authorization, departed participants, unfinished exclusion, win/tie, duplicate/late replay, atomic financial rollback, automatic/terminal continuation, no synthetic rows retained' result;