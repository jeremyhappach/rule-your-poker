-- No historical rows are changed. Fixture admission remains fake-money-only.
-- Validate the authoritative complete card cohort before publishing a new deal
-- or committing a new settlement. Existing settlement receipts still replay.
CREATE OR REPLACE FUNCTION private.assert_unique_holm_cards(p_cards jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE v_total integer; v_unique integer; v_invalid boolean;
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'holm_card_integrity:invalid_cards' USING ERRCODE='23514';
  END IF;
  WITH normalized AS (
    SELECT CASE upper(card->>'rank') WHEN 'T' THEN '10' ELSE upper(card->>'rank') END AS rank,
      CASE lower(card->>'suit')
        WHEN 'spades' THEN 's' WHEN '♠' THEN 's'
        WHEN 'hearts' THEN 'h' WHEN '♥' THEN 'h'
        WHEN 'diamonds' THEN 'd' WHEN '♦' THEN 'd'
        WHEN 'clubs' THEN 'c' WHEN '♣' THEN 'c' END AS suit,
      jsonb_typeof(card) IS DISTINCT FROM 'object'
        OR coalesce(card->>'masked','false') <> 'false' AS invalid
    FROM jsonb_array_elements(p_cards) card
  )
  SELECT count(*),count(DISTINCT (rank,suit)),
    coalesce(bool_or(invalid OR suit IS NULL OR rank IS NULL
      OR rank NOT IN ('2','3','4','5','6','7','8','9','10','J','Q','K','A')),false)
    INTO v_total,v_unique,v_invalid FROM normalized;
  IF v_invalid OR v_total > 52 THEN
    RAISE EXCEPTION 'holm_card_integrity:invalid_card' USING ERRCODE='23514';
  END IF;
  IF v_total <> v_unique THEN
    RAISE EXCEPTION 'holm_card_integrity:duplicate_card' USING ERRCODE='23514';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.assert_unique_holm_cards(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.assert_unique_holm_cards(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.assert_holm_round_card_integrity(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE v_round public.rounds%ROWTYPE; v_cards jsonb;
BEGIN
  SELECT * INTO STRICT v_round FROM public.rounds WHERE id=p_round_id;
  v_round:=private.holm_authoritative_round(v_round);
  SELECT coalesce(jsonb_agg(card),'[]'::jsonb) INTO v_cards
  FROM public.player_cards pc CROSS JOIN LATERAL jsonb_array_elements(pc.cards) card
  WHERE pc.round_id=p_round_id;
  PERFORM private.assert_unique_holm_cards(
    coalesce(v_round.community_cards,'[]'::jsonb)||v_cards||coalesce(v_round.chucky_cards,'[]'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION private.assert_holm_round_card_integrity(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.assert_holm_round_card_integrity(uuid) TO service_role;

-- Exact replacements fail closed if a deployed owner has changed shape.
DO $migration$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('private.target_holm_fixture_player_cards(text,integer)'::regprocedure) INTO v_definition;
  v_old := $old$  IF p_profile NOT LIKE 'holm:%' THEN RETURN NULL; END IF;$old$;
  v_new := $new$  IF p_profile IS NULL OR p_profile NOT LIKE 'holm:%'
     OR private.target_rule_branch_profile_valid(p_profile) IS NOT TRUE THEN RETURN NULL; END IF;$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','private.target_holm_fixture_player_cards(text,integer)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('private.target_holm_fixture_chucky(text,integer)'::regprocedure) INTO v_definition;
  v_old := $old$  IF p_profile NOT LIKE 'holm:%' THEN RETURN NULL; END IF;$old$;
  v_new := $new$  IF p_profile IS NULL OR p_profile NOT LIKE 'holm:%'
     OR private.target_rule_branch_profile_valid(p_profile) IS NOT TRUE THEN RETURN NULL; END IF;$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','private.target_holm_fixture_chucky(text,integer)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.start_holm_initial_hand(uuid,boolean)'::regprocedure) INTO v_definition;
  v_old := $old$  v_fixture_profile:=private.target_rule_branch_profile_for_context(
    _game_id,v_game.current_game_uuid,1,1,'holm-game'
  );$old$;
  v_new := $new$  IF v_game.real_money IS FALSE THEN
    v_fixture_profile:=private.target_rule_branch_profile_for_context(
      _game_id,v_game.current_game_uuid,1,1,'holm-game'
    );
  END IF;$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.start_holm_initial_hand(uuid,boolean)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.start_holm_initial_hand(uuid,boolean)'::regprocedure) INTO v_definition;
  v_old := $old$    v_fixture_cards:=private.target_holm_fixture_player_cards(v_fixture_profile,v_player_index);$old$;
  v_new := $new$    v_fixture_cards:=NULL;
    IF v_game.real_money IS FALSE AND v_fixture_profile IS NOT NULL THEN
      v_fixture_cards:=private.target_holm_fixture_player_cards(v_fixture_profile,v_player_index);
    END IF;$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.start_holm_initial_hand(uuid,boolean)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.start_holm_initial_hand(uuid,boolean)'::regprocedure) INTO v_definition;
  v_old := $old$  UPDATE public.games
     SET status = 'in_progress',$old$;
  v_new := $new$  PERFORM private.assert_holm_round_card_integrity(v_round_id);

  UPDATE public.games
     SET status = 'in_progress',$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.start_holm_initial_hand(uuid,boolean)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.prepare_next_holm_hand(uuid,uuid)'::regprocedure) INTO v_definition;
  v_old := $old$  SELECT count(*)::integer INTO v_inserted_count
  FROM public.player_cards$old$;
  v_new := $new$  PERFORM private.assert_holm_round_card_integrity(v_round_id);

  SELECT count(*)::integer INTO v_inserted_count
  FROM public.player_cards$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.prepare_next_holm_hand(uuid,uuid)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.proceed_to_next_holm_hand_core(uuid,uuid)'::regprocedure) INTO v_definition;
  v_old := $old$  SELECT count(*)::integer
    INTO v_updated_count
    FROM public.player_cards$old$;
  v_new := $new$  PERFORM private.assert_holm_round_card_integrity(v_round_id);

  SELECT count(*)::integer
    INTO v_updated_count
    FROM public.player_cards$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.proceed_to_next_holm_hand_core(uuid,uuid)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)'::regprocedure) INTO v_definition;
  v_old := $old$  IF p_chip_deltas IS NULL OR jsonb_typeof(p_chip_deltas) <> 'object' THEN$old$;
  v_new := $new$  -- Completed claims return above: never revalidate or rewrite historical deals.
  PERFORM private.assert_holm_round_card_integrity(v_round.id);

  IF p_chip_deltas IS NULL OR jsonb_typeof(p_chip_deltas) <> 'object' THEN$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.start_yahtzee_round(uuid,uuid)'::regprocedure) INTO v_definition;
  v_old := $old$  IF _predecessor_round_id IS NULL THEN
    v_fixture_profile:=private.target_rule_branch_profile_for_context($old$;
  v_new := $new$  IF _predecessor_round_id IS NULL AND v_game.real_money IS FALSE THEN
    v_fixture_profile:=private.target_rule_branch_profile_for_context($new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.start_yahtzee_round(uuid,uuid)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('public.start_yahtzee_round(uuid,uuid)'::regprocedure) INTO v_definition;
  v_old := $old$  IF _predecessor_round_id IS NULL AND v_harness_enabled AND v_harness='near_win' THEN$old$;
  v_new := $new$  IF _predecessor_round_id IS NULL AND v_game.real_money IS FALSE
     AND coalesce(v_harness_enabled,false) AND v_harness='near_win' THEN$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','public.start_yahtzee_round(uuid,uuid)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('private.target_yahtzee_fixture_dice(text)'::regprocedure) INTO v_definition;
  -- A WHERE guard preserves the existing category CASE as one valid statement.
  v_old := $old$    ELSE ARRAY[1,2,3,4,5]
  END$old$;
  v_new := $new$    ELSE ARRAY[1,2,3,4,5]
  END
  WHERE p_profile IS NOT NULL AND p_profile LIKE 'yahtzee:%'
    AND private.target_rule_branch_profile_valid(p_profile) IS TRUE$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','private.target_yahtzee_fixture_dice(text)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

  SELECT pg_get_functiondef('private.target_yahtzee_seed_scores(text,boolean)'::regprocedure) INTO v_definition;
  v_old := $old$BEGIN
  IF p_profile='yahtzee:terminal:tie'$old$;
  v_new := $new$BEGIN
  IF p_profile IS NULL OR p_profile NOT LIKE 'yahtzee:%'
     OR private.target_rule_branch_profile_valid(p_profile) IS NOT TRUE THEN RETURN NULL; END IF;
  IF p_profile='yahtzee:terminal:tie'$new$;
  IF position(v_new IN v_definition)=0 THEN
    IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 THEN
      RAISE EXCEPTION 'fixture_isolation:unexpected_function_shape:%','private.target_yahtzee_seed_scores(text,boolean)';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;

END;
$migration$;
