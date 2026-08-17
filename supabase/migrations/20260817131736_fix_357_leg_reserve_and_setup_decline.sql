-- Correct 3-5-7 leg accounting and make postgame setup-owner decline an
-- exact-identity, replay-safe database transition.

CREATE TABLE IF NOT EXISTS private.three_five_seven_setup_declines (
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hand_number integer NOT NULL CHECK (hand_number > 0),
  declining_player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  expected_dealer_position integer NOT NULL,
  expected_config_deadline timestamptz NOT NULL,
  target_status text NOT NULL CHECK (
    target_status IN ('game_selection','dealer_selection','waiting','session_ended')
  ),
  dealer_position integer,
  config_deadline timestamptz,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_id, dealer_game_id, round_id, hand_number, declining_player_id)
);

ALTER TABLE private.three_five_seven_setup_declines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.three_five_seven_setup_declines FROM PUBLIC, anon, authenticated;

-- A purchased leg is reserve value placed beside its owner. It debits the
-- player and increments players.legs, but it never increases games.pot.
DO $migration$
DECLARE
  v_function_sql text;
  v_old text := $old$
    IF v_amount>0 THEN
      v_transfer:=jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',v_winner_id),
        'to',jsonb_build_object('kind','pot'),'amount',v_amount));
      PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'leg');
      v_changes:=jsonb_set(v_changes,ARRAY[v_winner_id::text],to_jsonb(-v_amount),true);
    END IF;
    UPDATE public.players SET legs=coalesce(legs,0)+1 WHERE id=v_winner_id RETURNING legs INTO v_new_legs;
$old$;
  v_new text := $new$
    IF v_amount>0 THEN
      PERFORM set_config('ptown.chip_transfer_reason','leg',true);
      UPDATE public.players
         SET chips=chips-v_amount,
             legs=coalesce(legs,0)+1
       WHERE id=v_winner_id
         AND game_id=p_game_id
       RETURNING legs INTO v_new_legs;
      v_changes:=jsonb_set(v_changes,ARRAY[v_winner_id::text],to_jsonb(-v_amount),true);
    ELSE
      UPDATE public.players
         SET legs=coalesce(legs,0)+1
       WHERE id=v_winner_id
         AND game_id=p_game_id
       RETURNING legs INTO v_new_legs;
    END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'private.three_five_seven_resolve_round(uuid,uuid,uuid,integer,integer)'::regprocedure
  ) INTO v_function_sql;

  IF position('SET chips=chips-v_amount' IN v_function_sql) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'fix_357_leg_reserve:resolver_block_not_found';
  END IF;

  EXECUTE replace(v_function_sql,v_old,v_new);
END;
$migration$;

-- Normal final-leg settlement now contains three ordered journal stages:
-- purchase the last leg, return all leg reserve, then award the table pot.
-- Preserve Holm's existing two-stage showdown projection.
DO $migration$
DECLARE
  v_function_sql text;
  v_old_split text := $old$
      g.game_type IN ('3-5-7', '3-5-7-game', '357')
      AND bool_or(change.reason = 'sweep')
      AND bool_or(change.reason = 'transfer')
$old$;
  v_new_split text := $new$
      g.game_type IN ('3-5-7', '3-5-7-game', '357')
      AND bool_or(change.reason = 'leg')
      AND bool_or(change.reason = 'sweep')
      AND bool_or(change.reason = 'transfer')
$new$;
  v_old_stages text := $old$
          SELECT 'sweep', 1
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'win', 1
           WHERE v_split_holm_showdown
          UNION ALL
          SELECT 'transfer', 2
           WHERE v_split_normal_357_terminal OR v_split_holm_showdown
$old$;
  v_new_stages text := $new$
          SELECT 'leg', 1
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'sweep', 2
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'win', 1
           WHERE v_split_holm_showdown
          UNION ALL
          SELECT 'transfer', CASE WHEN v_split_normal_357_terminal THEN 3 ELSE 2 END
           WHERE v_split_normal_357_terminal OR v_split_holm_showdown
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.finalize_gameplay_transfer_batch()'::regprocedure
  ) INTO v_function_sql;

  IF position('SELECT ''leg'', 1' IN v_function_sql) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old_split IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'fix_357_leg_reserve:finalizer_split_not_found';
  END IF;
  IF position(v_old_stages IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'fix_357_leg_reserve:finalizer_stages_not_found';
  END IF;

  v_function_sql:=replace(v_function_sql,v_old_split,v_new_split);
  v_function_sql:=replace(v_function_sql,v_old_stages,v_new_stages);
  EXECUTE v_function_sql;
END;
$migration$;

COMMENT ON FUNCTION private.three_five_seven_resolve_round(uuid,uuid,uuid,integer,integer) IS
  'Resolves an exact 3-5-7 round; purchased legs debit the winner into owned leg reserve without increasing the table pot.';

COMMENT ON FUNCTION public.finalize_gameplay_transfer_batch() IS
  'Emits immutable game-scoped transfer batches, including ordered normal 3-5-7 leg-purchase/reserve-return/pot-award and Holm showdown stages.';

CREATE OR REPLACE FUNCTION public.three_five_seven_decline_setup(
  p_game_id uuid,
  p_expected_dealer_position integer,
  p_expected_config_deadline timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_handoff private.three_five_seven_postgame_advances%ROWTYPE;
  v_claim private.three_five_seven_setup_declines%ROWTYPE;
  v_decliner public.players%ROWTYPE;
  v_active integer;
  v_humans integer;
  v_allow_bots boolean:=false;
  v_positions integer[];
  v_index integer;
  v_next_position integer;
  v_target text;
  v_deadline timestamptz;
  v_result jsonb;
BEGIN
  IF p_game_id IS NULL OR p_expected_dealer_position IS NULL OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_decline_setup:missing_identity';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id=p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_decline_setup:game_not_found';
  END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_decline_setup:not_in_session';
  END IF;

  SELECT * INTO v_handoff
    FROM private.three_five_seven_postgame_advances handoff
   WHERE handoff.game_id=p_game_id
     AND handoff.target_status='game_selection'
     AND handoff.dealer_position=p_expected_dealer_position
     AND handoff.config_deadline IS NOT DISTINCT FROM p_expected_config_deadline
   ORDER BY handoff.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_decline_setup:committed_handoff_missing';
  END IF;

  SELECT * INTO v_decliner
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND player.position=p_expected_dealer_position
     AND player.user_id=auth.uid()
     AND NOT coalesce(player.is_bot,false)
     AND player.status NOT IN ('observer','left')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_decline_setup:not_setup_owner';
  END IF;

  SELECT * INTO v_claim
    FROM private.three_five_seven_setup_declines claim
   WHERE claim.game_id=v_handoff.game_id
     AND claim.dealer_game_id=v_handoff.dealer_game_id
     AND claim.round_id=v_handoff.round_id
     AND claim.hand_number=v_handoff.hand_number
     AND claim.declining_player_id=v_decliner.id;
  IF FOUND THEN
    RETURN v_claim.result||jsonb_build_object('outcome','already_declined','deduped',true);
  END IF;

  IF v_game.status<>'game_selection'
     OR v_game.current_game_uuid IS NOT NULL
     OR v_game.current_round IS NOT NULL
     OR coalesce(v_game.total_hands,0)<>0
     OR v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position
     OR v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RETURN jsonb_build_object(
      'outcome','stale_identity','deduped',true,'status',v_game.status,
      'current_dealer_game_id',v_game.current_game_uuid,
      'dealer_position',v_game.dealer_position,
      'config_deadline',v_game.config_deadline
    );
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);

  UPDATE public.players
     SET sitting_out=true,
         waiting=false,
         auto_fold=false,
         current_decision=NULL,
         decision_locked=false,
         pre_fold=false,
         pre_stay=false,
         ante_decision=NULL,
         sit_out_next_hand=false,
         stand_up_next_hand=false
   WHERE id=v_decliner.id
     AND game_id=p_game_id;

  SELECT
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out,false)
        AND player.status NOT IN ('observer','left')
        AND player.position IS NOT NULL
    ),
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out,false)
        AND player.status NOT IN ('observer','left')
        AND player.position IS NOT NULL
        AND NOT coalesce(player.is_bot,false)
    )
    INTO v_active,v_humans
    FROM public.players player
   WHERE player.game_id=p_game_id;

  IF v_game.status='session_ended' OR v_humans=0 THEN
    v_target:='session_ended';
  ELSIF v_active<2 THEN
    v_target:='waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers,false)
      INTO v_allow_bots
      FROM public.game_defaults defaults
     WHERE defaults.game_type='holm'
     LIMIT 1;
    v_allow_bots:=coalesce(v_allow_bots,false);

    SELECT array_agg(player.position ORDER BY player.position)
      INTO v_positions
      FROM public.players player
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.position IS NOT NULL
       AND (v_allow_bots OR NOT coalesce(player.is_bot,false));

    IF coalesce(cardinality(v_positions),0)=0 THEN
      v_target:='dealer_selection';
    ELSE
      v_index:=array_position(v_positions,p_expected_dealer_position);
      v_next_position:=CASE
        WHEN v_index IS NULL THEN v_positions[1]
        ELSE v_positions[(v_index%cardinality(v_positions))+1]
      END;
      v_target:='game_selection';
      v_deadline:=clock_timestamp()+make_interval(
        secs=>greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
      );
    END IF;
  END IF;

  UPDATE public.players
     SET auto_fold=false,
         current_decision=NULL,
         decision_locked=false,
         pre_fold=false,
         pre_stay=false,
         ante_decision=NULL,
         sit_out_next_hand=false,
         stand_up_next_hand=false
   WHERE game_id=p_game_id
     AND status NOT IN ('observer','left');

  UPDATE public.games
     SET status=v_target,
         game_type=NULL,
         config_complete=false,
         config_deadline=v_deadline,
         last_round_result=NULL,
         current_round=NULL,
         awaiting_next_round=false,
         next_round_number=NULL,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         game_over_at=NULL,
         buck_position=NULL,
         total_hands=0,
         is_first_hand=false,
         current_game_uuid=NULL,
         dealer_selection_state=NULL,
         dealer_position=CASE WHEN v_target='game_selection' THEN v_next_position ELSE dealer_position END,
         session_ended_at=CASE
           WHEN v_target='session_ended' THEN coalesce(session_ended_at,clock_timestamp())
           ELSE session_ended_at
         END
   WHERE id=p_game_id;

  v_result:=jsonb_build_object(
    'outcome','declined',
    'deduped',false,
    'source_dealer_game_id',v_handoff.dealer_game_id,
    'source_round_id',v_handoff.round_id,
    'source_hand_number',v_handoff.hand_number,
    'declining_player_id',v_decliner.id,
    'status',v_target,
    'dealer_position',CASE WHEN v_target='game_selection' THEN v_next_position ELSE NULL END,
    'config_deadline',v_deadline
  );

  INSERT INTO private.three_five_seven_setup_declines(
    game_id,dealer_game_id,round_id,hand_number,declining_player_id,
    expected_dealer_position,expected_config_deadline,target_status,
    dealer_position,config_deadline,result
  ) VALUES(
    p_game_id,v_handoff.dealer_game_id,v_handoff.round_id,v_handoff.hand_number,v_decliner.id,
    p_expected_dealer_position,p_expected_config_deadline,v_target,
    CASE WHEN v_target='game_selection' THEN v_next_position END,v_deadline,v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_decline_setup(uuid,integer,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_decline_setup(uuid,integer,timestamptz)
  TO authenticated,service_role;

COMMENT ON FUNCTION public.three_five_seven_decline_setup(uuid,integer,timestamptz) IS
  'Atomically declines an exact committed 3-5-7 postgame setup handoff, derives the next lifecycle disposition, and returns a durable replay-safe result.';
