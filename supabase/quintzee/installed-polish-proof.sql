BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='300s';CREATE TEMP TABLE q_installed_functions AS SELECT p.oid,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname LIKE '%quintzee%';
CREATE FUNCTION pg_temp.quintzee_accept(game uuid,dealer uuid) RETURNS void LANGUAGE plpgsql AS $wrap$
 DECLARE p record;actor text:=current_setting('request.jwt.claim.sub',true);
 BEGIN
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=game AND status='active' AND NOT sitting_out AND NOT is_bot AND ante_decision IS NULL LOOP
 PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(game,dealer,p.id,'ante_up');END LOOP;
 PERFORM public.advance_ante_phase(game,dealer);PERFORM set_config('request.jwt.claim.sub',actor,true);
 END $wrap$;
-- Transaction-contained qualification only. Caller wraps candidate + proof in BEGIN/ROLLBACK.
CREATE OR REPLACE FUNCTION pg_temp.quintzee_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quintzee proof: %',label;END IF;END $$;
CREATE OR REPLACE FUNCTION pg_temp.quintzee_fixture(n integer,bot boolean DEFAULT false,theme text DEFAULT 'modern',money boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g uuid:=gen_random_uuid();u uuid[]:=ARRAY[]::uuid[];p uuid[]:=ARRAY[]::uuid[];i integer;d uuid;v jsonb;offer timestamptz:=clock_timestamp()+interval '10 minutes';
BEGIN
 FOR i IN 1..n LOOP
  u:=array_append(u,gen_random_uuid());p:=array_append(p,gen_random_uuid());
  INSERT INTO auth.users(id) VALUES(u[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Quintzee qualification '||u[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money,n,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT p[j],g,u[j],n+1-j,100,bot AND j>1 FROM generate_series(1,n) j;
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 v:=public.quintzee_configure(g,p[1],n,'quintzee',jsonb_build_object('ante_amount',5,'theme',theme),offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.quintzee_accept(g,d);
 RETURN jsonb_build_object('game',g,'dealer',d,'users',to_jsonb(u),'players',to_jsonb(p));
END $$;

CREATE TEMP TABLE q_configure AS SELECT pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure) source;DO $$ BEGIN EXECUTE replace((SELECT source FROM q_configure),'private.quintzee_v3_rules()','private.quintzee_v2_rules()');END $$;UPDATE private.arcade_rulesets SET enabled=(id='quintzee/2') WHERE game='quintzee';UPDATE private.quintzee_release SET enabled=true,admission_enabled=true;
-- Transaction-contained local v2 delta proof, including actual canonical settlement.
DO $$ DECLARE b jsonb;v jsonb;s jsonb;f jsonb;g uuid;d uuid;actor uuid;req uuid;before jsonb;after_s jsonb;rev bigint;deadline bigint;v_run uuid;u uuid;other_id uuid;p_active uuid;i integer; BEGIN
 b:=private.quintzee_v2_board_start(private.quintzee_v2_rules(),1000);
 PERFORM pg_temp.quintzee_assert(b->>'phase'='ready' AND b->'dice'='[]' AND NOT b ? 'startedAt' AND (b->>'deadline')::bigint=31000,'blank ready, separate fixed 30s deadline');
 PERFORM pg_temp.quintzee_assert(private.quintzee_v2_board_reduce(b,'tick',NULL,30000)=b,'recovery before deadline cannot roll or extend');
 b:=private.quintzee_v2_board_reduce(b,'start','{}',15000);
 PERFORM pg_temp.quintzee_assert(b->>'phase'='playing' AND (b->>'startedAt')::bigint=15000 AND (b->>'deadline')::bigint=195000 AND (b->>'rollSerial')::int=1,'accepted start begins full gameplay clock and exactly one roll');
 BEGIN PERFORM private.quintzee_v2_board_reduce(b,'start','{}',15001);RAISE EXCEPTION 'duplicate start changed game';EXCEPTION WHEN OTHERS THEN IF SQLERRM='duplicate start changed game' THEN RAISE;END IF;END;
 b:=b||'{"dice":[2,2,3,4,5],"potentials":{"chance":16},"rollsRemaining":0}'::jsonb;deadline:=(b->>'deadline')::bigint;
 BEGIN PERFORM private.quintzee_v2_board_reduce(b,'score','{0}',15001);RAISE EXCEPTION 'zero without confirmation accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM='zero without confirmation accepted' THEN RAISE;END IF;END;
 v:=private.quintzee_v2_board_reduce(b,'score_zero','{0}',15001);
 PERFORM pg_temp.quintzee_assert(v#>>'{scores,ones}'='0' AND v->>'phase'='playing' AND v->>'deadline'=b->>'deadline' AND (v->>'rollSerial')::int=2,'confirmed zero and next category keep same gameplay clock');
 s:=jsonb_build_object('core',jsonb_build_object('board',b));PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(s,15001)->>'action'='score','bot chooses positive visible scoring');
 b:=b||'{"potentials":{}}'::jsonb;s:=jsonb_build_object('core',jsonb_build_object('board',b));PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(s,15001)->>'action'='score_zero','bot can intentionally fill zero');
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT p.id,p.user_id INTO p_active,actor FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.quintzee_assert(before->>'phase'='ready' AND before#>>'{rules,version}'='quintzee/2','multiplayer admits new rules and waits');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);v:=public.quintzee_snapshot(d);
 PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'reconnect cannot extend ready deadline');
 req:=gen_random_uuid();v:=public.quintzee_action(d,req,rev,'start','{}');SELECT state,revision INTO after_s,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev-1,'start','{}');PERFORM pg_temp.quintzee_assert((SELECT state=after_s AND revision=rev FROM private.quintzee_matches WHERE dealer_game_id=d),'duplicate request rolls once');
 BEGIN PERFORM public.quintzee_action(d,gen_random_uuid(),rev-1,'score_zero','{0}');RAISE EXCEPTION 'stale confirmation accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:stale_revision' THEN RAISE;END IF;END;
 -- Fake human first-action expiry takes over through canonical flags; reclaim never restarts clock.
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT p.id,p.user_id INTO p_active,actor FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.quintzee_assert(before->>'phase'='playing' AND (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=p_active),'fake timeout commits canonical takeover and first roll');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_reclaim(d,rev);PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'reclaim cannot alter gameplay deadline/dice');
 -- Current /3 all-away admission and recovery; frozen /2 is exercised separately above.
 EXECUTE (SELECT source FROM q_configure);
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;
 EXECUTE replace((SELECT source FROM q_configure),'private.quintzee_v3_rules()','private.quintzee_v2_rules()');
 PERFORM pg_temp.quintzee_assert((SELECT state#>>'{rules,version}'='quintzee/3' FROM private.quintzee_matches WHERE dealer_game_id=d),'all-away fixture uses actual release version');
 SELECT (state->'players'->(state->>'turnIndex')::int->>'id')::uuid INTO p_active FROM private.quintzee_matches WHERE dealer_game_id=d;UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g AND id<>p_active;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT NOT is_paused FROM public.games WHERE id=g) AND (SELECT state->>'phase'='playing' AND state#>>'{core,board,rollSerial}'='1' FROM private.quintzee_matches WHERE dealer_game_id=d),'all-away timeout starts legal autoplay without pausing');

 -- Deliberate pause is honored, and reclaim while paused does not resume or renew.
 UPDATE public.games SET is_paused=true WHERE id=g;SELECT state,revision INTO before,rev FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d),'explicit pause freezes recovery');
 SELECT user_id INTO actor FROM public.players WHERE id=p_active;PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_reclaim(d,rev);
 PERFORM pg_temp.quintzee_assert((SELECT state=before FROM private.quintzee_matches WHERE dealer_game_id=d) AND (SELECT is_paused FROM public.games WHERE id=g),'paused reclaim preserves clock and explicit pause');
 UPDATE public.games SET is_paused=false WHERE id=g;UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
 -- Fixture result windows are accelerated; bot actions wait for the real scheduler with all triggers enabled.
 FOR i IN 1..150 LOOP
  EXIT WHEN (SELECT settlement IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d);
  SELECT state INTO before FROM private.quintzee_matches WHERE dealer_game_id=d;
  IF before->>'phase'='stage_complete' THEN UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))) WHERE dealer_game_id=d;END IF;
  PERFORM pg_temp.quintzee_assert((SELECT bot_due_at IS NULL OR bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000)::bigint<=2200 FROM private.quintzee_matches WHERE dealer_game_id=d),'autoplay scheduler deadline stays bounded');
  PERFORM pg_sleep(greatest(0,coalesce((SELECT (bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000)::bigint)/1000.0+0.02 FROM private.quintzee_matches WHERE dealer_game_id=d),0)));
  PERFORM private.quintzee_recover();
 END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT settlement IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d) AND (SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'all-away legal autoplay reaches canonical settlement');
 BEGIN PERFORM pg_temp.quintzee_fixture(2,false,'modern',true);RAISE EXCEPTION 'missing real money block';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'quintzee:fake_money_only' THEN RAISE;END IF;END;
 -- Solo admission freezes chosen cosmetic theme; missing Start expires unranked.
 u:=(f#>>'{users,0}')::uuid;UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 req:=gen_random_uuid();v:=public.arcade_quintzee_start(u,req,'modern');v_run:=(v->>'id')::uuid;v:=public.arcade_quintzee_step(u,v_run);before:=v;
 PERFORM pg_temp.quintzee_assert(v#>>'{projection,view,phase}'='ready' AND v#>>'{record,config,theme}'='modern','solo is blank with requested theme');
 v:=public.arcade_quintzee_start(u,req,'classic');PERFORM pg_temp.quintzee_assert(v#>>'{config,theme}'='modern','start retry cannot replace frozen theme');
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE id=v_run;
 v:=public.arcade_quintzee_step(u,v_run);PERFORM pg_temp.quintzee_assert(v#>>'{record,status}'='expired' AND NOT EXISTS(SELECT 1 FROM private.arcade_results WHERE run_id=v_run),'solo first-action expiry unranked');
END $$;
DO $$ DECLARE f jsonb;g uuid;d uuid;n integer;k integer;ids uuid[];totals jsonb;expected jsonb;i integer;BEGIN
 FOR n IN 2..4 LOOP FOR k IN 1..n LOOP
 f:=pg_temp.quintzee_fixture(n);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(f->'players');totals:='{}';FOR i IN 1..n LOOP totals:=totals||jsonb_build_object(ids[i]::text,CASE WHEN i<=k THEN 100 ELSE 0 END);END LOOP;
 expected:=private.split_whole_chips_clockwise(g,ids[1:k],(n-k)*5,n);UPDATE private.quintzee_matches SET state=state||jsonb_build_object('phase','complete','scores',totals) WHERE dealer_game_id=d;PERFORM private.quintzee_settle(d);PERFORM private.quintzee_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
 FOR i IN 1..n LOOP PERFORM pg_temp.quintzee_assert((SELECT chips=100+CASE WHEN i<=k THEN coalesce((expected->>ids[i]::text)::int,0) ELSE -5 END FROM public.players WHERE id=ids[i]),'v2 canonical winner/tie amounts');END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'v2 exactly-once result');SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;
END $$;

DO $$ DECLARE f jsonb;d uuid;BEGIN
 f:=pg_temp.quintzee_fixture(3,true);d:=(f->>'dealer')::uuid;
 PERFORM pg_temp.quintzee_assert((SELECT state->>'phase'='ready' AND bot_due_at IS NOT NULL FROM private.quintzee_matches WHERE dealer_game_id=d),'real bot ready turn is scheduled');
 PERFORM pg_temp.quintzee_assert((SELECT bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000)::bigint BETWEEN -1000 AND 2000 FROM private.quintzee_matches WHERE dealer_game_id=d),'bot schedule has a bounded natural deadline');
 PERFORM pg_sleep(greatest(0, (SELECT (bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000)::bigint)/1000.0+0.02 FROM private.quintzee_matches WHERE dealer_game_id=d)));
 PERFORM private.quintzee_recover();PERFORM pg_temp.quintzee_assert((SELECT state->>'phase'='playing' AND state#>>'{core,board,rollSerial}'='1' FROM private.quintzee_matches WHERE dealer_game_id=d),'real bot starts once through recovery');
END $$;

-- Admit a synthetic historical /1 fixture through its original rule selection, then restore /2 admission.
DO $$ DECLARE source text;f jsonb;d uuid;actor uuid;v jsonb;rev bigint;req uuid:=gen_random_uuid();saved jsonb;BEGIN
 source:=pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure);
 EXECUTE replace(source,'private.quintzee_v2_rules()','private.quintzee_v1_rules()');f:=pg_temp.quintzee_fixture(2);EXECUTE source;d:=(f->>'dealer')::uuid;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_reduce(state,'tick',NULL,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;
 SELECT p.user_id,m.revision INTO actor,rev FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE m.dealer_game_id=d;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM public.quintzee_action(d,req,rev,'roll','{}');SELECT state INTO saved FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev,'roll','{}');PERFORM pg_temp.quintzee_assert((SELECT state=saved AND state#>>'{rules,version}'='quintzee/1' FROM private.quintzee_matches WHERE dealer_game_id=d),'historical /1 action replay retains frozen behavior');
END $$;
DO $$ DECLARE b jsonb;v jsonb;BEGIN
 b:=private.quintzee_v2_board_start(private.quintzee_v2_rules(),1000)||'{"phase":"playing","scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}}'::jsonb;
 v:=private.quintzee_present_board(b);PERFORM pg_temp.quintzee_assert(v->>'baseScore'='98' AND v->>'upperBonusAwarded'='35' AND (v-'baseScore'-'upperBonusAwarded')=b,'projection uses frozen scoring and changes no authoritative board fields');
 b:=jsonb_set(b,'{scores,yahtzee}','50');v:=private.quintzee_present_board(b);PERFORM pg_temp.quintzee_assert(v->>'baseScore'='148' AND v->>'upperBonusAwarded'='35','Quintzee is the recorded 50, not another bonus award');
 b:=private.quintzee_v1_board_start(private.quintzee_v1_rules(),1000)||'{"phase":"playing","scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18}}'::jsonb;
 PERFORM pg_temp.quintzee_assert(private.quintzee_present_board(b)->>'baseScore'='98','historical version uses its own frozen scorer');
 PERFORM pg_temp.quintzee_assert(NOT has_function_privilege('authenticated','private.quintzee_present_board(jsonb)','execute'),'private scorer projection is not a public RPC');
END $$;

DO $$ BEGIN EXECUTE (SELECT source FROM q_configure);END $$;UPDATE private.arcade_rulesets SET enabled=(id='quintzee/3') WHERE game='quintzee';
DO $$ DECLARE b jsonb;v jsonb;old jsonb;event jsonb;due bigint;i integer;f jsonb;d uuid;u uuid;rev bigint;req uuid;g uuid; BEGIN
 b:=private.quintzee_v3_board_start(private.quintzee_v3_rules(),1000);
 PERFORM pg_temp.quintzee_assert(b->'dice'='[]' AND b->>'rollsRemaining'='3' AND b->>'deadline'='31000','v3 initial manual Start');
 b:=private.quintzee_v3_board_reduce(b,'start','{}',2000);due:=(b->>'deadline')::bigint;
 b:=b||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15},"dice":[6,6,6,1,2]}'::jsonb;
 v:=private.quintzee_v3_board_reduce(b,'score','{5}',3000);event:=v->'celebration';
 PERFORM pg_temp.quintzee_assert(v->'dice'='[]' AND v->'held'='[]' AND v->>'rollsRemaining'='3' AND v->'rollSerial'=b->'rollSerial','score clears dice, no automatic roll');
 PERFORM pg_temp.quintzee_assert(event->>'startedAt'='3000' AND event->>'countAt'='4500' AND event->>'endsAt'='5100' AND event->>'from'='45' AND event->>'to'='98' AND (v->>'deadline')::bigint=due+2100,'one bounded pause and exact server totals');
 PERFORM pg_temp.quintzee_assert(private.quintzee_v3_board_reduce(v,'tick',NULL,5000)=v,'tick does not extend celebration');
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'roll','{}',5000);RAISE EXCEPTION 'early roll accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:celebrating' THEN RAISE;END IF;END;
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'score_zero','{6}',5100);RAISE EXCEPTION 'prior dice scored again';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:invalid_dice' THEN RAISE;END IF;END;
 BEGIN PERFORM private.quintzee_v3_board_reduce(v,'roll','{0}',5100);RAISE EXCEPTION 'prior dice held';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'quintzee:roll' THEN RAISE;END IF;END;
 old:=v;v:=private.quintzee_v3_board_reduce(v,'roll','{}',5100);
 PERFORM pg_temp.quintzee_assert(v->>'rollsRemaining'='2' AND (v->>'rollSerial')::int=(old->>'rollSerial')::int+1 AND v->'deadline'=old->'deadline' AND NOT v?'celebration','manual roll consumes exactly one, does not extend deadline');
 v:=private.quintzee_v3_board_reduce(old,'tick',NULL,(old->>'deadline')::bigint);PERFORM pg_temp.quintzee_assert(v->>'phase'='stage_complete' AND v#>>'{result,reason}'='timeout','manual-wait gameplay expiry still finishes');
 -- Upper bonus on the final category preserves multiplier at scoring time and reserves the whole result window after celebration.
 b:=b||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"three_of_a_kind":0,"four_of_a_kind":0,"yahtzee":0,"full_house":0,"large_straight":0,"chance":0}}'::jsonb;
 v:=private.quintzee_v3_board_reduce(b,'score','{5}',3000);
 PERFORM pg_temp.quintzee_assert(v->>'phase'='stage_complete' AND v->>'deadline'='14100' AND v#>>'{celebration,to}'='133' AND v#>>'{result,remainingMs}'=(due-3000)::text AND v#>>'{result,completedAt}'='3000','final-category celebration does not inflate scoring multiplier');
 -- All category hands wait for explicit rolls under the same clock; no per-category ready grace.
 b:=private.quintzee_v3_board_reduce(private.quintzee_v3_board_start(private.quintzee_v3_rules(),1000),'start','{}',2000);
 FOR i IN 0..11 LOOP
 b:=b||'{"dice":[6,6,6,6,6]}'::jsonb;b:=private.quintzee_v3_board_reduce(b,CASE WHEN i=ANY(ARRAY[0,1,2,3,4,9,10]) THEN 'score_zero' ELSE 'score' END,ARRAY[i],3000+i*3000);
 IF i<11 THEN PERFORM pg_temp.quintzee_assert(b->>'phase'='playing' AND b->'dice'='[]' AND b->>'rollsRemaining'='3','every category waits');b:=private.quintzee_v3_board_reduce(b,'roll','{}',3001+i*3000);END IF;
 END LOOP;
 PERFORM pg_temp.quintzee_assert(b->>'phase'='stage_complete','all explicit hands finish');
 -- Actual multiplayer command receipts and all-away ownership.
 f:=pg_temp.quintzee_fixture(2);d:=(f->>'dealer')::uuid;g:=(f->>'game')::uuid;
 SELECT p.user_id,m.revision INTO u,rev FROM private.quintzee_matches m JOIN public.players p ON p.id=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid WHERE dealer_game_id=d;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);req:=gen_random_uuid();PERFORM public.quintzee_action(d,req,rev,'start','{}');
 SELECT state INTO old FROM private.quintzee_matches WHERE dealer_game_id=d;PERFORM public.quintzee_action(d,req,rev,'start','{}');PERFORM pg_temp.quintzee_assert((SELECT state=old FROM private.quintzee_matches WHERE dealer_game_id=d),'v3 duplicate Start once');
 UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(state,jsonb_set(state->'core','{board}',(state#>'{core,board}')||'{"scores":{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15},"dice":[6,6,6,1,2]}'::jsonb)) WHERE dealer_game_id=d;
 SELECT revision INTO rev FROM private.quintzee_matches WHERE dealer_game_id=d;req:=gen_random_uuid();PERFORM public.quintzee_action(d,req,rev,'score','{5}');SELECT state INTO old FROM private.quintzee_matches WHERE dealer_game_id=d;
 PERFORM public.quintzee_action(d,req,rev,'score','{5}');PERFORM public.quintzee_snapshot(d);PERFORM pg_temp.quintzee_assert((SELECT state=old FROM private.quintzee_matches WHERE dealer_game_id=d),'bonus replay/reconnect cannot extend pause or award twice');
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
 PERFORM pg_temp.quintzee_assert((SELECT bot_due_at>=(state#>>'{core,board,celebration,endsAt}')::bigint FROM private.quintzee_matches WHERE dealer_game_id=d),'all-away bot waits until fixed celebration boundary');
 PERFORM pg_temp.quintzee_assert(private.quintzee_bot_choice(old,(old#>>'{core,board,celebration,endsAt}')::bigint)->>'action'='roll','autoplay explicitly rolls fresh category');
 UPDATE public.games SET is_paused=true WHERE id=g;UPDATE public.games SET is_paused=false WHERE id=g;
 PERFORM pg_temp.quintzee_assert((SELECT (state#>>'{core,board,celebration,endsAt}')::bigint-(state#>>'{core,board,celebration,startedAt}')::bigint=2100 FROM private.quintzee_matches WHERE dealer_game_id=d),'explicit pause preserves bounded sequence duration');
END $$;
DO $$ DECLARE f jsonb;g uuid;d uuid;n integer;k integer;ids uuid[];totals jsonb;expected jsonb;i integer;BEGIN
 FOR n IN 2..4 LOOP FOR k IN 1..n LOOP
 f:=pg_temp.quintzee_fixture(n);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(f->'players');totals:='{}';FOR i IN 1..n LOOP totals:=totals||jsonb_build_object(ids[i]::text,CASE WHEN i<=k THEN 100 ELSE 0 END);END LOOP;
 expected:=private.split_whole_chips_clockwise(g,ids[1:k],(n-k)*5,n);UPDATE private.quintzee_matches SET state=state||jsonb_build_object('phase','complete','scores',totals) WHERE dealer_game_id=d;PERFORM private.quintzee_settle(d);PERFORM private.quintzee_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
 FOR i IN 1..n LOOP PERFORM pg_temp.quintzee_assert((SELECT chips=100+CASE WHEN i<=k THEN coalesce((expected->>ids[i]::text)::int,0) ELSE -5 END FROM public.players WHERE id=ids[i]),'v2 canonical winner/tie amounts');END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'v2 exactly-once result');SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;
END $$;

-- Rollback-only synthetic fixtures through actual browser and service roles.
DO $$ DECLARE f jsonb;g uuid;d uuid;u uuid;other_u uuid;real_g uuid:=gen_random_uuid();real_p uuid:=gen_random_uuid();offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;run_id uuid; BEGIN
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;u:=(f#>>'{users,0}')::uuid;other_u:=(f#>>'{users,1}')::uuid;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(real_g,'game_selection',true,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(real_p,real_g,u,2,100,false);
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 run_id:=(public.arcade_start(u,gen_random_uuid(),'quintzee')->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);SET LOCAL ROLE authenticated;
 v:=public.quintzee_snapshot(d);IF v->>'viewerId' IS DISTINCT FROM f#>>'{players,0}' THEN RAISE EXCEPTION 'authorized snapshot identity mismatch';END IF;
 BEGIN PERFORM public.quintzee_configure(real_g,real_p,2,'quintzee','{"ante_amount":5}',offer);RAISE EXCEPTION 'real admission was permitted';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'quintzee:fake_money_only' THEN RAISE;END IF;END;
 BEGIN PERFORM public.arcade_quintzee_step(u,run_id);RAISE EXCEPTION 'browser invoked service-only step';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM private.quintzee_settle(d);RAISE EXCEPTION 'browser invoked raw settlement';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM public.quintzee_snapshot(d);RAISE EXCEPTION 'unrelated snapshot permitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.quintzee_revisions WHERE dealer_game_id=d) THEN RAISE EXCEPTION 'unrelated revision leaked';END IF;
 RESET ROLE;SET LOCAL ROLE anon;
 BEGIN PERFORM public.quintzee_capabilities();RAISE EXCEPTION 'anonymous capability allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_quintzee_step(u,run_id);RAISE EXCEPTION 'anonymous step allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;SET LOCAL ROLE service_role;
 v:=public.arcade_quintzee_step(u,run_id);IF v#>>'{record,id}' IS DISTINCT FROM run_id::text THEN RAISE EXCEPTION 'service owner step failed';END IF;
 BEGIN PERFORM public.arcade_quintzee_step(other_u,run_id);RAISE EXCEPTION 'service wrong owner allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.arcade_quintzee_step(NULL,run_id,NULL,NULL,NULL,NULL,NULL,gen_random_uuid());RAISE EXCEPTION 'invalid recovery token allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 PERFORM pg_temp.quintzee_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=real_g),'real mode denial has no setup write');
END $$;
SELECT 'Quintzee actual role authorization and server real-money exclusion PASS' proof;

SELECT pg_temp.quintzee_assert(NOT EXISTS(SELECT 1 FROM q_installed_functions WHERE hash<>md5(pg_get_functiondef(oid))),'installed functions unchanged by qualification');SELECT 'Installed Quintzee /3 rollback and actual-role qualification PASS' proof,md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text)) authority_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND (p.proname LIKE '%quintzee%' OR p.proname IN('arcade_start','arcade_commit','megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'));ROLLBACK;