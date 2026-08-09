-- Rollback-only proof for the canonical chip-transfer projection.
-- Proves atomic database-owned openings/closings, endpoint composition,
-- cursor locality, and caller authorization without persisting fixture data.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_player_one uuid;
  v_player_two uuid;
  v_unauthorized uuid := gen_random_uuid();
  v_batch public.gameplay_transfer_batches%ROWTYPE;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2
    ) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'chip_ledger_proof:requires_two_profiles';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_host, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - chip ledger', 'in_progress',
    'horses', v_users[1], 0, false
  );

  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, false),
    (v_game_id, v_users[2], 2, 100, 'active', false, false);

  SELECT id INTO v_player_one
    FROM public.players
   WHERE game_id = v_game_id AND user_id = v_users[1];
  SELECT id INTO v_player_two
    FROM public.players
   WHERE game_id = v_game_id AND user_id = v_users[2];

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.settle_gameplay_chip_transfers(
      v_game_id,
      jsonb_build_array(jsonb_build_object(
        'from', jsonb_build_object('kind', 'player', 'playerId', v_player_one),
        'to', jsonb_build_object('kind', 'pot'),
        'amount', 10
      )),
      'ante'
    );
    RAISE EXCEPTION 'chip_ledger_proof:unauthorized_call_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'chip_ledger_proof:unauthorized_call_accepted'
       OR SQLERRM NOT LIKE '%settle_gameplay_chip_transfers:caller_not_in_session%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  -- Two simultaneous antes compose into one immutable batch with one opening
  -- value per endpoint.  Deferred finalization mirrors the production commit.
  PERFORM public.settle_gameplay_chip_transfers(
    v_game_id,
    jsonb_build_array(
      jsonb_build_object(
        'from', jsonb_build_object('kind', 'player', 'playerId', v_player_one),
        'to', jsonb_build_object('kind', 'pot'), 'amount', 10
      ),
      jsonb_build_object(
        'from', jsonb_build_object('kind', 'player', 'playerId', v_player_two),
        'to', jsonb_build_object('kind', 'pot'), 'amount', 10
      )
    ),
    'ante'
  );
  SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;

  SELECT * INTO v_batch
    FROM public.gameplay_transfer_batches
   WHERE game_id = v_game_id AND cursor = 1;
  IF NOT FOUND
     OR v_batch.opening_balances ->> ('player:' || v_player_one::text) <> '100'
     OR v_batch.opening_balances ->> ('player:' || v_player_two::text) <> '100'
     OR v_batch.opening_balances ->> 'pot' <> '0'
     OR v_batch.closing_balances ->> ('player:' || v_player_one::text) <> '90'
     OR v_batch.closing_balances ->> ('player:' || v_player_two::text) <> '90'
     OR v_batch.closing_balances ->> 'pot' <> '20'
     OR jsonb_array_length(v_batch.transfers) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_game_id
          AND chip_transfer_cursor = 1
          AND pot_transfer_cursor = 1
     )
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = v_game_id AND chip_transfer_cursor <> 1
     ) THEN
    RAISE EXCEPTION 'chip_ledger_proof:ante_batch_invalid:%', v_batch;
  END IF;

  SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
  PERFORM public.settle_gameplay_chip_transfers(
    v_game_id,
    jsonb_build_array(jsonb_build_object(
      'from', jsonb_build_object('kind', 'player', 'playerId', v_player_one),
      'to', jsonb_build_object('kind', 'player', 'playerId', v_player_two),
      'amount', 5
    )),
    'transfer'
  );
  SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
  SELECT * INTO v_batch
    FROM public.gameplay_transfer_batches
   WHERE game_id = v_game_id AND cursor = 2;
  IF NOT FOUND
     OR v_batch.opening_balances ->> ('player:' || v_player_one::text) <> '90'
     OR v_batch.opening_balances ->> ('player:' || v_player_two::text) <> '90'
     OR v_batch.closing_balances ->> ('player:' || v_player_one::text) <> '85'
     OR v_batch.closing_balances ->> ('player:' || v_player_two::text) <> '95'
     OR v_batch.opening_balances ? 'pot' THEN
    RAISE EXCEPTION 'chip_ledger_proof:player_to_player_composition_invalid:%', v_batch;
  END IF;

  SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED;
  PERFORM public.settle_gameplay_chip_transfers(
    v_game_id,
    jsonb_build_array(jsonb_build_object(
      'from', jsonb_build_object('kind', 'pot'),
      'to', jsonb_build_object('kind', 'player', 'playerId', v_player_one),
      'amount', 20
    )),
    'win'
  );
  SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE;
  SELECT * INTO v_batch
    FROM public.gameplay_transfer_batches
   WHERE game_id = v_game_id AND cursor = 3;
  IF NOT FOUND
     OR v_batch.opening_balances ->> 'pot' <> '20'
     OR v_batch.closing_balances ->> 'pot' <> '0'
     OR v_batch.opening_balances ->> ('player:' || v_player_one::text) <> '85'
     OR v_batch.closing_balances ->> ('player:' || v_player_one::text) <> '105' THEN
    RAISE EXCEPTION 'chip_ledger_proof:pot_payout_invalid:%', v_batch;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.gameplay_transfer_batches
   WHERE game_id = v_game_id;
  IF v_count <> 3 OR EXISTS (
    SELECT 1 FROM public.gameplay_transfer_pending_changes WHERE game_id = v_game_id
  ) THEN
    RAISE EXCEPTION 'chip_ledger_proof:batch_or_pending_count:%', v_count;
  END IF;
END;
$proof$;

ROLLBACK;
