-- Migration candidate. Do not apply until the rollback proof passes.
-- Preserves the deployed election, locks, replay receipts, and dealer draw.
CREATE OR REPLACE FUNCTION private.waiting_start_is_blocked(p_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT NOT EXISTS (
  SELECT 1 FROM public.games g WHERE g.id=p_game_id
    AND g.status='waiting' AND g.current_game_uuid IS NULL AND g.pot=0
    AND NOT coalesce(g.is_paused,false) AND NOT coalesce(g.pending_session_end,false)
    AND g.session_ended_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.game_id=g.id AND r.status IS DISTINCT FROM 'completed')
    AND NOT EXISTS (SELECT 1 FROM public.gameplay_transfer_pending_changes c WHERE c.game_id=g.id)
 )
$function$;
REVOKE ALL ON FUNCTION private.waiting_start_is_blocked(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_waiting_start_blocked(p_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT CASE WHEN auth.uid() IS NULL AND coalesce(auth.jwt()->>'role','')<>'service_role'
   THEN true ELSE private.waiting_start_is_blocked(p_game_id) END
$function$;
REVOKE ALL ON FUNCTION public.get_waiting_start_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_waiting_start_blocked(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.begin_session_dealer_selection(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_host public.players%ROWTYPE;
  v_other public.players%ROWTYPE;
  v_occupant public.players%ROWTYPE;
  v_eligible_count integer := 0;
  v_target_position integer;
  v_sole_count integer;
  v_sole_position integer;
  v_old_other_position integer;
  v_new_dealer_position integer;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
  IF NOT v_service AND auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.begin_session_dealer_selection',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status = 'dealer_selection' THEN
    v_replay_return := jsonb_build_object('outcome','already_started','status',v_game.status,'timer_generation',v_game.timer_generation,'dealer_selection_state',v_game.dealer_selection_state);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_game.status <> 'waiting' THEN
    v_replay_return := jsonb_build_object('outcome','not_startable','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  -- Waiting must be a settled boundary. Never clear a live pointer or money
  -- merely because a caller (or stale lifecycle writer) published 'waiting'.
  IF private.waiting_start_is_blocked(p_game_id) THEN
    v_replay_return := jsonb_build_object('outcome','blocked_unfinished_state','status',v_game.status);
    IF v_replay_shared IS NOT NULL THEN
      PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),v_replay_return);
    END IF;
    RETURN v_replay_return;
  END IF;
  PERFORM 1 FROM public.players player WHERE player.game_id = p_game_id FOR UPDATE;
  SELECT count(*) INTO v_eligible_count
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false));
  IF v_eligible_count < 2 THEN
    v_replay_return := jsonb_build_object('outcome','not_ready','eligible_players',v_eligible_count);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT player.* INTO v_host
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     AND NOT coalesce(player.is_bot,false)
   ORDER BY CASE WHEN player.user_id = v_game.current_host THEN 0 ELSE 1 END,
            player.created_at NULLS LAST, player.id
   LIMIT 1;
  IF NOT FOUND THEN
    SELECT player.* INTO v_host
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     ORDER BY player.created_at NULLS LAST, player.id
     LIMIT 1;
  END IF;
  IF NOT v_service AND v_host.user_id IS DISTINCT FROM auth.uid() THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_eligible_count = 2 THEN
    SELECT player.* INTO v_other
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.id <> v_host.id
       AND player.position IS NOT NULL AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     LIMIT 1;
    v_target_position := ((v_host.position - 1 + 3) % 7) + 1;
    v_old_other_position := v_other.position;
    IF least(abs(v_host.position - v_other.position),7 - abs(v_host.position - v_other.position)) <> 3 THEN
      SELECT player.* INTO v_occupant FROM public.players player
       WHERE player.game_id = p_game_id AND player.id <> v_other.id
         AND player.position = v_target_position LIMIT 1;
      IF FOUND THEN UPDATE public.players SET position = NULL WHERE id = v_occupant.id; END IF;
      UPDATE public.players SET position = v_target_position WHERE id = v_other.id;
      IF v_occupant.id IS NOT NULL THEN
        UPDATE public.players SET position = v_old_other_position WHERE id = v_occupant.id;
      END IF;
      v_new_dealer_position := v_game.dealer_position;
      IF v_new_dealer_position = v_old_other_position THEN
        v_new_dealer_position := v_target_position;
      ELSIF v_occupant.id IS NOT NULL AND v_new_dealer_position = v_target_position THEN
        v_new_dealer_position := v_old_other_position;
      END IF;
      IF v_new_dealer_position IS DISTINCT FROM v_game.dealer_position THEN
        UPDATE public.games SET dealer_position = v_new_dealer_position WHERE id = p_game_id;
      END IF;
    END IF;
  END IF;
  UPDATE public.players SET status = 'active', sitting_out = false, waiting = false
   WHERE game_id = p_game_id AND position IS NOT NULL AND status NOT IN ('observer','left')
     AND (coalesce(waiting,false) OR NOT coalesce(sitting_out,false));
  UPDATE public.games
     SET status = 'dealer_selection', dealer_selection_state = NULL, current_game_uuid = NULL,
         config_deadline = NULL, config_complete = false, awaiting_next_round = false, last_round_result = NULL
   WHERE id = p_game_id
   RETURNING * INTO v_game;

  WITH eligible AS (
    SELECT player.position, coalesce(player.is_bot,false) AS is_bot
      FROM public.players player
     WHERE player.game_id=p_game_id AND player.position IS NOT NULL
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  )
  SELECT count(*),min(position) INTO v_sole_count,v_sole_position
    FROM eligible
   WHERE NOT is_bot
      OR coalesce((SELECT defaults.allow_bot_dealers FROM public.game_defaults defaults
                    WHERE defaults.game_type=coalesce(v_game.game_type,'holm') LIMIT 1),false)
      OR NOT EXISTS (SELECT 1 FROM eligible WHERE NOT is_bot);

  IF v_sole_count=1 THEN
    -- Reuse both canonical authority steps in the same locked Start transaction.
    PERFORM private.prepare_session_dealer_selection(p_game_id,v_game.timer_generation);
    PERFORM private.complete_session_dealer_selection(p_game_id,v_game.timer_generation);
    SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  END IF;
  v_replay_return := jsonb_build_object('outcome','started','status',v_game.status,'timer_generation',v_game.timer_generation);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$;
