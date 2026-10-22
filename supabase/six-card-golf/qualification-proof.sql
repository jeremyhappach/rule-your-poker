-- Exact qualification scope and canonical timeout/rejoin, rollback-only fixture.
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 p uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();other_g uuid:=gen_random_uuid();
 d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;m private.golf_matches;s jsonb;rev bigint;control_version bigint;i integer;
BEGIN
 UPDATE private.golf_release SET enabled=false,admission_enabled=false;
 FOR i IN 1..3 LOOP INSERT INTO auth.users(id) VALUES(u[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Golf scope '||u[i],true);END LOOP;
 INSERT INTO public.games(id,status,current_host,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
 VALUES(g,'game_selection',u[1],false,4,offer,0,false,false),(other_g,'game_selection',u[1],false,4,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p[1],g,u[1],4,100,false),(p[2],g,u[2],3,100,false);
 PERFORM pg_temp.golf_login(u[1]);
 PERFORM pg_temp.golf_assert(NOT (public.golf_capabilities(g)->>'enabled')::boolean,'default closed');
 INSERT INTO private.golf_qualification(game_id,user_id,created_at,expires_at) VALUES(g,u[1],clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour');
 PERFORM pg_temp.golf_assert(NOT (public.golf_capabilities(g)->>'enabled')::boolean,'every human must be scoped');
 INSERT INTO private.golf_qualification(game_id,user_id,created_at,expires_at) VALUES(g,u[2],clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour');
 PERFORM pg_temp.golf_assert((public.golf_capabilities(g)->>'enabled')::boolean AND NOT (public.golf_capabilities(NULL)->>'enabled')::boolean AND NOT (public.golf_capabilities(other_g)->>'enabled')::boolean,'exact session only, no global discovery');
 UPDATE private.golf_qualification SET expires_at=clock_timestamp()-interval '1 second' WHERE game_id=g AND user_id=u[2];
 PERFORM pg_temp.golf_assert(NOT (public.golf_capabilities(g)->>'enabled')::boolean,'expired peer blocks admission');
 UPDATE private.golf_qualification SET expires_at=clock_timestamp()+interval '1 hour' WHERE game_id=g;
 PERFORM pg_temp.golf_login(u[3]);
 PERFORM pg_temp.golf_assert(NOT (public.golf_capabilities(g)->>'enabled')::boolean,'unlisted account denied');
 BEGIN PERFORM public.golf_configure(g,p[1],4,'six-card-golf','{"ante_amount":5}',offer);RAISE EXCEPTION 'outside scope accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN INSERT INTO private.golf_qualification(game_id,user_id,expires_at) VALUES(g,gen_random_uuid(),clock_timestamp()+interval '1 hour');RAISE EXCEPTION 'unknown account accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN INSERT INTO private.golf_qualification(game_id,user_id,expires_at) VALUES(gen_random_uuid(),u[1],clock_timestamp()+interval '1 hour');RAISE EXCEPTION 'unknown session accepted';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 UPDATE public.profiles SET is_active=false WHERE id=u[2];PERFORM pg_temp.golf_login(u[2]);
 PERFORM pg_temp.golf_assert(NOT (public.golf_capabilities(g)->>'enabled')::boolean,'inactive scoped account denied');
 UPDATE public.profiles SET is_active=true WHERE id=u[2];
 PERFORM pg_temp.golf_assert(NOT has_table_privilege('authenticated','private.golf_qualification','INSERT') AND NOT has_table_privilege('service_role','private.golf_qualification','UPDATE'),'no client or service grant writer');
 PERFORM pg_temp.golf_login(u[1]);
 v:=public.golf_configure(g,p[1],4,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 UPDATE private.golf_qualification SET expires_at=clock_timestamp()-interval '1 second' WHERE game_id=g;
 PERFORM pg_temp.golf_login(u[2]);PERFORM public.submit_ante_decision(g,d,p[2],'ante_up');
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_assert((SELECT count(*)=2 FROM private.golf_qualified_matches WHERE dealer_game_id=d),'admitted access frozen before grant expiry');
 PERFORM pg_temp.golf_assert(public.golf_snapshot(d)->>'revision' IS NOT NULL AND NOT (public.golf_capabilities(g)->>'enabled')::boolean,'expired grant preserves existing match, closes new admission');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.golf_assert((SELECT count(*)=1 FROM public.golf_revisions WHERE game_id=g),'authenticated scoped revision read');
 RESET ROLE;
 -- Real human timeout preserves the decision and pauses; no autoplay flag.
 UPDATE public.games SET real_money=true WHERE id=g;
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g) AND NOT (SELECT auto_fold FROM public.players WHERE id=p[2]),'real timeout pauses without autoplay');
 PERFORM pg_temp.golf_assert((SELECT state->'tableaus'=s->'tableaus' AND state->'finalQueue'=s->'finalQueue' FROM private.golf_matches WHERE dealer_game_id=d),'real timeout preserves cards and queue');
 PERFORM pg_temp.golf_login(u[1]);PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 UPDATE public.games SET real_money=false,timeout_action='auto_fold',timeout_enforcement_enabled=true WHERE id=g;
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id=p[2]),'fake timeout sets canonical autoplay and deferred sit-out');
 PERFORM pg_temp.golf_login(u[2]);v:=public.golf_snapshot(d);
 PERFORM pg_temp.golf_assert((v#>>ARRAY['playerControls',p[2]::text,'autoPlay'])::boolean AND public.golf_snapshot(d)->'playerControls'=v->'playerControls','peer/reconnect projection retains autoplay');
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 BEGIN PERFORM public.golf_reclaim_control(d,m.round_id,-1);RAISE EXCEPTION 'stale rejoin accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:stale_control' THEN RAISE;END IF;END;
 PERFORM pg_temp.golf_login(u[3]);
 BEGIN PERFORM public.golf_snapshot(d);RAISE EXCEPTION 'outsider snapshot';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.golf_reclaim_control(d,m.round_id,0);RAISE EXCEPTION 'outsider rejoin';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.golf_assert(NOT public.golf_revision_allowed(g,d),'outsider realtime denied');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.golf_assert((SELECT count(*)=0 FROM public.golf_revisions WHERE game_id=g),'RLS rejects authenticated outsider');
 RESET ROLE;
 PERFORM pg_temp.golf_login(u[2]);rev:=m.revision;
 -- Other canonical options advance the same optimistic concurrency version.
 UPDATE public.players SET auto_ante=NOT auto_ante WHERE id=p[2];
 v:=public.golf_snapshot(d);
 PERFORM pg_temp.golf_assert((v#>>ARRAY['playerControls',p[2]::text,'intentVersion'])::bigint=(SELECT intent_version FROM public.players WHERE id=p[2]),'other option changes publish current reclaim version');
 SELECT intent_version INTO control_version FROM public.players WHERE id=p[2];
 v:=public.golf_reclaim_control(d,m.round_id,control_version);
 PERFORM pg_temp.golf_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=p[2]) AND (v->>'revision')::bigint>rev,'uncheck clears autoplay and next-hand sit-out with a revision');
 PERFORM pg_temp.golf_assert((SELECT intent_version>control_version FROM public.players WHERE id=p[2]),'canonical intent version advances on reclaim');
 -- Handoff between draw and disposition preserves the exact private draw.
 PERFORM pg_temp.golf_login(u[1]);v:=public.golf_snapshot(d);
 PERFORM public.golf_action(d,m.round_id,gen_random_uuid(),(v->>'revision')::bigint,'open',ARRAY[0,3]);
 PERFORM pg_temp.golf_login(u[2]);v:=public.golf_snapshot(d);
 PERFORM public.golf_action(d,m.round_id,gen_random_uuid(),(v->>'revision')::bigint,'draw',NULL);
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p[2];
 SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
 v:=public.golf_reclaim_control(d,m.round_id,(SELECT intent_version FROM public.players WHERE id=p[2]));
 PERFORM pg_temp.golf_assert(v->'pending' IS NOT NULL AND v->'pending'<>'null'::jsonb AND (SELECT state=s FROM private.golf_matches WHERE dealer_game_id=d),'pending draw reclaim preserves card, counter and queue');
 -- All-human auto safeguard and deliberate pause remain explicit.
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE game_id=g;
 PERFORM private.pause_all_humans_auto_fold(g);
 SELECT state INTO s FROM private.golf_matches WHERE dealer_game_id=d;
 v:=public.golf_reclaim_control(d,m.round_id,(SELECT intent_version FROM public.players WHERE id=p[2]));
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g) AND (SELECT state=s FROM private.golf_matches WHERE dealer_game_id=d),'reclaim does not resume deliberate pause or consume a card');
 PERFORM pg_temp.golf_login(u[1]);PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 -- A hole is not the next match: frozen liabilities and autoplay survive it.
 UPDATE private.golf_matches SET state=state||jsonb_build_object('phase','hole_complete','deadline',0,'holes',jsonb_build_array(jsonb_build_object('hole',1))),revision=revision+1 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_assert(m.state->>'hole'='2' AND (SELECT auto_fold AND sit_out_next_hand AND NOT sitting_out FROM public.players WHERE id=p[1]),'hole successor retains committed participant and autoplay');
 -- Existing financial owner and postgame apply deferred sit-out exactly once.
 s:=m.state||jsonb_build_object('phase','complete','hole',9,'scores',jsonb_build_object(p[1]::text,-2,p[2]::text,4),'pending',NULL,'holes',(SELECT jsonb_agg(jsonb_build_object('hole',h)) FROM generate_series(1,9)h));
 UPDATE private.golf_matches SET state=s,revision=revision+1 WHERE dealer_game_id=d;
 PERFORM private.golf_settle(d);PERFORM pg_sleep(3.05);PERFORM public.golf_close(d);
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.golf_assert((SELECT sitting_out AND NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=p[1]) AND (SELECT NOT sitting_out AND NOT sit_out_next_hand FROM public.players WHERE id=p[2]),'next match sits timed-out player out, reclaimed player remains eligible');
 PERFORM pg_temp.golf_assert((SELECT chips=105 FROM public.players WHERE id=p[1]) AND (SELECT chips=95 FROM public.players WHERE id=p[2]),'canonical settlement unchanged');
 PERFORM pg_temp.golf_assert(NOT private.golf_admission_allowed(u[2],g),'expiry prevents Run Back even after completion');
 DELETE FROM private.golf_qualification WHERE game_id=g;
 PERFORM pg_temp.golf_login(u[2]);PERFORM public.golf_snapshot(d);PERFORM public.golf_close(d);
 PERFORM pg_temp.golf_assert(NOT (SELECT enabled OR admission_enabled FROM private.golf_release),'general admission stayed closed');
 SET CONSTRAINTS ALL DEFERRED;
END $$;
SELECT 'Exact account/session/expiry scope, retained liability access, canonical timeout/reclaim and next-match intent passed' proof;
