-- Local fixture reconstruction from read-only production inspection at 2026-10-24 00:55 UTC.
-- Never apply this reference file to a hosted database.
-- admin_blast_fake_money_game(uuid) md5 06c2cedb3ef0b85485b0281f24f8cfcf
CREATE OR REPLACE FUNCTION public.admin_blast_fake_money_game(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_has_farkle boolean;
  v_prior_farkle_claim text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'not authorized';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-deleted',
      'deleted', false
    );
  END IF;

  IF v_game.real_money IS NOT FALSE THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only fake-money games can be blasted';
  END IF;

  -- A completed Farkle dealer game remains in this session's cascade even
  -- after canonical continuation clears games.game_type/current_game_uuid.
  SELECT v_game.game_type = 'farkle' OR EXISTS (
    SELECT 1 FROM public.dealer_games
     WHERE session_id = p_game_id AND game_type = 'farkle'
  ) INTO v_has_farkle;
  IF v_has_farkle THEN
    v_prior_farkle_claim := coalesce(current_setting('app.farkle_authority', true), '');
    PERFORM private.farkle_claim_v1(p_game_id, NULL, NULL, 'cleanup');
  END IF;

  -- This archive intentionally has no game foreign key, so it is the only
  -- session artifact that does not disappear through the games-row cascade.
  DELETE FROM public.cribbage_hand_archive
   WHERE game_id = p_game_id;

  -- The games row owns the rest of the session graph: players, dealer games,
  -- rounds, results, snapshots, chat, transfer batches, and private watches.
  DELETE FROM public.games
   WHERE id = p_game_id;

  IF v_has_farkle THEN
    PERFORM set_config('app.farkle_authority', v_prior_farkle_claim, true);
  END IF;
  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'deleted', true
  );
END;
$function$
;

-- private.pause_all_humans_auto_fold(uuid) md5 643abd1e2b49cf147268e68f2c4b3340
CREATE OR REPLACE FUNCTION private.pause_all_humans_auto_fold(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 g public.games%ROWTYPE; d public.game_defaults%ROWTYPE; r public.rounds%ROWTYPE;
 enabled boolean; action text; humans integer; automatic integer; result jsonb;
 saved jsonb:=private.capture_recovery_context();
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id;
 IF NOT FOUND OR g.status<>'in_progress' THEN RETURN false; END IF;
 IF coalesce(g.is_paused,false) THEN RETURN true; END IF;
 SELECT * INTO d FROM public.game_defaults
 WHERE game_type=CASE g.game_type WHEN 'holm-game' THEN 'holm' WHEN '357' THEN '3-5-7' WHEN '3-5-7-game' THEN '3-5-7' ELSE g.game_type END;
 -- Match the established complete-pair override/default/fail-closed contract.
 IF g.timeout_enforcement_enabled IS NOT NULL AND g.timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll') THEN
  enabled:=g.timeout_enforcement_enabled; action:=g.timeout_action;
 ELSE enabled:=coalesce(d.timeout_enforcement_enabled,false); action:=coalesce(d.timeout_action,'none'); END IF;
 IF g.game_type='eleven-up' THEN
 -- eleven_up_ready_all_humans_v1
 IF NOT EXISTS (SELECT 1 FROM private.eleven_up_matches m
  WHERE m.game_id=g.id AND m.dealer_game_id=g.current_game_uuid
   AND NOT m.finished AND m.settlement IS NULL AND m.state->>'phase'='ready')
 THEN RETURN false; END IF;
ELSE
 IF NOT enabled OR action<>'auto_fold' THEN RETURN false; END IF;
END IF;
 SELECT count(*),count(*) FILTER(WHERE coalesce(p.auto_fold,false)) INTO humans,automatic
 FROM public.players p WHERE p.game_id=g.id AND NOT coalesce(p.is_bot,false)
 AND p.position IS NOT NULL AND NOT coalesce(p.sitting_out,false)
 AND CASE WHEN g.game_type IN ('holm','holm-game') THEN p.status='active' ELSE p.status NOT IN ('left','observer') END;
 -- real_money_poker_last_present_human_v1
IF humans=0 OR automatic=0 OR (CASE
  WHEN coalesce(g.real_money,false) AND g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357')
  THEN humans-automatic>1
  ELSE automatic<>humans
 END) THEN RETURN false; END IF;

 -- Lock only a qualifying session. Ordinary dice/untimed recovery keeps its
 -- original round -> game lock order. NOWAIT makes contention retryable.
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF g.status<>'in_progress' THEN RETURN false; END IF;
 IF coalesce(g.is_paused,false) THEN RETURN true; END IF;
 IF g.timeout_enforcement_enabled IS NOT NULL AND g.timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll') THEN
  enabled:=g.timeout_enforcement_enabled; action:=g.timeout_action;
 ELSE enabled:=coalesce(d.timeout_enforcement_enabled,false); action:=coalesce(d.timeout_action,'none'); END IF;
 IF g.game_type='eleven-up' THEN
 -- eleven_up_ready_all_humans_v1
 IF NOT EXISTS (SELECT 1 FROM private.eleven_up_matches m
  WHERE m.game_id=g.id AND m.dealer_game_id=g.current_game_uuid
   AND NOT m.finished AND m.settlement IS NULL AND m.state->>'phase'='ready')
 THEN RETURN false; END IF;
ELSE
 IF NOT enabled OR action<>'auto_fold' THEN RETURN false; END IF;
END IF;
 PERFORM 1 FROM public.players p WHERE p.game_id=g.id ORDER BY p.id FOR UPDATE NOWAIT;
 SELECT count(*),count(*) FILTER(WHERE coalesce(p.auto_fold,false)) INTO humans,automatic
 FROM public.players p WHERE p.game_id=g.id AND NOT coalesce(p.is_bot,false)
 AND p.position IS NOT NULL AND NOT coalesce(p.sitting_out,false)
 AND CASE WHEN g.game_type IN ('holm','holm-game') THEN p.status='active' ELSE p.status NOT IN ('left','observer') END;
 -- real_money_poker_last_present_human_v1
IF humans=0 OR automatic=0 OR (CASE
  WHEN coalesce(g.real_money,false) AND g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357')
  THEN humans-automatic>1
  ELSE automatic<>humans
 END) THEN RETURN false; END IF;

 -- Preserve the unresolved decision for explicit resume. The last expiry is
 -- not a committed fold; give it the configured clock before freezing it.
 IF g.game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357') THEN
  SELECT * INTO r FROM public.rounds WHERE game_id=g.id AND dealer_game_id=g.current_game_uuid
   AND hand_number=g.total_hands AND round_number=g.current_round AND status='betting'
   FOR UPDATE NOWAIT;
  IF FOUND AND r.decision_deadline<=clock_timestamp() THEN
   -- Deadline synchronization can touch the registry; never wait behind a
   -- worker which already owns a timer and is waiting for this game.
   PERFORM 1 FROM private.game_timer_registry t WHERE t.game_id=g.id
    AND (t.state IN ('scheduled','processing') OR t.round_id=r.id) ORDER BY t.id FOR UPDATE NOWAIT;
   PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
   UPDATE public.rounds SET decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(d.decision_timer_seconds,
    CASE WHEN g.game_type IN ('holm','holm-game') THEN 30 ELSE 10 END))) WHERE id=r.id;
  END IF;
 END IF;
 -- Internal-only helper; callers retain their existing identity/authorization
 -- checks. Use the same trusted recovery identity and versioned pause owner.
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 IF coalesce(result->>'outcome','') NOT IN ('paused','already_set') THEN
  RAISE EXCEPTION 'all_human_auto_fold_pause:%',result USING ERRCODE='40001';
 END IF;
 PERFORM private.restore_recovery_context(saved);
 RETURN true;
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(saved);
 RAISE;
END $function$
;

-- set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) md5 a69f39fefb234c3b01114c8049fdbbb6
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_dealer_game_id,false);
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,r.dealer_game_id,r.id,'control'); END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND ((g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing')
 OR (g.game_type='farkle' AND r.farkle_state->>'currentTurnPlayerId'=p.id::text AND r.farkle_state->>'gamePhase'='playing'));
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 PERFORM private.pause_all_humans_auto_fold(p_game_id);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$
;
