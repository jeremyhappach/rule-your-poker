DO $$
DECLARE u uuid:=gen_random_uuid();bu uuid:=gen_random_uuid();p uuid:=gen_random_uuid();bp uuid:=gen_random_uuid();
 arrival uuid:=gen_random_uuid();g uuid:=gen_random_uuid();d uuid;v jsonb;m private.golf_matches;before_state jsonb;offer timestamptz:=clock_timestamp()+interval '10 minutes';pause_i bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(bu);
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Golf human',true),(bu,'Golf bot',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
 VALUES(g,'game_selection',false,2,offer,0,false,false);
 UPDATE public.games SET current_host=u WHERE id=g;
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(p,g,u,2,100,false),(bp,g,bu,1,100,true);
 PERFORM pg_temp.golf_login(u);
 v:=public.golf_configure(g,p,2,'six-card-golf','{"ante_amount":7}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT 1 FROM private.golf_matches WHERE dealer_game_id=d),'mixed consent boundary');
 PERFORM public.advance_ante_phase(g,d);
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 before_state:=m.state;
 PERFORM public.set_game_paused(g,true,d,(SELECT pause_version FROM public.games WHERE id=g));
 UPDATE private.golf_matches SET paused_at=paused_at-100000 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT state=before_state AND bot_due_at IS NULL FROM private.golf_matches WHERE dealer_game_id=d),'deliberate pause leaves opening and counter untouched');
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 PERFORM pg_temp.golf_assert((SELECT (state->>'deadline')::bigint>=(before_state->>'deadline')::bigint+100000 FROM private.golf_matches WHERE dealer_game_id=d),'paused time preserved on resume');
 -- Expire the legal allowance to drive the bot through normal recovery.
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT state->>'openingRemaining'='1' FROM private.golf_matches WHERE dealer_game_id=d),'autonomous bot opening');
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_login(u);
 v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'open',ARRAY[0,3]);
 -- Opening complete, bot acts through observation projection with no clients.
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 IF m.state->'pending'<>'null'::jsonb THEN
  UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
  PERFORM private.golf_recover();
 END IF;
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_assert(m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=p::text,'bot completes exactly one turn');
 -- Real-money timeout preserves actor-private pending draw and pauses.
 UPDATE public.games SET real_money=true WHERE id=g;
 PERFORM pg_temp.golf_login(u);
 v:=public.golf_action(d,m.round_id,gen_random_uuid(),m.revision,'draw');
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 SELECT state INTO before_state FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'real human timeout pauses');
 PERFORM pg_temp.golf_assert((SELECT state->'pending'=before_state->'pending' AND state->'finalQueue'=before_state->'finalQueue'
  AND state->'consecutiveNoRevealTurns'=before_state->'consecutiveNoRevealTurns' AND state->'tableaus'=before_state->'tableaus'
  FROM private.golf_matches WHERE dealer_game_id=d),'timeout preserves unresolved draw and gameplay');
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'zero-client recovery retains deliberate pause');
 -- Roster departures retain identity, seats and committed match liabilities.
 UPDATE public.players SET position=NULL,status='left' WHERE id=p;
 PERFORM pg_temp.golf_assert((SELECT position=2 AND status<>'left' AND stand_up_next_hand FROM public.players WHERE id=p),'departure deferred until match settlement');
 BEGIN
  DELETE FROM public.players WHERE id=p;
  RAISE EXCEPTION 'delete incorrectly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'golf:match_liability_committed' THEN RAISE;END IF;
 END;
 INSERT INTO auth.users(id) VALUES(arrival);
 INSERT INTO public.profiles(id,username,is_active) VALUES(arrival,'Golf arrival '||arrival::text,true);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(gen_random_uuid(),g,arrival,3,100,true);
 PERFORM pg_temp.golf_assert((SELECT waiting FROM public.players WHERE game_id=g AND position=3),'new arrival waits for match');
 -- Fake-money inactivity must pause when every admitted human is automatic.
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 UPDATE public.games SET real_money=false,timeout_enforcement_enabled=true,timeout_action='auto_fold' WHERE id=g;
 UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 SELECT state INTO before_state FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'fake all-human safeguard pauses');
 PERFORM pg_temp.golf_assert((SELECT state->'pending'=before_state->'pending' AND state->'tableaus'=before_state->'tableaus'
  AND state->'finalQueue'=before_state->'finalQueue' AND state->'consecutiveNoRevealTurns'=before_state->'consecutiveNoRevealTurns'
  FROM private.golf_matches WHERE dealer_game_id=d),'all-human pause preserves unresolved gameplay');
 -- A corrupt committed partition is a fault fixture, not a legal move. Restore
 -- the guard before exercising the real recovery/hold owner.
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 ALTER TABLE private.golf_matches DISABLE TRIGGER golf_guard;
 UPDATE private.golf_matches SET state=jsonb_set(jsonb_set(state,'{stock}','[]'),'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
 ALTER TABLE private.golf_matches ENABLE TRIGGER golf_guard;
 SELECT state INTO before_state FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'committed corruption holds table');
 PERFORM pg_temp.golf_assert((SELECT state=before_state AND settlement IS NULL FROM private.golf_matches WHERE dealer_game_id=d),'hold neither repairs nor scores nor settles');
 PERFORM pg_temp.golf_assert(EXISTS(SELECT 1 FROM private.golf_integrity_failures WHERE dealer_game_id=d AND code='card_partition'),'restricted integrity diagnostic');
END $$;
SELECT 'Golf mixed bot consent, autonomous opening/turn, pause time and real-human pending-draw timeout passed' proof;
