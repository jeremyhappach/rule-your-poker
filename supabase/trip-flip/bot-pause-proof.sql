DO $$
DECLARE u uuid:=gen_random_uuid();bot uuid:=gen_random_uuid();p uuid:=gen_random_uuid();bp uuid:=gen_random_uuid();g uuid:=gen_random_uuid();d uuid;offer timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;before_state jsonb;after_state jsonb;rev bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(bot);
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Trip Flip human',true),(bot,'Trip Flip bot',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,offer,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false),(bp,g,bot,1,100,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 v:=public.trip_flip_configure(g,p,2,'trip-flip','{"ante_amount":7}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.trip_assert((SELECT status='ante_decision' FROM public.games WHERE id=g) AND NOT EXISTS(SELECT 1 FROM private.trip_flip_matches WHERE dealer_game_id=d),'consent before bot match');
 PERFORM public.advance_ante_phase(g,d);
 UPDATE private.trip_flip_matches SET state=state||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+100000) WHERE dealer_game_id=d;
 SELECT state INTO before_state FROM private.trip_flip_matches WHERE dealer_game_id=d;
 UPDATE public.games SET is_paused=true WHERE id=g;
 UPDATE private.trip_flip_matches SET paused_at=paused_at-1500 WHERE dealer_game_id=d;
 PERFORM private.trip_flip_recover();
 PERFORM pg_temp.trip_assert((SELECT state=before_state AND bot_due_at IS NULL FROM private.trip_flip_matches WHERE dealer_game_id=d),'pause blocks gameplay and bot');
 UPDATE public.games SET is_paused=false WHERE id=g;
 SELECT state,revision INTO after_state,rev FROM private.trip_flip_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.trip_assert((after_state->>'deadline')::bigint-(before_state->>'deadline')::bigint>=1500 AND after_state->'score'=before_state->'score','pause preserves active time and points');
 PERFORM pg_sleep(.8);PERFORM private.trip_flip_recover();
 PERFORM pg_temp.trip_assert((SELECT revision=rev+1 AND state IS DISTINCT FROM after_state FROM private.trip_flip_matches WHERE dealer_game_id=d),'server bot performs legal action without clients');
 PERFORM private.trip_flip_recover();
 PERFORM pg_temp.trip_assert((SELECT revision=rev+1 FROM private.trip_flip_matches WHERE dealer_game_id=d),'bot schedule rejects double advance');
END $$;
SELECT 'Trip Flip bot consent, autonomous play and paused clocks passed' AS proof;
DO $$
DECLARE s jsonb;single jsonb;choice jsonb;i integer;j integer;p uuid:=gen_random_uuid();u uuid:=gen_random_uuid();at_ms bigint;
BEGIN
 FOR j IN 1..20 LOOP
  s:=private.trip_flip_deal(jsonb_build_object('rules',private.trip_flip_rules(),'players',jsonb_build_array(jsonb_build_object('id',p,'userId',u,'isBot',true)),'scores','{}'::jsonb,'stages','[]'::jsonb,'turnIndex',0,'stage',1,'identity',jsonb_build_object('dealerGameId',p,'roundId',p)),1000);
  single:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
  FOR i IN 0..400 LOOP
   at_ms:=3500+i*750;choice:=private.trip_flip_bot_choice(private.trip_flip_visible(s),at_ms);
   s:=private.trip_flip_reduce(s,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
   single:=private.trip_flip_board_reduce(single,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
   PERFORM pg_temp.trip_assert(s->'columns'=single->'columns' AND s->'cells'=single->'cells' AND s->'fan'=single->'fan' AND s->'score'=single->'score' AND s->'deadline'=single->'deadline','cross-mode rule parity');
   EXIT WHEN s->>'phase'='stage_complete';
  END LOOP;
  PERFORM pg_temp.trip_assert(s->>'phase'='stage_complete' AND (s#>>'{result,completedAt}')::bigint<=183500,'visible-only bot completes within entitlement');
 END LOOP;
END $$;
SELECT '20 autonomous bot rounds and shared-core multiplayer parity PASS' AS proof;
