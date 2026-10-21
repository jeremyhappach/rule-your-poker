-- Deployed dependencies captured read-only 2026-10-21, used only inside local rollback proofs.
CREATE OR REPLACE FUNCTION private.shift_pause_timestamp(p_state jsonb, p_path text[], p_duration interval)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN nullif(p_state#>>p_path,'') IS NULL THEN p_state
 ELSE jsonb_set(p_state,p_path,to_jsonb((p_state#>>p_path)::timestamptz+p_duration),false) END
$function$
;
CREATE OR REPLACE FUNCTION private.capture_recovery_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_object_agg(k,coalesce(current_setting(k,true),'')) FROM unnest(ARRAY[
 'request.jwt.claim.sub','request.jwt.claim.role','request.jwt.claims',
 'app.three_five_seven_authoritative_write','app.three_five_seven_recovery',
 'app.cribbage_authoritative_write','app.gin_rummy_authoritative_write',
 'app.yahtzee_authoritative_write','app.session_pause_write'
 ]) k
$function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION private.restore_recovery_context(p_context jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE item record;
BEGIN FOR item IN SELECT key,value FROM jsonb_each_text(p_context) LOOP PERFORM set_config(item.key,item.value,true); END LOOP; END
$function$
;
