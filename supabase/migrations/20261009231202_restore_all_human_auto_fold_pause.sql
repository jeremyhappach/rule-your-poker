-- Restore the retired all-human auto-fold guard at canonical action boundaries.
-- No presence policy, scheduler, accounting rule, or historical data changes.
CREATE OR REPLACE FUNCTION private.pause_all_humans_auto_fold(p_game_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
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
 IF NOT enabled OR action<>'auto_fold' THEN RETURN false; END IF;
 SELECT count(*),count(*) FILTER(WHERE coalesce(p.auto_fold,false)) INTO humans,automatic
 FROM public.players p WHERE p.game_id=g.id AND NOT coalesce(p.is_bot,false)
 AND p.position IS NOT NULL AND NOT coalesce(p.sitting_out,false)
 AND CASE WHEN g.game_type IN ('holm','holm-game') THEN p.status='active' ELSE p.status NOT IN ('left','observer') END;
 IF humans=0 OR automatic<>humans THEN RETURN false; END IF;

 -- Lock only a qualifying session. Ordinary dice/untimed recovery keeps its
 -- original round -> game lock order. NOWAIT makes contention retryable.
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF g.status<>'in_progress' THEN RETURN false; END IF;
 IF coalesce(g.is_paused,false) THEN RETURN true; END IF;
 IF g.timeout_enforcement_enabled IS NOT NULL AND g.timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll') THEN
  enabled:=g.timeout_enforcement_enabled; action:=g.timeout_action;
 ELSE enabled:=coalesce(d.timeout_enforcement_enabled,false); action:=coalesce(d.timeout_action,'none'); END IF;
 IF NOT enabled OR action<>'auto_fold' THEN RETURN false; END IF;
 PERFORM 1 FROM public.players p WHERE p.game_id=g.id ORDER BY p.id FOR UPDATE NOWAIT;
 SELECT count(*),count(*) FILTER(WHERE coalesce(p.auto_fold,false)) INTO humans,automatic
 FROM public.players p WHERE p.game_id=g.id AND NOT coalesce(p.is_bot,false)
 AND p.position IS NOT NULL AND NOT coalesce(p.sitting_out,false)
 AND CASE WHEN g.game_type IN ('holm','holm-game') THEN p.status='active' ELSE p.status NOT IN ('left','observer') END;
 IF humans=0 OR automatic<>humans THEN RETURN false; END IF;

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
END $guard$;
REVOKE ALL ON FUNCTION private.pause_all_humans_auto_fold(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Apply every replacement for an owner before compiling its complete body.
DO $patch$
DECLARE item record; body text; prior_signature text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
('public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean)',$before0$  PERFORM set_config('request.jwt.claim.sub', v_player.user_id::text, true);$before0$,$after0$  -- Mark a validated human expiry before a decision can settle or continue.
  IF p_mark_auto_fold AND p_decision='fold' AND NOT coalesce(v_player.is_bot,false) THEN
    UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=v_player.id;
  END IF;
  IF private.pause_all_humans_auto_fold(p_game_id) THEN
    RETURN jsonb_build_object('outcome','paused','game_paused',true,'round_id',v_round.id);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_player.user_id::text, true);$after0$,0),
('public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean)',$before1$  IF p_mark_auto_fold
     AND p_decision = 'fold'
     AND coalesce((v_result->>'decision_locked')::boolean, false) THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = p_player_id
       AND game_id = p_game_id;
  END IF;$before1$,$after1$  -- The timeout intent was committed before the decision owner.$after1$,1),
('public.three_five_seven_expire_round(uuid,uuid,uuid,integer,integer)',$before2$  IF NOT coalesce(v_game.timeout_enforcement_enabled,true)$before2$,$after2$  IF coalesce(v_game.is_paused,false) THEN RETURN jsonb_build_object('outcome','paused'); END IF;
  IF NOT coalesce(v_game.timeout_enforcement_enabled,true)$after2$,2),
('public.three_five_seven_expire_round(uuid,uuid,uuid,integer,integer)',$before3$  UPDATE public.players SET current_decision='fold',decision_locked=true$before3$,$after3$  UPDATE public.players SET auto_fold=true,sit_out_next_hand=true
   WHERE game_id=p_game_id AND NOT coalesce(is_bot,false) AND position IS NOT NULL
     AND status NOT IN ('left','observer') AND NOT coalesce(sitting_out,false)
     AND NOT coalesce(decision_locked,false);
  IF private.pause_all_humans_auto_fold(p_game_id) THEN RETURN jsonb_build_object('outcome','paused'); END IF;
  UPDATE public.players SET current_decision='fold',decision_locked=true$after3$,3),
('private.three_five_seven_recover_game(uuid)',$before4$  IF v_game.status='ante_decision' THEN$before4$,$after4$  IF private.pause_all_humans_auto_fold(p_game_id) THEN RETURN jsonb_build_object('outcome','paused'); END IF;

  IF v_game.status='ante_decision' THEN$after4$,4),
('public.prepare_next_holm_hand(uuid,uuid)',$before5$  IF coalesce(v_game.is_paused, false) THEN$before5$,$after5$  IF coalesce(v_game.is_paused, false) OR private.pause_all_humans_auto_fold(p_game_id) THEN$after5$,5),
('private.activate_prepared_holm_hand_exact(uuid,uuid,uuid,text)',$before6$  IF coalesce(v_game.is_paused, false) THEN$before6$,$after6$  IF coalesce(v_game.is_paused, false) OR private.pause_all_humans_auto_fold(p_game_id) THEN$after6$,6),
('public.three_five_seven_advance_round(uuid,uuid,uuid,integer,integer)',$before7$  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions$before7$,$after7$  IF coalesce(v_game.is_paused,false) OR private.pause_all_humans_auto_fold(p_game_id) THEN RETURN jsonb_build_object('outcome','paused'); END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions$after7$,7),
('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)',$before8$ v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));$before8$,$after8$ PERFORM private.pause_all_humans_auto_fold(p_game_id);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));$after8$,8),
('private.advance_due_canonical_game_timers(integer)',$before9$      CASE v_timer.timer_kind$before9$,$after9$      IF private.pause_all_humans_auto_fold(v_timer.game_id) THEN
        v_result:=jsonb_build_object('outcome','paused');
      ELSE
      CASE v_timer.timer_kind$after9$,9),
('private.advance_due_canonical_game_timers(integer)',$before10$      END CASE;

      IF v_result->>'outcome'$before10$,$after10$      END CASE;
      END IF;

      IF v_result->>'outcome'$after10$,10),
('private.advance_due_canonical_game_timers(integer)',$before11$IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN$before11$,$after11$IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') OR coalesce((v_result->>'game_paused')::boolean,false) THEN$after11$,11),
('private.advance_due_canonical_game_timers(integer)',$before12$               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')$before12$,$after12$               due_at=CASE WHEN v_result->>'outcome'='paused' OR coalesce((v_result->>'game_paused')::boolean,false) THEN due_at
                 WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')$after12$,12)
 ) AS changes(signature,before_text,after_text,ordinal) ORDER BY ordinal LOOP
  IF prior_signature IS DISTINCT FROM item.signature THEN
   IF prior_signature IS NOT NULL THEN EXECUTE body; END IF;
   body:=replace(pg_get_functiondef(item.signature::regprocedure),E'\r\n',E'\n');
   prior_signature:=item.signature;
  END IF;
  IF (length(body)-length(replace(body,item.before_text,'')))/length(item.before_text)<>1 THEN
   RAISE EXCEPTION 'all_human_auto_fold:owner_drift:%',item.signature;
  END IF;
  body:=replace(body,item.before_text,item.after_text);
 END LOOP;
 IF prior_signature IS NOT NULL THEN EXECUTE body; END IF;
END $patch$;
