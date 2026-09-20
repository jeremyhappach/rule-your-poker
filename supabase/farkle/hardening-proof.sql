-- Synthetic fixtures only; this entire file runs inside the outer rollback.
CREATE FUNCTION pg_temp.farkle_generic_definer(target_game uuid,target_round uuid,target_player uuid,target_dealer uuid,kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $p$
BEGIN
 CASE kind
 WHEN 'game' THEN UPDATE public.games SET pot=pot+1 WHERE id=target_game;
 WHEN 'round' THEN UPDATE public.rounds SET farkle_state=NULL WHERE id=target_round;
 WHEN 'round_insert' THEN INSERT INTO public.rounds(game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(target_game,2,2,0,'betting',0);
 WHEN 'player' THEN UPDATE public.players SET chips=chips+1 WHERE id=target_player;
 WHEN 'delete_player' THEN DELETE FROM public.players WHERE id=target_player;
 WHEN 'delete_game' THEN DELETE FROM public.games WHERE id=target_game;
 WHEN 'result' THEN INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,pot_won) VALUES(target_game,target_dealer,1,'farkle',target_player,99);
 WHEN 'snapshot' THEN INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
 SELECT target_game,target_dealer,1,id,user_id,'TEST ONLY',999,is_bot FROM public.players WHERE id=target_player;
 END CASE;
END $p$;
DO $proof$
DECLARE admin_id uuid; peer_id uuid; bot_user uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bot uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; s jsonb; ans jsonb; denied boolean; intent bigint; deadline timestamptz; kind text;
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 SELECT id INTO bot_user FROM public.profiles WHERE id NOT IN (admin_id,peer_id) ORDER BY id LIMIT 1;
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(admin_id);
 UPDATE private.farkle_release SET creation_enabled=true,admin_only=false WHERE singleton;
 deadline:=clock_timestamp()+interval '15 minutes';
 INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: Farkle hardening','game_selection',admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false),(b,gid,peer_id,3,100,'active',false),(bot,gid,bot_user,5,100,'active',true);
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_identity(peer_id);
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'test configuration stays admin only with public release gate');
 UPDATE public.games SET dealer_position=3 WHERE id=gid;
 denied:=false; BEGIN PERFORM public.configure_dealer_game(gid,b,3,'farkle',input,deadline); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:test_config_admin_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'public dealer RPC rejects nonadmin test scoring after release gate opens');
 UPDATE public.games SET dealer_position=4 WHERE id=gid;
 PERFORM pg_temp.farkle_identity(admin_id);
 g.real_money:=true;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,input); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:test_rules_fake_money_only'; END;
 PERFORM pg_temp.farkle_assert(denied,'real money rejects test scoring');
 g.real_money:=false;
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"aggressive"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented aggressive policy rejected');
 denied:=false; BEGIN PERFORM private.farkle_resolve_config_v1(g,jsonb_set(input,'{testConfiguration,botPolicy}','"conservative"')); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle:unsupported_bot_policy'; END;
 PERFORM pg_temp.farkle_assert(denied,'unimplemented conservative policy rejected');
 ans:=public.configure_dealer_game(gid,a,4,'farkle',input,deadline); dg:=(ans->'dealer_game'->>'id')::uuid;
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','configuration claim restored after return');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET ante_decision='ante_up',sitting_out=false WHERE game_id=gid;
 UPDATE public.players SET auto_fold=true WHERE id=b;
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM private.advance_ante_phase_exact(gid,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id,farkle_state INTO rd,s FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM pg_temp.farkle_assert(s->'turnOrder'=jsonb_build_array(b,bot,a),'middle dealer lower occupied seats clockwise with gaps 3 5 4');
 PERFORM pg_temp.farkle_assert((s->>'turnDeadline')::timestamptz BETWEEN clock_timestamp()-interval '1 second' AND clock_timestamp()+interval '2 seconds','initial bot policy deadline uses bot delay');
 -- RECOVERY_ACTIVE_CASE
 PERFORM set_config('app.farkle_authority','',true);
 FOREACH kind IN ARRAY ARRAY['game','round','round_insert','player','delete_player','delete_game','result','snapshot'] LOOP
  denied:=false; BEGIN PERFORM pg_temp.farkle_generic_definer(gid,rd,b,dg,kind); EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
  PERFORM pg_temp.farkle_assert(denied,'future generic definer rejected for '||kind);
 END LOOP;
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=true WHERE id=a;
 SELECT intent_version INTO intent FROM public.players WHERE id=a;
 ans:=public.set_automatic_play(gid,rd,dg,a,intent,false);
 PERFORM pg_temp.farkle_assert(ans->>'deferred'='false' AND (SELECT NOT auto_fold AND auto_play_stop_round_id IS NULL FROM public.players WHERE id=a),'out of turn reclaim is immediate');
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',gen_random_uuid(),'operation','action')::text,true);
 denied:=false; BEGIN UPDATE public.rounds SET pot=1 WHERE id=rd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'wrong game authority claim cannot mutate round');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET auto_fold=false WHERE id=b;
 s:=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000);
 UPDATE public.rounds SET farkle_state=s WHERE id=rd;
 UPDATE public.games SET pending_session_end=true WHERE id=gid;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(peer_id);
 ans:=public.farkle_apply_action(rd,b,'bank',0,gen_random_uuid());
 PERFORM pg_temp.farkle_assert(ans->'settlement'->>'terminal_disposition'='session_ended'
 AND (SELECT status='session_ended' AND NOT pending_session_end AND session_ended_at IS NOT NULL FROM public.games WHERE id=gid)
 AND (SELECT sum(chips)=300 FROM public.players WHERE game_id=gid),'pending session end settles once and conserves chips');
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'cleanup');
 DELETE FROM public.games WHERE id=gid;
 PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=gid)
 AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=gid)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_events WHERE round_id=rd)
 AND NOT EXISTS(SELECT 1 FROM private.farkle_action_receipts WHERE round_id=rd),'fixture cascade removes configuration actions events and receipts');
 PERFORM set_config('app.farkle_authority','',true);
 UPDATE private.farkle_release SET creation_enabled=false,admin_only=true WHERE singleton;
END $proof$;
