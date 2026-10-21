-- Actual configure -> submit_ante_decision -> shared dispatcher, inside rollback only.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;deadline timestamptz;r jsonb;money integer;t uuid;source text;
BEGIN
 source:=pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure);
 PERFORM pg_temp.canasta_assert(md5(replace(replace(source,E'    WHEN v_game.game_type=''canasta'' THEN\n      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n',''),chr(13),''))='7b6ca8feaa35c1fcce8b00491783e9d4','all pre-existing dispatcher behavior preserved byte-for-byte');
 PERFORM pg_temp.canasta_assert(position('''race-poker''' IN source)>0 AND position('''battle-31''' IN source)>0 AND position('''eleven-up''' IN source)>0 AND position('private.canasta_begin' IN source)>0,'preserves released game dispatcher branches');
 INSERT INTO cron.job(jobname,schedule,command,nodename,nodeport,database,username,active)
  SELECT 'canasta-recovery','5 seconds','SELECT private.canasta_dispatch_recovery()','localhost',5432,'postgres','postgres',true
  WHERE NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='canasta-recovery');
 UPDATE cron.job SET active=true WHERE jobname='canasta-recovery';
 UPDATE private.canasta_recovery_state SET last_completed_at=clock_timestamp();
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed',consecutive_partial_failures=0 WHERE singleton;
 UPDATE private.canasta_release SET enabled=true,admission_enabled=true;
 FOR money IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[money]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[money],'Canasta consent '||money,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 -- Two independent fake-money sessions retain the consent/recovery lease proof.
 FOR money IN 0..1 LOOP
  ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];g:=gen_random_uuid();deadline:=clock_timestamp()+interval '120 seconds';
  PERFORM set_config('request.jwt.claim.role','service_role',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline) VALUES(g,'game_selection',false,1,0,false,deadline);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   SELECT ids[i],g,users[i],i,100,false,'active',false,false FROM generate_series(1,2) i;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  r:=public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline);d:=(r#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.canasta_assert((SELECT ante_decision IS NULL FROM public.players WHERE id=ids[2]),'fresh opponent stake consent');
  PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=d),'no match before second consent');
  PERFORM pg_temp.canasta_assert(public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline)->>'outcome'='already_configured','setup retry');
  BEGIN UPDATE public.dealer_games SET config=config||'{"ante_amount":20}' WHERE id=d;RAISE EXCEPTION 'missing frozen configuration';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:configuration_frozen' THEN RAISE;END IF;END;
  r:=public.submit_ante_decision(g,d,ids[2],'ante_up',NULL,NULL);
  PERFORM pg_temp.canasta_assert(r->>'outcome'='not_authorized','cannot consent for opponent');
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[2])::text,true);
  r:=public.submit_ante_decision(g,d,ids[2],'ante_up',NULL,NULL);
  PERFORM pg_temp.canasta_assert(r->>'outcome'='accepted' AND r#>>'{phase,outcome}'='advanced','canonical human consent begins match');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM private.canasta_matches WHERE dealer_game_id=d AND stake=10 AND jsonb_array_length(seats)=2),'exact frozen match');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM public.canasta_revisions WHERE dealer_game_id=d),'revision signal at admission');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=0 FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'no intermediate stake payment');
 END LOOP;
 t:=gen_random_uuid();UPDATE private.canasta_recovery_state SET token=t,expires_at=clock_timestamp()+interval '25 seconds',claimed=false;
 r:=public.canasta_recovery_claim(t);
 PERFORM pg_temp.canasta_assert((r->>'accepted')::boolean AND jsonb_array_length(r->'matches')>=2,'worker claims zero-client initial deals');
 PERFORM pg_temp.canasta_assert(public.canasta_recovery_claim(t)->>'accepted'='false','single lease claim');
 PERFORM public.canasta_recovery_load(t,d);
 PERFORM public.canasta_recovery_complete(t,NULL);
 BEGIN PERFORM public.canasta_recovery_load(t,d);RAISE EXCEPTION 'missing retired lease';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE private.canasta_release SET enabled=false,admission_enabled=false;
END $$;
SELECT 'canasta canonical consent and recovery lease proof passed' AS proof;
