-- Horses/SCC actions accept intent, never a client dice/state payload.
CREATE OR REPLACE FUNCTION private.horses_scc_finish_turn(p_round_id uuid,p_player_id uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE r public.rounds; g public.games; s jsonb; ps jsonb; next_id uuid; idx integer;
 timer_seconds integer; bot_delay numeric; next_bot boolean; next_auto boolean; due timestamptz;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 s:=r.horses_state;
 IF g.game_type NOT IN ('horses','ship-captain-crew') OR g.status<>'in_progress'
  OR coalesce(g.is_paused,false) OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id
  OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
  OR r.status<>'betting' OR s->>'currentTurnPlayerId' IS DISTINCT FROM p_player_id::text THEN RETURN s; END IF;
 ps:=s->'playerStates'->p_player_id::text;
 IF NOT coalesce((ps->>'isComplete')::boolean,false) OR ps->'result' IS NULL OR ps->'result'='null'::jsonb THEN RETURN s; END IF;
 due:=nullif(s->>'turnAdvanceAt','')::timestamptz;
 IF due IS NOT NULL AND due>p_now THEN RETURN s; END IF;
 SELECT ordinality::integer INTO idx FROM jsonb_array_elements_text(s->'turnOrder') WITH ORDINALITY x(id,ordinality) WHERE id=p_player_id::text;
 IF idx IS NULL THEN RAISE EXCEPTION 'horses_action:invalid_turn_order'; END IF;
 SELECT value::uuid INTO next_id FROM jsonb_array_elements_text(s->'turnOrder') WITH ORDINALITY x(value,ordinality)
 WHERE ordinality>idx AND NOT coalesce((s->'playerStates'->value->>'isComplete')::boolean,false)
 ORDER BY ordinality LIMIT 1;
 IF next_id IS NULL THEN
  s:=s||jsonb_build_object('currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,'turnAdvanceAt',NULL);
 ELSE
  SELECT is_bot,auto_fold INTO next_bot,next_auto FROM public.players WHERE id=next_id AND game_id=g.id;
  SELECT coalesce(decision_timer_seconds,60),coalesce(bot_decision_delay_seconds,2) INTO timer_seconds,bot_delay FROM public.game_defaults WHERE game_type=g.game_type;
  due:=p_now+make_interval(secs=>CASE WHEN next_auto THEN 0 WHEN next_bot THEN greatest(0.1,coalesce(bot_delay,2)) ELSE greatest(1,coalesce(timer_seconds,60)) END);
  s:=s||jsonb_build_object('currentTurnPlayerId',next_id,'gamePhase','playing','turnDeadline',due,'turnAdvanceAt',NULL);
 END IF;
 s:=s||jsonb_build_object('actionSequence',coalesce((s->>'actionSequence')::integer,0)+1);
 UPDATE public.rounds SET horses_state=s WHERE id=r.id;
 RETURN s;
END;
$fn$;
REVOKE ALL ON FUNCTION private.horses_scc_finish_turn(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.horses_scc_apply_action(
 _round_id uuid,_player_id uuid,_action text,_expected_action_sequence integer,_hold_mask boolean[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE
 r public.rounds; g public.games; p public.players; s jsonb; ps jsonb; dice jsonb; die jsonb;
 seq integer; rolls integer; i integer; j integer; target integer; label text; profile text;
 holds boolean[]; result jsonb; finished boolean:=false; now_at timestamptz:=clock_timestamp();
 barrier timestamptz; deadline timestamptz; last_turn boolean; force_fixture boolean:=false;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'horses_action:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=_round_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'horses_action:round_not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 IF NOT public.user_is_in_game(g.id) THEN RAISE EXCEPTION 'horses_action:not_in_session' USING ERRCODE='42501'; END IF;
 s:=r.horses_state;
 IF g.game_type NOT IN ('horses','ship-captain-crew') OR g.status<>'in_progress'
  OR coalesce(g.is_paused,false) OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id
  OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
  OR r.status<>'betting' THEN RETURN jsonb_build_object('outcome','rejected','reason','round_not_current','state',s); END IF;
 SELECT * INTO p FROM public.players WHERE id=_player_id AND game_id=g.id AND status NOT IN ('left','observer');
 IF NOT FOUND THEN RAISE EXCEPTION 'horses_action:player_not_found'; END IF;
 IF (p.is_bot OR p.auto_fold) AND s->>'botControllerUserId'=auth.uid()::text THEN
  IF NOT p.is_bot AND g.real_money THEN RAISE EXCEPTION 'horses_action:real_money_auto_requires_owner' USING ERRCODE='42501'; END IF;
 ELSIF p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot THEN
  RAISE EXCEPTION 'horses_action:not_player_owner' USING ERRCODE='42501';
 END IF;
 seq:=coalesce((s->>'actionSequence')::integer,0);
 IF _expected_action_sequence IS NULL THEN RAISE EXCEPTION 'horses_action:sequence_required'; END IF;
 IF _expected_action_sequence<>seq THEN RETURN jsonb_build_object('outcome','stale_action','action_sequence',seq,'state',s); END IF;
 IF s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM _player_id::text THEN
  RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',s); END IF;
 ps:=s->'playerStates'->_player_id::text; dice:=ps->'dice'; rolls:=coalesce((ps->>'rollsRemaining')::integer,3);
 IF coalesce((ps->>'isComplete')::boolean,false) THEN RETURN jsonb_build_object('outcome','stale_action','action_sequence',seq,'state',s); END IF;
 IF jsonb_typeof(dice)<>'array' OR jsonb_array_length(dice)<>5 OR rolls NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'horses_action:invalid_state'; END IF;
 deadline:=nullif(s->>'turnDeadline','')::timestamptz;
 IF NOT p.is_bot AND NOT p.auto_fold AND deadline IS NOT NULL AND deadline<=now_at THEN
  RETURN jsonb_build_object('outcome','rejected','reason','deadline_expired','state',s); END IF;
 barrier:=nullif(ps->>'rollAnimationMinEndAt','')::timestamptz;
 IF barrier>now_at THEN RETURN jsonb_build_object('outcome','rejected','reason','roll_presentation_pending','state',s); END IF;
 IF _action NOT IN ('roll','set_holds','lock') THEN RAISE EXCEPTION 'horses_action:invalid_action'; END IF;
 IF _hold_mask IS NOT NULL THEN
  IF cardinality(_hold_mask)<>5 OR array_position(_hold_mask,NULL) IS NOT NULL THEN RAISE EXCEPTION 'horses_action:invalid_holds'; END IF;
  IF rolls=3 AND true=ANY(_hold_mask) THEN RAISE EXCEPTION 'horses_action:cannot_hold_before_roll'; END IF;
  FOR i IN 0..4 LOOP
   die:=dice->i;
   IF coalesce((die->>'isSCC')::boolean,false) AND NOT _hold_mask[i+1] THEN RAISE EXCEPTION 'horses_action:scc_lock_is_permanent'; END IF;
   dice:=jsonb_set(dice,ARRAY[i::text],jsonb_set(die,'{isHeld}',to_jsonb(_hold_mask[i+1]),true));
  END LOOP;
 END IF;
 SELECT array_agg(coalesce((value->>'isHeld')::boolean,false) ORDER BY ordinality) INTO holds FROM jsonb_array_elements(dice) WITH ORDINALITY;
 IF _action='roll' THEN
  IF rolls<=0 THEN RAISE EXCEPTION 'horses_action:no_rolls'; END IF;
  SELECT debug_harness INTO profile FROM public.game_defaults WHERE game_type=g.game_type;
  SELECT g.real_money IS FALSE AND coalesce((value->>'enabled')::boolean,false) INTO force_fixture FROM public.system_settings WHERE key='harnesses_mode';
  FOR i IN 0..4 LOOP
   die:=dice->i;
   IF NOT holds[i+1] THEN
    target:=CASE WHEN force_fixture AND g.game_type='horses' AND profile='force_tie' THEN 1
      WHEN force_fixture AND g.game_type='ship-captain-crew' AND profile='force_no_qualify' THEN floor(random()*3+1)::integer
      ELSE floor(random()*6+1)::integer END;
    die:=jsonb_set(die,'{value}',to_jsonb(target),true);
    IF g.game_type='ship-captain-crew' THEN die:=(die-'sccType')||jsonb_build_object('isSCC',false); END IF;
    dice:=jsonb_set(dice,ARRAY[i::text],die);
   END IF;
  END LOOP;
  IF g.game_type='ship-captain-crew' THEN
   FOR j IN 1..3 LOOP
    label:=CASE j WHEN 1 THEN 'ship' WHEN 2 THEN 'captain' ELSE 'crew' END; target:=7-j;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dice) x WHERE x->>'sccType'=label) THEN
     SELECT ordinality::integer-1 INTO i FROM jsonb_array_elements(dice) WITH ORDINALITY x(value,ordinality)
      WHERE (value->>'value')::integer=target AND NOT coalesce((value->>'isSCC')::boolean,false) ORDER BY ordinality LIMIT 1;
     IF i IS NULL THEN EXIT; END IF;
     dice:=jsonb_set(dice,ARRAY[i::text],(dice->i)||jsonb_build_object('isHeld',true,'isSCC',true,'sccType',label));
    END IF;
   END LOOP;
  END IF;
  IF p.is_bot AND rolls=3 THEN
   SELECT coalesce(decision_timer_seconds,60) INTO target FROM public.game_defaults WHERE game_type=g.game_type;
   s:=s||jsonb_build_object('turnDeadline',now_at+make_interval(secs=>greatest(1,coalesce(target,60))));
  END IF;
  rolls:=rolls-1;
  result:=private.horses_scc_player_result(dice,g.game_type);
  finished:=rolls=0 OR (g.game_type='ship-captain-crew' AND (result->>'cargoSum')::integer=12);
  ps:=ps||jsonb_build_object('rollKey',greatest(floor(extract(epoch FROM now_at)*1000)::bigint,coalesce((ps->>'rollKey')::bigint,0)+1),
   'holdSeq',0,'rollStartedAt',now_at,'rollAnimationMinEndAt',now_at+make_interval(secs=>CASE WHEN rolls=2 THEN 1.3 ELSE 1.8 END),
   'heldMaskBeforeComplete',to_jsonb(holds),'heldCountBeforeComplete',(SELECT count(*) FROM unnest(holds) h WHERE h));
 ELSIF _action='set_holds' THEN
  IF _hold_mask IS NULL OR rolls=3 THEN RAISE EXCEPTION 'horses_action:hold_requires_roll'; END IF;
  ps:=ps||jsonb_build_object('holdSeq',coalesce((ps->>'holdSeq')::integer,0)+1);
 ELSE
  IF rolls=3 THEN RAISE EXCEPTION 'horses_action:lock_requires_roll'; END IF;
  result:=private.horses_scc_player_result(dice,g.game_type);
  IF g.game_type='ship-captain-crew' AND NOT (result->>'isQualified')::boolean THEN RAISE EXCEPTION 'horses_action:scc_not_qualified'; END IF;
  finished:=true;
 END IF;
 IF finished THEN
  rolls:=0;
  SELECT jsonb_agg(jsonb_set(value,'{isHeld}','true'::jsonb,true) ORDER BY ordinality) INTO dice FROM jsonb_array_elements(dice) WITH ORDINALITY;
  ps:=ps||jsonb_build_object('result',result);
  last_turn:=(s->'turnOrder'->>(jsonb_array_length(s->'turnOrder')-1))=_player_id::text;
  s:=s||jsonb_build_object('turnAdvanceAt',now_at+make_interval(secs=>(CASE WHEN _action='roll' THEN 1.8 ELSE 0 END)+(CASE WHEN last_turn THEN 0 ELSE 3 END)));
 END IF;
 ps:=ps||jsonb_build_object('dice',dice,'rollsRemaining',rolls,'isComplete',finished);
 s:=jsonb_set(s,ARRAY['playerStates',_player_id::text],ps)||jsonb_build_object('actionSequence',seq+1);
 UPDATE public.rounds SET horses_state=s WHERE id=r.id;
 RETURN jsonb_build_object('outcome','applied','action_sequence',seq+1,'state',s);
END;
$fn$;
REVOKE ALL ON FUNCTION public.horses_scc_apply_action(uuid,uuid,text,integer,boolean[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.horses_scc_apply_action(uuid,uuid,text,integer,boolean[]) TO authenticated;
REVOKE ALL ON FUNCTION public.horses_set_player_state(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.horses_advance_turn(_round_id uuid,_expected_current_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE r public.rounds; s jsonb;
BEGIN
 SELECT * INTO r FROM public.rounds WHERE id=_round_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT public.user_is_in_game(r.game_id) THEN RAISE EXCEPTION 'horses_advance:not_in_session' USING ERRCODE='42501'; END IF;
 -- A peer may deliver an already-committed completion; it cannot complete a hand.
 s:=private.horses_scc_finish_turn(_round_id,_expected_current_player_id);
 RETURN s;
END;
$fn$;
REVOKE ALL ON FUNCTION public.horses_advance_turn(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.horses_advance_turn(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.horses_scc_guard_round()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.rounds; is_dice boolean;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF current_user NOT IN ('anon','authenticated') THEN RETURN r; END IF;
 SELECT EXISTS(SELECT 1 FROM public.dealer_games d WHERE d.id=r.dealer_game_id AND d.game_type IN ('horses','ship-captain-crew'))
  OR (r.dealer_game_id IS NULL AND EXISTS(SELECT 1 FROM public.games g WHERE g.id=r.game_id AND g.game_type IN ('horses','ship-captain-crew'))) INTO is_dice;
 is_dice:=is_dice OR r.horses_state IS NOT NULL;
 IF TG_OP='UPDATE' THEN
  is_dice:=is_dice OR OLD.horses_state IS NOT NULL OR NEW.horses_state IS DISTINCT FROM OLD.horses_state;
 END IF;
 IF is_dice THEN RAISE EXCEPTION 'horses_round:rpc_required' USING ERRCODE='42501'; END IF;
 RETURN r;
END;
$fn$;
REVOKE ALL ON FUNCTION private.horses_scc_guard_round() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS horses_scc_guard_round ON public.rounds;
CREATE TRIGGER horses_scc_guard_round BEFORE INSERT OR UPDATE OR DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.horses_scc_guard_round();

CREATE OR REPLACE FUNCTION private.advance_horses_scc_expired_turn(p_round_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_current_player_id uuid;
  v_current_state jsonb;
  v_current_is_bot boolean;
  v_current_auto_fold boolean;
  v_turn_deadline timestamptz;
  v_all_absent boolean;
  v_current_stale boolean;
  v_should_roll boolean;
  v_dice jsonb;
  v_die jsonb;
  v_index integer;
  v_roll integer;
  v_rolls_remaining integer;
  v_value integer;
  v_target integer;
  v_wild_count integer;
  v_best_count integer;
  v_best_value integer;
  v_candidate_count integer;
  v_has_ship boolean;
  v_has_captain boolean;
  v_has_crew boolean;
  v_cargo_sum integer;
  v_result jsonb;
  v_turn_order jsonb;
  v_seen_current boolean := false;
  v_next_player_id uuid;
  v_next_is_bot boolean;
  v_next_auto_fold boolean;
  v_timer_seconds integer;
  v_bot_delay_seconds numeric;
  v_next_deadline timestamptz;
  v_outcome jsonb;
  v_winner_count integer;
  v_settlement jsonb;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing_round');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = v_round.game_id FOR UPDATE;
  IF NOT FOUND
     OR v_game.game_type NOT IN ('horses', 'ship-captain-crew')
     OR v_game.status <> 'in_progress'
     OR COALESCE(v_game.is_paused, false)
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;

  v_state := v_round.horses_state;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('status', 'missing_state');
  END IF;
  v_all_absent := private.horses_scc_all_humans_absent(v_game.id, p_now);
  IF v_state ->> 'gamePhase' = 'complete' THEN
    v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
    v_winner_count := jsonb_array_length(v_outcome -> 'winner_player_ids');
    IF v_winner_count = 1 THEN
      SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
        INTO v_settlement;
      RETURN v_settlement;
    END IF;
    IF v_all_absent THEN
      RETURN private.horses_scc_rollover_abandoned_round(v_round.id, p_now);
    END IF;
    RETURN jsonb_build_object('status', 'tie_waiting_for_client');
  END IF;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('status', 'unsupported_phase');
  END IF;

  BEGIN
    v_current_player_id := NULLIF(v_state ->> 'currentTurnPlayerId', '')::uuid;
    v_turn_deadline := NULLIF(v_state ->> 'turnDeadline', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:malformed_turn_identity';
  END;
  IF v_current_player_id IS NULL THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:missing_current_player';
  END IF;
  v_current_state := v_state -> 'playerStates' -> v_current_player_id::text;
  IF COALESCE((v_current_state ->> 'isComplete')::boolean, false) THEN
    RETURN private.horses_scc_finish_turn(v_round.id,v_current_player_id,p_now);
  END IF;
  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_current_player_state';
  END IF;
  SELECT player.is_bot, player.auto_fold
    INTO v_current_is_bot, v_current_auto_fold
    FROM public.players AS player
   WHERE player.id = v_current_player_id AND player.game_id = v_game.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:current_player_not_in_game';
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.voice_presence_heartbeats AS heartbeat
     JOIN public.players AS player ON player.user_id = heartbeat.user_id
    WHERE heartbeat.game_id = v_game.id
      AND player.id = v_current_player_id
      AND heartbeat.status IN ('active', 'hidden')
      AND heartbeat.updated_at >= p_now - interval '15 seconds'
  ) INTO v_current_stale;
  v_should_roll := (v_current_is_bot AND v_all_absent)
    OR (v_turn_deadline IS NOT NULL AND v_turn_deadline <= p_now)
    OR (COALESCE(v_current_auto_fold, false) AND v_current_stale);
  IF NOT v_should_roll THEN
    RETURN jsonb_build_object('status', 'not_expired');
  END IF;

  IF NOT v_current_is_bot THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = v_current_player_id;
  END IF;
  v_dice := v_current_state -> 'dice';
  IF v_dice IS NULL OR jsonb_typeof(v_dice) <> 'array' OR jsonb_array_length(v_dice) <> 5 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_dice';
  END IF;

  BEGIN
    v_rolls_remaining := (v_current_state ->> 'rollsRemaining')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END;
  IF v_rolls_remaining NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END IF;

  FOR v_roll IN 1..v_rolls_remaining LOOP
    FOR v_index IN 0..4 LOOP
      v_die := v_dice -> v_index;
      IF NOT COALESCE((v_die ->> 'isHeld')::boolean, false) THEN
        v_die := v_die || jsonb_build_object('value', floor(random() * 6)::integer + 1);
        IF v_game.game_type = 'ship-captain-crew' THEN
          v_die := v_die - 'sccType' || jsonb_build_object('isSCC', false);
        END IF;
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END IF;
    END LOOP;

    IF v_game.game_type = 'horses' THEN
      v_wild_count := 0;
      v_best_count := 0;
      v_best_value := 0;
      FOR v_value IN 1..6 LOOP
        SELECT count(*) INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_value = 1 THEN
          v_wild_count := v_candidate_count;
        END IF;
      END LOOP;
      FOR v_value IN REVERSE 6..2 LOOP
        SELECT count(*) + v_wild_count INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_candidate_count > v_best_count
           OR (v_candidate_count = v_best_count AND v_value > v_best_value) THEN
          v_best_count := v_candidate_count;
          v_best_value := v_value;
        END IF;
      END LOOP;
      v_target := v_best_value;
      FOR v_index IN 0..4 LOOP
        v_die := v_dice -> v_index;
        v_value := (v_die ->> 'value')::integer;
        v_die := jsonb_set(v_die, '{isHeld}', to_jsonb(v_value = 1 OR v_value = v_target), true);
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END LOOP;
      EXIT WHEN v_best_count >= 5;
    ELSE
      SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'ship'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'captain'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'crew')
        INTO v_has_ship, v_has_captain, v_has_crew;
      IF NOT v_has_ship THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 6 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'ship'), false);
            v_has_ship := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND NOT v_has_captain THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 5 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'captain'), false);
            v_has_captain := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND NOT v_has_crew THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 4 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'crew'), false);
            v_has_crew := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND v_has_crew THEN
        SELECT COALESCE(sum((die.value ->> 'value')::integer), 0) INTO v_cargo_sum
          FROM jsonb_array_elements(v_dice) AS die
         WHERE NOT COALESCE((die.value ->> 'isSCC')::boolean, false);
        EXIT WHEN v_cargo_sum >= 8;
      END IF;
    END IF;
  END LOOP;

  FOR v_index IN 0..4 LOOP
    v_die := jsonb_set(v_dice -> v_index, '{isHeld}', 'true'::jsonb, true);
    v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
  END LOOP;
  v_result := private.horses_scc_player_result(v_dice, v_game.game_type);
  v_current_state := v_current_state || jsonb_build_object(
    'dice', v_dice,
    'rollsRemaining', 0,
    'isComplete', true,
    'result', v_result
  );
  v_state := jsonb_set(v_state, ARRAY['playerStates', v_current_player_id::text], v_current_state, true);

  v_turn_order := v_state -> 'turnOrder';
  FOR v_index IN 0..jsonb_array_length(v_turn_order) - 1 LOOP
    IF (v_turn_order ->> v_index)::uuid = v_current_player_id THEN
      v_seen_current := true;
    ELSIF v_seen_current
      AND NOT COALESCE(((v_state -> 'playerStates' -> (v_turn_order ->> v_index) ->> 'isComplete')::boolean), false) THEN
      v_next_player_id := (v_turn_order ->> v_index)::uuid;
      EXIT;
    END IF;
  END LOOP;

  IF v_next_player_id IS NULL THEN
    v_state := jsonb_set(v_state, '{gamePhase}', '"complete"'::jsonb, true);
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{turnDeadline}', 'null'::jsonb, true);
  ELSE
    SELECT player.is_bot, player.auto_fold INTO v_next_is_bot, v_next_auto_fold
      FROM public.players AS player WHERE player.id = v_next_player_id;
    SELECT COALESCE(defaults.decision_timer_seconds, 60),
           COALESCE(defaults.bot_decision_delay_seconds, 2)
      INTO v_timer_seconds, v_bot_delay_seconds
      FROM public.game_defaults AS defaults WHERE defaults.game_type = v_game.game_type;
    v_next_deadline := CASE
      WHEN v_next_auto_fold THEN p_now
      WHEN v_next_is_bot THEN p_now + make_interval(secs => GREATEST(0.1, COALESCE(v_bot_delay_seconds, 2)))
      ELSE p_now + make_interval(secs => GREATEST(1, COALESCE(v_timer_seconds, 60)))
    END;
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', to_jsonb(v_next_player_id::text), true);
    v_state := jsonb_set(v_state, '{turnDeadline}', to_jsonb(v_next_deadline), true);
  END IF;
  UPDATE public.rounds SET horses_state = v_state WHERE id = v_round.id;

  IF v_next_player_id IS NULL THEN
    SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
      INTO v_settlement;
    RETURN v_settlement;
  END IF;
  RETURN jsonb_build_object('status', 'advanced_turn', 'next_player_id', v_next_player_id);
END;
$function$
;
NOTIFY pgrst,'reload schema';
