-- Caller wraps candidate + this proof + recovery twice in BEGIN/ROLLBACK.
-- Every numeric rule in this file is TEST ONLY, not a production recommendation.
CREATE TEMP TABLE farkle_proof_log(case_name text PRIMARY KEY);
CREATE FUNCTION pg_temp.farkle_identity(id uuid) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',id::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
END $p$;
CREATE FUNCTION pg_temp.farkle_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $p$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'farkle_proof:%',label; END IF;
 INSERT INTO farkle_proof_log VALUES(label); END $p$;
CREATE TEMP TABLE farkle_test_config(config jsonb);
INSERT INTO farkle_test_config VALUES ('{"version":1,"testOnly":true,"testLabel":"TEST ONLY: authority proof; NOT APPROVED PRODUCTION RULES","ante_amount":7,"targetScore":1000,"endgame":"immediate","turnSeconds":30,"botDelayMs":1000,"botPolicy":"balanced","botBankThreshold":100,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[2000,2000,2000,2000,2000,2000],"5":[3000,3000,3000,3000,3000,3000],"6":[4000,4000,4000,4000,4000,4000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}');

DO $proof$ DECLARE c jsonb; rules jsonb; s jsonb; original jsonb; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); ids jsonb; denied boolean; mode text;
BEGIN
 SELECT config INTO c FROM farkle_test_config; rules:=c->'rules'; ids:=jsonb_build_array(a,b,d);
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1],rules)=1000,'selected triple only');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],rules)=2000,'best four interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1],jsonb_set(rules,'{ofAKind,4,0}','1000'))=1100,'triple plus single beats four kind');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,1,1,1,1,1],rules)=4000,'best six interpretation');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2,3,4,5,6],rules)=1500,'straight');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,3,3,4,4],rules)=1500,'three pairs');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,3,3,3],rules)=2500,'two triplets');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[2,2,2,2,3,3],rules)=1500,'four plus pair');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,5],rules)=150,'independent scoring partition');
 PERFORM pg_temp.farkle_assert(private.farkle_score_v1(ARRAY[1,2],rules)=0,'every selected die must score');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,2,3,4,6,2]);
 s:=private.farkle_reduce_v1(s,'hold','[0]');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,1,2,3,4]);
 denied:=false; BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[0,1,2]');
 EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:non_scoring_selection'; END;
 PERFORM pg_temp.farkle_assert(denied,'previous roll indexes cannot join a later hold');
 s:=private.farkle_reduce_v1(s,'hold','[1,2]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='300','ones across rolls cannot become a triple');
 s:=private.farkle_new_state_v1(ids,c,gen_random_uuid());
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'stage'='hold','roll does not commit scoring');
 s:=private.farkle_reduce_v1(s,'hold','[0,1]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='150' AND s->'available'='[2,3,4,5]'::jsonb,'partial hold');
 denied:=false;BEGIN PERFORM private.farkle_reduce_v1(s,'hold','[2]'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:illegal_hold'; END;
 PERFORM pg_temp.farkle_assert(denied,'one hold per roll');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,2,2,2]);
 s:=private.farkle_reduce_v1(s,'hold','[2,3,4,5]');
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='2150' AND s->>'scoringCycle'='2' AND s->'available'='[0,1,2,3,4,5]'::jsonb,'hot dice across rolls');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'thisTurn'='0' AND s->>'currentTurnPlayerId'=b::text AND s->'playerStates'->a::text->>'completedTurns'='1'
 AND s->'playerStates'->a::text->>'banked'='0','farkle loses whole accumulated turn only');
 FOREACH mode IN ARRAY ARRAY['immediate','equal_turns','one_last_turn'] LOOP
  s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame',mode),gen_random_uuid());
  s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
  s:=private.farkle_reduce_v1(s,'bank','[]');
  IF mode='immediate' THEN PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text,'immediate terminal');
  ELSE
   PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(b,d),'final queue '||mode);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
   PERFORM pg_temp.farkle_assert(s->>'gamePhase'='complete' AND s->>'winnerPlayerId'=a::text
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(s->'playerStates') WHERE value->>'completedTurns'<>'1'),'exact final counts '||mode);
  END IF;
 END LOOP;
 -- Trigger in the middle of a cycle. Last-turn queue wraps past the dealer,
 -- excludes the trigger and is not restarted by later target-reaching BANKs.
 s:=private.farkle_new_state_v1(ids,c||jsonb_build_object('endgame','one_last_turn'),gen_random_uuid());
 s:=jsonb_set(s,ARRAY['playerStates',a::text,'completedTurns'],'1');
 s:=s||jsonb_build_object('currentTurnPlayerId',b,'stage','bank_or_roll','thisTurn',1000);
 s:=private.farkle_reduce_v1(s,'bank','[]');
 PERFORM pg_temp.farkle_assert(s->'finalQueue'=jsonb_build_array(d,a),'one last turn clockwise wrap');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='1' AND s->'eligible'=jsonb_build_array(a,b)
  AND s->'playerStates'->a::text->>'completedTurns'='2' AND s->'playerStates'->b::text->>'completedTurns'='1','equal tiebreak exact lifetime counts');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'tiebreakTurn'='2' AND s->'finalQueue'=jsonb_build_array(a,b),'repeat equal tiebreak cycle');
 s:=private.farkle_reduce_v1(s||jsonb_build_object('stage','bank_or_roll','thisTurn',100),'bank','[]');
 PERFORM pg_temp.farkle_assert(s->>'gamePhase'='playing' AND s->>'currentTurnPlayerId'=b::text,'tiebreak leader cannot finish early');
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[2,3,4,6,2,3]);
 PERFORM pg_temp.farkle_assert(s->>'winnerPlayerId'=a::text AND s->'playerStates'->d::text->>'completedTurns'='1','tiebreak winner excludes prior nonleaders');
END $proof$;

DO $proof$ DECLARE admin_id uuid; other_id uuid; fixture_game_id uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; before_state jsonb; answer jsonb; replay jsonb; req uuid; bank_req uuid;
 denied boolean; intent bigint; version bigint; first_actor uuid; actor_user uuid; cash jsonb; after_cash jsonb; cfg_deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO other_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 IF admin_id IS NULL OR other_id IS NULL THEN RAISE EXCEPTION 'farkle_proof:requires_admin_and_peer'; END IF;
 PERFORM pg_temp.farkle_identity(admin_id);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true); PERFORM set_config('request.jwt.claim.role','authenticated',true);
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 INSERT INTO public.games(id,name,status,game_type,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(fixture_game_id,'TEST ONLY: Farkle rollback proof','game_selection',NULL,admin_id,1,false,cfg_deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
 (a,fixture_game_id,admin_id,1,100,'active',false,false),(b,fixture_game_id,other_id,3,100,'active',false,false);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:creation_disabled'; END;
 PERFORM pg_temp.farkle_assert(denied,'creation disabled before client release');
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 PERFORM pg_temp.farkle_identity(other_id);
 UPDATE public.games SET dealer_position=3 WHERE id=fixture_game_id;
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,b,3,'farkle',input,cfg_deadline); EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'farkle:admin_only' THEN RAISE; END IF; denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'nonadmin direct setup rejected');
 UPDATE public.games SET dealer_position=1 WHERE id=fixture_game_id;
 PERFORM pg_temp.farkle_identity(admin_id);
 denied:=false;BEGIN PERFORM public.configure_dealer_game(fixture_game_id,a,1,'farkle',input-'testConfiguration',cfg_deadline); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:production_defaults_unapproved'; END;
 PERFORM pg_temp.farkle_assert(denied,'unapproved defaults never resolve');
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline); dg:=(answer->'dealer_game'->>'id')::uuid;
 answer:=public.configure_dealer_game(fixture_game_id,a,1,'farkle',input,cfg_deadline);
 PERFORM pg_temp.farkle_assert(answer->>'deduped'='true','idempotent configuration');
 denied:=false;BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{rules,singles,1}','999') WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'frozen rules cannot change');
 denied:=false;BEGIN UPDATE public.dealer_games SET game_type='horses' WHERE id=dg; EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:frozen_config_immutable'; END;
 PERFORM pg_temp.farkle_assert(denied,'game type cannot bypass immutable rules');
 SELECT * INTO g FROM public.games WHERE id=fixture_game_id;
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure'); -- trusted synthetic fixture writes only
 PERFORM pg_temp.farkle_assert(private.farkle_resolve_config_v1(g,jsonb_build_object('ante_amount',7,'runBackDealerGameId',dg))=(SELECT config FROM public.dealer_games WHERE id=dg),'run back uses exact frozen snapshot');
 UPDATE public.players SET ante_decision='ante_up' WHERE game_id=g.id;
 answer:=private.advance_ante_phase_exact(g.id,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM public.increment_player_chips(b,1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic increment definer cannot move Farkle chips');
 denied:=false; BEGIN PERFORM public.decrement_player_chips(ARRAY[b],1); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
 PERFORM pg_temp.farkle_assert(denied,'generic decrement definer cannot move Farkle chips');
 denied:=false; BEGIN UPDATE public.rounds SET farkle_state=NULL WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot clear Farkle state');
 denied:=false; BEGIN UPDATE public.games SET game_type='horses' WHERE id=g.id; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'owner role without claim cannot switch Farkle game');
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,a) AND s->>'currentTurnPlayerId'=b::text,'left of dealer across empty seat');
 PERFORM pg_temp.farkle_assert((SELECT sum(chips) FROM public.players WHERE game_id=g.id)=200 AND (SELECT pot FROM public.games WHERE id=g.id)=0,'no chip ante for fixed stake');
 PERFORM pg_temp.farkle_identity(other_id);
 req:=gen_random_uuid(); answer:=public.farkle_apply_action(rd,b,'roll',0,req);
 replay:=public.farkle_apply_action(rd,b,'roll',0,req);
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','action authority claim cannot leak to next RPC');
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND replay->>'deduped'='true' AND answer->'state'=replay->'state','duplicate roll never rerolls');
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'bank',0,req); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:replay_payload_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'request id payload binding');
 PERFORM pg_temp.farkle_assert(public.farkle_apply_action(rd,b,'roll',0,gen_random_uuid())->>'outcome'='stale_action','stale sequence rejected');
 PERFORM pg_temp.farkle_identity(gen_random_uuid());
 denied:=false;BEGIN PERFORM public.farkle_apply_action(rd,b,'roll',1,gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'outsider cannot act');
 -- Fresh deterministic authority fixture state, not client-supplied randomness.
 PERFORM private.farkle_claim_v1(g.id,dg,NULL,'configure');
 s:=private.farkle_new_state_v1(jsonb_build_array(b,a),c,rd);
 s:=private.farkle_reduce_v1(s,'roll','[]',ARRAY[1,5,2,3,4,4]);
 s:=s||jsonb_build_object('actionSequence',10,'turnDeadline',clock_timestamp()-interval '1 second');
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET real_money=true WHERE id=g.id;
 before_state:=s; answer:=private.farkle_advance_due_v1(rd);
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT is_paused FROM public.games WHERE id=g.id) AND (s-'turnDeadline')=(before_state-'turnDeadline')
 AND NOT (SELECT auto_fold FROM public.players WHERE id=b),'real timeout pauses without scoring decisions');
 SELECT pause_version INTO version FROM public.games WHERE id=g.id;
 PERFORM pg_temp.farkle_identity(admin_id);
 answer:=public.set_game_paused(g.id,false,dg,version);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='resumed' AND (SELECT (farkle_state->>'turnDeadline')::timestamptz>clock_timestamp() FROM public.rounds WHERE id=rd),'resume gives human decision window');
 UPDATE public.games SET real_money=false WHERE id=g.id;
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=b)
 AND answer->'state'->>'stage'='bank_or_roll','fake timeout uses authoritative hold path');
 PERFORM pg_temp.farkle_identity(other_id);
 SELECT intent_version INTO intent FROM public.players WHERE id=b;
 answer:=public.set_automatic_play(g.id,rd,dg,b,intent,false);
 PERFORM pg_temp.farkle_assert(answer->>'deferred'='true' AND (SELECT auto_fold AND auto_play_stop_round_id=rd AND NOT sit_out_next_hand FROM public.players WHERE id=b),'active turn reclaim is persisted and deferred');
 PERFORM public.read_session_frame(g.id);
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'reconnect does not reclaim');
 -- Shared resume writes Horses columns too: it must not consume Farkle's request.
 UPDATE public.rounds SET horses_state=horses_state WHERE id=rd;
 PERFORM pg_temp.farkle_assert((SELECT auto_fold AND auto_play_stop_round_id=rd FROM public.players WHERE id=b),'shared consume respects active Farkle turn');
 UPDATE public.rounds SET farkle_state=jsonb_set(farkle_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE id=rd;
 answer:=private.farkle_advance_due_v1(rd);
 PERFORM pg_temp.farkle_assert(answer->>'outcome'='applied' AND answer->'state'->>'currentTurnPlayerId'=a::text
 AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=b),'bank completes deferred reclaim');
 SELECT farkle_state INTO s FROM public.rounds WHERE id=rd;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 PERFORM pg_temp.farkle_identity(admin_id);
 bank_req:=gen_random_uuid();answer:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 SELECT jsonb_object_agg(id,chips) INTO cash FROM public.players WHERE game_id=g.id;
 PERFORM pg_temp.farkle_assert(cash->>a::text='107' AND cash->>b::text='93' AND (SELECT count(*) FROM public.game_results WHERE dealer_game_id=dg AND settlement_key='farkle_terminal')=1,'fixed stake winner paid once');
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND replay->'settlement'=answer->'settlement','terminal action replay receipt');
 PERFORM private.farkle_settle_v1(rd);
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'settlement replay cannot move chips');
 PERFORM pg_temp.farkle_assert((SELECT count(*) FROM public.session_player_snapshots WHERE dealer_game_id=dg)=2
 AND (SELECT status FROM public.rounds WHERE id=rd)='completed' AND (SELECT status FROM public.games WHERE id=g.id)='game_over','terminal snapshots and lifecycle');
 replay:=public.farkle_read_replay(rd);
 PERFORM pg_temp.farkle_assert(replay->'config'=(SELECT config FROM public.dealer_games WHERE id=dg)
 AND jsonb_array_length(replay->'events')>=4,'semantic replay retains frozen rules and events');
 UPDATE public.games SET game_type='yahtzee',status='game_selection',current_game_uuid=NULL WHERE id=g.id;
 replay:=public.farkle_apply_action(rd,a,'bank',(s->>'actionSequence')::bigint,bank_req);
 PERFORM pg_temp.farkle_assert(replay->>'deduped'='true' AND (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g.id)=cash,'late replay after game transition');
 PERFORM pg_temp.farkle_assert(NOT has_function_privilege('authenticated','private.farkle_reduce_v1(jsonb,text,jsonb,integer[])','EXECUTE'),'private authority not publicly executable');
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
END $proof$;
