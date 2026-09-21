-- Runs only inside the outer rollback; every fixture uses labeled TEST ONLY rules.
CREATE TEMP TABLE farkle_postgame_history_fixture(game_id uuid,round_id uuid,dealer_game_id uuid);
CREATE FUNCTION pg_temp.farkle_postgame_fixture() RETURNS jsonb LANGUAGE plpgsql AS $p$
DECLARE admin_id uuid; peer_id uuid; bot_user uuid; gid uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); bot uuid:=gen_random_uuid();
 c jsonb; input jsonb; g public.games; dg uuid; rd uuid; ans jsonb; deadline timestamptz:=clock_timestamp()+interval '15 minutes';
BEGIN
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1;
 SELECT id INTO peer_id FROM public.profiles WHERE id<>admin_id AND NOT public.has_role(id,'admin'::public.app_role) ORDER BY id LIMIT 1;
 SELECT id INTO bot_user FROM public.profiles WHERE id NOT IN (admin_id,peer_id) ORDER BY id LIMIT 1;
 SELECT config INTO c FROM farkle_test_config;
 input:=jsonb_build_object('ante_amount',7,'targetScore',1000,'endgame','immediate','testConfiguration',
  jsonb_build_object('testOnly',true,'label',c->'testLabel','rules',c->'rules','turnSeconds',30,'botDelayMs',1000,'botBankThreshold',100,'botPolicy','balanced'));
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity(admin_id);
 UPDATE private.farkle_release SET creation_enabled=true WHERE singleton;
 INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline,real_money,pot,current_round,total_hands)
 VALUES(gid,'TEST ONLY: Wave2 postgame rollback','game_selection',admin_id,4,false,deadline,false,0,0,0);
 INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot) VALUES
 (a,gid,admin_id,4,100,'active',false),(b,gid,peer_id,3,100,'active',false),(bot,gid,bot_user,5,100,'active',true);
 ans:=public.configure_dealer_game(gid,a,4,'farkle',input,deadline); dg:=(ans->'dealer_game'->>'id')::uuid;
 PERFORM private.farkle_claim_v1(gid,dg,NULL,'configure');
 UPDATE public.players SET ante_decision='ante_up' WHERE game_id=gid;
 SELECT * INTO g FROM public.games WHERE id=gid;
 PERFORM private.advance_ante_phase_exact(gid,dg,g.ante_decision_deadline,clock_timestamp());
 SELECT id INTO rd FROM public.rounds WHERE dealer_game_id=dg;
 PERFORM set_config('app.farkle_authority','',true);
 UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
 RETURN jsonb_build_object('game',gid,'dealer',dg,'round',rd,'a',a,'b',b,'bot',bot,'admin',admin_id,'peer',peer_id);
END $p$;
CREATE FUNCTION pg_temp.farkle_postgame_bank(f jsonb,pending_end boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE s jsonb;
BEGIN
 PERFORM private.farkle_claim_v1((f->>'game')::uuid,(f->>'dealer')::uuid,NULL,'configure');
 SELECT farkle_state INTO s FROM public.rounds WHERE id=(f->>'round')::uuid;
 UPDATE public.rounds SET farkle_state=s||jsonb_build_object('stage','bank_or_roll','thisTurn',1000) WHERE id=(f->>'round')::uuid;
 IF pending_end THEN UPDATE public.games SET pending_session_end=true WHERE id=(f->>'game')::uuid; END IF;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
 PERFORM public.farkle_apply_action((f->>'round')::uuid,(f->>'b')::uuid,'bank',0,gen_random_uuid());
END $p$;
CREATE FUNCTION pg_temp.farkle_postgame_cleanup() RETURNS void LANGUAGE plpgsql AS $p$
DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM farkle_postgame_history_fixture LOOP
  PERFORM private.farkle_claim_v1(f.game_id,f.dealer_game_id,NULL,'cleanup');
  DELETE FROM public.games WHERE id=f.game_id;
  PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=f.game_id)
   AND NOT EXISTS(SELECT 1 FROM private.farkle_events WHERE round_id=f.round_id)
   AND NOT EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=f.game_id),'postgame fixture cascade cleanup');
 END LOOP;
 PERFORM set_config('app.farkle_authority','',true);
END $p$;
DO $p$
DECLARE f jsonb; g uuid; d uuid; r uuid; ans jsonb; again jsonb; before_game jsonb; terminal_state jsonb; balances jsonb; version bigint; denied boolean; mode text;
BEGIN
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',false) WHERE key='make_it_take_it';
 f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
 PERFORM pg_temp.farkle_assert(public.farkle_advance_postgame(g,r,d,1)->>'outcome'='stale_identity','postgame rejects live gameplay');
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,gen_random_uuid(),1); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:round_identity_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame exact dealer identity');
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,2); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:round_identity_mismatch'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame exact hand identity');
 PERFORM pg_temp.farkle_identity(gen_random_uuid());
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame outsider rejected');
 PERFORM pg_temp.farkle_assert(NOT has_function_privilege('anon','public.farkle_advance_postgame(uuid,uuid,uuid,integer)','EXECUTE')
  AND NOT has_table_privilege('authenticated','private.farkle_postgame_receipts_v2','INSERT'),'postgame RPC and receipt grants');
 PERFORM pg_temp.farkle_postgame_bank(f);
 SELECT farkle_state INTO terminal_state FROM public.rounds WHERE id=r;
 PERFORM pg_temp.farkle_assert(EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND round_id=r AND dealer_game_id=d
  AND hand_number=1 AND timer_kind='farkle_postgame' AND state='scheduled' AND due_at=(SELECT game_over_at+interval '15 seconds' FROM public.games WHERE id=g)),'postgame exact durable recovery registration');
 PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
 UPDATE public.rounds SET farkle_state=terminal_state||jsonb_build_object('gamePhase','playing','winnerPlayerId',NULL,'tiebreakTurn',1) WHERE id=r;
 PERFORM set_config('app.farkle_authority','',true);
 denied:=false; BEGIN PERFORM public.farkle_advance_postgame(g,r,d,1); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='farkle_postgame:not_terminal'; END;
 PERFORM pg_temp.farkle_assert(denied,'postgame cannot advance an unresolved tie');
 PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
 UPDATE public.rounds SET farkle_state=terminal_state WHERE id=r;
 PERFORM set_config('app.farkle_authority','',true);
 PERFORM pg_temp.farkle_identity((f->>'admin')::uuid);
 SELECT pause_version INTO version FROM public.games WHERE id=g;
 PERFORM public.set_game_paused(g,true,d,version);
 PERFORM pg_temp.farkle_assert(public.farkle_advance_postgame(g,r,d,1)->>'outcome'='paused','postgame respects real pause owner');
 SELECT pause_version INTO version FROM public.games WHERE id=g;
 PERFORM public.set_game_paused(g,false,d,version);
 SELECT jsonb_object_agg(id,chips) INTO balances FROM public.players WHERE game_id=g;
 ans:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(ans->>'outcome'='advanced' AND ans->>'status'='game_selection' AND ans->>'dealer_position'='3','postgame continues clockwise to lower occupied dealer');
 PERFORM pg_temp.farkle_assert(coalesce(current_setting('app.farkle_authority',true),'')='','postgame restores exact authority context');
 PERFORM pg_temp.farkle_assert((SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=g)=balances
  AND (SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d AND settlement_key='farkle_terminal'),'postgame never resettles chips');
 PERFORM pg_temp.farkle_assert((SELECT farkle_state=terminal_state FROM public.rounds WHERE id=r)
  AND (SELECT config=terminal_state->'config' FROM public.dealer_games WHERE id=d),'postgame preserves frozen config score and completed turns');
 SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
 again:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(again->>'outcome'='already_advanced' AND (again-'outcome'-'deduped')=(ans-'outcome'-'deduped')
  AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'postgame duplicate receipt is read only');
 PERFORM pg_temp.farkle_identity((f->>'peer')::uuid);
 PERFORM public.configure_dealer_game(g,(f->>'b')::uuid,3,'horses','{"ante_amount":7}',(SELECT config_deadline FROM public.games WHERE id=g));
 SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
 again:=public.farkle_advance_postgame(g,r,d,1);
 PERFORM pg_temp.farkle_assert(again->>'outcome'='already_advanced' AND (SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'postgame late replay cannot change subsequent dealer game');
 PERFORM pg_temp.farkle_assert(public.farkle_read_replay(r)->'config'=terminal_state->'config','postgame replay keeps original immutable rules');
 INSERT INTO farkle_postgame_history_fixture VALUES(g,r,d);

 FOREACH mode IN ARRAY ARRAY['recovery','waiting','no_humans','pending_end','already_ended'] LOOP
  f:=pg_temp.farkle_postgame_fixture(); g:=(f->>'game')::uuid; d:=(f->>'dealer')::uuid; r:=(f->>'round')::uuid;
  PERFORM pg_temp.farkle_postgame_bank(f,mode='already_ended');
  PERFORM private.farkle_claim_v1(g,d,r,'cleanup');
  IF mode='waiting' THEN UPDATE public.players SET sit_out_next_hand=true WHERE game_id=g AND NOT is_bot; END IF;
  IF mode='no_humans' THEN UPDATE public.players SET stand_up_next_hand=true WHERE game_id=g AND NOT is_bot; END IF;
  IF mode='pending_end' THEN UPDATE public.games SET pending_session_end=true WHERE id=g; END IF;
  PERFORM set_config('app.farkle_authority','',true);
  IF mode='recovery' THEN
   -- Limit one with this synthetic timer first. Refuse an unsafe legacy side scan.
   PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM public.rounds rr JOIN public.games gg ON gg.id=rr.game_id
    WHERE gg.game_type IN ('horses','ship-captain-crew') AND gg.status='in_progress' AND gg.current_game_uuid=rr.dealer_game_id
    AND rr.horses_state->>'gamePhase'='playing' AND nullif(rr.horses_state->>'turnDeadline','') IS NULL),'recovery proof has no unrelated legacy actor writes');
   UPDATE private.game_timer_registry SET due_at='-infinity' WHERE game_id=g AND timer_kind='farkle_postgame';
   PERFORM private.advance_due_canonical_game_timers(1);
   PERFORM pg_temp.farkle_assert(EXISTS(SELECT 1 FROM private.game_timer_registry WHERE game_id=g AND timer_kind='farkle_postgame'
    AND state='completed' AND metadata->'result'->>'outcome'='advanced') AND (SELECT status='game_selection' FROM public.games WHERE id=g),'canonical timer dispatches isolated Farkle continuation');
   PERFORM pg_temp.farkle_assert(auth.uid()=(f->>'peer')::uuid AND coalesce(current_setting('app.farkle_authority',true),'')='','recovery restores JWT and Farkle authority');
  ELSE
   SELECT to_jsonb(x) INTO before_game FROM public.games x WHERE id=g;
   ans:=public.farkle_advance_postgame(g,r,d,1);
   PERFORM pg_temp.farkle_assert(ans->>'status'=CASE WHEN mode='waiting' THEN 'waiting' ELSE 'session_ended' END,'postgame participation disposition '||mode);
   IF mode='already_ended' THEN PERFORM pg_temp.farkle_assert((SELECT to_jsonb(x)=before_game FROM public.games x WHERE id=g),'already ended terminal frame preserved'); END IF;
  END IF;
  PERFORM private.farkle_claim_v1(g,d,NULL,'cleanup'); DELETE FROM public.games WHERE id=g;
  PERFORM set_config('app.farkle_authority','',true);
  PERFORM pg_temp.farkle_assert(NOT EXISTS(SELECT 1 FROM private.farkle_postgame_receipts_v2 WHERE game_id=g),'receipt cascade cleanup '||mode);
 END LOOP;
END $p$;
