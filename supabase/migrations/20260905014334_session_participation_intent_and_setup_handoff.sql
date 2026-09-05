-- One command boundary for participant intent, host transfer and setup departure.
ALTER TABLE public.players ADD COLUMN intent_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.games ADD COLUMN host_version bigint NOT NULL DEFAULT 0;

CREATE FUNCTION private.stamp_session_intent_version() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.intent_version:=0;
 ELSE NEW.intent_version:=OLD.intent_version+CASE WHEN
 ROW(OLD.auto_ante,OLD.auto_ante_runback,OLD.sit_out_next_hand,OLD.stand_up_next_hand,OLD.waiting,OLD.sitting_out,OLD.position,OLD.auto_fold,
 CASE OLD.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
 IS DISTINCT FROM
 ROW(NEW.auto_ante,NEW.auto_ante_runback,NEW.sit_out_next_hand,NEW.stand_up_next_hand,NEW.waiting,NEW.sitting_out,NEW.position,NEW.auto_fold,
 CASE NEW.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
 THEN 1 ELSE 0 END; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stamp_session_intent_version BEFORE INSERT OR UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.stamp_session_intent_version();

CREATE FUNCTION private.guard_browser_session_intent() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
 ROW(OLD.auto_ante,OLD.auto_ante_runback,OLD.sit_out_next_hand,OLD.stand_up_next_hand,OLD.waiting)
 IS DISTINCT FROM ROW(NEW.auto_ante,NEW.auto_ante_runback,NEW.sit_out_next_hand,NEW.stand_up_next_hand,NEW.waiting)
 THEN RAISE EXCEPTION 'participant_intent:command_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_browser_session_intent BEFORE UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_session_intent();

CREATE FUNCTION private.guard_and_stamp_session_host() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.host_version:=0; RETURN NEW; END IF;
 IF current_user IN ('anon','authenticated') AND OLD.current_host IS DISTINCT FROM NEW.current_host
 THEN RAISE EXCEPTION 'session_host:command_required' USING ERRCODE='42501'; END IF;
 NEW.host_version:=OLD.host_version+CASE WHEN OLD.current_host IS DISTINCT FROM NEW.current_host THEN 1 ELSE 0 END;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_and_stamp_session_host BEFORE INSERT OR UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_and_stamp_session_host();

CREATE FUNCTION public.set_session_player_intent(p_game_id uuid,p_player_id uuid,p_expected_version bigint,
 p_expected_dealer_game_id uuid,p_option text,p_value boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; p public.players%ROWTYPE; prior357 text;
BEGIN
 IF auth.uid() IS NULL OR p_value IS NULL OR p_option IS NULL OR p_option NOT IN
 ('auto_ante','auto_ante_runback','sit_out_next_hand','stand_up_next_hand','rejoin','cancel_exit') THEN
  RAISE EXCEPTION 'participant_intent:invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'participant_intent:missing_session'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR (NOT coalesce(p.is_bot,false) AND p.user_id IS DISTINCT FROM auth.uid())
 OR (coalesce(p.is_bot,false) AND (g.real_money IS DISTINCT FROM false OR g.current_host IS DISTINCT FROM auth.uid()))
 THEN RAISE EXCEPTION 'participant_intent:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR p.position IS NULL OR p.status IN ('left','observer')
 OR g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
 OR p.intent_version IS DISTINCT FROM p_expected_version THEN
  RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF p_option IN ('rejoin','cancel_exit') AND NOT p_value THEN
  RAISE EXCEPTION 'participant_intent:invalid_value' USING ERRCODE='22023'; END IF;
 prior357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_ante=CASE WHEN p_option='auto_ante' THEN p_value WHEN p_option='auto_ante_runback' AND p_value THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN p_option='auto_ante_runback' THEN p_value WHEN p_option='auto_ante' AND p_value THEN false ELSE auto_ante_runback END,
 sit_out_next_hand=CASE WHEN p_option='sit_out_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='stand_up_next_hand' AND p_value) THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN p_option='stand_up_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='sit_out_next_hand' AND p_value) THEN false ELSE stand_up_next_hand END,
 waiting=CASE WHEN p_option='rejoin' THEN true WHEN p_option IN ('sit_out_next_hand','stand_up_next_hand') AND p_value THEN false ELSE waiting END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior357,true);
 RETURN jsonb_build_object('outcome','accepted','player',to_jsonb(p));
END $$;
REVOKE ALL ON FUNCTION public.set_session_player_intent(uuid,uuid,bigint,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_session_player_intent(uuid,uuid,bigint,uuid,text,boolean) TO authenticated;

CREATE FUNCTION public.transfer_session_host(p_game_id uuid,p_target_player_id uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; p public.players%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR g.current_host IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND position IS NOT NULL)
 THEN RAISE EXCEPTION 'session_host:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR g.host_version IS DISTINCT FROM p_expected_version THEN
 RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 SELECT * INTO p FROM public.players WHERE id=p_target_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.is_bot OR p.position IS NULL OR p.status IN ('left','observer') THEN
 RAISE EXCEPTION 'session_host:invalid_target' USING ERRCODE='22023'; END IF;
 UPDATE public.games SET current_host=p.user_id WHERE id=g.id RETURNING * INTO g;
 RETURN jsonb_build_object('outcome','accepted','host_version',g.host_version,'current_host',g.current_host);
END $$;
REVOKE ALL ON FUNCTION public.transfer_session_host(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_session_host(uuid,uuid,bigint) TO authenticated;

CREATE TABLE private.session_setup_declines(
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 expected_deadline timestamptz NOT NULL, expected_position integer NOT NULL,
 actor_id uuid NOT NULL, player_id uuid NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(game_id,expected_deadline,expected_position));
REVOKE ALL ON private.session_setup_declines FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.decline_session_setup(p_game_id uuid,p_expected_dealer_position integer,p_expected_config_deadline timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; p public.players%ROWTYPE; claim private.session_setup_declines%ROWTYPE;
 host public.players%ROWTYPE; other public.players%ROWTYPE; occupant public.players%ROWTYPE;
 active_count integer; human_count integer; allow_bots boolean; target text; deadline timestamptz;
 next_pos integer; old_pos integer; target_pos integer; result jsonb; ctx text; prior jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL OR p_game_id IS NULL OR p_expected_dealer_position IS NULL OR p_expected_config_deadline IS NULL THEN
 RAISE EXCEPTION 'setup_decline:missing_identity'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'setup_decline:missing_session'; END IF;
 SELECT * INTO claim FROM private.session_setup_declines WHERE game_id=g.id
 AND expected_deadline=p_expected_config_deadline AND expected_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.actor_id<>auth.uid() THEN RAISE EXCEPTION 'setup_decline:not_authorized' USING ERRCODE='42501'; END IF;
  RETURN claim.result||jsonb_build_object('outcome','already_declined','deduped',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer')) THEN
 RAISE EXCEPTION 'setup_decline:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status NOT IN ('game_selection','configuring') OR coalesce(g.config_complete,false)
 OR g.current_game_uuid IS NOT NULL OR coalesce(g.pot,0)<>0 OR g.is_paused
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
 THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE game_id=g.id AND position=p_expected_dealer_position
 AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND NOT sitting_out;
 IF NOT FOUND THEN RAISE EXCEPTION 'setup_decline:not_setup_owner' USING ERRCODE='42501'; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
 prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
 PERFORM set_config(ctx,'on',true); END LOOP;
 -- Apply already queued participation before evaluating the next dealer.
 UPDATE public.players SET
 position=CASE WHEN stand_up_next_hand THEN NULL ELSE position END,
 status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
 sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand OR id=p.id THEN true WHEN waiting THEN false ELSE sitting_out END,
 waiting=false, sit_out_next_hand=false,stand_up_next_hand=false,
 auto_ante=CASE WHEN stand_up_next_hand THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN stand_up_next_hand THEN false ELSE auto_ante_runback END,
 auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL
 WHERE game_id=g.id AND status NOT IN ('left','observer');
 SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count
 FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
 IF coalesce(g.pending_session_end,false) OR human_count=0 THEN target:='session_ended';
 ELSIF active_count<2 THEN target:='waiting';
 ELSE
  -- Preserve the established two-player projection, moving occupied seats atomically.
  IF active_count=2 THEN
   SELECT * INTO host FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL
   ORDER BY is_bot,CASE WHEN user_id=g.current_host THEN 0 ELSE 1 END,created_at NULLS LAST,id LIMIT 1;
   SELECT * INTO other FROM public.players WHERE game_id=g.id AND id<>host.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
   IF least(abs(host.position-other.position),7-abs(host.position-other.position))<>3 THEN
    target_pos:=((host.position-1+3)%7)+1; old_pos:=other.position;
    SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=target_pos AND id<>other.id;
    IF FOUND THEN UPDATE public.players SET position=NULL WHERE id=occupant.id; END IF;
    UPDATE public.players SET position=target_pos WHERE id=other.id;
    IF occupant.id IS NOT NULL THEN UPDATE public.players SET position=old_pos WHERE id=occupant.id; END IF;
   END IF;
  END IF;
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm' LIMIT 1;
  -- Existing setup rotation chooses the first eligible position after the dealer sits out.
  SELECT position INTO next_pos FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer')
  AND position IS NOT NULL AND (coalesce(allow_bots,false) OR NOT is_bot) ORDER BY position LIMIT 1;
  IF next_pos IS NULL THEN target:='waiting';
  ELSE target:='game_selection'; deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.game_setup_timer_seconds,30))); END IF;
 END IF;
 UPDATE public.games SET status=target,game_type=NULL,config_complete=false,config_deadline=deadline,
 ante_decision_deadline=NULL,last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,
 all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,is_first_hand=false,
 current_game_uuid=NULL,dealer_selection_state=NULL,dealer_position=coalesce(next_pos,dealer_position),
 pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
 session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=g.id;
 result:=jsonb_build_object('outcome','declined','deduped',false,'status',target,'declining_player_id',p.id,'dealer_position',next_pos,'config_deadline',deadline);
 INSERT INTO private.session_setup_declines VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,auth.uid(),p.id,result);
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
 PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.decline_session_setup(uuid,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decline_session_setup(uuid,integer,timestamptz) TO authenticated;

-- Compatibility name forwards to the same owner; it cannot perform a second transition.
CREATE OR REPLACE FUNCTION public.three_five_seven_decline_setup(p_game_id uuid,p_expected_dealer_position integer,p_expected_config_deadline timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb; actor uuid;
BEGIN
 -- Preserve receipts issued before the shared owner was deployed.
 SELECT d.result,p.user_id INTO receipt,actor
 FROM private.three_five_seven_setup_declines d JOIN public.players p ON p.id=d.declining_player_id
 WHERE d.game_id=p_game_id AND d.expected_dealer_position=p_expected_dealer_position
 AND d.expected_config_deadline=p_expected_config_deadline LIMIT 1;
 IF FOUND THEN
  IF actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'setup_decline:not_authorized' USING ERRCODE='42501'; END IF;
  RETURN receipt||jsonb_build_object('outcome','already_declined','deduped',true);
 END IF;
 RETURN public.decline_session_setup(p_game_id,p_expected_dealer_position,p_expected_config_deadline);
END $$;
NOTIFY pgrst,'reload schema';
