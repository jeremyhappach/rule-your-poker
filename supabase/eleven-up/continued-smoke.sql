-- Canonical ante owns participant consent; this private adapter only starts an accepted match.
CREATE FUNCTION private.megatouch_begin(p_game uuid,p_dealer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games;dg public.dealer_games;r uuid:=gen_random_uuid();people jsonb;balances jsonb;s jsonb;stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('eleven-up','tri-towers','run21') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type='run21' THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 IF g.game_type='eleven-up' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='eleven-up' THEN
   s:=private.eleven_up_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSE
   s:=private.tri_towers_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  END IF;
 END IF;
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $$;
REVOKE ALL ON FUNCTION private.megatouch_begin(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Once offered, the exact dealer-game configuration identifies the accepted stake.
CREATE FUNCTION private.megatouch_frozen_stake() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.game_type IN('eleven-up','tri-towers','run21') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $$;
CREATE TRIGGER megatouch_frozen_stake BEFORE UPDATE OF config ON public.dealer_games FOR EACH ROW EXECUTE FUNCTION private.megatouch_frozen_stake();
REVOKE ALL ON FUNCTION private.megatouch_frozen_stake() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_app_activity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'activity:authentication_required' USING ERRCODE='42501';END IF;
 UPDATE public.profiles SET last_seen_at=clock_timestamp() WHERE id=auth.uid() AND (last_seen_at IS NULL OR last_seen_at<clock_timestamp()-interval '60 seconds');
END $$;
REVOKE ALL ON FUNCTION public.record_app_activity() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_app_activity() TO authenticated;
-- Existing table-level profile grants override column revokes. Guard this field
-- while preserving established profile/preferences writes and trusted server RPCs.
CREATE FUNCTION private.guard_app_activity_timestamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN('authenticated','anon') AND NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN RAISE EXCEPTION 'activity:server_timestamp_required' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_app_activity_timestamp BEFORE UPDATE OF last_seen_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_app_activity_timestamp();
REVOKE ALL ON FUNCTION private.guard_app_activity_timestamp() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admin_recent_activity() RETURNS TABLE(id uuid,name text,last_seen_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'activity:admin_required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT p.id,coalesce(p.username,'Player'),p.last_seen_at FROM public.profiles p ORDER BY p.last_seen_at DESC NULLS LAST,p.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_recent_activity() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_recent_activity() TO authenticated;
