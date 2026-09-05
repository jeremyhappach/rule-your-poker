-- Atomic genesis and the final browser gameplay-write boundary.
CREATE OR REPLACE FUNCTION public.session_take_seat(
  p_game_id uuid, p_position integer, p_player_id uuid, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  g public.games%ROWTYPE; p public.players%ROWTYPE; occupant public.players%ROWTYPE;
  in_play boolean; waiting_room boolean; v_deck text; v_prior_357 text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active
  ) THEN RAISE EXCEPTION 'session_take_seat:not_authorized' USING ERRCODE='42501'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'session_take_seat:invalid_seat';
  END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing-game'); END IF;
  IF g.status IN ('session_ended','completed') THEN
    RETURN jsonb_build_object('outcome','already-session-ended');
  END IF;
  SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF p.id IS DISTINCT FROM p_player_id OR (p.id IS NOT NULL AND p.participation_version IS DISTINCT FROM p_expected_version) THEN
    RETURN jsonb_build_object('outcome','stale-participation');
  END IF;
  in_play:=g.status NOT IN ('waiting','waiting_for_players','dealer_selection','game_selection','configuring','ante_decision');
  waiting_room:=g.status IN ('waiting','waiting_for_players');
  IF in_play AND p.id IS NOT NULL AND p.status NOT IN ('left','observer') AND p.position IS DISTINCT FROM p_position THEN
    RAISE EXCEPTION 'session_take_seat:seat_locked_during_game';
  END IF;
  SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=p_position AND id IS DISTINCT FROM p.id FOR UPDATE;
  IF occupant.id IS NOT NULL THEN
    -- Preserve an in-flight participant's seat identity through settlement.
    IF occupant.status NOT IN ('left','observer') OR in_play THEN
      RAISE EXCEPTION 'session_take_seat:seat_occupied';
    END IF;
    UPDATE public.players SET position=NULL WHERE id=occupant.id;
  END IF;
  IF p.id IS NULL THEN
    IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND EXISTS(
      SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true'
    ) THEN RAISE EXCEPTION 'session_take_seat:maintenance' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=auth.uid()) THEN
      RAISE EXCEPTION 'session_take_seat:missing_historical_participant';
    END IF;
    SELECT deck_color_mode INTO v_deck FROM public.profiles WHERE id=auth.uid();
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
    VALUES(g.id,auth.uid(),p_position,0,'active',in_play,waiting_room OR in_play,v_deck)
    RETURNING * INTO p;
  ELSIF p.status IN ('left','observer') OR p.position IS NULL THEN
    UPDATE public.players SET position=p_position,status='active',sitting_out=in_play,
      waiting=waiting_room OR in_play,ante_decision=NULL,stand_up_next_hand=false,sit_out_next_hand=false
    WHERE id=p.id RETURNING * INTO p;
  ELSE
    UPDATE public.players SET position=p_position,
      sitting_out=CASE WHEN in_play THEN sitting_out ELSE false END,
      status=CASE WHEN in_play THEN status ELSE 'active' END,
      waiting=CASE WHEN in_play THEN waiting ELSE false END
    WHERE id=p.id RETURNING * INTO p;
  END IF;
  -- A newcomer at an already-settled boundary has an authoritative zero opening
  -- balance. Include it for session finalization without reserving an active hand.
  IF p.chips=0 AND g.status IN ('waiting','waiting_for_players','game_over')
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id=g.id)
     AND NOT EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=p.user_id) THEN
    v_prior_357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
    SELECT g.id,g.current_game_uuid,coalesce(g.total_hands,0),p.id,p.user_id,coalesce(profile.username,'Player'),0,false
      FROM public.profiles profile WHERE profile.id=p.user_id;
    PERFORM set_config('app.three_five_seven_authoritative_write',v_prior_357,true);
  END IF;
  UPDATE public.games SET current_host=(
    SELECT seated.user_id FROM public.players seated WHERE seated.game_id=g.id AND NOT seated.is_bot
      AND seated.status NOT IN ('left','observer') AND seated.position IS NOT NULL
    ORDER BY seated.created_at,seated.id LIMIT 1
  ) WHERE id=g.id AND NOT EXISTS (
    SELECT 1 FROM public.players host WHERE host.game_id=g.id AND host.user_id=g.current_host
      AND NOT host.is_bot AND host.status NOT IN ('left','observer') AND host.position IS NOT NULL
  );
  RETURN jsonb_build_object('outcome','seated','player_id',p.id,'participation_version',p.participation_version);
END;
$$;
CREATE TABLE private.session_creation_requests(
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, payload jsonb NOT NULL,
 game_id uuid REFERENCES public.games(id) ON DELETE SET NULL, player_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON private.session_creation_requests FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.create_session(p_request_id uuid,p_name text,p_real_money boolean,p_position integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt private.session_creation_requests%ROWTYPE; payload jsonb; g uuid; p uuid; seat integer;
 setup_seconds integer; ante_seconds integer; deck text;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
 THEN RAISE EXCEPTION 'create_session:not_authorized' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_real_money IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR (p_position IS NOT NULL AND p_position NOT BETWEEN 1 AND 7)
 THEN RAISE EXCEPTION 'create_session:invalid_request' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('name',btrim(p_name),'real_money',p_real_money,'position',p_position);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,914));
 SELECT * INTO receipt FROM private.session_creation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.actor_id IS DISTINCT FROM auth.uid() OR receipt.payload IS DISTINCT FROM payload
  THEN RAISE EXCEPTION 'create_session:request_mismatch' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('outcome',CASE WHEN receipt.game_id IS NULL THEN 'already_deleted' ELSE 'already_created' END,
   'game_id',receipt.game_id,'player_id',receipt.player_id);
 END IF;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND
 EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true')
 THEN RAISE EXCEPTION 'create_session:maintenance' USING ERRCODE='42501'; END IF;
 SELECT (value::text)::integer INTO setup_seconds FROM public.system_settings WHERE key='game_setup_timer_seconds';
 SELECT (value::text)::integer INTO ante_seconds FROM public.system_settings WHERE key='ante_decision_timer_seconds';
 SELECT deck_color_mode INTO deck FROM public.profiles WHERE id=auth.uid();
 seat:=coalesce(p_position,1+floor(random()*7)::integer);
 INSERT INTO public.games(name,status,real_money,buy_in,current_host,game_setup_timer_seconds,ante_decision_timer_seconds)
 VALUES(btrim(p_name),'waiting',p_real_money,100,auth.uid(),coalesce(setup_seconds,30),coalesce(ante_seconds,30)) RETURNING id INTO g;
 INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
 VALUES(g,auth.uid(),seat,0,'active',false,true,deck) RETURNING id INTO p;
 INSERT INTO private.session_creation_requests(request_id,actor_id,payload,game_id,player_id)
 VALUES(p_request_id,auth.uid(),payload,g,p);
 RETURN jsonb_build_object('outcome','created','game_id',g,'player_id',p);
END $$;
REVOKE ALL ON FUNCTION public.create_session(uuid,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_session(uuid,text,boolean,integer) TO authenticated;
REVOKE INSERT ON public.games FROM PUBLIC,anon,authenticated;

-- Visible intent survives disconnect; the round owner consumes it at turn advance.
ALTER TABLE public.players ADD COLUMN auto_play_stop_round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL;
CREATE FUNCTION public.set_automatic_play(p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,
 p_player_id uuid,p_expected_version bigint,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
END $$;
REVOKE ALL ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;

CREATE FUNCTION private.consume_automatic_play_stop() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status='completed' OR NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing'
 OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.consume_automatic_play_stop() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER consume_automatic_play_stop AFTER UPDATE OF horses_state,status ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.consume_automatic_play_stop();

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.players FROM PUBLIC,anon,authenticated;
GRANT UPDATE(deck_color_mode) ON public.players TO authenticated;
DROP POLICY "Anyone can update players" ON public.players;
CREATE POLICY "Humans can update their own deck preference" ON public.players FOR UPDATE TO authenticated
 USING(user_id=auth.uid() AND NOT is_bot) WITH CHECK(user_id=auth.uid() AND NOT is_bot);
CREATE OR REPLACE FUNCTION private.stamp_session_intent_version() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.intent_version:=0;
 ELSE NEW.intent_version:=OLD.intent_version+CASE WHEN
 ROW(OLD.auto_ante,OLD.auto_ante_runback,OLD.sit_out_next_hand,OLD.stand_up_next_hand,OLD.waiting,OLD.sitting_out,OLD.position,OLD.auto_fold,OLD.auto_play_stop_round_id,
 CASE OLD.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
 IS DISTINCT FROM
 ROW(NEW.auto_ante,NEW.auto_ante_runback,NEW.sit_out_next_hand,NEW.stand_up_next_hand,NEW.waiting,NEW.sitting_out,NEW.position,NEW.auto_fold,NEW.auto_play_stop_round_id,
 CASE NEW.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
 THEN 1 ELSE 0 END; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.submit_ante_decision(p_game_id uuid, p_expected_dealer_game_id uuid, p_player_id uuid, p_decision text, p_auto_ante boolean DEFAULT NULL::boolean, p_auto_ante_runback boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_phase jsonb;
BEGIN
  IF p_auto_ante IS TRUE AND p_auto_ante_runback IS TRUE THEN RAISE EXCEPTION 'submit_ante_decision:conflicting_preferences' USING ERRCODE='22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('ante_up','sit_out') THEN
    RAISE EXCEPTION 'submit_ante_decision:invalid_decision';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS NULL THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','paused');
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left')
     OR coalesce(v_player.sitting_out,false) THEN
    RETURN jsonb_build_object('outcome','player_ineligible');
  END IF;
  IF NOT v_service AND (
    auth.uid() IS NULL OR v_player.is_bot OR v_player.user_id IS DISTINCT FROM auth.uid()
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  IF v_game.ante_decision_deadline<=clock_timestamp() THEN
    v_phase:=private.advance_ante_phase_exact(
      p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
      clock_timestamp()
    );
    RETURN jsonb_build_object('outcome','deadline_expired','phase',v_phase);
  END IF;
  IF v_player.ante_decision IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome','already_decided','decision',v_player.ante_decision,'deduped',true
    );
  END IF;

  UPDATE public.players
     SET ante_decision=p_decision,
         sitting_out=(p_decision='sit_out'),
         waiting=CASE WHEN p_decision='sit_out' THEN false ELSE waiting END,
         auto_ante=CASE WHEN p_auto_ante_runback IS TRUE THEN false ELSE coalesce(p_auto_ante,auto_ante) END,
         auto_ante_runback=CASE WHEN p_auto_ante IS TRUE THEN false ELSE coalesce(p_auto_ante_runback,auto_ante_runback) END
   WHERE id=p_player_id;
  v_phase:=private.advance_ante_phase_exact(
    p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
    clock_timestamp()
  );
  RETURN jsonb_build_object(
    'outcome','accepted','decision',p_decision,'deduped',false,'phase',v_phase
  );
END;
$function$;
