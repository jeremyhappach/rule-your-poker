CREATE OR REPLACE FUNCTION public.gin_rummy_advance_postgame(_game_id uuid, _round_id uuid, _dealer_game_id uuid, _hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_claim private.gin_rummy_postgame_advances%ROWTYPE;
  v_winner public.players%ROWTYPE;
  v_winner_id uuid;
  v_settlement_count integer;
  v_active_count integer;
  v_active_humans integer;
  v_allow_bot_dealers boolean := false;
  v_make_it_take_it boolean := false;
  v_positions integer[];
  v_human_count integer;
  v_single_human_position integer;
  v_index integer;
  v_next_dealer integer;
  v_target text;
  v_deadline timestamptz;
  v_actor uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_prior_authority text;
BEGIN
  IF _game_id IS NULL OR _round_id IS NULL OR _dealer_game_id IS NULL OR coalesce(_hand_number,0)<1 THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:missing_identity';
  END IF;
  IF v_actor IS NULL AND NOT v_service THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_found'; END IF;
  IF v_round.game_id IS DISTINCT FROM _game_id OR v_round.dealer_game_id IS DISTINCT FROM _dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM _hand_number THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_gin_game'; END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor,'admin'::public.app_role) THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:not_in_session'; END IF;

  SELECT * INTO v_claim FROM private.gin_rummy_postgame_advances claim
   WHERE claim.game_id=_game_id AND claim.dealer_game_id=_dealer_game_id
     AND claim.round_id=_round_id AND claim.hand_number=_hand_number;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome','already_advanced','deduped',true,'status',v_claim.target_status,
      'dealer_position',v_claim.dealer_position,'config_deadline',v_claim.config_deadline);
  END IF;
  IF v_game.status IS DISTINCT FROM 'game_over' OR v_game.current_game_uuid IS DISTINCT FROM _dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM _hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,'current_hand_number',v_game.total_hands);
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id;
  BEGIN v_winner_id:=nullif(v_state->>'winnerPlayerId','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:malformed_winner'; END;
  IF v_round.status IS DISTINCT FROM 'completed' OR v_state->>'phase'<>'complete' OR v_winner_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_advance_postgame:round_not_terminal';
  END IF;
  SELECT count(*) INTO v_settlement_count FROM public.game_results result
   WHERE result.game_id=_game_id AND result.dealer_game_id=_dealer_game_id
     AND result.hand_number=_hand_number AND result.settlement_key='gin_rummy_terminal'
     AND result.winner_player_id=v_winner_id;
  IF v_settlement_count<>1 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:settlement_not_committed:%',v_settlement_count; END IF;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:winner_not_in_session'; END IF;

  v_prior_authority:=current_setting('app.gin_rummy_authoritative_write',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM 1 FROM public.players WHERE game_id=_game_id ORDER BY id FOR UPDATE;
  UPDATE public.players player SET
    status=CASE WHEN coalesce(player.stand_up_next_hand,false) THEN 'left' ELSE player.status END,
    sitting_out=CASE
      WHEN coalesce(player.stand_up_next_hand,false) OR coalesce(player.sit_out_next_hand,false) THEN true
      WHEN coalesce(player.waiting,false) THEN false ELSE player.sitting_out END,
    waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,
    auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,
    ante_decision=NULL,auto_ante=false,auto_ante_runback=false
   WHERE player.game_id=_game_id;
  SELECT * INTO v_winner FROM public.players WHERE id=v_winner_id AND game_id=_game_id;

  SELECT count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL),
         count(*) FILTER (WHERE NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left') AND p.position IS NOT NULL AND NOT coalesce(p.is_bot,false))
    INTO v_active_count,v_active_humans FROM public.players p WHERE p.game_id=_game_id;
  IF coalesce(v_game.pending_session_end,false) OR v_active_humans=0 THEN
    v_target:='session_ended';
  ELSIF v_active_count<2 THEN
    v_target:='waiting';
  END IF;

  IF v_target IS NULL THEN
    SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot_dealers
      FROM public.game_defaults defaults WHERE defaults.game_type='holm' LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_make_it_take_it
      FROM public.system_settings setting WHERE setting.key='make_it_take_it' LIMIT 1;
    IF coalesce(v_make_it_take_it,false) THEN
      IF NOT coalesce(v_winner.is_bot,false) AND NOT coalesce(v_winner.sitting_out,false)
         AND v_winner.status NOT IN ('observer','left') THEN
        v_next_dealer:=v_winner.position;
      ELSE
        SELECT count(*),min(p.position) INTO v_human_count,v_single_human_position
          FROM public.players p WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false)
            AND p.status NOT IN ('observer','left') AND NOT coalesce(p.is_bot,false);
        IF v_human_count=1 THEN v_next_dealer:=v_single_human_position;
        ELSIF v_human_count>1 THEN v_target:='dealer_selection'; END IF;
      END IF;
    END IF;
    IF v_target IS NULL AND v_next_dealer IS NULL THEN
      SELECT array_agg(p.position ORDER BY p.position) INTO v_positions FROM public.players p
       WHERE p.game_id=_game_id AND NOT coalesce(p.sitting_out,false) AND p.status NOT IN ('observer','left')
         AND (coalesce(v_allow_bot_dealers,false) OR NOT coalesce(p.is_bot,false));
      IF coalesce(cardinality(v_positions),0)=0 THEN RAISE EXCEPTION 'gin_rummy_advance_postgame:no_eligible_dealer'; END IF;
      v_index:=array_position(v_positions,coalesce(v_game.dealer_position,1));
      v_next_dealer:=CASE WHEN v_index IS NULL THEN v_positions[1]
        ELSE v_positions[(v_index%cardinality(v_positions))+1] END;
    END IF;
    IF v_target IS NULL THEN
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30)));
    END IF;
  END IF;

  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL
   WHERE game_id=_game_id AND dealer_game_id=_dealer_game_id;
  UPDATE public.games SET
    status=v_target,config_complete=false,config_deadline=v_deadline,ante_decision_deadline=NULL,last_round_result=NULL,current_round=NULL,
    awaiting_next_round=false,next_round_number=NULL,pot=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
    game_over_at=CASE WHEN v_target='session_ended' THEN game_over_at ELSE NULL END,buck_position=NULL,total_hands=0,
    is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
    dealer_position=CASE WHEN v_target='game_selection' THEN v_next_dealer ELSE dealer_position END,
    session_ended_at=CASE WHEN v_target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END,
    pending_session_end=CASE WHEN v_target='session_ended' THEN false ELSE pending_session_end END
   WHERE id=_game_id;
  INSERT INTO private.gin_rummy_postgame_advances(
    game_id,dealer_game_id,round_id,hand_number,winner_player_id,target_status,dealer_position,config_deadline
  ) VALUES (_game_id,_dealer_game_id,_round_id,_hand_number,v_winner_id,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_dealer END,v_deadline);
  PERFORM set_config('app.gin_rummy_authoritative_write',coalesce(v_prior_authority,''),true);
  RETURN jsonb_build_object('outcome','advanced','deduped',false,'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_dealer END,'config_deadline',v_deadline);
END;
$function$;

NOTIFY pgrst, 'reload schema';
