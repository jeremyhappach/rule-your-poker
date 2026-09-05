-- The player row remains the balance owner across departure and rejoin.
ALTER TABLE public.players ADD COLUMN participation_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.players ALTER COLUMN position DROP NOT NULL;

CREATE TABLE private.session_departures (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  participation_version integer NOT NULL,
  user_id uuid NOT NULL,
  dealer_game_id uuid,
  hand_number integer NOT NULL,
  position integer,
  chips integer NOT NULL,
  departed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, player_id, participation_version)
);
REVOKE ALL ON private.session_departures FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.stamp_participation_version()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.participation_version:=0;
  ELSE
    NEW.participation_version:=OLD.participation_version + CASE WHEN
      OLD.position IS DISTINCT FROM NEW.position OR
      (CASE OLD.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
        <> (CASE NEW.status WHEN 'left' THEN 0 WHEN 'observer' THEN 1 ELSE 2 END)
      THEN 1 ELSE 0 END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_participation_version BEFORE INSERT OR UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION private.stamp_participation_version();

CREATE OR REPLACE FUNCTION private.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
END;
$function$;


REVOKE ALL ON FUNCTION private.stand_up_and_resolve_postgame(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.stand_up_and_resolve_postgame(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.session_leave(
  p_game_id uuid, p_player_id uuid, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  g public.games%ROWTYPE; p public.players%ROWTYPE; result jsonb;
  keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write',
    'app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  prior text[]:=ARRAY[]::text[]; i integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing-game'); END IF;
  SELECT * INTO p FROM public.players
    WHERE id=p_player_id AND game_id=p_game_id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  IF g.status IN ('session_ended','completed') THEN
    RETURN jsonb_build_object('outcome','already-session-ended');
  END IF;
  IF p.participation_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('outcome','stale-participation');
  END IF;
  IF p.status='left' THEN RETURN jsonb_build_object('outcome','already-left'); END IF;
  -- A mid-hand departure is not a settled hand. Never occupy its financial snapshot key.
  IF g.current_game_uuid IS NOT NULL OR coalesce(g.total_hands,0)>0 OR p.chips<>0 THEN
    INSERT INTO private.session_departures
      (game_id,player_id,participation_version,user_id,dealer_game_id,hand_number,position,chips)
    VALUES(g.id,p.id,p.participation_version,p.user_id,g.current_game_uuid,coalesce(g.total_hands,0),p.position,p.chips)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR i IN 1..cardinality(keys) LOOP
    prior:=array_append(prior,coalesce(current_setting(keys[i],true),''));
    PERFORM set_config(keys[i],'on',true);
  END LOOP;
  result:=private.stand_up_and_resolve_postgame(p_game_id);
  FOR i IN 1..cardinality(keys) LOOP PERFORM set_config(keys[i],prior[i],true); END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.session_leave(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.session_leave(uuid,uuid,integer) TO authenticated;

CREATE FUNCTION public.session_take_seat(
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
  UPDATE public.games SET current_host=auth.uid() WHERE id=g.id AND NOT EXISTS (
    SELECT 1 FROM public.players host WHERE host.game_id=g.id AND host.user_id=g.current_host
      AND NOT host.is_bot AND host.status NOT IN ('left','observer') AND host.position IS NOT NULL
  );
  RETURN jsonb_build_object('outcome','seated','player_id',p.id,'participation_version',p.participation_version);
END;
$$;
REVOKE ALL ON FUNCTION public.session_take_seat(uuid,integer,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.session_take_seat(uuid,integer,uuid,integer) TO authenticated;

-- All seven settlement owners already write final snapshots in their transaction.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.session_player_snapshots FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
