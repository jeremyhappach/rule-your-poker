-- Make successor preparation part of the authoritative Chucky-loss settlement
-- transaction. The browser observes/prepares idempotently too, but it is no
-- longer required for the durable successor to exist.

DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  WHERE id = v_round.id;\n\n  RETURN jsonb_build_object(';
  v_after text := E'  WHERE id = v_round.id;\n\n  -- A continuing Chucky loss prepares its successor in this same transaction.\n  -- The successor is non-actionable until presentation activation.\n  IF p_event_kind IN (''chucky_loss_pot_match'', ''chucky_tiebreak_pot_match'')\n     AND p_awaiting_next_round\n     AND NOT v_end_game THEN\n    PERFORM public.prepare_next_holm_hand(p_game_id, v_round.id);\n  END IF;\n\n  RETURN jsonb_build_object(';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  IF position('PERFORM public.prepare_next_holm_hand(p_game_id, v_round.id)' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'prepare_holm_successor_in_settlement:accepted_boundary_not_found';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END;
$migration$;

DO $migration$
BEGIN
  IF to_regprocedure('public.proceed_to_next_holm_hand_core(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.proceed_to_next_holm_hand(uuid, uuid)
      RENAME TO proceed_to_next_holm_hand_core;
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand_core(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand_core(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand_core(uuid, uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.proceed_to_next_holm_hand(
  p_game_id uuid,
  p_expected_round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_prepared public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_activation jsonb;
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_holm_game';
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
       WHERE participant.game_id = p_game_id
         AND participant.user_id = v_actor_id
         AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.id = v_actor_id
         AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'proceed_to_next_holm_hand:not_participant';
  END IF;

  SELECT * INTO v_prepared
  FROM public.rounds
  WHERE game_id = p_game_id
    AND holm_predecessor_round_id = p_expected_round_id
  LIMIT 1;

  IF FOUND THEN
    SELECT public.activate_prepared_holm_hand(
      p_game_id,
      p_expected_round_id,
      v_prepared.id,
      false
    ) INTO v_activation;

    IF v_activation->>'outcome' = 'activated' THEN
      RETURN jsonb_build_object(
        'outcome', 'started',
        'round_id', v_activation->'round_id',
        'dealer_game_id', v_activation->'dealer_game_id',
        'hand_number', v_activation->'hand_number',
        'buck_position', v_activation->'buck_position',
        'pot', v_activation->'pot',
        'deduped', false
      );
    END IF;

    IF v_activation->>'outcome' = 'already-active' THEN
      RETURN jsonb_build_object(
        'outcome', 'already-started',
        'round_id', v_activation->'round_id',
        'dealer_game_id', v_activation->'dealer_game_id',
        'hand_number', v_activation->'hand_number',
        'buck_position', v_activation->'buck_position',
        'pot', v_activation->'pot',
        'deduped', true
      );
    END IF;

    RETURN v_activation;
  END IF;

  RETURN public.proceed_to_next_holm_hand_core(p_game_id, p_expected_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.proceed_to_next_holm_hand(uuid, uuid) IS
  'Backward-compatible Holm continuation. Activates an exact durably prepared successor when present; otherwise delegates to the atomic legacy successor core.';
