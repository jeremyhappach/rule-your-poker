BEGIN ISOLATION LEVEL REPEATABLE READ;
-- Scoped installed-authority qualification. No admission/configuration changes.
-- Fixtures are seeded as already admitted; this does NOT prove fresh admission.
-- Actual commands, canonical settlement, triggers and role checks remain installed.
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE q_installed_functions AS SELECT p.oid,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND (p.proname LIKE '%quintzee%' OR p.proname IN('arcade_start','arcade_commit','megatouch_begin'));
CREATE TEMP TABLE q_settings AS SELECT jsonb_build_object('release',(SELECT to_jsonb(r) FROM private.quintzee_release r LIMIT 1),'rulesets',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM private.arcade_rulesets r WHERE game='quintzee'),'recovery',(SELECT to_jsonb(r) FROM private.arcade_recovery_state r LIMIT 1)) value;
CREATE TEMP TABLE q_fixture_users(id uuid PRIMARY KEY);
CREATE FUNCTION pg_temp.quintzee_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Quintzee scoped proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.quintzee_fixture(n integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE g uuid:=gen_random_uuid();d uuid:=gen_random_uuid();r uuid:=gen_random_uuid();u uuid[]:='{}';p uuid[]:='{}';i integer;people jsonb;s jsonb;
BEGIN
 FOR i IN 1..n LOOP
  u:=array_append(u,gen_random_uuid());p:=array_append(p,gen_random_uuid());
  INSERT INTO auth.users(id) VALUES(u[i]);INSERT INTO q_fixture_users VALUES(u[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Quintzee scoped proof '||u[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 INSERT INTO public.games(id,status,game_type,real_money,dealer_position,pot,is_paused,pending_session_end,current_game_uuid,ante_amount,current_round,total_hands)
 VALUES(g,'in_progress','quintzee',false,n,0,false,false,d,5,1,1);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,ante_decision) SELECT p[j],g,u[j],n+1-j,100,false,'ante_up' FROM generate_series(1,n) j;
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config) VALUES(d,g,u[1],'quintzee',jsonb_build_object('ante_amount',5,'rules',private.quintzee_v3_rules(),'theme','modern'));
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g,d,1,1,0,'betting',0);
 SELECT jsonb_agg(jsonb_build_object('id',p1.id,'userId',p1.user_id,'name',pr.username,'seat',p1.position,'isBot',false,'kind','human','chips',p1.chips) ORDER BY p1.position DESC) INTO people FROM public.players p1 JOIN public.profiles pr ON pr.id=p1.user_id WHERE p1.game_id=g;
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',g,'dealerGameId',d,'roundId',r),'players',people,'rules',private.quintzee_v3_rules(),'theme','modern','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
 s:=private.quintzee_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.quintzee_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(d,g,r,s,5);
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 RETURN jsonb_build_object('game',g,'dealer',d,'users',to_jsonb(u),'players',to_jsonb(p));
END $$;
CREATE FUNCTION pg_temp.quintzee_arcade_fixture(u uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid;BEGIN
 INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(u,'quintzee','quintzee/3',private.quintzee_v3_rules()||'{"theme":"modern"}'::jsonb,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) RETURNING id INTO r;
 INSERT INTO public.arcade_revisions VALUES(r,u,0);RETURN r;
END $$;
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
 FOR i IN 1..n LOOP PERFORM pg_temp.quintzee_assert((SELECT chips=100+CASE WHEN i<=k THEN coalesce((expected->>ids[i]::text)::int,0) ELSE -5 END FROM public.players WHERE id=ids[i]),'v3 canonical winner/tie amounts');END LOOP;
 PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'v3 exactly-once result');
 PERFORM pg_temp.quintzee_assert((SELECT sum(chips)=n*100 FROM public.players WHERE game_id=g),'canonical chip conservation');
 PERFORM pg_temp.quintzee_assert((SELECT count(*)=n FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=d),'final snapshot balances');
 IF k<n THEN PERFORM pg_temp.quintzee_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'balanced canonical transfer batch');END IF;SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;
END $$;

-- Rollback-only synthetic fixtures through actual browser and service roles.
DO $$ DECLARE f jsonb;g uuid;d uuid;u uuid;other_u uuid;real_g uuid:=gen_random_uuid();real_p uuid:=gen_random_uuid();offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;run_id uuid; BEGIN
 f:=pg_temp.quintzee_fixture(2);g:=(f->>'game')::uuid;d:=(f->>'dealer')::uuid;u:=(f#>>'{users,0}')::uuid;other_u:=(f#>>'{users,1}')::uuid;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(real_g,'game_selection',true,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(real_p,real_g,u,2,100,false);
 run_id:=pg_temp.quintzee_arcade_fixture(u);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);SET LOCAL ROLE authenticated;
 v:=public.quintzee_snapshot(d);IF v->>'viewerId' IS DISTINCT FROM f#>>'{players,0}' THEN RAISE EXCEPTION 'authorized snapshot identity mismatch';END IF;
 PERFORM public.quintzee_action(d,gen_random_uuid(),(v->>'revision')::bigint,'start','{}');
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
 PERFORM pg_temp.quintzee_assert((SELECT state#>>'{core,board,rollSerial}'='1' FROM private.quintzee_matches WHERE dealer_game_id=d),'authenticated caller executes installed Start');
 PERFORM pg_temp.quintzee_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=real_g),'real mode denial has no setup write');
END $$;
SELECT 'Quintzee actual role authorization and server real-money exclusion PASS' proof;


SELECT pg_temp.quintzee_assert(NOT EXISTS(SELECT 1 FROM q_installed_functions WHERE hash<>md5(pg_get_functiondef(oid))),'installed functions unchanged');
SELECT pg_temp.quintzee_assert((SELECT value FROM q_settings)=jsonb_build_object('release',(SELECT to_jsonb(r) FROM private.quintzee_release r LIMIT 1),'rulesets',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM private.arcade_rulesets r WHERE game='quintzee'),'recovery',(SELECT to_jsonb(r) FROM private.arcade_recovery_state r LIMIT 1)),'global admission/configuration/recovery unchanged');
SELECT 'Scoped installed Quintzee /3 qualification PASS' proof, (SELECT jsonb_agg(id) FROM q_fixture_users) fixture_users, md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text)) authority_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND (p.proname LIKE '%quintzee%' OR p.proname IN('arcade_start','arcade_commit','megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'));
ROLLBACK;
