-- Bind every charged 3-5-7 Round 1 to the immutable transfer batch that
-- opened it. The game-level cursor is allowed to advance later; this claim is
-- exact round identity and is therefore safe for duplicate and late replay.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS three_five_seven_opening_transfer_cursor bigint;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'rounds_357_opening_transfer_cursor_positive'
       AND conrelid = 'public.rounds'::regclass
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_357_opening_transfer_cursor_positive
      CHECK (
        three_five_seven_opening_transfer_cursor IS NULL
        OR three_five_seven_opening_transfer_cursor > 0
      );
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.rounds.three_five_seven_opening_transfer_cursor IS
  'Immutable gameplay_transfer_batches cursor that paid the exact charged 3-5-7 Round 1. NULL for rounds with no opening charge.';

-- Existing authority-owned rounds predate the claim column. Backfill only
-- when the exact charge result exists and exactly one immutable ante batch
-- lies between this Round 1 and the next Round 1 in the same dealer game.
-- Ambiguous history remains NULL and therefore fails closed below.
SELECT set_config('app.three_five_seven_authoritative_write', 'on', true);

WITH charged_rounds AS (
  SELECT
    round_row.id,
    round_row.game_id,
    round_row.dealer_game_id,
    round_row.created_at,
    charge_result.player_chip_changes,
    lead(round_row.created_at) OVER (
      PARTITION BY round_row.game_id, round_row.dealer_game_id
      ORDER BY round_row.hand_number, round_row.created_at, round_row.id
    ) AS next_round_one_at
  FROM public.rounds round_row
  JOIN public.games game_row ON game_row.id = round_row.game_id
  JOIN public.game_results charge_result
    ON charge_result.game_id = round_row.game_id
   AND charge_result.dealer_game_id = round_row.dealer_game_id
   AND charge_result.hand_number = round_row.hand_number
   AND charge_result.settlement_key = 'three_five_seven_charge:' || round_row.id::text
  WHERE game_row.game_type IN ('3-5-7','3-5-7-game','357')
    AND round_row.round_number = 1
    AND round_row.three_five_seven_opening_transfer_cursor IS NULL
), exact_candidates AS (
  SELECT
    charged_round.id,
    min(batch.cursor) AS cursor,
    count(*) AS candidate_count
  FROM charged_rounds charged_round
  JOIN public.gameplay_transfer_batches batch
    ON batch.game_id = charged_round.game_id
   AND batch.dealer_game_id IS NOT DISTINCT FROM charged_round.dealer_game_id
   AND batch.reason = 'ante'
   AND batch.created_at >= charged_round.created_at
   AND (
     charged_round.next_round_one_at IS NULL
     OR batch.created_at < charged_round.next_round_one_at
   )
   AND jsonb_typeof(charged_round.player_chip_changes) = 'object'
   AND jsonb_array_length(batch.transfers) = (
     SELECT count(*) FROM jsonb_each(charged_round.player_chip_changes)
   )
   AND NOT EXISTS (
     SELECT 1
       FROM jsonb_each(charged_round.player_chip_changes) charge(player_id, delta)
      WHERE charge.delta #>> '{}' !~ '^-[1-9][0-9]*$'
         OR NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(batch.transfers) transfer
            WHERE transfer #>> '{from,kind}' = 'player'
              AND transfer #>> '{from,playerId}' = charge.player_id
              AND transfer #>> '{to,kind}' = 'pot'
              AND transfer ->> 'amount' = substring(charge.delta #>> '{}' from 2)
         )
   )
   AND NOT EXISTS (
     SELECT 1
       FROM jsonb_array_elements(batch.transfers) transfer
      WHERE transfer #>> '{from,kind}' IS DISTINCT FROM 'player'
         OR transfer #>> '{to,kind}' IS DISTINCT FROM 'pot'
         OR transfer ->> 'amount' !~ '^[1-9][0-9]*$'
         OR NOT EXISTS (
           SELECT 1
             FROM jsonb_each(charged_round.player_chip_changes) charge(player_id, delta)
            WHERE charge.player_id = transfer #>> '{from,playerId}'
              AND charge.delta #>> '{}' = '-' || (transfer ->> 'amount')
         )
   )
  GROUP BY charged_round.id
)
UPDATE public.rounds round_row
   SET three_five_seven_opening_transfer_cursor = candidate.cursor
  FROM exact_candidates candidate
 WHERE candidate.id = round_row.id
   AND candidate.candidate_count = 1
   AND round_row.three_five_seven_opening_transfer_cursor IS NULL;

DO $active_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.games game_row
      JOIN public.rounds round_row
        ON round_row.game_id = game_row.id
       AND round_row.dealer_game_id = game_row.current_game_uuid
       AND round_row.hand_number = game_row.total_hands
       AND round_row.round_number = game_row.current_round
     WHERE game_row.game_type IN ('3-5-7','3-5-7-game','357')
       AND game_row.status IN ('in_progress','game_over')
       AND round_row.round_number = 1
       AND round_row.three_five_seven_opening_transfer_cursor IS NULL
       AND EXISTS (
         SELECT 1
           FROM public.game_results charge_result
          WHERE charge_result.game_id = round_row.game_id
            AND charge_result.dealer_game_id = round_row.dealer_game_id
            AND charge_result.hand_number = round_row.hand_number
            AND charge_result.settlement_key = 'three_five_seven_charge:' || round_row.id::text
       )
  ) THEN
    RAISE EXCEPTION 'exact_357_opening_transfer_claim:active_backfill_unresolved';
  END IF;
END;
$active_backfill$;

CREATE OR REPLACE FUNCTION private.three_five_seven_commit_opening_transfer_claim(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer,
  p_charge_amount integer
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_cursor bigint;
  v_expected_players integer;
  v_pending_reason text;
  v_pending_reason_count integer;
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL
     OR p_hand_number IS NULL OR p_hand_number < 1 OR p_charge_amount IS NULL
     OR p_charge_amount < 0 THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:invalid_input';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:dealer_game_mismatch';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number
     OR v_round.round_number IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:round_identity_mismatch';
  END IF;

  -- Durable replay reads the stored exact claim. It never reconstructs from
  -- the mutable current game cursor or the current player cohort.
  IF v_round.three_five_seven_opening_transfer_cursor IS NOT NULL THEN
    v_cursor := v_round.three_five_seven_opening_transfer_cursor;
    IF NOT EXISTS (
      SELECT 1
        FROM public.gameplay_transfer_batches batch
       WHERE batch.game_id = p_game_id
         AND batch.dealer_game_id IS NOT DISTINCT FROM p_dealer_game_id
         AND batch.cursor = v_cursor
         AND batch.reason = 'ante'
    ) THEN
      RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:stored_batch_mismatch';
    END IF;
    RETURN v_cursor;
  END IF;

  IF p_charge_amount = 0 THEN
    RETURN NULL;
  END IF;

  -- A missing claim may be created only from this transaction's unfinalized
  -- ante journal. This prevents a duplicate/late caller from claiming whatever
  -- newer cursor happens to be on games.
  SELECT count(DISTINCT pending.reason), min(pending.reason)
    INTO v_pending_reason_count, v_pending_reason
    FROM public.gameplay_transfer_pending_changes pending
   WHERE pending.transaction_id = txid_current()
     AND pending.game_id = p_game_id;
  IF coalesce(v_pending_reason_count, 0) <> 1 OR v_pending_reason IS DISTINCT FROM 'ante' THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:pending_ante_missing';
  END IF;

  SELECT count(*) INTO v_expected_players
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out, false);
  IF v_expected_players < 2 THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:insufficient_players';
  END IF;

  -- The transfer projector is a deferred constraint trigger. Force the whole
  -- projector now so the initiating RPC returns the same committed cursor its
  -- peer will later observe, then restore normal deferred behavior.
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';

  SELECT game_row.chip_transfer_cursor INTO v_cursor
    FROM public.games game_row
   WHERE game_row.id = p_game_id;
  IF coalesce(v_cursor, 0) <= 0 OR NOT EXISTS (
    SELECT 1
      FROM public.gameplay_transfer_batches batch
     WHERE batch.game_id = p_game_id
       AND batch.dealer_game_id IS NOT DISTINCT FROM p_dealer_game_id
       AND batch.cursor = v_cursor
       AND batch.reason = 'ante'
       AND jsonb_array_length(batch.transfers) = v_expected_players
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(batch.transfers) transfer
          WHERE transfer #>> '{from,kind}' IS DISTINCT FROM 'player'
             OR transfer #>> '{to,kind}' IS DISTINCT FROM 'pot'
             OR (transfer ->> 'amount')::integer IS DISTINCT FROM p_charge_amount
             OR NOT EXISTS (
               SELECT 1
                 FROM public.players player
                WHERE player.game_id = p_game_id
                  AND player.status NOT IN ('left','observer')
                  AND NOT coalesce(player.sitting_out, false)
                  AND player.id::text = transfer #>> '{from,playerId}'
             )
       )
       AND (
         SELECT count(DISTINCT transfer #>> '{from,playerId}')
           FROM jsonb_array_elements(batch.transfers) transfer
       ) = v_expected_players
  ) THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:committed_batch_mismatch';
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);
  UPDATE public.rounds round_row
     SET three_five_seven_opening_transfer_cursor = v_cursor
   WHERE round_row.id = p_round_id
     AND round_row.three_five_seven_opening_transfer_cursor IS NULL
   RETURNING round_row.three_five_seven_opening_transfer_cursor INTO v_cursor;
  IF v_cursor IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_opening_transfer_claim:claim_write_failed';
  END IF;
  RETURN v_cursor;
END;
$$;

REVOKE ALL ON FUNCTION private.three_five_seven_commit_opening_transfer_claim(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_begin_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_result jsonb;
  v_opening_cursor bigint;
  v_timer integer := 10;
  v_eligible integer;
  v_ready integer;
BEGIN
  IF p_game_id IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_game_id'; END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_in_session';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:not_357_game';
  END IF;
  IF v_game.current_game_uuid IS NULL THEN RAISE EXCEPTION 'three_five_seven_begin_game:missing_dealer_game'; END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id = v_game.current_game_uuid AND hand_number = 1 AND round_number = 1
   FOR UPDATE;
  IF FOUND THEN
    v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
      p_game_id, v_existing.id, v_game.current_game_uuid, 1, greatest(0, coalesce(v_game.ante_amount, 0))
    );
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    SELECT * INTO v_existing FROM public.rounds WHERE id = v_existing.id;
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',1,'round_number',1,
      'opening_transfer_cursor',v_opening_cursor,
      'opening_transfer_required',v_opening_cursor IS NOT NULL,
      'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
    );
  END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:invalid_phase:%', v_game.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dealer_games dealer_game
     WHERE dealer_game.id = v_game.current_game_uuid
       AND dealer_game.session_id = p_game_id
       AND dealer_game.game_type IN ('3-5-7','3-5-7-game','357')
  ) THEN RAISE EXCEPTION 'three_five_seven_begin_game:dealer_game_mismatch'; END IF;

  SELECT count(*), count(*) FILTER (WHERE player.ante_decision = 'ante_up')
    INTO v_eligible, v_ready
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.status NOT IN ('left','observer')
     AND NOT coalesce(player.sitting_out, false);
  IF v_eligible < 2 OR v_ready <> v_eligible THEN
    RAISE EXCEPTION 'three_five_seven_begin_game:admission_incomplete:%/%', v_ready, v_eligible;
  END IF;
  IF coalesce(v_game.ante_amount, 0) < 0 THEN RAISE EXCEPTION 'three_five_seven_begin_game:invalid_ante'; END IF;
  SELECT coalesce(defaults.decision_timer_seconds, 10) INTO v_timer
    FROM public.game_defaults defaults WHERE defaults.game_type = '3-5-7' LIMIT 1;
  v_timer := coalesce(v_timer, 10);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);
  v_result := private.three_five_seven_create_round(
    p_game_id, v_game.current_game_uuid, 1, 1, coalesce(v_game.ante_amount, 0), 'Ante',
    clock_timestamp() + make_interval(secs => greatest(1, v_timer) + 2)
  );
  v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
    p_game_id, (v_result->>'round_id')::uuid, v_game.current_game_uuid, 1,
    greatest(0, coalesce(v_game.ante_amount, 0))
  );
  PERFORM private.three_five_seven_settle_instant_sweep(
    p_game_id, (v_result->>'round_id')::uuid, v_game.current_game_uuid, 1
  );
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  SELECT * INTO v_existing FROM public.rounds WHERE id = (v_result->>'round_id')::uuid;
  RETURN v_result || jsonb_build_object(
    'opening_transfer_cursor',v_opening_cursor,
    'opening_transfer_required',v_opening_cursor IS NOT NULL,
    'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_begin_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_begin_game(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_advance_round(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer,
  p_round_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_resolution private.three_five_seven_round_resolutions%ROWTYPE;
  v_existing public.rounds%ROWTYPE;
  v_next_round integer;
  v_next_hand integer;
  v_charge integer := 0;
  v_label text := 'Re-Ante';
  v_timer integer := 10;
  v_result jsonb;
  v_opening_cursor bigint;
BEGIN
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:not_in_session';
  END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number
     OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:stale_game_identity';
  END IF;
  SELECT * INTO v_resolution FROM private.three_five_seven_round_resolutions
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND round_id = p_round_id
     AND hand_number = p_hand_number
     AND round_number = p_round_number;
  IF NOT FOUND OR v_round.status <> 'completed' THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_committed';
  END IF;
  v_next_round := CASE p_round_number WHEN 1 THEN 2 WHEN 2 THEN 3 ELSE 1 END;
  v_next_hand := CASE WHEN p_round_number = 3 THEN p_hand_number + 1 ELSE p_hand_number END;
  IF p_round_number = 3 THEN
    v_charge := greatest(0, coalesce(v_game.rollover_amount, 1));
  END IF;

  SELECT * INTO v_existing FROM public.rounds
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = v_next_hand
     AND round_number = v_next_round
   FOR UPDATE;
  IF FOUND THEN
    IF v_next_round = 1 THEN
      v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
        p_game_id, v_existing.id, p_dealer_game_id, v_next_hand, v_charge
      );
    END IF;
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    SELECT * INTO v_existing FROM public.rounds WHERE id = v_existing.id;
    RETURN jsonb_build_object(
      'outcome','already_started','deduped',true,'round_id',v_existing.id,
      'hand_number',v_existing.hand_number,'round_number',v_existing.round_number,
      'opening_transfer_cursor',v_opening_cursor,
      'opening_transfer_required',v_opening_cursor IS NOT NULL,
      'game',to_jsonb(v_game),'round',to_jsonb(v_existing)
    );
  END IF;
  IF NOT coalesce(v_game.awaiting_next_round, false)
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_advance_round:predecessor_not_current';
  END IF;
  SELECT coalesce(defaults.decision_timer_seconds, 10) INTO v_timer
    FROM public.game_defaults defaults WHERE defaults.game_type = '3-5-7' LIMIT 1;
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);
  v_result := private.three_five_seven_create_round(
    p_game_id, p_dealer_game_id, v_next_round, v_next_hand, v_charge, v_label,
    clock_timestamp() + make_interval(secs => greatest(1, coalesce(v_timer, 10)) + 2)
  );
  IF v_next_round = 1 THEN
    v_opening_cursor := private.three_five_seven_commit_opening_transfer_claim(
      p_game_id, (v_result->>'round_id')::uuid, p_dealer_game_id, v_next_hand, v_charge
    );
    PERFORM private.three_five_seven_settle_instant_sweep(
      p_game_id, (v_result->>'round_id')::uuid, p_dealer_game_id, v_next_hand
    );
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id = (v_result->>'round_id')::uuid;
  RETURN v_result || jsonb_build_object(
    'opening_transfer_cursor',v_opening_cursor,
    'opening_transfer_required',v_opening_cursor IS NOT NULL,
    'game',to_jsonb(v_game),'round',to_jsonb(v_round)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_advance_round(uuid,uuid,uuid,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_advance_round(uuid,uuid,uuid,integer,integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.three_five_seven_current_frame(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_players jsonb := '[]'::jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_viewer public.players%ROWTYPE;
  v_is_privileged boolean := false;
  v_viewer_cards_required boolean := false;
  v_viewer_cards_present boolean := false;
  v_opening_charge_exists boolean := false;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:missing_game_id';
  END IF;
  IF NOT private.three_five_seven_actor_allowed(p_game_id) THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_in_session';
  END IF;

  SELECT * INTO v_game FROM public.games game_row WHERE game_row.id = p_game_id;
  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:not_357_game';
  END IF;

  IF v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL THEN
    SELECT * INTO v_round
      FROM public.rounds round_row
     WHERE round_row.game_id = p_game_id
       AND round_row.dealer_game_id = v_game.current_game_uuid
       AND round_row.hand_number = v_game.total_hands
       AND round_row.round_number = v_game.current_round;
  END IF;

  IF v_game.status IN ('in_progress','game_over')
     AND v_game.current_game_uuid IS NOT NULL
     AND v_game.total_hands IS NOT NULL
     AND v_game.current_round IS NOT NULL
     AND v_round.id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_current_frame:exact_round_missing';
  END IF;

  IF v_round.id IS NOT NULL AND v_round.round_number = 1 THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.game_results charge_result
       WHERE charge_result.game_id = v_round.game_id
         AND charge_result.dealer_game_id = v_round.dealer_game_id
         AND charge_result.hand_number = v_round.hand_number
         AND charge_result.settlement_key = 'three_five_seven_charge:' || v_round.id::text
    ) INTO v_opening_charge_exists;
    IF v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_missing';
    END IF;
    IF NOT v_opening_charge_exists
       AND v_round.three_five_seven_opening_transfer_cursor IS NOT NULL THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:unexpected_opening_transfer_claim';
    END IF;
    IF v_round.three_five_seven_opening_transfer_cursor IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.gameplay_transfer_batches batch
          WHERE batch.game_id = v_round.game_id
            AND batch.dealer_game_id IS NOT DISTINCT FROM v_round.dealer_game_id
            AND batch.cursor = v_round.three_five_seven_opening_transfer_cursor
            AND batch.reason = 'ante'
       ) THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:opening_transfer_claim_mismatch';
    END IF;
  END IF;

  SELECT participant.* INTO v_viewer
    FROM public.players participant
   WHERE participant.game_id = p_game_id
     AND participant.user_id = auth.uid()
     AND participant.status <> 'left'
   ORDER BY participant.created_at, participant.id
   LIMIT 1;

  v_is_privileged := coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role));

  SELECT coalesce(
    jsonb_agg(
      to_jsonb(participant) || jsonb_build_object(
        'profiles', CASE WHEN profile.id IS NULL THEN NULL
          ELSE jsonb_build_object('username', profile.username) END
      ) ORDER BY participant.position, participant.id
    ), '[]'::jsonb
  ) INTO v_players
    FROM public.players participant
    LEFT JOIN public.profiles profile ON profile.id = participant.user_id
   WHERE participant.game_id = p_game_id
     AND participant.status <> 'left';

  IF v_round.id IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object('player_id', cards.player_id, 'cards', cards.cards)
        ORDER BY cards.player_id
      ), '[]'::jsonb
    ) INTO v_cards
      FROM public.player_cards cards
      JOIN public.players owner
        ON owner.id = cards.player_id
       AND owner.game_id = p_game_id
     WHERE cards.round_id = v_round.id
       AND (
         coalesce(cards.is_public, false)
         OR owner.user_id = auth.uid()
         OR v_is_privileged
       );

    v_viewer_cards_required := v_viewer.id IS NOT NULL
      AND v_viewer.status NOT IN ('left','observer')
      AND NOT coalesce(v_viewer.sitting_out, false)
      AND NOT coalesce(v_viewer.is_bot, false);
    v_viewer_cards_present := v_viewer.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.player_cards cards
       WHERE cards.round_id = v_round.id AND cards.player_id = v_viewer.id
    );
    IF v_viewer_cards_required AND NOT v_viewer_cards_present THEN
      RAISE EXCEPTION 'three_five_seven_current_frame:viewer_cards_missing';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'game', to_jsonb(v_game),
    'round', CASE WHEN v_round.id IS NULL THEN NULL ELSE
      to_jsonb(v_round) || jsonb_build_object(
        'three_five_seven_opening_transfer_required', v_opening_charge_exists
      )
    END,
    'players', v_players,
    'player_cards', v_cards,
    'viewer_player_id', v_viewer.id,
    'viewer_cards_required', v_viewer_cards_required,
    'viewer_cards_present', v_viewer_cards_present,
    'identity', jsonb_build_object(
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', v_game.total_hands,
      'round_number', v_game.current_round,
      'round_id', v_round.id,
      'opening_transfer_required', v_opening_charge_exists,
      'opening_transfer_cursor', v_round.three_five_seven_opening_transfer_cursor,
      'chip_transfer_cursor', coalesce(v_game.chip_transfer_cursor, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_current_frame(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_current_frame(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.three_five_seven_current_frame(uuid) IS
  'Returns one exact MVCC 3-5-7 frame. Charged Round 1 identity includes and validates its immutable opening transfer claim; Realtime is refetch only.';
