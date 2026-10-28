-- Isolated loopback fixture only. Every mutation is rolled back by the runner.
CREATE TEMP TABLE golf_completion_checks(label text PRIMARY KEY,passes integer NOT NULL);
CREATE TEMP TABLE golf_completion_cases(rules_version text,real_money boolean,humans integer,settled boolean,finished boolean);
CREATE OR REPLACE FUNCTION pg_temp.golf_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Golf proof: %',label;END IF;
 INSERT INTO pg_temp.golf_completion_checks VALUES(label,1) ON CONFLICT ON CONSTRAINT golf_completion_checks_pkey DO UPDATE SET passes=pg_temp.golf_completion_checks.passes+1;
END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 ids uuid[];g uuid;d uuid;m private.golf_matches;v jsonb;before_state jsonb;before_revision bigint;
 offer timestamptz;money integer;humans integer;i integer;j integer;actor_id uuid;actor_user uuid;version_i bigint;preserved uuid;
BEGIN
 UPDATE private.golf_release SET enabled=true,admission_enabled=true;
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Golf completion '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.user_roles(user_id,role) VALUES(users[3],'admin');
 preserved:=gen_random_uuid();
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
 VALUES(preserved,'game_selection',true,2,clock_timestamp()+interval '30 minutes',0,true,false,users[1]);
 FOR money IN 0..1 LOOP FOR humans IN 1..3 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '30 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host,timeout_enforcement_enabled,timeout_action)
   VALUES(g,'game_selection',money=1,2,offer,0,false,false,users[1],true,'auto_fold');
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[x],g,users[x],3-x,100,humans=1 AND x=2 FROM generate_series(1,2)x;
  PERFORM pg_temp.golf_login(users[1]);
  UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
  v:=public.golf_configure(g,ids[1],2,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  IF humans>1 THEN PERFORM pg_temp.golf_login(users[2]);PERFORM public.submit_ante_decision(g,d,ids[2],'ante_up');
  ELSE PERFORM public.advance_ante_phase(g,d);END IF;
  SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=d;
  -- Current simultaneous opening prioritizes uncommitted bots. Commit the bot's
  -- legal opening first so the following timeout boundary belongs to the human.
  IF humans=1 AND m.state ? 'openingCommits' THEN
   UPDATE private.golf_matches SET state=private.golf_open_commit(state,ids[2]::text,ARRAY[0,3],floor(extract(epoch FROM clock_timestamp())*1000)::bigint),revision=revision+1 WHERE dealer_game_id=d;
   SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
  END IF;
  -- Move only the fixture's actor index to its human at a legal opening boundary.
  SELECT (ord-1)::integer INTO i FROM jsonb_array_elements(m.state->'players') WITH ORDINALITY x(p,ord) WHERE p->>'id'=ids[1]::text;
  UPDATE private.golf_matches SET state=jsonb_set(state,'{turnIndex}',to_jsonb(i)),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;before_state:=m.state;before_revision:=m.revision;
  PERFORM private.golf_recover();
  PERFORM pg_temp.golf_assert((SELECT revision=before_revision FROM private.golf_matches WHERE dealer_game_id=d),'unexpired human not advanced');
  PERFORM pg_temp.golf_login(users[1]);
  v:=public.golf_snapshot(d);
  PERFORM pg_temp.golf_assert(v#>ARRAY['tableaus',ids[1]::text,'cards']='[null,null,null,null,null,null]'::jsonb,'own hidden cards stay private');
  PERFORM public.set_game_paused(g,true,d,(SELECT pause_version FROM public.games WHERE id=g));
  PERFORM private.golf_recover();PERFORM private.golf_recover();
  PERFORM pg_temp.golf_assert((SELECT state=before_state FROM private.golf_matches WHERE dealer_game_id=d),'deliberate pause does not progress');
  PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
  UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;before_state:=m.state;
  BEGIN PERFORM public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'open',ARRAY[0,3]);RAISE EXCEPTION 'expired accepted';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:deadline' THEN RAISE;END IF;END;
  PERFORM private.golf_recover();
  IF money=1 THEN
   PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'real timeout pauses');
   PERFORM pg_temp.golf_assert((SELECT state-'deadline'=before_state-'deadline' FROM private.golf_matches WHERE dealer_game_id=d),'real pause preserves unresolved gameplay');
   PERFORM private.golf_recover();
   PERFORM pg_temp.golf_assert((SELECT NOT auto_fold FROM public.players WHERE id=ids[1]),'real timeout does not opt into autoplay');
   -- Reconnect may encounter a previously enabled control flag. Reclaiming it
   -- must clear deferred sit-out while retaining the real-money pause.
   UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=ids[1];
   SELECT intent_version INTO version_i FROM public.players WHERE id=ids[1];
   v:=public.golf_reclaim_control(d,m.round_id,version_i);
   PERFORM pg_temp.golf_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=ids[1]) AND (SELECT is_paused FROM public.games WHERE id=g),'real rejoin clears control flags without resuming');
   PERFORM pg_temp.golf_assert(public.golf_snapshot(d)->'playerControls'=v->'playerControls','real reconnect preserves reclaimed flags');
   PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));PERFORM private.golf_recover();
   PERFORM pg_temp.golf_assert((SELECT NOT is_paused FROM public.games WHERE id=g),'real resume has fresh allowance');
  ELSE
   PERFORM pg_temp.golf_assert((SELECT NOT is_paused FROM public.games WHERE id=g),'play money human timeout continues');
   PERFORM pg_temp.golf_assert((SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=ids[1]),'timeout owns canonical autoplay flags');
   SELECT intent_version INTO version_i FROM public.players WHERE id=ids[1];
   PERFORM pg_temp.golf_login(users[3]);
   BEGIN PERFORM public.golf_reclaim_control(d,m.round_id,version_i);RAISE EXCEPTION 'outsider reclaimed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   PERFORM pg_temp.golf_login(users[1]);
   v:=public.golf_reclaim_control(d,m.round_id,version_i);
   PERFORM pg_temp.golf_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=ids[1]),'rejoin clears both flags');
   PERFORM pg_temp.golf_assert(public.golf_snapshot(d)->'playerControls'=v->'playerControls','reconnect keeps reclaimed control');
   BEGIN PERFORM public.golf_reclaim_control(d,m.round_id,version_i-1);RAISE EXCEPTION 'stale reclaim accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:stale_control' THEN RAISE;END IF;END;
   -- All admitted humans may be away; each legal action still reaches settlement.
   UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g AND NOT is_bot;
   PERFORM pg_temp.golf_assert(NOT private.pause_all_humans_auto_fold(g),'shared eligibility helper does not pause active play money');
   IF humans<3 THEN
   FOR j IN 1..2500 LOOP
    SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;EXIT WHEN m.settlement IS NOT NULL;
    UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
    PERFORM private.golf_recover();
    PERFORM pg_temp.golf_assert((SELECT NOT is_paused FROM public.games WHERE id=g),'no automatic re-pause');
   END LOOP;
   SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.golf_assert(m.settlement IS NOT NULL AND jsonb_array_length(m.state->'holes')=9,'zero-client full nine-hole settlement');
   PERFORM pg_temp.golf_assert((SELECT sum(chips)=200 FROM public.players WHERE game_id=g),'canonical settlement balances');
   PERFORM private.golf_settle(d);PERFORM private.golf_recover();
   PERFORM pg_temp.golf_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'settlement replay once');
   PERFORM pg_sleep(greatest(0,((m.state#>>'{terminal,deadline}')::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.02);
   PERFORM private.golf_recover();PERFORM private.golf_recover();
   PERFORM pg_temp.golf_assert((SELECT finished FROM private.golf_matches WHERE dealer_game_id=d),'zero-client terminal completion');
   PERFORM pg_temp.golf_assert((SELECT current_game_uuid IS NULL FROM public.games WHERE id=g),'between-dealer eligibility retires old identity');
   ELSE
    BEGIN DELETE FROM public.players WHERE id=ids[1];RAISE EXCEPTION 'direct roster deletion accepted';
     EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:match_liability_committed' THEN RAISE;END IF;END;
   END IF;
  END IF;
  -- Settlement and Blast are distinct requests in production. Complete deferred
  -- financial validation before the cleanup request in this rollback fixture.
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
  INSERT INTO pg_temp.golf_completion_cases VALUES(m.state#>>'{rules,version}',money=1,(SELECT count(*) FROM public.players WHERE game_id=g AND NOT is_bot),m.settlement IS NOT NULL,m.finished);
  -- Canonical Blast authorization and money checks apply before any cleanup.
  PERFORM pg_temp.golf_login(users[1]);
  BEGIN PERFORM public.admin_blast_fake_money_game(g);RAISE EXCEPTION 'nonadmin blasted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM pg_temp.golf_login(users[3]);
  IF money=1 THEN
   BEGIN PERFORM public.admin_blast_fake_money_game(g);RAISE EXCEPTION 'real game blasted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   PERFORM pg_temp.golf_assert(EXISTS(SELECT FROM private.golf_matches WHERE dealer_game_id=d),'real Blast denial retains match');
   PERFORM public.set_game_paused(g,true,d,(SELECT pause_version FROM public.games WHERE id=g));
   preserved:=g;
  ELSE
   BEGIN PERFORM public.admin_blast_fake_money_game(g);RAISE EXCEPTION 'injected interruption';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'injected interruption' THEN RAISE;END IF;END;
   PERFORM pg_temp.golf_assert(EXISTS(SELECT FROM public.games WHERE id=g) AND EXISTS(SELECT FROM private.golf_matches WHERE dealer_game_id=d),'interrupted Blast rolls back whole graph');
   PERFORM public.admin_blast_fake_money_game(g);
   PERFORM pg_temp.golf_assert(public.admin_blast_fake_money_game(g)->>'outcome'='already-deleted','Blast replay');
   PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT FROM public.players WHERE game_id=g) AND NOT EXISTS(SELECT FROM private.golf_matches WHERE game_id=g) AND NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d),'Blast retires exact settled graph');
  END IF;
 END LOOP;END LOOP;
 PERFORM pg_temp.golf_assert(EXISTS(SELECT FROM public.games WHERE id=preserved),'unrelated real fixture retained');
 PERFORM pg_temp.golf_assert(private.golf_score('[1,2,3,14,15,16]')=0,'paired twos remain zero');
 PERFORM pg_temp.golf_assert(NOT has_function_privilege('anon','public.admin_blast_fake_money_game(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.admin_blast_fake_money_game(uuid)','EXECUTE'),'Blast execute grants preserved');
 PERFORM pg_temp.golf_assert(NOT has_function_privilege('authenticated','private.golf_recover()','EXECUTE'),'recovery remains private');
END $$;
