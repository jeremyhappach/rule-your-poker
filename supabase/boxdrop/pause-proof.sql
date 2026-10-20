DO $$
DECLARE u uuid:=gen_random_uuid();bot uuid:=gen_random_uuid();p uuid:=gen_random_uuid();bp uuid:=gen_random_uuid();g uuid:=gen_random_uuid();d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;before_state jsonb;after_state jsonb;rev bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(bot);
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Boxdrop human',true),(bot,'Boxdrop bot',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false),(bp,g,bot,1,100,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 v:=public.boxdrop_configure(g,p,2,'boxdrop','{"ante_amount":7}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.box_assert((SELECT status='ante_decision' FROM public.games WHERE id=g) AND NOT EXISTS(SELECT 1 FROM private.boxdrop_matches WHERE dealer_game_id=d),'consent before bot match');
 PERFORM public.advance_ante_phase(g,d);
 UPDATE private.boxdrop_matches SET state=state||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+100000) WHERE dealer_game_id=d;
 SELECT state INTO before_state FROM private.boxdrop_matches WHERE dealer_game_id=d;
 UPDATE public.games SET is_paused=true WHERE id=g;
 UPDATE private.boxdrop_matches SET paused_at=paused_at-1500 WHERE dealer_game_id=d;
 PERFORM private.boxdrop_recover();
 PERFORM pg_temp.box_assert((SELECT state=before_state AND bot_due_at IS NULL FROM private.boxdrop_matches WHERE dealer_game_id=d),'pause blocks gameplay and bot');
 UPDATE public.games SET is_paused=false WHERE id=g;
 SELECT state,revision INTO after_state,rev FROM private.boxdrop_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.box_assert((after_state->>'deadline')::bigint-(before_state->>'deadline')::bigint>=1500 AND after_state->'score'=before_state->'score','pause preserves active time and points');
 PERFORM pg_sleep(.8);PERFORM private.boxdrop_recover();
 PERFORM pg_temp.box_assert((SELECT revision=rev+1 AND state IS DISTINCT FROM after_state FROM private.boxdrop_matches WHERE dealer_game_id=d),'server bot performs legal action without clients');
 PERFORM private.boxdrop_recover();
 PERFORM pg_temp.box_assert((SELECT revision=rev+1 FROM private.boxdrop_matches WHERE dealer_game_id=d),'bot schedule rejects double advance');
END $$;

SELECT 'Boxdrop bot consent, autonomous play and paused clocks PASS' AS proof;
