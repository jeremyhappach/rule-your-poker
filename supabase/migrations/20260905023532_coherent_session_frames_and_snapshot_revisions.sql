-- Per-row revisions avoid adding a new session lock to existing action paths.
CREATE OR REPLACE FUNCTION private.gin_project_state(_state jsonb, _game_id uuid, _actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_state jsonb := private.gin_public_state(_state) || jsonb_build_object('_authorityRevision',private.session_authority_revision(_game_id),'_authorityScope',_game_id);
  v_player_id uuid;
BEGIN
  IF _actor_id IS NULL OR _state IS NULL THEN
    RETURN v_state;
  END IF;

  SELECT participant.id
    INTO v_player_id
    FROM public.players participant
   WHERE participant.game_id = _game_id
     AND participant.user_id = _actor_id
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  IF v_player_id IS NOT NULL AND _state->'playerStates' ? v_player_id::text THEN
    v_state := jsonb_set(
      v_state,
      ARRAY['playerStates', v_player_id::text, 'hand'],
      coalesce(_state->'playerStates'->v_player_id::text->'hand', '[]'::jsonb),
      true
    );
  END IF;

  IF v_player_id IS NOT NULL
     AND _state #>> '{lastAction,type}' = 'draw_stock'
     AND _state #>> '{lastAction,playerId}' = v_player_id::text
     AND jsonb_typeof(_state #> '{lastAction,card}') = 'object' THEN
    v_state := jsonb_set(
      v_state,
      '{lastAction,card}',
      _state #> '{lastAction,card}',
      false
    );
  END IF;
  RETURN v_state;
END;
$function$;
CREATE OR REPLACE FUNCTION private.cribbage_project_state(p_state jsonb, p_game_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_state jsonb := private.cribbage_public_state(p_state) || jsonb_build_object('_authorityRevision',private.session_authority_revision(p_game_id),'_authorityScope',p_game_id);
  v_player_id uuid;
  v_private_player jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_state IS NULL THEN
    RETURN v_state;
  END IF;

  SELECT participant.id
    INTO v_player_id
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = p_actor_id
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  IF v_player_id IS NULL OR NOT (p_state->'playerStates' ? v_player_id::text) THEN
    RETURN v_state;
  END IF;

  v_private_player := p_state->'playerStates'->v_player_id::text;
  v_state := jsonb_set(
    v_state,
    ARRAY['playerStates', v_player_id::text, 'hand'],
    coalesce(v_private_player->'hand', '[]'::jsonb),
    true
  );
  v_state := jsonb_set(
    v_state,
    ARRAY['playerStates', v_player_id::text, 'discardedToCrib'],
    coalesce(v_private_player->'discardedToCrib', '[]'::jsonb),
    true
  );
  RETURN v_state;
END;
$function$;
CREATE OR REPLACE FUNCTION public.three_five_seven_current_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_players jsonb := '[]'::jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_viewer public.players%ROWTYPE;
  v_is_privileged boolean := false;
  v_viewer_cards_required boolean := false;
  v_viewer_cards_present boolean := false;
  v_opening_charge_exists boolean := false;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:missing_game_id';
  END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_in_session';
  END IF;

  SELECT * INTO v_game FROM public.games game_row WHERE game_row.id = p_game_id;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_357_game';
  END IF;

  IF (
       v_game.status = 'game_over'
       OR (
         v_game.status = 'session_ended'
         AND (
           v_game.current_game_uuid IS NOT NULL
           OR coalesce(v_game.total_hands, 0) > 0
           OR v_game.current_round IS NOT NULL
         )
       )
     )
     AND (
       v_game.current_game_uuid IS NULL
       OR coalesce(v_game.total_hands, 0) < 1
       OR v_game.current_round IS NULL
     ) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:terminal_round_identity_missing';
  END IF;

  IF v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round
      FROM public.rounds round_row
     WHERE round_row.game_id = p_game_id
       AND round_row.dealer_game_id = v_game.current_game_uuid
       AND round_row.hand_number = v_game.total_hands
       AND round_row.round_number = v_game.current_round;
  END IF;

  IF v_game.status IN ('in_progress','game_over','session_ended')
     AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL
     AND v_round.id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:exact_round_missing';
  END IF;

  IF v_round.id IS NOT NULL AND v_round.round_number = 1 THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.game_results charge_result
       WHERE charge_result.game_id = v_round.game_id
         AND charge_result.dealer_game_id = v_round.dealer_game_id
         AND charge_result.hand_number = v_round.hand_number
         AND charge_result.settlement_key = 'three_five_seven_charge:' || v_round.id::text
    ) INTO v_opening_charge_exists;
    IF v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_missing';
    END IF;
    IF NOT v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NOT NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:unexpected_opening_transfer_claim';
    END IF;
    IF v_round.three_five_seven_opening_transfer_cursor IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.gameplay_transfer_batches batch
          WHERE batch.game_id = v_round.game_id
            AND batch.dealer_game_id IS NOT DISTINCT FROM v_round.dealer_game_id
            AND batch.cursor = v_round.three_five_seven_opening_transfer_cursor
            AND batch.reason = 'ante'
       ) THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_mismatch';
    END IF;
  END IF;

  SELECT participant.* INTO v_viewer
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = auth.uid()
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  v_is_privileged := coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role));

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(participant) || jsonb_build_object(
        'profiles', CASE WHEN profile.id IS NULL THEN NULL
          ELSE jsonb_build_object('username', profile.username) END
      ) ORDER BY participant.position, participant.id
    ), '[]'::jsonb
  ) INTO v_players
    FROM public.players participant
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
   WHERE participant.game_id = p_game_id
     AND participant.status <> 'left';

  IF v_round.id IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('player_id', cards.player_id, 'cards', cards.cards)
        ORDER BY cards.player_id
      ), '[]'::jsonb
    ) INTO v_cards
      FROM public.player_cards cards
      JOIN public.players owner
        ON owner.id = cards.player_id
       AND owner.game_id = p_game_id
     WHERE cards.round_id = v_round.id
       AND (
         coalesce(cards.is_public, false)
         OR owner.user_id = auth.uid()
         OR v_is_privileged
       );

    v_viewer_cards_required := v_viewer.id IS NOT NULL
      AND v_viewer.status NOT IN ('left','observer')
      AND NOT coalesce(v_viewer.sitting_out, false)
      AND NOT coalesce(v_viewer.is_bot, false);
    v_viewer_cards_present := v_viewer.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.player_cards cards
       WHERE cards.round_id = v_round.id AND cards.player_id = v_viewer.id
    );
    IF v_viewer_cards_required AND NOT v_viewer_cards_present THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:viewer_cards_missing';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'game', to_jsonb(v_game)||jsonb_build_object('_authorityRevision',private.session_authority_revision(p_game_id)),
    'round', CASE WHEN v_round.id IS NULL THEN NULL ELSE
      to_jsonb(v_round) || jsonb_build_object(
        'three_five_seven_opening_transfer_required', v_opening_charge_exists
      )
    END,
    'players', v_players,
    'player_cards', v_cards,
    'viewer_player_id', v_viewer.id,
    'viewer_cards_required', v_viewer_cards_required,
    'viewer_cards_present', v_viewer_cards_present,
    'decision_reveal', private.three_five_seven_decision_reveal(
      p_game_id, v_game.current_game_uuid, v_round.id,
      v_game.total_hands, v_game.current_round
    ),
    'server_now', statement_timestamp(),
    'identity', jsonb_build_object(
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', v_game.total_hands,
      'round_number', v_game.current_round,
      'round_id', v_round.id,
      'opening_transfer_required', v_opening_charge_exists,
      'opening_transfer_cursor', v_round.three_five_seven_opening_transfer_cursor,
      'chip_transfer_cursor', coalesce(v_game.chip_transfer_cursor, 0)
    )
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.horses_scc_apply_action(_round_id uuid, _player_id uuid, _action text, _expected_action_sequence integer, _hold_mask boolean[] DEFAULT NULL::boolean[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
 UPDATE public.rounds SET horses_state=s WHERE id=r.id RETURNING horses_state INTO s;
 RETURN jsonb_build_object('outcome','applied','action_sequence',seq+1,'state',s);
END;
$function$;
CREATE OR REPLACE FUNCTION public.yahtzee_apply_action(_round_id uuid, _player_id uuid, _action text, _die_index integer DEFAULT NULL::integer, _category text DEFAULT NULL::text, _hold_mask boolean[] DEFAULT NULL::boolean[], _expected_action_sequence integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_state jsonb;
  v_ps jsonb;
  v_dice jsonb;
  v_scores jsonb;
  v_action text:=lower(coalesce(_action,''));
  v_deadline_auto boolean:=v_action='deadline_auto';
  v_sequence integer;
  v_rolls integer;
  v_hold_mask boolean[];
  v_values integer[];
  v_best_value integer;
  v_best_count integer;
  v_category text:=_category;
  v_category_candidate text;
  v_score integer;
  v_candidate_score integer;
  v_best_score integer:=-1;
  v_best_priority integer:=-1;
  v_priority integer;
  v_bonus integer;
  v_is_yahtzee boolean;
  v_is_complete boolean;
  v_all_complete boolean;
  v_turn_order uuid[];
  v_current_index integer;
  v_next_player_id uuid;
  v_deadline timestamptz;
  v_expected_deadline timestamptz;
  v_settlement jsonb;
  offset_index integer;
BEGIN
  IF v_actor_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'yahtzee_apply_action:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_action:round_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_yahtzee_game';
  END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_game.id)
     AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_in_session';
  END IF;
  IF coalesce(v_game.is_paused,false) OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','round_not_current');
  END IF;
  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game_not_playing','state',v_state);
  END IF;
  BEGIN
    v_sequence:=coalesce((v_state->>'actionSequence')::integer,0);
    v_deadline:=nullif(v_state->>'turnDeadline','')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_turn_identity';
  END;
  IF v_deadline IS NULL OR v_round.decision_deadline IS DISTINCT FROM v_deadline THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_identity_changed','state',v_state);
  END IF;
  IF _expected_action_sequence IS NOT NULL AND _expected_action_sequence<>v_sequence THEN
    RETURN jsonb_build_object(
      'outcome','stale_action','deduped',true,'action_sequence',v_sequence,'state',v_state
    );
  END IF;
  IF nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM _player_id THEN
    RETURN jsonb_build_object('outcome','rejected','reason','not_current_turn','state',v_state);
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=_player_id AND game_id=v_game.id AND status NOT IN ('observer','left');
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_apply_action:player_not_found'; END IF;

  IF v_deadline_auto THEN
    IF NOT v_service THEN
      RAISE EXCEPTION 'yahtzee_apply_action:deadline_auto_requires_service_role';
    END IF;
    IF v_deadline>clock_timestamp() THEN
      RETURN jsonb_build_object('outcome','rejected','reason','deadline_not_due','state',v_state);
    END IF;
    v_action:='auto';
  ELSIF NOT v_service AND v_deadline<=clock_timestamp() THEN
    RETURN jsonb_build_object('outcome','rejected','reason','turn_deadline_expired','state',v_state);
  END IF;

  IF v_action IN ('auto','bot_roll','bot_score') THEN
    IF NOT v_deadline_auto
       AND NOT coalesce(v_player.is_bot,false)
       AND NOT (
         NOT coalesce(v_game.real_money,false)
         AND coalesce(v_player.auto_fold,false)
         AND v_action IN ('bot_roll','bot_score')
         AND v_player.user_id IS NOT DISTINCT FROM v_actor_id
       ) THEN
      RAISE EXCEPTION 'yahtzee_apply_action:auto_requires_bot';
    END IF;
  ELSIF NOT v_service AND v_player.user_id IS DISTINCT FROM v_actor_id
        AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_apply_action:not_player_owner';
  END IF;

  v_ps:=v_state->'playerStates'->_player_id::text;
  v_dice:=v_ps->'dice';
  v_scores:=coalesce(v_ps->'scorecard'->'scores','{}'::jsonb);
  v_rolls:=coalesce((v_ps->>'rollsRemaining')::integer,3);
  IF jsonb_typeof(v_ps) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_dice) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_dice)<>5 THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_player_state';
  END IF;

  IF v_action='auto' THEN
    SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
      INTO v_values FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_is_yahtzee:=v_rolls<3 AND (SELECT count(DISTINCT value)=1 AND min(value)>0 FROM unnest(v_values) value);
    IF v_rolls=0 OR v_is_yahtzee THEN
      v_action:='bot_score';
    ELSE
      IF v_rolls<3 THEN
        SELECT value,count(*) INTO v_best_value,v_best_count
          FROM unnest(v_values) value GROUP BY value ORDER BY count(*) DESC,value DESC LIMIT 1;
        IF v_best_count>=2 THEN
          SELECT array_agg(value=v_best_value ORDER BY ordinality)
            INTO v_hold_mask FROM unnest(v_values) WITH ORDINALITY item(value,ordinality);
        ELSE
          v_hold_mask:=ARRAY[false,false,false,false,false];
        END IF;
      END IF;
      v_action:='bot_roll';
    END IF;
  END IF;

  IF v_action IN ('roll','bot_roll') THEN
    IF v_rolls<=0 THEN RETURN jsonb_build_object('outcome','rejected','reason','no_rolls_remaining','state',v_state); END IF;
    IF v_action='bot_roll' AND _hold_mask IS NOT NULL THEN v_hold_mask:=_hold_mask; END IF;
    IF v_hold_mask IS NOT NULL THEN
      IF cardinality(v_hold_mask)<>5 THEN RAISE EXCEPTION 'yahtzee_apply_action:invalid_hold_mask'; END IF;
      SELECT jsonb_agg(jsonb_set(die.value,'{isHeld}',to_jsonb(v_hold_mask[die.ordinality]),true) ORDER BY die.ordinality)
        INTO v_dice FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
             'value',CASE WHEN coalesce((die.value->>'isHeld')::boolean,false)
                          THEN (die.value->>'value')::integer
                          ELSE floor(random()*6+1)::integer END,
             'isHeld',coalesce((die.value->>'isHeld')::boolean,false)
           ) ORDER BY die.ordinality),
           array_agg(coalesce((die.value->>'isHeld')::boolean,false) ORDER BY die.ordinality)
      INTO v_dice,v_hold_mask
      FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_sequence:=v_sequence+1;
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}',to_jsonb(v_rolls-1),true);
    v_ps:=jsonb_set(v_ps,'{rollKey}',to_jsonb(format('yahtzee:%s:%s:%s',_round_id,_player_id,v_sequence)),true);
    v_ps:=jsonb_set(v_ps,'{heldMaskBeforeComplete}',to_jsonb(v_hold_mask),true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    -- Rolls preserve the exact deadline assigned when this player turn began.
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline
     WHERE id=_round_id;
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','applied','action','roll','action_sequence',v_sequence,'state',v_state);
  END IF;

  IF v_action='hold' THEN
    IF _die_index IS NULL OR _die_index<0 OR _die_index>4 THEN
      RETURN jsonb_build_object('outcome','rejected','reason','invalid_die_index','state',v_state);
    END IF;
    IF v_rolls=3 OR v_rolls=0 THEN
      RETURN jsonb_build_object('outcome','rejected','reason','hold_not_allowed','state',v_state);
    END IF;
    SELECT jsonb_agg(CASE WHEN die.ordinality=_die_index+1
      THEN jsonb_set(die.value,'{isHeld}',to_jsonb(NOT coalesce((die.value->>'isHeld')::boolean,false)),true)
      ELSE die.value END ORDER BY die.ordinality)
      INTO v_dice FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_sequence:=v_sequence+1;
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline WHERE id=_round_id;
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
    RETURN jsonb_build_object('outcome','applied','action','hold','action_sequence',v_sequence,'state',v_state);
  END IF;

  IF v_action IN ('score','bot_score') THEN
    IF v_rolls=3 THEN RETURN jsonb_build_object('outcome','rejected','reason','must_roll_first','state',v_state); END IF;
    IF v_action='bot_score' AND v_category IS NULL THEN
      FOREACH v_category_candidate IN ARRAY ARRAY[
        'ones','twos','threes','fours','fives','sixes','three_of_a_kind',
        'four_of_a_kind','full_house','small_straight','large_straight','yahtzee','chance'
      ] LOOP
        IF private.yahtzee_category_is_legal(v_ps->'scorecard',v_dice,v_category_candidate) THEN
          v_candidate_score:=private.yahtzee_category_score(v_ps->'scorecard',v_dice,v_category_candidate);
          v_priority:=CASE v_category_candidate
            WHEN 'yahtzee' THEN 13 WHEN 'large_straight' THEN 12 WHEN 'small_straight' THEN 11
            WHEN 'full_house' THEN 10 WHEN 'four_of_a_kind' THEN 9 WHEN 'three_of_a_kind' THEN 8
            WHEN 'chance' THEN 7 WHEN 'sixes' THEN 6 WHEN 'fives' THEN 5 WHEN 'fours' THEN 4
            WHEN 'threes' THEN 3 WHEN 'twos' THEN 2 ELSE 1 END;
          IF v_candidate_score>v_best_score OR (v_candidate_score=v_best_score AND v_priority>v_best_priority) THEN
            v_best_score:=v_candidate_score;v_best_priority:=v_priority;v_category:=v_category_candidate;
          END IF;
        END IF;
      END LOOP;
    END IF;
    IF v_category IS NULL OR NOT private.yahtzee_category_is_legal(v_ps->'scorecard',v_dice,v_category) THEN
      RETURN jsonb_build_object('outcome','rejected','reason','category_not_legal','state',v_state);
    END IF;
    v_score:=private.yahtzee_category_score(v_ps->'scorecard',v_dice,v_category);
    SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
      INTO v_values FROM jsonb_array_elements(v_dice) WITH ORDINALITY die(value,ordinality);
    v_is_yahtzee:=(SELECT count(DISTINCT value)=1 AND min(value)>0 FROM unnest(v_values) value);
    v_bonus:=coalesce((v_ps->'scorecard'->>'yahtzeeBonuses')::integer,0);
    IF v_is_yahtzee AND coalesce((v_scores->>'yahtzee')::integer,0)=50 THEN v_bonus:=v_bonus+1; END IF;
    v_scores:=jsonb_set(v_scores,ARRAY[v_category],to_jsonb(v_score),true);
    SELECT count(*)=13 INTO v_is_complete FROM jsonb_object_keys(v_scores);
    v_ps:=jsonb_set(v_ps,'{scorecard,scores}',v_scores,true);
    v_ps:=jsonb_set(v_ps,'{scorecard,yahtzeeBonuses}',to_jsonb(v_bonus),true);
    v_ps:=jsonb_set(v_ps,'{isComplete}',to_jsonb(v_is_complete),true);
    v_ps:=jsonb_set(v_ps,'{dice}','[{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false},{"value":0,"isHeld":false}]'::jsonb,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}','3'::jsonb,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{lastAction}',jsonb_build_object(
      'type','score','playerId',_player_id,'category',v_category,'score',v_score,
      'dice',v_dice,'sequence',v_sequence+1
    ),true);
    SELECT NOT EXISTS(
      SELECT 1 FROM jsonb_each(v_state->'playerStates') entry
       WHERE coalesce((entry.value->>'isComplete')::boolean,false)=false
    ) INTO v_all_complete;
    v_sequence:=v_sequence+1;
    IF v_all_complete THEN
      v_state:=jsonb_set(v_state,'{currentTurnPlayerId}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{gamePhase}',to_jsonb('complete'::text),true);
      v_state:=jsonb_set(v_state,'{turnDeadline}','null'::jsonb,true);
      v_deadline:=NULL;
    ELSE
      SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_turn_order
        FROM jsonb_array_elements_text(v_state->'turnOrder') WITH ORDINALITY item(value,ordinality);
      v_current_index:=array_position(v_turn_order,_player_id);
      FOR offset_index IN 1..cardinality(v_turn_order) LOOP
        v_next_player_id:=v_turn_order[((v_current_index-1+offset_index)%cardinality(v_turn_order))+1];
        EXIT WHEN coalesce((v_state->'playerStates'->v_next_player_id::text->>'isComplete')::boolean,false)=false;
      END LOOP;
      v_deadline:=private.yahtzee_turn_deadline(v_game.id,v_next_player_id);
      v_state:=jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_next_player_id),true);
      v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_deadline),true);
    END IF;
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline,
      current_turn_position=(SELECT position FROM public.players WHERE id=v_next_player_id)
     WHERE id=_round_id;
    IF v_all_complete THEN
      v_settlement:=public.yahtzee_settle_game(v_game.id,_round_id,v_round.dealer_game_id,v_round.hand_number);
    END IF;
    SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=_round_id;
    RETURN jsonb_build_object(
      'outcome','applied','action','score','action_sequence',v_sequence,
      'category',v_category,'score',v_score,'terminal',v_all_complete,
      'state',v_state,'settlement',v_settlement
    );
  END IF;
  RETURN jsonb_build_object('outcome','rejected','reason','unknown_action','state',v_state);
END;
$function$;
ALTER TABLE public.games ADD COLUMN authority_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.players ADD COLUMN authority_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.rounds ADD COLUMN authority_revision bigint NOT NULL DEFAULT 1;
CREATE TABLE private.session_revision_tombstones(
 game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 relation_name text NOT NULL, row_id uuid NOT NULL, revision bigint NOT NULL,
 PRIMARY KEY(game_id,relation_name,row_id)
);
REVOKE ALL ON private.session_revision_tombstones FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.stamp_authority_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous bigint;
BEGIN
 IF TG_OP='DELETE' THEN
  -- Parent deletion needs no revision: the entire session identity has retired.
  IF EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id) THEN
   INSERT INTO private.session_revision_tombstones(game_id,relation_name,row_id,revision)
   VALUES(OLD.game_id,TG_TABLE_NAME,OLD.id,OLD.authority_revision+1)
   ON CONFLICT(game_id,relation_name,row_id) DO UPDATE SET revision=greatest(session_revision_tombstones.revision,EXCLUDED.revision);
  END IF;
  RETURN OLD;
 END IF;
 NEW.authority_revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.authority_revision+1 END;
 IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('players','rounds') THEN
  DELETE FROM private.session_revision_tombstones WHERE game_id=NEW.game_id AND relation_name=TG_TABLE_NAME AND row_id=NEW.id RETURNING revision INTO previous;
  NEW.authority_revision:=coalesce(previous+1,1);
 END IF;
 IF TG_TABLE_NAME='rounds' THEN
  IF NEW.horses_state IS NOT NULL THEN NEW.horses_state:=NEW.horses_state||jsonb_build_object('_authorityRevision',NEW.authority_revision,'_authorityScope',NEW.id); END IF;
  IF NEW.yahtzee_state IS NOT NULL THEN NEW.yahtzee_state:=NEW.yahtzee_state||jsonb_build_object('_authorityRevision',NEW.authority_revision,'_authorityScope',NEW.id); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.stamp_authority_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzz_stamp_authority_revision BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.stamp_authority_revision();
CREATE TRIGGER zzz_stamp_authority_revision BEFORE INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.stamp_authority_revision();
CREATE TRIGGER zzz_stamp_authority_revision BEFORE INSERT OR UPDATE OR DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.stamp_authority_revision();
CREATE TRIGGER zzz_retire_player_revision BEFORE DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.stamp_authority_revision();

CREATE FUNCTION private.session_authority_revision(p_game_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT authority_revision FROM public.games WHERE id=p_game_id),0)
 +coalesce((SELECT sum(authority_revision) FROM public.players WHERE game_id=p_game_id),0)
 +coalesce((SELECT sum(authority_revision) FROM public.rounds WHERE game_id=p_game_id),0)
 +coalesce((SELECT sum(revision) FROM private.session_revision_tombstones WHERE game_id=p_game_id),0)
$$;
REVOKE ALL ON FUNCTION private.session_authority_revision(uuid) FROM PUBLIC,anon,authenticated;

-- All joined rows and their revision come from the same MVCC statement snapshot.
CREATE FUNCTION public.read_session_frame(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_session_frame(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.cribbage_get_state(_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'cribbage_get_state:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id = _round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_get_state:round_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players participant
     WHERE participant.game_id = v_round.game_id
       AND participant.user_id = v_actor_id
       AND participant.status <> 'left'
  ) AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_get_state:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = _round_id;
  v_state := coalesce(v_state, v_round.cribbage_state);
  RETURN private.cribbage_project_state(v_state, v_round.game_id, v_actor_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.gin_rummy_get_state(_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_state jsonb;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF v_actor IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'gin_rummy_get_state:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_get_state:round_not_found'; END IF;
  IF NOT v_service
     AND NOT public.user_is_in_game(v_round.game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_get_state:not_in_session';
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_get_state:state_not_found'; END IF;
  RETURN private.gin_project_state(v_state,v_round.game_id,v_actor);
END;
$function$;
