-- Rollback-only focused proof. All fixtures/configuration here are TEST ONLY.
CREATE TEMP TABLE cleanup_proof_ids(kind text PRIMARY KEY, id uuid);
CREATE FUNCTION pg_temp.cleanup_assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $f$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'cleanup_proof:%',label; END IF;
  RAISE NOTICE 'PASS %',label;
END $f$;
CREATE FUNCTION pg_temp.cleanup_identity(id uuid) RETURNS void
LANGUAGE plpgsql AS $f$ BEGIN
  PERFORM set_config('request.jwt.claim.sub',id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
END $f$;

DO $proof$ <<fixture>> DECLARE
  admin_id uuid:=gen_random_uuid(); peer_id uuid:=gen_random_uuid();
  game_id uuid:=gen_random_uuid(); dealer_id uuid:=gen_random_uuid(); round_id uuid:=gen_random_uuid();
  player_id uuid:=gen_random_uuid(); peer_player_id uuid:=gen_random_uuid();
  real_id uuid:=gen_random_uuid(); current_id uuid:=gen_random_uuid(); holm_id uuid:=gen_random_uuid();
  config jsonb:='{"version":1,"testOnly":true,"testLabel":"TEST ONLY: cleanup rollback proof","ante_amount":1,"targetScore":1000,"endgame":"equal_turns","turnSeconds":60,"botDelayMs":2000,"botPolicy":"balanced","botBankThreshold":500,"rules":{"version":1,"singles":{"1":100,"5":50},"ofAKind":{"3":[1000,200,300,400,500,600],"4":[1000,1000,1000,1000,1000,1000],"5":[2000,2000,2000,2000,2000,2000],"6":[3000,3000,3000,3000,3000,3000]},"straight":1500,"threePairs":1500,"twoTriplets":2500,"fourPlusPair":1500}}';
  result jsonb; bank_state jsonb; denied boolean; prior_claim text:='{"game":"00000000-0000-0000-0000-000000000001","operation":"cleanup"}';
BEGIN
  -- The public browser proof must assert the authoritative event name banked.
  bank_state:=private.farkle_new_state_v1(jsonb_build_array(player_id,peer_player_id),config,gen_random_uuid());
  bank_state:=bank_state||jsonb_build_object('stage','bank_or_roll','thisTurn',500);
  bank_state:=private.farkle_reduce_v1(bank_state,'bank','[]'::jsonb);
  PERFORM pg_temp.cleanup_assert(bank_state->'events' @> '[{"type":"banked"}]'::jsonb
    AND NOT bank_state->'events' @> '[{"type":"bank"}]'::jsonb,'banked event contract');
  INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at) VALUES
    (admin_id,'cleanup-admin-'||admin_id||'@test.invalid',jsonb_build_object('username','Cleanup Admin'),clock_timestamp()),
    (peer_id,'cleanup-peer-'||peer_id||'@test.invalid',jsonb_build_object('username','Cleanup Peer'),clock_timestamp());
  INSERT INTO public.profiles(id,username) VALUES(admin_id,'Cleanup Admin'),(peer_id,'Cleanup Peer') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.user_roles(user_id,role) VALUES(admin_id,'admin');
  UPDATE private.farkle_release SET creation_enabled=true,admin_only=true WHERE singleton;
  PERFORM pg_temp.cleanup_identity(admin_id);
  INSERT INTO public.games(id,name,status,current_host,real_money,ante_amount,pot)
    VALUES(game_id,'TEST ONLY: cleanup proof','game_selection',admin_id,false,1,0),
          (real_id,'TEST ONLY: real Farkle guard','waiting',admin_id,true,1,0),
          (current_id,'TEST ONLY: current Farkle setup','configuring',admin_id,false,1,0),
          (holm_id,'TEST ONLY: other-game blast','waiting',admin_id,false,1,0);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,is_bot) VALUES
    (player_id,game_id,admin_id,1,100,'active',false,false),
    (peer_player_id,game_id,peer_id,3,100,'active',false,false);
  PERFORM private.farkle_claim_v1(game_id,NULL,NULL,'configure');
  INSERT INTO public.dealer_games(id,session_id,game_type,dealer_user_id,config)
    VALUES(dealer_id,game_id,'farkle',admin_id,config);
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
    VALUES(round_id,game_id,dealer_id,1,1,0,'completed',0);
  INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
    VALUES(round_id,1,dealer_id,player_id,'[{"type":"terminal_result"}]','{"gamePhase":"complete"}',md5(config::text));
  INSERT INTO private.farkle_action_receipts(round_id,request_id,actor_id,request,response)
    VALUES(round_id,gen_random_uuid(),player_id,'{"action":"bank"}','{"outcome":"applied"}');
  INSERT INTO public.game_results(game_id,dealer_game_id,game_type,hand_number,pot_won,winner_player_id,winner_username,settlement_key)
    VALUES(game_id,dealer_id,'farkle',1,0,player_id,'Cleanup Admin','farkle_terminal');
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
    VALUES(game_id,dealer_id,1,player_id,admin_id,'Cleanup Admin',100,false);
  INSERT INTO private.game_timer_registry(game_id,timer_kind,identity_key,owner_task,dealer_game_id,round_id,due_at)
    VALUES(game_id,'farkle_turn','cleanup-proof','TEST ONLY cleanup proof',dealer_id,round_id,clock_timestamp()+interval '1 hour');
  PERFORM set_config('app.farkle_authority','',true);
  -- A real-money Farkle target is rejected before any cleanup claim is acquired.
  PERFORM private.farkle_claim_v1(real_id,NULL,NULL,'configure');
  UPDATE public.games SET game_type='farkle' WHERE id=real_id;
  PERFORM private.farkle_claim_v1(current_id,NULL,NULL,'configure');
  UPDATE public.games SET game_type='farkle' WHERE id=current_id;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.cleanup_identity(peer_id);
  denied:=false; BEGIN PERFORM public.admin_blast_fake_money_game(game_id);
    EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='not authorized'; END;
  PERFORM pg_temp.cleanup_assert(denied AND EXISTS(SELECT 1 FROM public.games WHERE id=game_id),'non-admin denied');
  PERFORM pg_temp.cleanup_identity(admin_id);
  denied:=false; BEGIN PERFORM public.admin_blast_fake_money_game(real_id);
    EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='only fake-money games can be blasted'; END;
  PERFORM pg_temp.cleanup_assert(denied AND EXISTS(SELECT 1 FROM public.games WHERE id=real_id),'real-money Farkle denied');
  PERFORM set_config('app.farkle_authority',prior_claim,true);
  result:=public.admin_blast_fake_money_game(game_id);
  PERFORM pg_temp.cleanup_assert(result->>'outcome'='deleted','admin Farkle RPC deletes');
  PERFORM pg_temp.cleanup_assert(current_setting('app.farkle_authority',true)=prior_claim,'prior claim restored');
  PERFORM pg_temp.cleanup_assert(
    NOT EXISTS(SELECT 1 FROM public.games WHERE id=game_id)
    AND NOT EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=fixture.game_id)
    AND NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=dealer_id)
    AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=round_id)
    AND NOT EXISTS(SELECT 1 FROM public.game_results gr WHERE gr.game_id=fixture.game_id)
    AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots s WHERE s.game_id=fixture.game_id)
    AND NOT EXISTS(SELECT 1 FROM private.farkle_events e WHERE e.round_id=fixture.round_id)
    AND NOT EXISTS(SELECT 1 FROM private.farkle_action_receipts r WHERE r.round_id=fixture.round_id)
    AND NOT EXISTS(SELECT 1 FROM private.game_timer_registry t WHERE t.game_id=fixture.game_id),
    'session-owned graph cascaded');
  result:=public.admin_blast_fake_money_game(game_id);
  PERFORM pg_temp.cleanup_assert(result->>'outcome'='already-deleted','duplicate blast harmless');
  result:=public.admin_blast_fake_money_game(current_id);
  PERFORM pg_temp.cleanup_assert(result->>'outcome'='deleted' AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=current_id),'current Farkle setup blast');
  denied:=false; BEGIN DELETE FROM public.games WHERE id=real_id;
    EXCEPTION WHEN insufficient_privilege THEN denied:=SQLERRM='farkle:authority_claim_required'; END;
  PERFORM pg_temp.cleanup_assert(denied AND EXISTS(SELECT 1 FROM public.games WHERE id=real_id),'claim cannot leak to other Farkle game');
  PERFORM set_config('app.farkle_authority','',true);
  result:=public.admin_blast_fake_money_game(holm_id);
  PERFORM pg_temp.cleanup_assert(result->>'outcome'='deleted' AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=holm_id),'other-game blast unchanged');
  PERFORM pg_temp.cleanup_assert(coalesce(current_setting('app.farkle_authority',true),'')='','other-game blast does not mint claim');
  PERFORM pg_temp.cleanup_assert(NOT has_function_privilege('authenticated','private.farkle_claim_v1(uuid,uuid,uuid,text)'::regprocedure,'EXECUTE'),'client cannot mint claim');
END $proof$;
