-- Canonical chip-transfer projection.
--
-- Every committed player/pot balance movement is journalled in the same
-- transaction and finalized by a deferred constraint trigger.  The immutable
-- batch stores database-captured opening and closing balances; clients never
-- infer either value or create their own financial presentation state.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS chip_transfer_cursor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pot_transfer_cursor bigint;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS chip_transfer_cursor bigint;

CREATE TABLE IF NOT EXISTS public.gameplay_transfer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid,
  cursor bigint NOT NULL,
  reason text NOT NULL DEFAULT 'transfer',
  transfers jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  closing_balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  unmatched_deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gameplay_transfer_batches_game_cursor_key UNIQUE (game_id, cursor),
  CONSTRAINT gameplay_transfer_batches_transfers_array CHECK (jsonb_typeof(transfers) = 'array'),
  CONSTRAINT gameplay_transfer_batches_opening_object CHECK (jsonb_typeof(opening_balances) = 'object'),
  CONSTRAINT gameplay_transfer_batches_closing_object CHECK (jsonb_typeof(closing_balances) = 'object'),
  CONSTRAINT gameplay_transfer_batches_unmatched_object CHECK (jsonb_typeof(unmatched_deltas) = 'object')
);

CREATE INDEX IF NOT EXISTS gameplay_transfer_batches_game_cursor_idx
  ON public.gameplay_transfer_batches (game_id, cursor);

-- This table is private transaction scratch space.  Rows are inserted by the
-- row triggers below and deleted by the deferred finalizer before commit.
CREATE TABLE IF NOT EXISTS public.gameplay_transfer_pending_changes (
  id bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  endpoint_key text NOT NULL,
  opening_balance integer NOT NULL,
  closing_balance integer NOT NULL,
  reason text NOT NULL DEFAULT 'transfer',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gameplay_transfer_pending_endpoint_key CHECK (
    endpoint_key = 'pot' OR endpoint_key ~ '^player:[0-9a-fA-F-]{36}$'
  )
);

CREATE INDEX IF NOT EXISTS gameplay_transfer_pending_transaction_idx
  ON public.gameplay_transfer_pending_changes (transaction_id, game_id, id);

ALTER TABLE public.gameplay_transfer_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gameplay_transfer_batches_select_participant
  ON public.gameplay_transfer_batches;
CREATE POLICY gameplay_transfer_batches_select_participant
  ON public.gameplay_transfer_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.players p
       WHERE p.game_id = gameplay_transfer_batches.game_id
         AND p.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

GRANT SELECT ON public.gameplay_transfer_batches TO authenticated, service_role;

-- Stage the cursor on the same physical row update as the balance.  Realtime
-- may deliver that row before the immutable batch INSERT, so publishing the
-- next per-game cursor here lets the presentation ledger hold the old display
-- instead of accepting an early authoritative balance.
CREATE OR REPLACE FUNCTION public.stage_gameplay_player_transfer_cursor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cursor bigint;
BEGIN
  IF NEW.chips IS NOT DISTINCT FROM OLD.chips THEN
    RETURN NEW;
  END IF;
  SELECT chip_transfer_cursor + 1 INTO v_cursor
    FROM public.games
   WHERE id = NEW.game_id
   FOR UPDATE;
  IF v_cursor IS NULL THEN
    RAISE EXCEPTION 'gameplay_transfer_cursor:game_not_found:%', NEW.game_id;
  END IF;
  NEW.chip_transfer_cursor := v_cursor;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_gameplay_pot_transfer_cursor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.pot, 0) IS DISTINCT FROM COALESCE(OLD.pot, 0) THEN
    NEW.pot_transfer_cursor := OLD.chip_transfer_cursor + 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.journal_gameplay_player_chip_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.chips IS NOT DISTINCT FROM OLD.chips THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.gameplay_transfer_pending_changes (
    transaction_id, game_id, endpoint_key, opening_balance, closing_balance, reason
  ) VALUES (
    txid_current(),
    NEW.game_id,
    'player:' || NEW.id::text,
    OLD.chips,
    NEW.chips,
    COALESCE(NULLIF(current_setting('ptown.chip_transfer_reason', true), ''), 'transfer')
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.journal_gameplay_pot_chip_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.pot, 0) IS NOT DISTINCT FROM COALESCE(OLD.pot, 0) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.gameplay_transfer_pending_changes (
    transaction_id, game_id, endpoint_key, opening_balance, closing_balance, reason
  ) VALUES (
    txid_current(),
    NEW.id,
    'pot',
    COALESCE(OLD.pot, 0),
    COALESCE(NEW.pot, 0),
    COALESCE(NULLIF(current_setting('ptown.chip_transfer_reason', true), ''), 'transfer')
  );
  RETURN NEW;
END;
$function$;

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
  v_has_pot boolean;
BEGIN
  -- Constraint triggers fire once for every scratch row at commit.  The first
  -- invocation consumes the complete transaction group; later invocations are
  -- intentional no-ops.
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
    SELECT COALESCE(jsonb_object_agg(endpoint_key, opening_balance), '{}'::jsonb)
      INTO v_opening
      FROM (
        SELECT DISTINCT ON (endpoint_key) endpoint_key, opening_balance
          FROM public.gameplay_transfer_pending_changes
         WHERE transaction_id = v_transaction_id
           AND game_id = v_game_id
         ORDER BY endpoint_key, id
      ) opening_values;

    SELECT COALESCE(jsonb_object_agg(endpoint_key, closing_balance), '{}'::jsonb)
      INTO v_closing
      FROM (
        SELECT DISTINCT ON (endpoint_key) endpoint_key, closing_balance
          FROM public.gameplay_transfer_pending_changes
         WHERE transaction_id = v_transaction_id
           AND game_id = v_game_id
         ORDER BY endpoint_key, id DESC
      ) closing_values;

    SELECT CASE WHEN count(DISTINCT reason) = 1 THEN min(reason) ELSE 'transfer' END
      INTO v_reason
      FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
       AND game_id = v_game_id;

    -- Lock only the game whose cursor is being advanced.  Independent games
    -- therefore never serialize each other's presentation batches.
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

    -- A player row carries the cursor that owns its raw balance.  If realtime
    -- delivers that row before the batch, the client keeps the previous
    -- presentation value until this exact immutable batch is available.
    UPDATE public.players p
       SET chip_transfer_cursor = v_cursor
     WHERE p.game_id = v_game_id
       AND ('player:' || p.id::text) IN (
         SELECT key FROM jsonb_object_keys(v_opening) AS endpoint(key)
       );

    -- Deterministically pair negative and positive net endpoint deltas using
    -- cumulative intervals.  This composes multi-sender antes and payouts
    -- without client snapshots or arbitrary pairing order.
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

    -- Not every chip change is a table transfer (for example a buy-in or the
    -- pre-existing 3-5-7 leg reserve).  They remain auditable and reconcile to
    -- their database closing value, but never produce a fake flight.
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

    DELETE FROM public.gameplay_transfer_pending_changes
     WHERE transaction_id = v_transaction_id
       AND game_id = v_game_id;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS gameplay_transfer_players_journal ON public.players;
DROP TRIGGER IF EXISTS gameplay_transfer_players_stage_cursor ON public.players;
CREATE TRIGGER gameplay_transfer_players_stage_cursor
  BEFORE UPDATE OF chips ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.stage_gameplay_player_transfer_cursor();

CREATE TRIGGER gameplay_transfer_players_journal
  AFTER UPDATE OF chips ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_gameplay_player_chip_change();

DROP TRIGGER IF EXISTS gameplay_transfer_games_journal ON public.games;
DROP TRIGGER IF EXISTS gameplay_transfer_games_stage_pot_cursor ON public.games;
CREATE TRIGGER gameplay_transfer_games_stage_pot_cursor
  BEFORE UPDATE OF pot ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.stage_gameplay_pot_transfer_cursor();

CREATE TRIGGER gameplay_transfer_games_journal
  AFTER UPDATE OF pot ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_gameplay_pot_chip_change();

DROP TRIGGER IF EXISTS gameplay_transfer_pending_finalize ON public.gameplay_transfer_pending_changes;
CREATE CONSTRAINT TRIGGER gameplay_transfer_pending_finalize
  AFTER INSERT ON public.gameplay_transfer_pending_changes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.finalize_gameplay_transfer_batch();

CREATE OR REPLACE FUNCTION public.settle_gameplay_chip_transfers(
  p_game_id uuid,
  p_transfers jsonb,
  p_reason text DEFAULT 'transfer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_transfer jsonb;
  v_from_kind text;
  v_to_kind text;
  v_from_player_id uuid;
  v_to_player_id uuid;
  v_amount integer;
  v_endpoint_key text;
  v_delta integer;
  v_deltas jsonb := '{}'::jsonb;
  v_pot_delta integer := 0;
BEGIN
  IF p_game_id IS NULL OR jsonb_typeof(p_transfers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_input';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:game_not_found:%', p_game_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:caller_not_in_session';
  END IF;

  PERFORM set_config(
    'ptown.chip_transfer_reason',
    CASE WHEN p_reason IN ('ante', 'bet', 'win', 'leg', 'sweep', 'transfer') THEN p_reason ELSE 'transfer' END,
    true
  );

  FOR v_transfer IN SELECT value FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      v_amount := (v_transfer ->> 'amount')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END IF;

    v_from_kind := v_transfer #>> '{from,kind}';
    v_to_kind := v_transfer #>> '{to,kind}';
    IF v_from_kind NOT IN ('pot', 'player') OR v_to_kind NOT IN ('pot', 'player')
       OR v_from_kind = v_to_kind AND v_from_kind = 'pot' THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_endpoint';
    END IF;

    IF v_from_kind = 'player' THEN
      BEGIN v_from_player_id := (v_transfer #>> '{from,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_from_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_from_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) - v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta - v_amount;
    END IF;

    IF v_to_kind = 'player' THEN
      BEGIN v_to_player_id := (v_transfer #>> '{to,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_to_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_to_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) + v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta + v_amount;
    END IF;
  END LOOP;

  UPDATE public.players p
     SET chips = p.chips + (entry.value #>> '{}')::integer
    FROM jsonb_each(v_deltas) AS entry(key, value)
   WHERE p.id = substring(entry.key from 8)::uuid
     AND p.game_id = p_game_id
     AND (entry.value #>> '{}')::integer <> 0;

  IF v_pot_delta <> 0 THEN
    UPDATE public.games
       SET pot = COALESCE(pot, 0) + v_pot_delta
     WHERE id = p_game_id;
  END IF;

  RETURN jsonb_build_object('status', 'settled');
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_gameplay_chip_transfers(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_gameplay_chip_transfers(uuid, jsonb, text)
  TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.gameplay_transfer_batches;

COMMENT ON TABLE public.gameplay_transfer_batches IS
  'Immutable database-owned presentation projection for chip transfers. Opening and closing balances are captured in the financial transaction.';
COMMENT ON FUNCTION public.settle_gameplay_chip_transfers(uuid, jsonb, text) IS
  'Applies client-requested pot/player transfers atomically; the deferred transfer projector emits the corresponding immutable presentation batch before commit.';
