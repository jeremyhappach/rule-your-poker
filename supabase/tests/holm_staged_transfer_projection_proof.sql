-- Rollback-only proof for the Holm staged transfer projection.
-- Run after holm_initial_hand_proof.sql. It proves ordinary winner, partial
-- tie, duplicate/replay, and database-owned staged opening/closing values.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_tie_game_id uuid := gen_random_uuid();
  v_tie_dealer_game_id uuid := gen_random_uuid();
  v_winner_id uuid;
  v_loser_id uuid;
  v_tie_winner_one uuid;
  v_tie_winner_two uuid;
  v_tie_loser uuid;
  v_result jsonb;
  v_duplicate jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 3
    ) profiles;
  IF coalesce(cardinality(v_users), 0) < 3 THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:requires_three_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm staged winner', 'ante_decision',
    'holm-game', v_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_winner_id FROM public.players
   WHERE game_id = v_game_id AND user_id = v_users[1];
  SELECT id INTO v_loser_id FROM public.players
   WHERE game_id = v_game_id AND user_id = v_users[2];

  -- The first hand must create a proper ante batch before any decisions.
  PERFORM public.start_holm_initial_hand(v_game_id, false);
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_transfer_batches b
     WHERE b.game_id = v_game_id
       AND b.cursor = 1
       AND b.reason = 'ante'
       AND b.opening_balances ->> 'pot' = '0'
       AND b.closing_balances ->> 'pot' = '2'
       AND jsonb_array_length(b.transfers) = 2
  ) THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:initial_ante_not_canonical';
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';

  SELECT public.holm_settle_hand(
    v_game_id, v_dealer_game_id, 1, 'showdown_final_award',
    1, true,
    'Winner|||WINNER:' || v_winner_id::text || '|||LOSERS:' || v_loser_id::text || '|||POT:2|||MATCH:1',
    jsonb_build_object(v_winner_id::text, 2, v_loser_id::text, -1),
    'Winner proof', v_winner_id, 'Winner', false, 2,
    true, NULL, false, false
  ) INTO v_result;
  IF v_result->>'status' <> 'settled' THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:winner_not_settled:%', v_result;
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';

  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_transfer_batches b
     WHERE b.game_id = v_game_id
       AND b.cursor = 2
       AND b.reason = 'win'
       AND b.opening_balances ->> 'pot' = '2'
       AND b.closing_balances ->> 'pot' = '0'
       AND b.opening_balances ->> ('player:' || v_winner_id::text) = '99'
       AND b.closing_balances ->> ('player:' || v_winner_id::text) = '101'
       AND b.transfers = jsonb_build_array(jsonb_build_object(
         'id', v_game_id::text || ':2:1', 'amount', 2,
         'from', jsonb_build_object('kind', 'pot'),
         'to', jsonb_build_object('kind', 'player', 'playerId', v_winner_id::text)
       ))
  ) THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:winner_pot_stage_invalid:%', (
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.cursor)
        FROM public.gameplay_transfer_batches b
       WHERE b.game_id = v_game_id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_transfer_batches b
     WHERE b.game_id = v_game_id
       AND b.cursor = 3
       AND b.reason = 'transfer'
       AND b.opening_balances ->> 'pot' = '0'
       AND b.closing_balances ->> 'pot' = '1'
       AND b.opening_balances ->> ('player:' || v_loser_id::text) = '99'
       AND b.closing_balances ->> ('player:' || v_loser_id::text) = '98'
       AND jsonb_array_length(b.transfers) = 1
       AND b.transfers->0->'from'->>'playerId' = v_loser_id::text
       AND b.transfers->0->'to'->>'kind' = 'pot'
       AND (b.transfers->0->>'amount')::integer = 1
  ) THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:winner_replacement_stage_invalid';
  END IF;

  SELECT public.holm_settle_hand(
    v_game_id, v_dealer_game_id, 1, 'showdown_final_award',
    1, true, 'ignored replay',
    jsonb_build_object(v_winner_id::text, 2, v_loser_id::text, -1),
    'ignored replay', v_winner_id, 'Winner', false, 2,
    true, NULL, false, false
  ) INTO v_duplicate;
  IF v_duplicate->>'status' <> 'already_settled' THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:duplicate_not_deduped:%', v_duplicate;
  END IF;
  SELECT count(*) INTO v_count FROM public.gameplay_transfer_batches WHERE game_id = v_game_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:duplicate_emitted_batch:%', v_count;
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';

  -- Partial tie proves the pot stage can fan out to multiple winners before
  -- the distinct loser-to-replacement-pot stage begins.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_tie_game_id, 'Codex rollback proof - Holm staged tie', 'ante_decision',
    'holm-game', v_tie_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_tie_dealer_game_id, v_tie_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_tie_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_tie_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false),
    (v_tie_game_id, v_users[3], 3, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_tie_winner_one FROM public.players
   WHERE game_id = v_tie_game_id AND user_id = v_users[1];
  SELECT id INTO v_tie_winner_two FROM public.players
   WHERE game_id = v_tie_game_id AND user_id = v_users[2];
  SELECT id INTO v_tie_loser FROM public.players
   WHERE game_id = v_tie_game_id AND user_id = v_users[3];

  PERFORM public.start_holm_initial_hand(v_tie_game_id, false);
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  SELECT public.holm_settle_hand(
    v_tie_game_id, v_tie_dealer_game_id, 1, 'partial_tie_final_award',
    1, true,
    'Tie|||WINNERS:' || v_tie_winner_one::text || ',' || v_tie_winner_two::text || '|||LOSERS:' || v_tie_loser::text || '|||POT:3|||MATCH:1',
    jsonb_build_object(v_tie_winner_one::text, 1, v_tie_winner_two::text, 1, v_tie_loser::text, -1),
    'Tie proof', NULL, 'Tie', true, 3,
    true, NULL, false, false
  ) INTO v_result;
  IF v_result->>'status' <> 'settled' THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:tie_not_settled:%', v_result;
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';

  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_transfer_batches b
     WHERE b.game_id = v_tie_game_id
       AND b.cursor = 2
       AND b.reason = 'win'
       AND b.opening_balances ->> 'pot' = '3'
       AND b.closing_balances ->> 'pot' = '0'
       AND jsonb_array_length(b.transfers) = 2
  ) OR NOT EXISTS (
    SELECT 1 FROM public.gameplay_transfer_batches b
     WHERE b.game_id = v_tie_game_id
       AND b.cursor = 3
       AND b.reason = 'transfer'
       AND b.opening_balances ->> 'pot' = '0'
       AND b.closing_balances ->> 'pot' = '1'
       AND jsonb_array_length(b.transfers) = 1
       AND b.transfers->0->'from'->>'playerId' = v_tie_loser::text
  ) THEN
    RAISE EXCEPTION 'holm_staged_projection_proof:tie_stages_invalid';
  END IF;

  RAISE NOTICE 'holm_staged_projection_proof:passed';
END;
$proof$;

ROLLBACK;
