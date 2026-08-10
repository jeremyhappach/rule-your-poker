-- Holm's multi-player showdown has two real financial consequences in one
-- settlement: the old pot pays winner(s), then losing stayers seed the next
-- pot. Preserve that topology as adjacent immutable ledger batches instead of
-- reducing it to a net player-to-player transfer.

DO $migration$
DECLARE
  v_function_sql text;
  v_old text := $old$
  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);
$old$;
  v_new text := $new$
  -- The initial Holm hand is an ante, never a terminal replacement-pot
  -- transfer. Both player and pot journal rows must carry the same reason.
  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_holm_initial_hand(uuid,boolean)'::regprocedure
  ) INTO v_function_sql;

  IF v_function_sql LIKE '%ptown.chip_transfer_reason'', ''ante''%' THEN
    RETURN;
  END IF;
  IF position(v_old IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'stage_holm_showdown_projection:initial_ante_update_not_found';
  END IF;

  EXECUTE replace(v_function_sql, v_old, v_new);
END;
$migration$;

DO $migration$
DECLARE
  v_function_sql text;
  v_old text := $old$
  -- ── Payout (exactly once, guarded by the claim above) ──────────────────
  FOR v_player_id, v_delta IN
    SELECT k::uuid, (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k
  LOOP
    IF v_delta <> 0 THEN
      UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
    END IF;
  END LOOP;
$old$;
  v_new text := $new$
  -- holm_staged_showdown_projection
  -- A standard or partial-tie showdown pays the old pot before the losing
  -- stayers seed its replacement. The underlying game result remains one
  -- transaction and one idempotency claim; the journal records its two
  -- authoritative presentation stages with database-captured balance pairs.
  IF p_event_kind IN ('showdown_final_award', 'partial_tie_final_award') THEN
    PERFORM set_config('ptown.chip_transfer_reason', 'win', true);
    FOR v_player_id, v_delta IN
      SELECT k::uuid, (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k
    LOOP
      IF v_delta > 0 THEN
        UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
      END IF;
    END LOOP;
    UPDATE public.games
       SET pot = 0
     WHERE id = p_game_id
       AND pot <> 0;

    PERFORM set_config('ptown.chip_transfer_reason', 'transfer', true);
    FOR v_player_id, v_delta IN
      SELECT k::uuid, (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k
    LOOP
      IF v_delta < 0 THEN
        UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
      END IF;
    END LOOP;
    UPDATE public.games
       SET pot = p_pot_final
     WHERE id = p_game_id
       AND pot IS DISTINCT FROM p_pot_final;
  ELSE
    -- Existing financial semantics remain byte-for-byte for every other Holm
    -- settlement event, including Chucky loss/final and carry-forward paths.
    FOR v_player_id, v_delta IN
      SELECT k::uuid, (p_chip_deltas->>k)::int FROM jsonb_object_keys(p_chip_deltas) k
    LOOP
      IF v_delta <> 0 THEN
        UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
      END IF;
    END LOOP;
  END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean)'::regprocedure
  ) INTO v_function_sql;

  IF v_function_sql LIKE '%holm_staged_showdown_projection%' THEN
    RETURN;
  END IF;
  IF position(v_old IN v_function_sql) = 0 THEN
    RAISE EXCEPTION 'stage_holm_showdown_projection:settlement_payout_not_found';
  END IF;

  EXECUTE replace(v_function_sql, v_old, v_new);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.finalize_gameplay_transfer_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_split_holm_showdown boolean;
  v_split_projection boolean;
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
    -- Normal 3-5-7 and multi-player Holm each publish two semantic financial
    -- stages in a single settlement transaction. Other games retain their
    -- existing one-batch net projection.
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

    SELECT
      g.game_type IN ('holm', 'holm-game')
      AND bool_or(change.reason = 'win')
      AND bool_or(change.reason = 'transfer')
      INTO v_split_holm_showdown
      FROM public.games g
      JOIN public.gameplay_transfer_pending_changes change
        ON change.game_id = g.id
       AND change.transaction_id = v_transaction_id
     WHERE g.id = v_game_id
     GROUP BY g.game_type;
    v_split_holm_showdown := COALESCE(v_split_holm_showdown, false);
    v_split_projection := v_split_normal_357_terminal OR v_split_holm_showdown;

    FOR v_stage_reason IN
      SELECT stage_reason
        FROM (
          SELECT NULL::text AS stage_reason, 0 AS stage_order
           WHERE NOT v_split_projection
          UNION ALL
          SELECT 'sweep', 1
           WHERE v_split_normal_357_terminal
          UNION ALL
          SELECT 'win', 1
           WHERE v_split_holm_showdown
          UNION ALL
          SELECT 'transfer', 2
           WHERE v_split_normal_357_terminal OR v_split_holm_showdown
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
             AND (NOT v_split_projection OR reason = v_stage_reason)
           ORDER BY endpoint_key, id
        ) opening_values;

      SELECT COALESCE(jsonb_object_agg(endpoint_key, closing_balance), '{}'::jsonb)
        INTO v_closing
        FROM (
          SELECT DISTINCT ON (endpoint_key) endpoint_key, closing_balance
            FROM public.gameplay_transfer_pending_changes
           WHERE transaction_id = v_transaction_id
             AND game_id = v_game_id
             AND (NOT v_split_projection OR reason = v_stage_reason)
           ORDER BY endpoint_key, id DESC
        ) closing_values;

      IF v_split_projection THEN
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

COMMENT ON FUNCTION public.finalize_gameplay_transfer_batch() IS
  'Emits immutable game-scoped transfer batches, including ordered normal 3-5-7 leg/pot and Holm showdown pot/replacement-pot stages.';

COMMENT ON FUNCTION public.holm_settle_hand(uuid,uuid,integer,public.holm_event_kind,integer,boolean,text,jsonb,text,uuid,text,boolean,integer,boolean,integer,boolean,boolean) IS
  'Atomically and idempotently settles Holm hands; multi-player showdowns publish ordered pot-award and replacement-pot transfer stages.';
