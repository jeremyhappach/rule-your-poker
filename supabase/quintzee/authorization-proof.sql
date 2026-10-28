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
