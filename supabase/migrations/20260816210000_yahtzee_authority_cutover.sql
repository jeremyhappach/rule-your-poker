-- Move Yahtzee bootstrap, dice, holds, scoring, bot recovery, and the
-- post-settlement dealer-game handoff behind exact-identity PostgreSQL owners.
-- The accepted yahtzee_settle_game function remains the financial owner.

CREATE TABLE IF NOT EXISTS private.yahtzee_postgame_advances (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number > 0),
  winner_player_id uuid NOT NULL,
  target_status text NOT NULL CHECK (
    target_status IN ('game_selection', 'dealer_selection', 'waiting', 'session_ended')
  ),
  dealer_position integer,
  config_deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, dealer_game_id, round_id, hand_number)
);

ALTER TABLE private.yahtzee_postgame_advances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.yahtzee_postgame_advances FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.yahtzee_turn_deadline(
  _game_id uuid,
  _player_id uuid
)
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT clock_timestamp() + make_interval(
    secs => greatest(
      1,
      CASE WHEN coalesce(player.is_bot, false)
        THEN coalesce(defaults.bot_decision_delay_seconds, 2)::integer
        ELSE coalesce(defaults.decision_timer_seconds, 60)
      END
    )
  )
  FROM public.players player
  LEFT JOIN public.game_defaults defaults ON defaults.game_type = 'yahtzee'
  WHERE player.game_id = _game_id
    AND player.id = _player_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.yahtzee_category_is_legal(
  _scorecard jsonb,
  _dice jsonb,
  _category text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_categories constant text[] := ARRAY[
    'ones','twos','threes','fours','fives','sixes',
    'three_of_a_kind','four_of_a_kind','full_house',
    'small_straight','large_straight','yahtzee','chance'
  ];
  v_upper constant text[] := ARRAY['ones','twos','threes','fours','fives','sixes'];
  v_lower constant text[] := ARRAY[
    'three_of_a_kind','four_of_a_kind','full_house',
    'small_straight','large_straight','yahtzee','chance'
  ];
  v_values integer[];
  v_is_yahtzee boolean;
  v_matching_upper text;
  v_scores jsonb := coalesce(_scorecard->'scores', '{}'::jsonb);
BEGIN
  IF NOT (_category = ANY(v_categories)) OR v_scores ? _category THEN
    RETURN false;
  END IF;
  SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
    INTO v_values
    FROM jsonb_array_elements(_dice) WITH ORDINALITY AS die(value, ordinality);
  IF cardinality(v_values) <> 5 OR EXISTS (
    SELECT 1 FROM unnest(v_values) value WHERE value < 1 OR value > 6
  ) THEN
    RETURN false;
  END IF;
  v_is_yahtzee := (
    SELECT count(DISTINCT value) = 1 FROM unnest(v_values) value
  );
  IF NOT v_is_yahtzee OR coalesce((v_scores->>'yahtzee')::integer, 0) <> 50 THEN
    RETURN true;
  END IF;

  v_matching_upper := v_upper[v_values[1]];
  IF NOT (v_scores ? v_matching_upper) THEN
    RETURN _category = v_matching_upper;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_lower) category WHERE NOT (v_scores ? category)) THEN
    RETURN _category = ANY(v_lower);
  END IF;
  RETURN _category = ANY(v_upper);
END;
$$;

CREATE OR REPLACE FUNCTION private.yahtzee_category_score(
  _scorecard jsonb,
  _dice jsonb,
  _category text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_values integer[];
  v_sum integer;
  v_distinct integer;
  v_c1 integer; v_c2 integer; v_c3 integer;
  v_c4 integer; v_c5 integer; v_c6 integer;
  v_scores jsonb := coalesce(_scorecard->'scores', '{}'::jsonb);
  v_joker boolean;
BEGIN
  IF _category <> ALL(ARRAY[
    'ones','twos','threes','fours','fives','sixes',
    'three_of_a_kind','four_of_a_kind','full_house',
    'small_straight','large_straight','yahtzee','chance'
  ]::text[]) THEN
    RAISE EXCEPTION 'yahtzee_category_score:invalid_category:%', _category;
  END IF;
  SELECT array_agg((die.value->>'value')::integer ORDER BY die.ordinality)
    INTO v_values
    FROM jsonb_array_elements(_dice) WITH ORDINALITY AS die(value, ordinality);
  IF cardinality(v_values) <> 5 OR EXISTS (
    SELECT 1 FROM unnest(v_values) value WHERE value < 1 OR value > 6
  ) THEN
    RAISE EXCEPTION 'yahtzee_category_score:invalid_dice';
  END IF;
  SELECT sum(value), count(DISTINCT value),
         count(*) FILTER (WHERE value=1), count(*) FILTER (WHERE value=2),
         count(*) FILTER (WHERE value=3), count(*) FILTER (WHERE value=4),
         count(*) FILTER (WHERE value=5), count(*) FILTER (WHERE value=6)
    INTO v_sum,v_distinct,v_c1,v_c2,v_c3,v_c4,v_c5,v_c6
    FROM unnest(v_values) value;
  v_joker := v_distinct=1 AND coalesce((v_scores->>'yahtzee')::integer,0)=50;

  RETURN CASE _category
    WHEN 'ones' THEN v_c1
    WHEN 'twos' THEN v_c2*2
    WHEN 'threes' THEN v_c3*3
    WHEN 'fours' THEN v_c4*4
    WHEN 'fives' THEN v_c5*5
    WHEN 'sixes' THEN v_c6*6
    WHEN 'three_of_a_kind' THEN CASE WHEN greatest(v_c1,v_c2,v_c3,v_c4,v_c5,v_c6)>=3 THEN v_sum ELSE 0 END
    WHEN 'four_of_a_kind' THEN CASE WHEN greatest(v_c1,v_c2,v_c3,v_c4,v_c5,v_c6)>=4 THEN v_sum ELSE 0 END
    WHEN 'full_house' THEN CASE WHEN v_joker OR (
      3=ANY(ARRAY[v_c1,v_c2,v_c3,v_c4,v_c5,v_c6])
      AND 2=ANY(ARRAY[v_c1,v_c2,v_c3,v_c4,v_c5,v_c6])
    ) THEN 25 ELSE 0 END
    WHEN 'small_straight' THEN CASE WHEN v_joker OR (
      (v_c1>0 AND v_c2>0 AND v_c3>0 AND v_c4>0)
      OR (v_c2>0 AND v_c3>0 AND v_c4>0 AND v_c5>0)
      OR (v_c3>0 AND v_c4>0 AND v_c5>0 AND v_c6>0)
    ) THEN 30 ELSE 0 END
    WHEN 'large_straight' THEN CASE WHEN v_joker OR (
      (v_c1>0 AND v_c2>0 AND v_c3>0 AND v_c4>0 AND v_c5>0)
      OR (v_c2>0 AND v_c3>0 AND v_c4>0 AND v_c5>0 AND v_c6>0)
    ) THEN 40 ELSE 0 END
    WHEN 'yahtzee' THEN CASE WHEN v_distinct=1 THEN 50 ELSE 0 END
    WHEN 'chance' THEN v_sum
    ELSE 0
  END;
END;
$$;

CREATE OR REPLACE FUNCTION private.yahtzee_guard_round_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.game_id ELSE NEW.game_id END;
  v_is_yahtzee boolean := false;
  v_service boolean := coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean := coalesce(current_setting('app.yahtzee_authoritative_write',true),'')='on';
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.games WHERE id=v_game_id AND game_type='yahtzee')
    INTO v_is_yahtzee;
  IF TG_OP='UPDATE' AND NOT v_is_yahtzee THEN
    SELECT EXISTS(SELECT 1 FROM public.games WHERE id=OLD.game_id AND game_type='yahtzee')
      INTO v_is_yahtzee;
  END IF;
  IF v_is_yahtzee AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'yahtzee_round_mutation:rpc_required';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS yahtzee_guard_round_insert ON public.rounds;
CREATE TRIGGER yahtzee_guard_round_insert
BEFORE INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.yahtzee_guard_round_mutation();
DROP TRIGGER IF EXISTS yahtzee_guard_round_state_update ON public.rounds;
CREATE TRIGGER yahtzee_guard_round_state_update
BEFORE UPDATE OF yahtzee_state ON public.rounds
FOR EACH ROW WHEN (OLD.yahtzee_state IS DISTINCT FROM NEW.yahtzee_state)
EXECUTE FUNCTION private.yahtzee_guard_round_mutation();
DROP TRIGGER IF EXISTS yahtzee_guard_round_delete ON public.rounds;
CREATE TRIGGER yahtzee_guard_round_delete
BEFORE DELETE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION private.yahtzee_guard_round_mutation();

CREATE OR REPLACE FUNCTION private.yahtzee_guard_game_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_trusted boolean:=coalesce(current_setting('app.yahtzee_authoritative_write',true),'')='on';
  v_protected boolean:=false;
BEGIN
  IF OLD.game_type='yahtzee' THEN
    v_protected :=
      OLD.current_round IS DISTINCT FROM NEW.current_round
      OR OLD.total_hands IS DISTINCT FROM NEW.total_hands
      OR OLD.dealer_position IS DISTINCT FROM NEW.dealer_position
      OR (
        OLD.current_game_uuid IS DISTINCT FROM NEW.current_game_uuid
        AND OLD.status NOT IN ('game_selection','configuring','dealer_selection')
      )
      OR (
        OLD.status='ante_decision'
        AND NEW.status IS DISTINCT FROM OLD.status
      )
      OR (
        OLD.status='game_over'
        AND NEW.status IS DISTINCT FROM OLD.status
      );
  END IF;
  IF v_protected AND NOT v_service AND NOT v_trusted THEN
    RAISE EXCEPTION 'yahtzee_game_authority_mutation:rpc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS yahtzee_guard_game_authority ON public.games;
CREATE TRIGGER yahtzee_guard_game_authority
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.yahtzee_guard_game_authority();

REVOKE ALL ON FUNCTION private.yahtzee_turn_deadline(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.yahtzee_category_is_legal(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.yahtzee_category_score(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.yahtzee_guard_round_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.yahtzee_guard_game_authority() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.start_yahtzee_round(
  _game_id uuid,
  _predecessor_round_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_player_ids uuid[];
  v_player_id uuid;
  v_player_states jsonb:='{}'::jsonb;
  v_turn_order jsonb;
  v_state jsonb;
  v_round_id uuid;
  v_dealer_game_id uuid;
  v_hand_number integer;
  v_deadline timestamptz;
  v_harness_enabled boolean:=false;
  v_harness text;
  v_seed_scores jsonb;
  v_host_player_id uuid;
BEGIN
  IF v_actor_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'start_yahtzee_round:authentication_required';
  END IF;

  IF _predecessor_round_id IS NOT NULL THEN
    SELECT * INTO v_predecessor FROM public.rounds WHERE id=_predecessor_round_id FOR UPDATE;
    IF NOT FOUND OR v_predecessor.game_id IS DISTINCT FROM _game_id THEN
      RAISE EXCEPTION 'start_yahtzee_round:predecessor_not_found';
    END IF;
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'start_yahtzee_round:not_yahtzee_game';
  END IF;
  IF NOT v_service AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'start_yahtzee_round:not_in_session';
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game_paused','status',v_game.status);
  END IF;
  IF v_game.current_game_uuid IS NULL OR v_game.dealer_position IS NULL THEN
    RETURN jsonb_build_object('outcome','rejected','reason','dealer_game_not_configured','status',v_game.status);
  END IF;

  v_dealer_game_id:=v_game.current_game_uuid;
  IF _predecessor_round_id IS NULL THEN
    v_hand_number:=1;
    SELECT * INTO v_existing FROM public.rounds
     WHERE game_id=_game_id AND dealer_game_id=v_dealer_game_id
       AND hand_number=1 AND round_number=1 LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'outcome','already_started','deduped',true,'round_id',v_existing.id,
        'dealer_game_id',v_existing.dealer_game_id,'hand_number',1,
        'state',v_existing.yahtzee_state
      );
    END IF;
    IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
      RETURN jsonb_build_object('outcome','rejected','reason','wrong_status','status',v_game.status);
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.players participant
       WHERE participant.game_id=_game_id
         AND NOT coalesce(participant.sitting_out,false)
         AND participant.status NOT IN ('observer','left')
         AND participant.ante_decision IS NULL
    ) THEN
      RETURN jsonb_build_object('outcome','rejected','reason','waiting_for_antes','status',v_game.status);
    END IF;
  ELSE
    IF v_predecessor.dealer_game_id IS DISTINCT FROM v_dealer_game_id
       OR v_predecessor.hand_number IS NULL
       OR v_predecessor.status IS DISTINCT FROM 'completed'
       OR v_predecessor.yahtzee_state->>'gamePhase' IS DISTINCT FROM 'complete' THEN
      RAISE EXCEPTION 'start_yahtzee_round:predecessor_identity_mismatch';
    END IF;
    v_hand_number:=v_predecessor.hand_number+1;
    SELECT * INTO v_existing FROM public.rounds
     WHERE game_id=_game_id AND dealer_game_id=v_dealer_game_id
       AND hand_number=v_hand_number AND round_number=v_hand_number LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'outcome','already_started','deduped',true,'round_id',v_existing.id,
        'dealer_game_id',v_existing.dealer_game_id,'hand_number',v_existing.hand_number,
        'state',v_existing.yahtzee_state
      );
    END IF;
    IF v_game.status IS DISTINCT FROM 'in_progress'
       OR coalesce(v_game.awaiting_next_round,false) IS DISTINCT FROM true
       OR v_game.total_hands IS DISTINCT FROM v_predecessor.hand_number
       OR v_game.last_round_result IS DISTINCT FROM 'Tie - rollover' THEN
      RETURN jsonb_build_object('outcome','rejected','reason','tie_rollover_not_ready','status',v_game.status);
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.game_results result
       WHERE result.game_id=_game_id AND result.dealer_game_id=v_dealer_game_id
         AND result.hand_number=v_predecessor.hand_number
         AND result.settlement_key='yahtzee_terminal'
    ) THEN
      RAISE EXCEPTION 'start_yahtzee_round:winner_settlement_cannot_roll_over';
    END IF;
  END IF;

  SELECT array_agg(participant.id ORDER BY
           CASE WHEN participant.position < v_game.dealer_position THEN 0 ELSE 1 END,
           participant.position DESC)
    INTO v_player_ids
    FROM public.players participant
   WHERE participant.game_id=_game_id
     AND NOT coalesce(participant.sitting_out,false)
     AND participant.status NOT IN ('observer','left');
  IF cardinality(v_player_ids)<2 THEN
    RAISE EXCEPTION 'start_yahtzee_round:insufficient_players';
  END IF;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    v_player_states:=v_player_states || jsonb_build_object(v_player_id::text,jsonb_build_object(
      'dice',jsonb_build_array(
        jsonb_build_object('value',0,'isHeld',false),jsonb_build_object('value',0,'isHeld',false),
        jsonb_build_object('value',0,'isHeld',false),jsonb_build_object('value',0,'isHeld',false),
        jsonb_build_object('value',0,'isHeld',false)
      ),
      'rollsRemaining',3,'isComplete',false,
      'scorecard',jsonb_build_object('scores','{}'::jsonb,'yahtzeeBonuses',0)
    ));
  END LOOP;
  SELECT jsonb_agg(player_id) INTO v_turn_order FROM unnest(v_player_ids) player_id;

  SELECT coalesce((setting.value->>'enabled')::boolean,false)
    INTO v_harness_enabled FROM public.system_settings setting
   WHERE setting.key='harnesses_mode' LIMIT 1;
  SELECT defaults.debug_harness INTO v_harness
    FROM public.game_defaults defaults WHERE defaults.game_type='yahtzee' LIMIT 1;
  IF _predecessor_round_id IS NULL AND v_harness_enabled AND v_harness='near_win' THEN
    SELECT participant.id INTO v_host_player_id FROM public.players participant
     WHERE participant.game_id=_game_id AND participant.user_id=v_game.current_host
       AND participant.id=ANY(v_player_ids) LIMIT 1;
    v_host_player_id:=coalesce(v_host_player_id,v_player_ids[1]);
    FOREACH v_player_id IN ARRAY v_player_ids LOOP
      v_seed_scores:=CASE WHEN v_player_id=v_host_player_id THEN
        '{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18,"three_of_a_kind":20,"four_of_a_kind":0,"full_house":25,"small_straight":30,"large_straight":40,"yahtzee":50}'::jsonb
      ELSE
        '{"ones":1,"twos":2,"threes":3,"fours":4,"fives":5,"sixes":6,"three_of_a_kind":10,"four_of_a_kind":0,"full_house":0,"small_straight":0,"large_straight":0,"yahtzee":0}'::jsonb
      END;
      v_player_states:=jsonb_set(
        v_player_states,ARRAY[v_player_id::text,'scorecard','scores'],v_seed_scores,true
      );
    END LOOP;
  END IF;

  v_deadline:=private.yahtzee_turn_deadline(_game_id,v_player_ids[1]);
  v_state:=jsonb_build_object(
    'currentTurnPlayerId',v_player_ids[1],
    'playerStates',v_player_states,
    'gamePhase','playing','turnOrder',v_turn_order,'currentRound',1,
    'botControllerUserId',NULL,'turnDeadline',v_deadline,'actionSequence',0,
    'lastAction',NULL
  );
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  INSERT INTO public.rounds(
    game_id,dealer_game_id,round_number,hand_number,cards_dealt,status,pot,
    yahtzee_state,current_turn_position,decision_deadline
  )
  SELECT _game_id,v_dealer_game_id,v_hand_number,v_hand_number,2,'betting',0,
         v_state,participant.position,v_deadline
    FROM public.players participant WHERE participant.id=v_player_ids[1]
  RETURNING id INTO v_round_id;
  UPDATE public.games SET
    status='in_progress',current_round=v_hand_number,total_hands=v_hand_number,
    pot=0,awaiting_next_round=false,next_round_number=NULL,
    all_decisions_in=false,all_decisions_in_round_id=NULL,last_round_result=NULL,
    game_over_at=NULL,is_first_hand=false,config_deadline=NULL,ante_decision_deadline=NULL
  WHERE id=_game_id;
  RETURN jsonb_build_object(
    'outcome','started','deduped',false,'round_id',v_round_id,
    'dealer_game_id',v_dealer_game_id,'hand_number',v_hand_number,'state',v_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_yahtzee_round(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_yahtzee_round(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.yahtzee_apply_action(
  _round_id uuid,
  _player_id uuid,
  _action text,
  _die_index integer DEFAULT NULL,
  _category text DEFAULT NULL,
  _hold_mask boolean[] DEFAULT NULL,
  _expected_action_sequence integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
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
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'yahtzee_apply_action:invalid_action_sequence';
  END;
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
  IF v_action IN ('auto','bot_roll','bot_score') THEN
    IF NOT coalesce(v_player.is_bot,false) THEN
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
    v_deadline:=private.yahtzee_turn_deadline(v_game.id,_player_id);
    v_ps:=jsonb_set(v_ps,'{dice}',v_dice,true);
    v_ps:=jsonb_set(v_ps,'{rollsRemaining}',to_jsonb(v_rolls-1),true);
    v_ps:=jsonb_set(v_ps,'{rollKey}',to_jsonb(format('yahtzee:%s:%s:%s',_round_id,_player_id,v_sequence)),true);
    v_ps:=jsonb_set(v_ps,'{heldMaskBeforeComplete}',to_jsonb(v_hold_mask),true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{actionSequence}',to_jsonb(v_sequence),true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_deadline),true);
    PERFORM set_config('app.yahtzee_authoritative_write','on',true);
    UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline
     WHERE id=_round_id;
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
    UPDATE public.rounds SET yahtzee_state=v_state WHERE id=_round_id;
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
    RETURN jsonb_build_object(
      'outcome','applied','action','score','action_sequence',v_sequence,
      'category',v_category,'score',v_score,'terminal',v_all_complete,
      'state',v_state,'settlement',v_settlement
    );
  END IF;
  RETURN jsonb_build_object('outcome','rejected','reason','unknown_action','state',v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.yahtzee_advance_postgame(
  _game_id uuid,
  _round_id uuid,
  _dealer_game_id uuid,
  _hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_actor_id uuid:=auth.uid();
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_claim private.yahtzee_postgame_advances%ROWTYPE;
  v_result public.game_results%ROWTYPE;
  v_result_count integer;
  v_winner public.players%ROWTYPE;
  v_active_count integer;
  v_active_human_count integer;
  v_eligible_count integer;
  v_allow_bot_dealers boolean:=false;
  v_make_it_take_it boolean:=false;
  v_eligible_positions integer[];
  v_current_index integer;
  v_next_dealer_position integer;
  v_target_status text;
  v_config_deadline timestamptz;
BEGIN
  IF _game_id IS NULL OR _round_id IS NULL OR _dealer_game_id IS NULL
     OR _hand_number IS NULL OR _hand_number<1 THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:missing_identity';
  END IF;
  IF v_actor_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:authentication_required';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM _game_id
     OR v_round.dealer_game_id IS DISTINCT FROM _dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM _hand_number THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:not_yahtzee_game';
  END IF;
  IF NOT v_service AND NOT EXISTS(
    SELECT 1 FROM public.players participant
     WHERE participant.game_id=_game_id AND participant.user_id=v_actor_id
       AND participant.status<>'left'
  ) AND NOT public.has_role(v_actor_id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:not_in_session';
  END IF;
  SELECT * INTO v_claim FROM private.yahtzee_postgame_advances claim
   WHERE claim.game_id=_game_id AND claim.dealer_game_id=_dealer_game_id
     AND claim.round_id=_round_id AND claim.hand_number=_hand_number;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome','already_advanced','deduped',true,'status',v_claim.target_status,
      'dealer_position',v_claim.dealer_position,'config_deadline',v_claim.config_deadline
    );
  END IF;
  IF v_game.status IS DISTINCT FROM 'game_over'
     OR v_game.current_game_uuid IS DISTINCT FROM _dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM _hand_number THEN
    RETURN jsonb_build_object(
      'outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,
      'current_hand_number',v_game.total_hands
    );
  END IF;
  IF v_round.status IS DISTINCT FROM 'completed'
     OR v_round.yahtzee_state->>'gamePhase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:round_not_terminal';
  END IF;
  SELECT count(*) INTO v_result_count
    FROM public.game_results result
   WHERE result.game_id=_game_id AND result.dealer_game_id=_dealer_game_id
     AND result.hand_number=_hand_number AND result.settlement_key='yahtzee_terminal';
  IF v_result_count<>1 THEN
    RAISE EXCEPTION 'yahtzee_advance_postgame:settlement_not_committed:%',v_result_count;
  END IF;
  SELECT * INTO v_result FROM public.game_results result
   WHERE result.game_id=_game_id AND result.dealer_game_id=_dealer_game_id
     AND result.hand_number=_hand_number AND result.settlement_key='yahtzee_terminal';
  SELECT * INTO v_winner FROM public.players winner
   WHERE winner.id=v_result.winner_player_id AND winner.game_id=_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'yahtzee_advance_postgame:winner_not_in_session'; END IF;

  DELETE FROM public.players player
   WHERE player.game_id=_game_id AND coalesce(player.is_bot,false)
     AND coalesce(player.stand_up_next_hand,false);
  UPDATE public.players player SET
    status=CASE WHEN coalesce(player.stand_up_next_hand,false) THEN 'left' ELSE player.status END,
    sitting_out=CASE
      WHEN coalesce(player.stand_up_next_hand,false) OR coalesce(player.sit_out_next_hand,false) THEN true
      WHEN coalesce(player.waiting,false) THEN false ELSE player.sitting_out END,
    waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,
    auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,
    ante_decision=NULL,auto_ante=false,auto_ante_runback=false
   WHERE player.game_id=_game_id;

  SELECT count(*) FILTER(WHERE NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left')),
         count(*) FILTER(WHERE NOT coalesce(sitting_out,false) AND status NOT IN ('observer','left') AND NOT coalesce(is_bot,false))
    INTO v_active_count,v_active_human_count FROM public.players WHERE game_id=_game_id;
  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot_dealers
    FROM public.game_defaults defaults WHERE defaults.game_type='holm' LIMIT 1;
  SELECT count(*) INTO v_eligible_count FROM public.players player
   WHERE player.game_id=_game_id AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left') AND player.position IS NOT NULL
     AND (v_allow_bot_dealers OR NOT coalesce(player.is_bot,false));

  IF v_active_human_count<1 THEN
    v_target_status:='session_ended';
  ELSIF v_active_count<2 OR v_eligible_count<1 THEN
    v_target_status:='waiting';
  ELSE
    SELECT coalesce((setting.value->>'enabled')::boolean,false) INTO v_make_it_take_it
      FROM public.system_settings setting WHERE setting.key='make_it_take_it' LIMIT 1;
    IF v_make_it_take_it AND NOT coalesce(v_winner.is_bot,false)
       AND NOT coalesce(v_winner.sitting_out,false) AND v_winner.status NOT IN ('observer','left') THEN
      v_next_dealer_position:=v_winner.position;
    ELSIF v_make_it_take_it AND (coalesce(v_winner.is_bot,false) OR coalesce(v_winner.sitting_out,false) OR v_winner.status IN ('observer','left')) THEN
      IF v_eligible_count=1 THEN
        SELECT position INTO v_next_dealer_position FROM public.players player
         WHERE player.game_id=_game_id AND NOT coalesce(player.sitting_out,false)
           AND player.status NOT IN ('observer','left') AND NOT coalesce(player.is_bot,false) LIMIT 1;
      ELSE
        v_target_status:='dealer_selection';
      END IF;
    END IF;
    IF v_target_status IS NULL AND v_next_dealer_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position) INTO v_eligible_positions
        FROM public.players player WHERE player.game_id=_game_id
         AND NOT coalesce(player.sitting_out,false) AND player.status NOT IN ('observer','left')
         AND (v_allow_bot_dealers OR NOT coalesce(player.is_bot,false));
      v_current_index:=array_position(v_eligible_positions,coalesce(v_game.dealer_position,1));
      v_next_dealer_position:=CASE WHEN v_current_index IS NULL THEN v_eligible_positions[1]
        ELSE v_eligible_positions[(v_current_index%cardinality(v_eligible_positions))+1] END;
    END IF;
    IF v_target_status IS NULL THEN
      v_target_status:='game_selection';
      v_config_deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30)));
    END IF;
  END IF;

  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL
   WHERE game_id=_game_id AND dealer_game_id=_dealer_game_id;
  UPDATE public.games SET
    status=v_target_status,config_complete=false,config_deadline=v_config_deadline,
    last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,
    pot=0,all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,
    buck_position=NULL,total_hands=0,is_first_hand=false,current_game_uuid=NULL,
    dealer_selection_state=NULL,
    dealer_position=CASE WHEN v_target_status='game_selection' THEN v_next_dealer_position ELSE dealer_position END,
    pending_session_end=CASE WHEN v_target_status='session_ended' THEN false ELSE pending_session_end END,
    session_ended_at=CASE WHEN v_target_status='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
   WHERE id=_game_id;
  INSERT INTO private.yahtzee_postgame_advances(
    game_id,dealer_game_id,round_id,hand_number,winner_player_id,target_status,dealer_position,config_deadline
  ) VALUES(
    _game_id,_dealer_game_id,_round_id,_hand_number,v_result.winner_player_id,v_target_status,
    CASE WHEN v_target_status='game_selection' THEN v_next_dealer_position END,v_config_deadline
  );
  RETURN jsonb_build_object(
    'outcome','advanced','deduped',false,'status',v_target_status,
    'dealer_position',CASE WHEN v_target_status='game_selection' THEN v_next_dealer_position END,
    'config_deadline',v_config_deadline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.yahtzee_advance_postgame(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_advance_postgame(uuid,uuid,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.advance_due_yahtzee_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_candidate record;
  v_result jsonb;
  v_advanced integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  FOR v_candidate IN
    SELECT game_row.id FROM public.games game_row
     WHERE game_row.game_type='yahtzee' AND game_row.status='ante_decision'
       AND game_row.current_game_uuid IS NOT NULL
       AND NOT EXISTS(
         SELECT 1 FROM public.players participant WHERE participant.game_id=game_row.id
          AND NOT coalesce(participant.sitting_out,false) AND participant.status NOT IN ('observer','left')
          AND participant.ante_decision IS NULL
       )
     ORDER BY game_row.updated_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.id,NULL);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id FROM public.rounds round_row
    JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND coalesce(game_row.awaiting_next_round,false) AND round_row.status='completed'
       AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands
     ORDER BY round_row.hand_number,round_row.id LIMIT 32
  LOOP
    v_result:=public.start_yahtzee_round(v_candidate.game_id,v_candidate.round_id);
    IF v_result->>'outcome' IN ('started','already_started') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.id AS round_id,
           nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid AS player_id,
           coalesce((round_row.yahtzee_state->>'actionSequence')::integer,0) AS action_sequence
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
      JOIN public.players participant ON participant.id=nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='playing'
       AND coalesce(participant.is_bot,false)
       AND nullif(round_row.yahtzee_state->>'turnDeadline','')::timestamptz<=clock_timestamp()
     ORDER BY round_row.decision_deadline,round_row.id LIMIT 32
  LOOP
    v_result:=public.yahtzee_apply_action(
      v_candidate.round_id,v_candidate.player_id,'auto',NULL,NULL,NULL,v_candidate.action_sequence
    );
    IF v_result->>'outcome'='applied' THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  FOR v_candidate IN
    SELECT round_row.game_id,round_row.id AS round_id,round_row.dealer_game_id,round_row.hand_number
      FROM public.rounds round_row JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='yahtzee' AND game_row.status='in_progress'
       AND round_row.status='betting' AND round_row.dealer_game_id=game_row.current_game_uuid
       AND round_row.hand_number=game_row.total_hands AND round_row.yahtzee_state->>'gamePhase'='complete'
     ORDER BY round_row.id LIMIT 32
  LOOP
    PERFORM public.yahtzee_settle_game(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    v_advanced:=v_advanced+1;
  END LOOP;
  FOR v_candidate IN
    SELECT game_row.id AS game_id,result.dealer_game_id,result.hand_number,round_row.id AS round_id
      FROM public.games game_row
      JOIN public.game_results result ON result.game_id=game_row.id AND result.settlement_key='yahtzee_terminal'
      JOIN public.rounds round_row ON round_row.game_id=game_row.id
       AND round_row.dealer_game_id=result.dealer_game_id AND round_row.hand_number=result.hand_number
     WHERE game_row.game_type='yahtzee' AND game_row.status='game_over'
       AND game_row.current_game_uuid=result.dealer_game_id AND game_row.total_hands=result.hand_number
       AND game_row.game_over_at<=clock_timestamp()-interval '30 seconds'
     ORDER BY game_row.game_over_at,game_row.id LIMIT 32
  LOOP
    v_result:=public.yahtzee_advance_postgame(
      v_candidate.game_id,v_candidate.round_id,v_candidate.dealer_game_id,v_candidate.hand_number
    );
    IF v_result->>'outcome' IN ('advanced','already_advanced') THEN v_advanced:=v_advanced+1; END IF;
  END LOOP;
  RETURN v_advanced;
END;
$$;

REVOKE ALL ON FUNCTION private.advance_due_yahtzee_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_yahtzee_state() TO service_role;

-- Admit active legacy rounds into the sequence/deadline contract before the
-- guard begins rejecting browser-authored JSON replacements.
SELECT set_config('app.yahtzee_authoritative_write','on',true);
UPDATE public.rounds round_row SET
  yahtzee_state=jsonb_set(
    jsonb_set(round_row.yahtzee_state,'{actionSequence}',
      to_jsonb(coalesce((round_row.yahtzee_state->>'actionSequence')::integer,0)),true),
    '{turnDeadline}',to_jsonb(coalesce(
      nullif(round_row.yahtzee_state->>'turnDeadline','')::timestamptz,
      private.yahtzee_turn_deadline(round_row.game_id,nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid)
    )),true
  ),
  decision_deadline=coalesce(round_row.decision_deadline,
    private.yahtzee_turn_deadline(round_row.game_id,nullif(round_row.yahtzee_state->>'currentTurnPlayerId','')::uuid))
FROM public.games game_row
WHERE game_row.id=round_row.game_id AND game_row.game_type='yahtzee'
  AND round_row.status='betting' AND round_row.yahtzee_state->>'gamePhase'='playing';

DO $schedule$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='advance-due-yahtzee-state-1s' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'advance-due-yahtzee-state-1s','1 second',
    $cron$SELECT private.advance_due_yahtzee_state();$cron$
  );
END;
$schedule$;

COMMENT ON FUNCTION public.start_yahtzee_round(uuid,uuid) IS
  'Atomic first-hand/tie bootstrap that returns the committed Yahtzee round to its caller.';
COMMENT ON FUNCTION public.yahtzee_apply_action(uuid,uuid,text,integer,text,boolean[],integer) IS
  'Exact-sequence Yahtzee roll, hold, score, turn, bot, and terminal transition owner.';
COMMENT ON FUNCTION public.yahtzee_advance_postgame(uuid,uuid,uuid,integer) IS
  'Exact-settlement replay-safe Yahtzee dealer-game handoff and terminal disposition owner.';
COMMENT ON FUNCTION private.advance_due_yahtzee_state() IS
  'Complete scheduled Yahtzee bootstrap, bot, terminal settlement, and abandoned postgame recovery owner.';
