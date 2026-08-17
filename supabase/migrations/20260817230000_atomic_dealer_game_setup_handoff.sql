-- Atomically publish the shared dealer configuration -> ante-decision handoff.
-- Every supported game keeps its existing game-specific bootstrap and
-- settlement owner; this function owns only the canonical setup boundary.

CREATE TABLE IF NOT EXISTS private.dealer_game_setup_commits (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  expected_config_deadline timestamptz NOT NULL,
  expected_dealer_position integer NOT NULL CHECK (expected_dealer_position BETWEEN 1 AND 7),
  request_hash text NOT NULL,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, expected_config_deadline, expected_dealer_position)
);

ALTER TABLE private.dealer_game_setup_commits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.dealer_game_setup_commits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.configure_dealer_game(
  p_game_id uuid,
  p_dealer_player_id uuid,
  p_expected_dealer_position integer,
  p_game_type text,
  p_config jsonb,
  p_expected_config_deadline timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    RETURN v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type='cribbage' THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) IS
  'Exact-phase, replay-safe atomic dealer configuration to ante-decision handoff for all seven game families.';

-- A duplicate opening-game caller must receive the same complete committed
-- snapshot as the winner of the race. The existing round uniqueness key is
-- the durable replay claim; include the locked game row on both outcomes so a
-- browser never needs its own Realtime event to finish bootstrapping.
CREATE OR REPLACE FUNCTION public.three_five_seven_begin_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_game public.games%ROWTYPE; v_existing public.rounds%ROWTYPE; v_result jsonb;
  v_timer integer:=10; v_eligible integer; v_ready integer;
BEGIN
  IF p_game_id IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_game_id'; END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_in_session';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_dealer_game'; END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id=v_game.current_game_uuid AND hand_number=1 AND round_number=1
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',1,'round_number',1,'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
    );
  END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:invalid_phase:%',v_game.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dealer_games dealer_game
     WHERE dealer_game.id=v_game.current_game_uuid AND dealer_game.session_id=p_game_id
       AND dealer_game.game_type IN ('3-5-7','3-5-7-game','357')
  ) THEN RAISE EXCEPTION 'three_five_seven_begin_game:dealer_game_mismatch'; END IF;

  SELECT count(*),count(*) FILTER (WHERE player.ante_decision='ante_up')
    INTO v_eligible,v_ready FROM public.players player
   WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out,false);
  IF v_eligible<2 OR v_ready<>v_eligible THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:admission_incomplete:%/%',v_ready,v_eligible;
  END IF;
  IF coalesce(v_game.ante_amount,0)<0 THEN RAISE EXCEPTION 'three_five_seven_begin_game:invalid_ante'; END IF;
  SELECT coalesce(defaults.decision_timer_seconds,10) INTO v_timer
    FROM public.game_defaults defaults WHERE defaults.game_type='3-5-7' LIMIT 1;
  v_timer:=coalesce(v_timer,10);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  v_result:=private.three_five_seven_create_round(
    p_game_id,v_game.current_game_uuid,1,1,coalesce(v_game.ante_amount,0),'Ante',
    clock_timestamp()+make_interval(secs=>greatest(1,v_timer)+2)
  );
  PERFORM private.three_five_seven_settle_instant_sweep(
    p_game_id,(v_result->>'round_id')::uuid,v_game.current_game_uuid,1
  );
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_existing FROM public.rounds WHERE id=(v_result->>'round_id')::uuid;
  RETURN v_result||jsonb_build_object('game',to_jsonb(v_game),'round',to_jsonb(v_existing));
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_begin_game(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_begin_game(uuid) TO authenticated,service_role;

COMMENT ON FUNCTION public.three_five_seven_begin_game(uuid) IS
  'Atomically validates 3-5-7 admission/antes, commits the opening deal, and returns the complete committed result to every exact replay.';
