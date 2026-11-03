CREATE FUNCTION pg_temp.mega_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'mega proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.mega_login(who uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claim.sub',who::text,true);PERFORM set_config('request.jwt.claim.role','authenticated',true);END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;r uuid;offer timestamptz;v jsonb;s jsonb;config jsonb;totals jsonb;expected jsonb;n integer;k integer;i integer;money_i integer;winners uuid[];failed boolean;before_counts jsonb;
BEGIN
 FOR i IN 1..3 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Mega proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 PERFORM pg_temp.mega_login(users[1]);
 FOR config IN SELECT jsonb_build_object('version','mega-card-golf/4','course',private.mega_config(c)||jsonb_build_object('holes',holes)) FROM private.arcade_mega_courses a JOIN private.arcade_mega_configs c ON c.id=a.config_id CROSS JOIN unnest(ARRAY[3,6,9,18])holes LOOP
  PERFORM pg_temp.mega_assert(private.mega_competition_config(config)=config,'all course/hole selections freeze exactly');
 END LOOP;
 UPDATE public.game_defaults SET mega_course='coastal-links',mega_holes=6 WHERE game_type='mega-card-golf';
 config:=private.mega_competition_config();
 PERFORM pg_temp.mega_assert(config#>>'{course,id}'='coastal-links' AND config#>>'{course,holes}'='6','saved course and hole defaults are inherited');
 PERFORM pg_temp.mega_assert(public.mega_competition_catalog()->'defaults'=config,'setup catalog returns persisted defaults');
 UPDATE public.game_defaults SET mega_course='sunny-meadows',mega_holes=9 WHERE game_type='mega-card-golf';
 UPDATE private.mega_competition_release SET live_enabled=true,async_enabled=true;
 UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();
 UPDATE private.delayed_recovery_state SET enabled=true;
 UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true;
 config:=private.mega_competition_config();
 PERFORM pg_temp.mega_assert(EXISTS(SELECT FROM jsonb_array_elements(public.delayed_capabilities()->'games') x WHERE x->>'id'='mega-card-golf'),'capabilities expose qualified Mega');
 FOR money_i IN 0..1 LOOP FOR n IN 2..3 LOOP FOR k IN 1..n LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money_i=1,4,offer,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[x],g,users[x],5-x,100,false FROM generate_series(1,n)x;
  PERFORM pg_temp.mega_login(users[1]);PERFORM set_config('request.jwt.claim.role','service_role',true);UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v:=public.mega_configure(g,ids[1],4,'mega-card-golf',jsonb_build_object('ante_amount',5,'mega',config),offer);d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.mega_assert((public.mega_configure(g,ids[1],4,'mega-card-golf',jsonb_build_object('ante_amount',5,'mega',config),offer)->>'deduped')::boolean,'setup duplicate');
  FOR i IN 2..n LOOP PERFORM pg_temp.mega_login(users[i]);PERFORM public.submit_ante_decision(g,d,ids[i],'ante_up');END LOOP;
  SELECT state,round_id INTO STRICT s,r FROM private.mega_live_matches WHERE dealer_game_id=d;
  SELECT jsonb_object_agg(ids[x]::text,CASE WHEN x<=k THEN -4 ELSE 12 END),array_agg(ids[x]) FILTER(WHERE x<=k) INTO totals,winners FROM generate_series(1,n)x;
  -- Deliberate terminal settlement fixture; separate service tests earn all holes.
  s:=s||jsonb_build_object('phase','complete','hole',9,'scores',totals,'holes',(SELECT jsonb_agg(jsonb_build_object('hole',h,'scores',CASE WHEN h=9 THEN totals ELSE (SELECT jsonb_object_agg(ids[x]::text,0) FROM generate_series(1,n)x) END)) FROM generate_series(1,9)h));
  UPDATE private.mega_live_matches SET state=s,revision=revision+1 WHERE dealer_game_id=d;
  expected:=private.split_whole_chips_clockwise(g,winners,(n-k)*5,4);FOR i IN k+1..n LOOP expected:=expected||jsonb_build_object(ids[i]::text,-5);END LOOP;
  IF k=1 THEN
   CREATE OR REPLACE FUNCTION pg_temp.mega_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN IF NOT EXISTS(SELECT FROM public.players WHERE game_id=NEW.game_id AND chips<>100) THEN RAISE EXCEPTION 'failure_before_chips';END IF;RAISE EXCEPTION 'mega_after_chips';END $f$;
   CREATE TRIGGER mega_proof_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.mega_fail_snapshot();failed:=false;
   BEGIN PERFORM private.mega_live_settle(d);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'mega_after_chips' THEN RAISE;END IF;failed:=true;END;
   DROP TRIGGER mega_proof_failure ON public.session_player_snapshots;
   PERFORM pg_temp.mega_assert(failed AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'after-chip failure restores chips');
   PERFORM pg_temp.mega_assert(NOT EXISTS(SELECT FROM public.game_results WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=d) AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE dealer_game_id=d),'after-chip failure rolls back result journal snapshots');
  END IF;
  UPDATE public.games SET pending_session_end=k=n WHERE id=g;
  PERFORM private.mega_live_settle(d);PERFORM private.mega_live_settle(d);
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.mega_assert((SELECT settlement=expected FROM private.mega_live_matches WHERE dealer_game_id=d),'exact settlement');
  PERFORM pg_temp.mega_assert((SELECT bool_and(chips=100+(expected->>id::text)::integer) AND sum(chips)=n*100 FROM public.players WHERE game_id=g),'canonical balances and conservation');
  PERFORM pg_temp.mega_assert((SELECT count(*)=1 AND bool_and(player_chip_changes=expected) FROM public.game_results WHERE dealer_game_id=d),'one canonical result');
  IF k<n THEN PERFORM pg_temp.mega_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}') FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'one balanced canonical transfer batch');END IF;
  IF k=n THEN PERFORM pg_temp.mega_assert((SELECT status='session_ended' FROM public.games WHERE id=g),'terminal disposition');END IF;
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;END LOOP;END LOOP;
END $$;
