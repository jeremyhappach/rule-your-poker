-- Browser lifecycle writes are requests, never arbitrary session-row updates.
CREATE FUNCTION private.guard_browser_session_genesis() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND (
 NEW.status IS DISTINCT FROM 'waiting' OR NEW.game_type IS NOT NULL OR NEW.current_game_uuid IS NOT NULL
 OR coalesce(NEW.current_round,0)<>0 OR coalesce(NEW.total_hands,0)<>0 OR coalesce(NEW.config_complete,false)
 OR NEW.config_deadline IS NOT NULL OR NEW.ante_decision_deadline IS NOT NULL
 OR coalesce(NEW.is_paused,false) OR coalesce(NEW.pending_session_end,false)
 OR NEW.session_ended_at IS NOT NULL OR NEW.game_over_at IS NOT NULL OR NEW.dealer_selection_state IS NOT NULL
 OR coalesce(NEW.awaiting_next_round,false) OR NEW.last_round_result IS NOT NULL
 ) THEN RAISE EXCEPTION 'session_genesis:invalid_initial_state' USING ERRCODE='42501'; END IF;
 IF current_user IN ('anon','authenticated') AND NOT public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN
 RAISE EXCEPTION 'session_genesis:maintenance' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_browser_session_genesis BEFORE INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_session_genesis();

CREATE FUNCTION private.request_session_end(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; ctx text; prior jsonb:='{}'; target text; terminal_key text; settled boolean:=false; result jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true); END IF;
 IF g.status IN ('session_ended','completed') THEN
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','session_ended','already_terminal',true); END IF;
 IF g.status='game_over' THEN
  terminal_key:=CASE g.game_type WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN '3-5-7-game' THEN 'three_five_seven_terminal'
   WHEN '357' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal'
   WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  SELECT coalesce(g.pot,0)=0 AND EXISTS(SELECT 1 FROM public.game_results r WHERE r.game_id=g.id
   AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands
   AND ((g.game_type IN ('holm','holm-game') AND r.event_kind='chucky_final_award') OR r.settlement_key=terminal_key))
   INTO settled;
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF (g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0 AND g.status IN ('waiting','dealer_selection','game_selection','configuring')) OR settled THEN
  IF g.real_money IS FALSE AND g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0
   AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND chips<>0)
   AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g.id) THEN
   DELETE FROM public.games WHERE id=g.id; target:='deleted';
  ELSE
   UPDATE public.games SET status='session_ended',session_ended_at=coalesce(session_ended_at,clock_timestamp()),
    pending_session_end=false,config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=g.id;
   target:='session_ended';
  END IF;
 ELSE
  -- Rule engines consume the request at their financial completion boundary.
  UPDATE public.games SET pending_session_end=true WHERE id=g.id;
  target:='pending_session_end';
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition',target,'already_terminal',false);
END $$;
REVOKE ALL ON FUNCTION private.request_session_end(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.request_session_end(p_game_id uuid,p_expected_dealer_game_id uuid,p_expected_timer_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; fallback_host uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_end:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true); END IF;
 SELECT user_id INTO fallback_host FROM public.players WHERE game_id=g.id AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL ORDER BY created_at,id LIMIT 1;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 coalesce(g.current_host,fallback_host) IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL)
 AND NOT (g.current_host=auth.uid() AND g.status='waiting' AND g.current_game_uuid IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id))) THEN
 RAISE EXCEPTION 'session_end:not_session_host' USING ERRCODE='42501'; END IF;
 IF g.status IN ('session_ended','completed') THEN RETURN private.request_session_end(g.id); END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.timer_generation IS DISTINCT FROM p_expected_timer_generation THEN
 RETURN jsonb_build_object('request_recorded',false,'outcome','stale_identity'); END IF;
 RETURN private.request_session_end(g.id);
END $$;
REVOKE ALL ON FUNCTION public.request_session_end(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_session_end(uuid,uuid,bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.holm_request_session_end(uuid),public.three_five_seven_request_session_end(uuid),
 public.resolve_postgame_participation(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_set_maintenance_mode(p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g record; result jsonb; pending_count integer:=0; ended_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
 RAISE EXCEPTION 'maintenance:not_authorized' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'maintenance:missing_value' USING ERRCODE='22023'; END IF;
 -- Existing tables remain usable while their authoritative games finish.
 UPDATE public.system_settings SET value=jsonb_build_object('enabled',p_enabled),updated_at=clock_timestamp()
 WHERE key='maintenance_mode';
 IF NOT FOUND THEN RAISE EXCEPTION 'maintenance:setting_missing'; END IF;
 IF p_enabled THEN
  FOR g IN SELECT id FROM public.games WHERE status NOT IN ('session_ended','completed') ORDER BY id FOR UPDATE LOOP
   result:=private.request_session_end(g.id);
   IF result->>'terminal_disposition'='pending_session_end' THEN pending_count:=pending_count+1; ELSE ended_count:=ended_count+1; END IF;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('enabled',p_enabled,'pending_sessions',pending_count,'closed_sessions',ended_count);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_maintenance_mode(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_maintenance_mode(boolean) TO authenticated;

CREATE FUNCTION private.guard_browser_maintenance() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
 ((TG_OP<>'INSERT' AND OLD.key='maintenance_mode') OR (TG_OP<>'DELETE' AND NEW.key='maintenance_mode')) THEN
 RAISE EXCEPTION 'maintenance:command_required' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_browser_maintenance BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_maintenance();

REVOKE UPDATE,DELETE,TRUNCATE ON public.games FROM PUBLIC,anon,authenticated;
-- The canonical deadline dispatcher uses the same guarded game-family context.
CREATE OR REPLACE FUNCTION private.handle_config_deadline_timeout_exact(p_game_id uuid, p_expected_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_dealer_position integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_dealer_id uuid;
  v_next_dealer_pos integer;
  v_allow_bot boolean := false;
  v_setup_seconds integer;
  v_new_deadline timestamptz;
  v_active_total integer;
  v_active_humans integer;
  v_outcome text;
  v_forced_absence_armed_at timestamptz;
  v_ctx text;
  v_prior jsonb := '{}';
BEGIN
  FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    v_prior:=v_prior||jsonb_build_object(v_ctx,coalesce(current_setting(v_ctx,true),''));
    PERFORM set_config(v_ctx,'on',true);
  END LOOP;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object('outcome','suppressed','reason','game-not-found');
  END IF;
  IF p_expected_deadline IS NOT NULL
     AND v_game.config_deadline IS DISTINCT FROM p_expected_deadline THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-deadline');
  END IF;
  IF p_expected_dealer_position IS NOT NULL
     AND v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-dealer');
  END IF;
  IF v_game.status NOT IN ('dealer_selection','configuring','game_selection')
     OR coalesce(v_game.config_complete,false)
     OR coalesce(v_game.is_paused,false)
     OR v_game.config_deadline IS NULL
     OR v_game.config_deadline > clock_timestamp() THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object(
      'outcome','suppressed','reason','game-advanced-or-not-expired',
      'status',v_game.status,'config_deadline',v_game.config_deadline
    );
  END IF;

  SELECT player.id INTO v_dealer_id FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position = v_game.dealer_position LIMIT 1;
  IF v_dealer_id IS NOT NULL THEN
    v_forced_absence_armed_at := clock_timestamp();
    UPDATE public.players SET sitting_out=true,waiting=false
     WHERE id=v_dealer_id;
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT player.game_id, player.id, v_forced_absence_armed_at, 'config_timeout'
      FROM public.players AS player
     WHERE player.id = v_dealer_id
       AND player.is_bot = false
       AND EXISTS (
         SELECT 1
           FROM public.game_results AS result
          WHERE result.game_id = player.game_id
       )
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm') LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);
  v_setup_seconds := greatest(1,coalesce(nullif(v_game.game_setup_timer_seconds,0),30));

  SELECT count(*),
         count(*) FILTER (WHERE NOT coalesce(player.is_bot,false))
    INTO v_active_total,v_active_humans
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left');

  IF v_active_humans = 0 THEN
    v_outcome := private.resolve_postgame_participation(p_game_id,clock_timestamp());
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object('outcome',CASE
      WHEN v_outcome='session-ended-with-results' THEN 'session_ended'
      ELSE 'waiting' END,'reason',v_outcome);
  END IF;

  SELECT player.position INTO v_next_dealer_pos
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false))
     AND (v_dealer_id IS NULL OR player.id<>v_dealer_id)
   ORDER BY CASE WHEN player.position>coalesce(v_game.dealer_position,0) THEN 0 ELSE 1 END,
            player.position
   LIMIT 1;

  IF v_next_dealer_pos IS NOT NULL AND v_active_total>=2 THEN
    v_new_deadline:=clock_timestamp()+make_interval(secs=>v_setup_seconds);
    UPDATE public.games
       SET dealer_position=v_next_dealer_pos,
           config_deadline=v_new_deadline,
           config_complete=false,
           current_game_uuid=NULL
     WHERE id=p_game_id;
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    RETURN jsonb_build_object(
      'outcome','rotated','new_dealer_position',v_next_dealer_pos,
      'new_config_deadline',v_new_deadline,'active_total',v_active_total
    );
  END IF;

  UPDATE public.games
     SET status='waiting',config_deadline=NULL,ante_decision_deadline=NULL,
         config_complete=false,awaiting_next_round=false,
         last_round_result=NULL,current_game_uuid=NULL
   WHERE id=p_game_id;
  FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
  RETURN jsonb_build_object('outcome','waiting','active_humans',v_active_humans);
END;
$function$
;
NOTIFY pgrst,'reload schema';
