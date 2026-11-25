-- Candidate and proof run in a single BEGIN/ROLLBACK. No fixture persists.
CREATE FUNCTION pg_temp.undo_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'undo proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.undo_rpc(who uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.sub',who::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;EXECUTE command INTO answer;RESET ROLE;RETURN answer;
END $$;
CREATE FUNCTION pg_temp.undo_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('undo.proof_fail',true)='on' THEN RAISE EXCEPTION 'undo:injected_after_reversal';END IF;RETURN NEW;END $$;
CREATE TRIGGER undo_proof_failure BEFORE INSERT ON private.board_undo_audits FOR EACH ROW EXECUTE FUNCTION pg_temp.undo_fail();
CREATE TEMP TABLE undo_checks(mode text,game text,real_money boolean,draw boolean);
UPDATE private.chess_release SET enabled=true,admission_enabled=true,async_enabled=true,real_qualified=true;
UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true;
UPDATE private.delayed_release SET real_qualified=true;
UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
UPDATE private.delayed_words_health SET last_tick=clock_timestamp();
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;s jsonb;t jsonb;r jsonb;v jsonb;
 mode_i text;game_i text;money_i boolean;draw_i boolean;i int;offer timestamptz;req uuid;admin_i uuid;actor_i uuid;revision_i bigint;
 before_row jsonb;after_row jsonb;financial_id uuid;count_i bigint;failed boolean;cmd text;original_accounts bigint;
 move_i text;child_i private.delayed_children;items_i jsonb;expected_s jsonb;
BEGIN
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];
  UPDATE public.profiles SET is_active=true,username='Board undo proof '||users[i] WHERE id=users[i];
  INSERT INTO private.chess_preview_users VALUES(users[i]);
  IF i<3 THEN INSERT INTO public.user_roles(user_id,role) VALUES(users[i],'admin') ON CONFLICT DO NOTHING;END IF;
 END LOOP;
 FOREACH mode_i IN ARRAY ARRAY['live','async'] LOOP FOREACH game_i IN ARRAY ARRAY['chess','ptown-words'] LOOP
 FOREACH money_i IN ARRAY ARRAY[false,true] LOOP FOREACH draw_i IN ARRAY ARRAY[false,true] LOOP
  IF mode_i='live' THEN
   g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
   INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
    VALUES(g,'game_selection',money_i,2,offer,0,false,false,users[1]);
   INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,false FROM generate_series(1,2)j;
   v:=pg_temp.undo_rpc(users[1],format('SELECT public.%I(%L,%L,2,%L,''{"ante_amount":5}''::jsonb,%L)',CASE game_i WHEN 'chess' THEN 'chess_configure' ELSE 'ptown_words_configure' END,g,ids[1],game_i,offer));
   d:=(v#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.undo_rpc(users[2],format('SELECT to_jsonb(public.submit_ante_decision(%L,%L,%L,''ante_up''))',g,d,ids[2]));
  ELSE
   g:=(pg_temp.undo_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,%L,%L::jsonb))',gen_random_uuid(),users[2],money_i,jsonb_build_array(jsonb_build_object('game',game_i,'stake',5))))#>>'{}')::uuid;
   PERFORM pg_temp.undo_rpc(users[2],format('SELECT public.delayed_respond(%L,%L,%L,''accept'')',g,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=g)));
   SELECT id INTO d FROM private.delayed_children WHERE match_id=g;ids:=users[1:2];
  END IF;
  before_row:=private.board_undo_row(mode_i,game_i,d);s:=before_row->'state';
  actor_i:=(s->'players'->(s->>'turnIndex')::int->>'userId')::uuid;admin_i:=CASE WHEN actor_i=users[1] THEN users[2] ELSE users[1] END;
  IF game_i='ptown-words' THEN
   FOREACH move_i IN ARRAY ARRAY['exchange','pass','tick'] LOOP
    before_row:=private.board_undo_row(mode_i,game_i,d);s:=before_row->'state';
    items_i:=jsonb_build_array(jsonb_build_object('tileId',s->'racks'->(s->'players'->(s->>'turnIndex')::int->>'id')->0->'id'));
    t:=private.ptown_words_reduce(s,move_i,CASE WHEN move_i='exchange' THEN items_i END,
      CASE WHEN move_i='tick' THEN (s->>'deadline')::bigint ELSE floor(extract(epoch FROM clock_timestamp())*1000)::bigint END);
    IF mode_i='live' THEN UPDATE private.ptown_words_matches SET state=t,revision=revision+1 WHERE dealer_game_id=d;
    ELSE SELECT * INTO child_i FROM private.delayed_children WHERE id=d;PERFORM private.delayed_words_finish_turn(child_i,t,clock_timestamp());END IF;
    req:=gen_random_uuid();r:=private.board_undo_row(mode_i,game_i,d);
    IF move_i<>'tick' THEN
     v:=pg_temp.undo_rpc(actor_i,format('SELECT public.admin_board_undo_info(%L,%L,%L)',mode_i,game_i,d));
     PERFORM pg_temp.undo_assert(NOT(v->>'available')::boolean,'own move cannot be undone');
    END IF;
    PERFORM pg_temp.undo_rpc(admin_i,format('SELECT public.admin_board_undo(%L,%L,%L,%L,%s)',req,mode_i,game_i,d,(r->>'revision')::bigint));
    after_row:=private.board_undo_row(mode_i,game_i,d);
    PERFORM pg_temp.undo_assert(((after_row->'state')-ARRAY['deadline','adminUndoId','movePresentation'])=(s-ARRAY['deadline','adminUndoId','movePresentation']),'real Words exchange/pass/timeout restores exact private state');
    IF mode_i='async' THEN PERFORM pg_temp.undo_assert(NOT EXISTS(SELECT FROM private.delayed_current_review_events WHERE child_id=d),'undone moves do not survive review projection');END IF;
   END LOOP;
   before_row:=private.board_undo_row(mode_i,game_i,d);s:=before_row->'state';
  END IF;
  t:=s||jsonb_build_object('phase','complete','turn',(s->>'turn')::int+1,'reason',CASE WHEN money_i AND NOT draw_i THEN 'timeout' WHEN draw_i THEN 'stalemate' ELSE 'checkmate' END,
   'winnerIds',CASE WHEN draw_i THEN to_jsonb(ids) ELSE jsonb_build_array(ids[1]) END,'scores',jsonb_build_object(ids[1]::text,CASE WHEN draw_i THEN 0 ELSE 1 END,ids[2]::text,0));
  IF mode_i='live' THEN
   UPDATE public.games SET pending_session_end=true WHERE id=g;
   EXECUTE format('UPDATE private.%I SET state=$1,revision=revision+1 WHERE dealer_game_id=$2',CASE game_i WHEN 'chess' THEN 'chess_matches' ELSE 'ptown_words_matches' END) USING t,d;
   EXECUTE format('SELECT private.%I($1)',CASE game_i WHEN 'chess' THEN 'chess_settle' ELSE 'ptown_words_settle' END) USING d;
   financial_id:=g;
   EXECUTE format('UPDATE private.%I SET state=jsonb_set(state,''{terminal,deadline}'',''0'') WHERE dealer_game_id=$1',CASE game_i WHEN 'chess' THEN 'chess_matches' ELSE 'ptown_words_matches' END) USING d;
   IF game_i='chess' THEN PERFORM private.chess_finish_postgame(d);ELSE PERFORM public.ptown_words_close(d);END IF;
   PERFORM pg_temp.undo_assert((private.board_undo_row(mode_i,game_i,d)->>'finished')::boolean,'undo remains reachable after postgame continuation');
  ELSE
   UPDATE private.delayed_children SET state=t,revision=revision+1 WHERE id=d;
   PERFORM private.delayed_record_outcome(d,(SELECT revision FROM private.delayed_children WHERE id=d),CASE WHEN draw_i THEN 'draw' WHEN money_i THEN 'timeout_forfeit' ELSE 'normal' END,CASE WHEN NOT draw_i THEN users[1] END,'{"proof":"admin undo"}');
   SELECT game_id INTO financial_id FROM private.delayed_current_settlements WHERE match_id=g;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  r:=private.board_undo_row(mode_i,game_i,d);revision_i:=(r->>'revision')::bigint;req:=gen_random_uuid();
  cmd:=format('SELECT public.admin_board_undo(%L,%L,%L,%L,%s)',req,mode_i,game_i,d,revision_i);
  failed:=false;BEGIN PERFORM pg_temp.undo_rpc(users[3],cmd);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
  PERFORM pg_temp.undo_assert(failed,'non-admin denied');
  failed:=false;BEGIN PERFORM pg_temp.undo_rpc(admin_i,format('SELECT public.admin_board_undo(%L,%L,%L,%L,%s)',gen_random_uuid(),mode_i,game_i,d,revision_i-1));EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'board_undo:match_changed' THEN RAISE;END IF;failed:=true;END;
  PERFORM pg_temp.undo_assert(failed,'stale revision denied');
  SELECT count(*) INTO count_i FROM public.player_transactions WHERE source_game_id=financial_id;
  PERFORM set_config('undo.proof_fail','on',true);failed:=false;
  BEGIN PERFORM pg_temp.undo_rpc(admin_i,cmd);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'undo:injected_after_reversal' THEN RAISE;END IF;failed:=true;END;
  PERFORM set_config('undo.proof_fail','off',true);
  PERFORM pg_temp.undo_assert(failed AND private.board_undo_row(mode_i,game_i,d)=r AND (SELECT count(*)=count_i FROM public.player_transactions WHERE source_game_id=financial_id),'failure rolls back authority and accounts');
  v:=pg_temp.undo_rpc(admin_i,cmd);after_row:=private.board_undo_row(mode_i,game_i,d);
  PERFORM pg_temp.undo_assert(v->>'outcome'='undone' AND after_row#>>'{state,phase}'='playing' AND (after_row->>'revision')::bigint=revision_i+1,'restore and monotone revision');
  PERFORM pg_temp.undo_assert(((after_row->'state')-ARRAY['deadline','turnStartedAt','adminUndoId','movePresentation'])=(s-ARRAY['deadline','turnStartedAt','adminUndoId','movePresentation']),'exact board, rack, bag, scores, turn, banks');
  PERFORM pg_temp.undo_assert((SELECT bool_and(chips=CASE mode_i WHEN 'live' THEN 100 ELSE 0 END) FROM public.players WHERE game_id=financial_id),'canonical balances restored');
  PERFORM pg_temp.undo_assert((SELECT coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=financial_id),'account balance restored');
  PERFORM pg_temp.undo_assert((SELECT count(*)=1 FROM private.board_undo_audits WHERE id=req),'one immutable audit');
  SELECT count(*) INTO count_i FROM public.player_transactions WHERE source_game_id=financial_id;
  v:=pg_temp.undo_rpc(admin_i,cmd);
  PERFORM pg_temp.undo_assert(v->>'outcome'='already_undone' AND (SELECT count(*)=count_i FROM public.player_transactions WHERE source_game_id=financial_id),'retry cannot reverse twice');
  PERFORM pg_temp.undo_assert(NOT(public.admin_board_undo_info(mode_i,game_i,d)->>'available')::boolean,'different request cannot undo same frame');
  IF mode_i='async' THEN
   PERFORM pg_temp.undo_assert((SELECT status='active' AND settled_at IS NULL FROM private.delayed_matches WHERE id=g) AND NOT EXISTS(SELECT FROM private.delayed_current_outcomes WHERE child_id=d) AND NOT EXISTS(SELECT FROM private.delayed_current_settlements WHERE match_id=g),'async terminal projections restored');
   UPDATE private.delayed_children SET state=t,revision=revision+1 WHERE id=d;
   PERFORM private.delayed_record_outcome(d,(SELECT revision FROM private.delayed_children WHERE id=d),CASE WHEN draw_i THEN 'draw' ELSE 'normal' END,CASE WHEN NOT draw_i THEN users[1] END,'{"proof":"resettlement"}');
   PERFORM private.delayed_finalize(g);
   PERFORM pg_temp.undo_assert((SELECT count(*)=1 FROM private.delayed_current_settlements WHERE match_id=g),'async settles again exactly once');
  ELSE
   PERFORM pg_temp.undo_assert((SELECT status='in_progress' AND current_game_uuid=d FROM public.games WHERE id=g),'live match reinstated');
   UPDATE public.games SET pending_session_end=true WHERE id=g;
   EXECUTE format('UPDATE private.%I SET state=$1,revision=revision+1 WHERE dealer_game_id=$2',CASE game_i WHEN 'chess' THEN 'chess_matches' ELSE 'ptown_words_matches' END) USING t,d;
   EXECUTE format('SELECT private.%I($1)',CASE game_i WHEN 'chess' THEN 'chess_settle' ELSE 'ptown_words_settle' END) USING d;
   PERFORM pg_temp.undo_assert((SELECT count(*)=CASE WHEN money_i THEN 4 ELSE 0 END FROM public.player_transactions WHERE source_game_id=g AND transaction_type='SessionResult'),'reopened live session posts next generation');
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO undo_checks VALUES(mode_i,game_i,money_i,draw_i);
 END LOOP;END LOOP;END LOOP;END LOOP;
END $$;
SELECT count(*) AS passed_financial_cases FROM undo_checks;

DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];parent uuid;child uuid;children uuid[];s jsonb;r jsonb;admin_i uuid;i int;
BEGIN
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];
  UPDATE public.profiles SET is_active=true,username='Undo siblings '||users[i] WHERE id=users[i];
  INSERT INTO public.user_roles(user_id,role) VALUES(users[i],'admin') ON CONFLICT DO NOTHING;
 END LOOP;
 parent:=(pg_temp.undo_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,true,''[{"game":"ptown-words","stake":5},{"game":"ptown-words","stake":7}]''))',gen_random_uuid(),users[2]))#>>'{}')::uuid;
 PERFORM pg_temp.undo_rpc(users[2],format('SELECT public.delayed_respond(%L,%L,%L,''accept'')',parent,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=parent)));
 SELECT array_agg(id ORDER BY ordinal) INTO children FROM private.delayed_children WHERE match_id=parent;
 FOREACH child IN ARRAY children LOOP
  SELECT state INTO s FROM private.delayed_children WHERE id=child;
  UPDATE private.delayed_children SET state=s||jsonb_build_object('phase','complete','turn',(s->>'turn')::int+1,'winnerIds',jsonb_build_array(users[1])),revision=revision+1 WHERE id=child;
  PERFORM private.delayed_record_outcome(child,(SELECT revision FROM private.delayed_children WHERE id=child),'normal',users[1],'{}');
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 FOREACH child IN ARRAY children LOOP
  SELECT to_jsonb(c) INTO r FROM private.delayed_children c WHERE id=child;
  admin_i:=CASE WHEN r->'state'->'players'->(r#>>'{state,turnIndex}')::int->>'userId'=users[1]::text THEN users[2] ELSE users[1] END;
  PERFORM pg_temp.undo_rpc(admin_i,format('SELECT public.admin_board_undo(%L,''async'',''ptown-words'',%L,%s)',gen_random_uuid(),child,r->>'revision'));
 END LOOP;
 FOREACH child IN ARRAY children LOOP
  SELECT state INTO s FROM private.delayed_children WHERE id=child;
  UPDATE private.delayed_children SET state=s||jsonb_build_object('phase','complete','turn',(s->>'turn')::int+1,'winnerIds',jsonb_build_array(users[1])),revision=revision+1 WHERE id=child;
  PERFORM private.delayed_record_outcome(child,(SELECT revision FROM private.delayed_children WHERE id=child),'normal',users[1],'{}');
 END LOOP;
 PERFORM pg_temp.undo_assert((SELECT count(*)=2 FROM private.delayed_current_outcomes WHERE match_id=parent),'reopened sibling outcomes survive separate corrections');
 PERFORM pg_temp.undo_assert((SELECT organizer_delta=12 FROM private.delayed_current_settlements WHERE match_id=parent),'reopened siblings settle the correct total');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $$;
SELECT 'PASS: 16 terminal finance cases, 24 actual Words move/timeout restores, repeated corrections and sibling settlement' result;
