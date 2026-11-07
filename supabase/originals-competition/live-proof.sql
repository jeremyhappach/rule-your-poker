CREATE FUNCTION pg_temp.originals_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'originals proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.originals_login(who uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claim.sub',who::text,true);PERFORM set_config('request.jwt.claim.role','authenticated',true);END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;offer timestamptz;v jsonb;s jsonb;totals jsonb;expected jsonb;n int;k int;i int;money_i int;winners uuid[];failed boolean;game_i text;before_revision bigint;
BEGIN
 PERFORM pg_temp.originals_assert((SELECT bool_and(NOT live_enabled AND NOT async_enabled AND NOT live_real_qualified AND NOT async_real_qualified) FROM private.originals_release),'closed defaults');
 PERFORM pg_temp.originals_assert(NOT has_function_privilege('authenticated','private.originals_live_step(uuid,uuid,uuid,bigint,jsonb,uuid)','EXECUTE'),'browser cannot choose actor');
 PERFORM pg_temp.originals_assert(NOT has_table_privilege('authenticated','private.originals_live_matches','SELECT'),'private cards inaccessible');
 FOR i IN 1..4 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(users[i],true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Originals proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 UPDATE private.originals_release SET live_enabled=true,async_enabled=true,live_real_qualified=true,async_real_qualified=true;
 UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();UPDATE private.delayed_recovery_state SET enabled=true;
 UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true;
 FOREACH game_i IN ARRAY ARRAY['crib-lab','chucky-showdown'] LOOP
  PERFORM pg_temp.originals_assert(private.originals_config(game_i)#>>'{gameplay,version}'=CASE WHEN game_i='crib-lab' THEN 'crib-lab/2' ELSE 'chucky-showdown/3' END,'current frozen rules');
  FOR money_i IN 0..1 LOOP FOR n IN 2..3 LOOP FOR k IN 1..n LOOP
   g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
   INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money_i=1,4,offer,0,false,false);
   INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[x],g,users[x],5-x,100,false FROM generate_series(1,n)x;
   PERFORM pg_temp.originals_login(users[1]);PERFORM set_config('request.jwt.claim.role','service_role',true);UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';PERFORM set_config('request.jwt.claim.role','authenticated',true);
   failed:=false;BEGIN PERFORM public.originals_configure(g,ids[1],4,game_i,'{"ante_amount":0}',offer);EXCEPTION WHEN OTHERS THEN failed:=true;END;
   PERFORM pg_temp.originals_assert(failed,'invalid stake rejected');
   v:=public.originals_configure(g,ids[1],4,game_i,'{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.originals_assert((public.originals_configure(g,ids[1],4,game_i,'{"ante_amount":5}',offer)->>'deduped')::boolean,'duplicate setup');
   FOR i IN 2..n LOOP PERFORM pg_temp.originals_login(users[i]);PERFORM public.submit_ante_decision(g,d,ids[i],'ante_up');END LOOP;
   SELECT state INTO STRICT s FROM private.originals_live_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.originals_login(users[4]);failed:=false;
   BEGIN PERFORM public.originals_live_snapshot(d);EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;
   PERFORM pg_temp.originals_assert(failed,'outsider denied');PERFORM pg_temp.originals_login(users[1]);
   v:=public.originals_live_snapshot(d);
   PERFORM pg_temp.originals_assert(v->'board' IS NOT NULL AND NOT (v->'board' ? 'stock') AND NOT (v->'board' ? '_competitiveDeck'),'visible board masks future cards');
   SELECT jsonb_object_agg(ids[x]::text,CASE WHEN x<=k THEN 200 ELSE 100 END),array_agg(ids[x]) FILTER(WHERE x<=k) INTO totals,winners FROM generate_series(1,n)x;
   -- Dedicated settlement fixtures; separate gameplay proof earns all round results.
   SELECT state INTO s FROM private.originals_live_matches WHERE dealer_game_id=d;
   s:=s||jsonb_build_object('phase','complete','round',3,'scores',totals,'rounds',(SELECT jsonb_agg(jsonb_build_object('round',r,'scores',totals)) FROM generate_series(1,3)r));
   UPDATE private.originals_live_matches SET state=s,revision=revision+1 WHERE dealer_game_id=d;
   expected:=private.split_whole_chips_clockwise(g,winners,(n-k)*5,4);FOR i IN k+1..n LOOP expected:=expected||jsonb_build_object(ids[i]::text,-5);END LOOP;
   IF k=1 THEN
    CREATE OR REPLACE FUNCTION pg_temp.originals_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF NOT EXISTS(SELECT FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'failure_before_chips';END IF;RAISE EXCEPTION 'originals_after_chips';END $f$;
    CREATE TRIGGER originals_proof_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.originals_fail_snapshot();failed:=false;
    BEGIN PERFORM private.originals_live_settle(d);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'originals_after_chips' THEN RAISE;END IF;failed:=true;END;
    DROP TRIGGER originals_proof_failure ON public.session_player_snapshots;
    PERFORM pg_temp.originals_assert(failed AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'failure restores chips');
    PERFORM pg_temp.originals_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE dealer_game_id=d),'failure rolls back all settlement artifacts');
   END IF;
   UPDATE public.games SET pending_session_end=k=n WHERE id=g;
   PERFORM private.originals_live_settle(d);PERFORM private.originals_live_settle(d);SET CONSTRAINTS ALL IMMEDIATE;
   PERFORM pg_temp.originals_assert((SELECT settlement=expected FROM private.originals_live_matches WHERE dealer_game_id=d),'exact settlement');
   PERFORM pg_temp.originals_assert((SELECT bool_and(chips=100+(expected->>id::text)::integer) AND sum(chips)=n*100 FROM public.players WHERE game_id=g),'actual balances and conservation');
   PERFORM pg_temp.originals_assert((SELECT count(*)=1 AND bool_and(player_chip_changes=expected AND game_type=game_i) FROM public.game_results WHERE dealer_game_id=d),'one correct canonical result');
   IF k<n THEN PERFORM pg_temp.originals_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'one balanced transfer batch');END IF;
   PERFORM pg_temp.originals_assert((SELECT count(*)=n FROM public.session_player_snapshots WHERE dealer_game_id=d),'final player snapshots');
   IF k=n THEN PERFORM pg_temp.originals_assert((SELECT status='session_ended' FROM public.games WHERE id=g),'terminal disposition');END IF;
   SET CONSTRAINTS ALL DEFERRED;
   UPDATE private.originals_live_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
   PERFORM private.originals_live_finish_postgame(d);PERFORM private.originals_live_finish_postgame(d);PERFORM private.originals_live_settle(d);
   PERFORM pg_temp.originals_assert((SELECT finished AND settlement=expected FROM private.originals_live_matches WHERE dealer_game_id=d),'continuation and late replay');
   PERFORM pg_temp.originals_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'no late duplicate result');
  END LOOP;END LOOP;END LOOP;
 END LOOP;
END $$;
