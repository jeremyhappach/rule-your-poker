-- A normal final-leg 3-5-7 terminal has two presentation boundaries even
-- though its financial settlement is one transaction: return all purchased-leg
-- value during Sweep the Legs, then award the table pot.  Keep those immutable
-- batches adjacent and game-scoped so the client ledger never releases the
-- winner stack onto the post-settlement row between them.

CREATE OR REPLACE FUNCTION public.finalize_gameplay_transfer_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_transaction_id bigint := txid_current();
  v_game_id uuid;
  v_dealer_game_id uuid;
  v_cursor bigint;
  v_opening jsonb;
  v_closing jsonb;
  v_transfers jsonb;
  v_unmatched jsonb;
  v_reason text;
  v_stage_reason text;
  v_has_pot boolean;
  v_split_normal_357_terminal boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
  ) THEN
    RETURN NULL;
  END IF;

  FOR v_game_id IN
    SELECT DISTINCT game_id
      FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
     ORDER BY game_id
  LOOP
    -- Only the normal 3-5-7 terminal explicitly labels two ordered financial
    -- consequences in one transaction. Leave every other game's legacy
    -- projection shape untouched.
    SELECT
      g.game_type IN ('3-5-7', '3-5-7-game', '357')
      AND bool_or(change.reason = 'sweep')
      AND bool_or(change.reason = 'transfer')
      INTO v_split_normal_357_terminal
      FROM public.games g
      JOIN public.gameplay_transfer_pending_changes change
        ON change.game_id = g.id
       AND change.transaction_id = v_transaction_id
     WHERE g.id = v_game_id
     GROUP BY g.game_type;
    v_split_normal_357_terminal := COALESCE(v_split_normal_357_terminal, false);

    FOR v_stage_reason IN
      SELECT stage_reason
        FROM (
          SELECT NULL::text AS stage_reason, 0 AS stage_order
           WHERE NOT v_split_normal_357_terminal
          UNION ALL
          SELECT 'sweep', 1
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'transfer', 2
           WHERE v_split_normal_357_terminal
        ) stages
       ORDER BY stage_order
    LOOP
      SELECT COALESCE(jsonb_object_agg(endpoint_key, opening_balance), '{}'::jsonb)
        INTO v_opening
        FROM (
          SELECT DISTINCT ON (endpoint_key) endpoint_key, opening_balance
            FROM public.gameplay_transfer_pending_changes
           WHERE transaction_id = v_transaction_id
             AND game_id = v_game_id
             AND (NOT v_split_normal_357_terminal OR reason = v_stage_reason)
           ORDER BY endpoint_key, id
        ) opening_values;

      SELECT COALESCE(jsonb_object_agg(endpoint_key, closing_balance), '{}'::jsonb)
        INTO v_closing
        FROM (
          SELECT DISTINCT ON (endpoint_key) endpoint_key, closing_balance
            FROM public.gameplay_transfer_pending_changes
           WHERE transaction_id = v_transaction_id
             AND game_id = v_game_id
             AND (NOT v_split_normal_357_terminal OR reason = v_stage_reason)
           ORDER BY endpoint_key, id DESC
        ) closing_values;

      IF v_split_normal_357_terminal THEN
        v_reason := v_stage_reason;
      ELSE
        SELECT CASE WHEN count(DISTINCT reason) = 1 THEN min(reason) ELSE 'transfer' END
          INTO v_reason
          FROM public.gameplay_transfer_pending_changes
         WHERE transaction_id = v_transaction_id
           AND game_id = v_game_id;
      END IF;

      -- Cursors advance once per ordered presentation batch and only lock the
      -- affected game. The final raw player/pot rows carry the last cursor;
      -- the client keeps the predecessor owned until its queued successor
      -- starts, so no stale absolute row can leak between stages.
      UPDATE public.games
         SET chip_transfer_cursor = chip_transfer_cursor + 1
       WHERE id = v_game_id
       RETURNING current_game_uuid, chip_transfer_cursor
        INTO v_dealer_game_id, v_cursor;

      IF v_cursor IS NULL THEN
        RAISE EXCEPTION 'gameplay_transfer_batch:game_not_found:%', v_game_id;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_opening) AS endpoint(key) WHERE key = 'pot'
      ) INTO v_has_pot;

      IF v_has_pot THEN
        UPDATE public.games
           SET pot_transfer_cursor = v_cursor
         WHERE id = v_game_id;
      END IF;

      UPDATE public.players p
         SET chip_transfer_cursor = v_cursor
       WHERE p.game_id = v_game_id
         AND ('player:' || p.id::text) IN (
           SELECT key FROM jsonb_object_keys(v_opening) AS endpoint(key)
         );

      WITH deltas AS (
        SELECT key AS endpoint_key,
               COALESCE((v_closing ->> key)::integer, 0)
                 - COALESCE((v_opening ->> key)::integer, 0) AS delta
          FROM jsonb_object_keys(v_opening) AS endpoint(key)
      ), sources AS (
        SELECT endpoint_key,
               -delta AS amount,
               COALESCE(sum(-delta) OVER (ORDER BY endpoint_key ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS start_at,
               sum(-delta) OVER (ORDER BY endpoint_key) AS end_at
          FROM deltas
         WHERE delta < 0
      ), sinks AS (
        SELECT endpoint_key,
               delta AS amount,
               COALESCE(sum(delta) OVER (ORDER BY endpoint_key ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS start_at,
               sum(delta) OVER (ORDER BY endpoint_key) AS end_at
          FROM deltas
         WHERE delta > 0
      ), pairs AS (
        SELECT s.endpoint_key AS from_key,
               t.endpoint_key AS to_key,
               LEAST(s.end_at, t.end_at) - GREATEST(s.start_at, t.start_at) AS amount
          FROM sources s
          JOIN sinks t
            ON s.start_at < t.end_at
           AND t.start_at < s.end_at
      ), numbered_pairs AS (
        SELECT from_key, to_key, amount,
               row_number() OVER (ORDER BY from_key, to_key) AS sequence
          FROM pairs
         WHERE amount > 0
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', v_game_id::text || ':' || v_cursor::text || ':' || sequence::text,
          'amount', amount,
          'from', CASE WHEN from_key = 'pot'
            THEN jsonb_build_object('kind', 'pot')
            ELSE jsonb_build_object('kind', 'player', 'playerId', substring(from_key from 8)) END,
          'to', CASE WHEN to_key = 'pot'
            THEN jsonb_build_object('kind', 'pot')
            ELSE jsonb_build_object('kind', 'player', 'playerId', substring(to_key from 8)) END
        ) ORDER BY sequence
      ), '[]'::jsonb)
        INTO v_transfers
        FROM numbered_pairs;

      WITH deltas AS (
        SELECT key AS endpoint_key,
               COALESCE((v_closing ->> key)::integer, 0)
                 - COALESCE((v_opening ->> key)::integer, 0) AS delta
          FROM jsonb_object_keys(v_opening) AS endpoint(key)
      ), totals AS (
        SELECT COALESCE(sum(-delta) FILTER (WHERE delta < 0), 0) AS sources,
               COALESCE(sum(delta) FILTER (WHERE delta > 0), 0) AS sinks
          FROM deltas
      )
      SELECT COALESCE(jsonb_object_agg(endpoint_key, delta), '{}'::jsonb)
        INTO v_unmatched
        FROM deltas, totals
       WHERE (totals.sources <> totals.sinks) AND delta <> 0;

      INSERT INTO public.gameplay_transfer_batches (
        game_id, dealer_game_id, cursor, reason, transfers,
        opening_balances, closing_balances, unmatched_deltas
      ) VALUES (
        v_game_id, v_dealer_game_id, v_cursor, COALESCE(v_reason, 'transfer'),
        v_transfers, v_opening, v_closing, v_unmatched
      );
    END LOOP;

    DELETE FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
       AND game_id = v_game_id;
  END LOOP;

  RETURN NULL;
END;
$function$;

DO $migration$
DECLARE
  v_function_sql text;
  v_old text := $old$
  UPDATE public.players p
     SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END,
         legs = 0,
         current_decision = NULL,
         decision_locked = false,
         ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
   WHERE p.game_id = p_game_id;
$old$;
  v_new text := $new$
  -- Normal final-leg settlement has a leg-reserve return and a pot award.
  -- Both remain in this transaction, but the journal marks them as ordered
  -- immutable presentation stages. Instant 3-5-7 sweeps retain their existing
  -- single payout projection.
  IF NOT v_is_sweep AND v_total_leg_value > 0 THEN
    PERFORM set_config('ptown.chip_transfer_reason', 'sweep', true);
    UPDATE public.players p
       SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_total_leg_value ELSE 0 END,
           legs = 0,
           current_decision = NULL,
           decision_locked = false,
           ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
     WHERE p.game_id = p_game_id;

    PERFORM set_config('ptown.chip_transfer_reason', 'transfer', true);
    UPDATE public.players p
       SET chips = p.chips + COALESCE(v_game.pot, 0)
     WHERE p.id = v_winner_id
       AND p.game_id = p_game_id;
  ELSE
    UPDATE public.players p
       SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END,
           legs = 0,
           current_decision = NULL,
           decision_locked = false,
           ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
     WHERE p.game_id = p_game_id;
  END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.three_five_seven_settle_game(uuid,uuid,uuid,integer)'::regprocedure
  ) INTO v_function_sql;

  IF v_function_sql LIKE '%ptown.chip_transfer_reason'', ''sweep''%' THEN
    RETURN;
  END IF;
  IF position(v_old IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'split_normal_357_leg_sweep_projection:terminal_update_not_found';
  END IF;

  EXECUTE replace(v_function_sql, v_old, v_new);
END;
$migration$;

COMMENT ON FUNCTION public.finalize_gameplay_transfer_batch() IS
  'Emits immutable game-scoped transfer batches and preserves ordered normal 3-5-7 leg-sweep and pot-award presentation stages.';

COMMENT ON FUNCTION public.three_five_seven_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles terminal 3-5-7, including ordered normal final-leg reserve-return and pot-award presentation batches.';
