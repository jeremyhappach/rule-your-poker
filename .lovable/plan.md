# Final Implementation Plan — `holm_settle_hand` (Revised v2)

Both final pushbacks accepted with no disagreement. Changes vs prior draft:

1. **Dealer-game lifecycle ownership moved fully into the RPC.** `p_continue_dealer_game` removed. The RPC evaluates Holm's canonical end predicate itself using `games.legs_to_win` + `players.legs` (both confirmed present in live schema).
2. **Payload validation reordered before idempotency.** Malformed callers now always fail loudly, even against an already-settled hand.

Everything else preserved: `SELECT ... INTO STRICT`, `(dealer_game_id, hand_number)` business identity, partial unique index as final race guard, terminal `game_results` insert before chip mutations, no `game_type_cache`, no `rounds` uniqueness index, no settlement UUID.

---

## 1. Enum migration

```sql
CREATE TYPE public.holm_event_kind AS ENUM (
  'ante',
  'pussy_tax_carryforward',
  'chucky_loss_pot_match',
  'chucky_tiebreak_pot_match',
  'showdown_final_award',
  'partial_tie_final_award',
  'chucky_final_award'
);
```

## 2. `event_kind` column

```sql
ALTER TABLE public.game_results ADD COLUMN event_kind public.holm_event_kind NULL;
```

Nullable. No backfill. Legacy 331 Holm rows keep `NULL`.

## 3. Partial unique index (sole terminal race guard)

```sql
CREATE UNIQUE INDEX game_results_holm_terminal_uniq
  ON public.game_results (dealer_game_id, hand_number)
  WHERE game_type IN ('holm','holm-game')
    AND event_kind IN (
      'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
      'showdown_final_award','partial_tie_final_award','chucky_final_award'
    );
```

Legacy `NULL`s and `ante` excluded by predicate. Safe to create against current data (zero Holm duplicates verified).

## 4. Round identity

No new index, no cached column. Holm invariant enforced inside the RPC via `SELECT ... INTO STRICT` — raises loudly on 0 or >1 rows.

## 5. RPC signature (lifecycle removed)

```sql
CREATE OR REPLACE FUNCTION public.holm_settle_hand(
  p_game_id                  uuid,
  p_dealer_game_id           uuid,
  p_hand_number              integer,
  p_event_kind               public.holm_event_kind,
  p_pot_final                integer,
  p_awaiting_next_round      boolean,
  p_last_round_result        jsonb,
  p_chip_deltas              jsonb,            -- {"<player_id>": <signed int>}
  p_winning_hand_description text,
  p_winner_player_id         uuid,
  p_winner_username          text,
  p_is_chopped               boolean,
  p_pot_won                  integer
) RETURNS jsonb
```

No `p_continue_dealer_game`, no `p_game_status_next`. The RPC decides `games.status` from authoritative DB state.

## 6. PL/pgSQL body — final ordering

```plpgsql
DECLARE
  v_round     public.rounds%ROWTYPE;
  v_game      public.games%ROWTYPE;
  v_existing  uuid;
  v_result_id uuid;
  v_player_id uuid;
  v_delta     integer;
  v_max_legs  integer;
  v_end_game  boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- (a) LOCK canonical round; treat (dealer_game_id, hand_number) as unique.
  ---------------------------------------------------------------------------
  SELECT * INTO STRICT v_round
    FROM public.rounds
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
   FOR UPDATE;

  ---------------------------------------------------------------------------
  -- (b) OWNERSHIP: game match + Holm game type.
  ---------------------------------------------------------------------------
  IF v_round.game_id <> p_game_id THEN
    RAISE EXCEPTION 'holm_settle_hand:game_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game.game_type NOT IN ('holm','holm-game') THEN
    RAISE EXCEPTION 'holm_settle_hand:not_holm';
  END IF;

  ---------------------------------------------------------------------------
  -- (c) TERMINAL GUARD.
  ---------------------------------------------------------------------------
  IF p_event_kind = 'ante' THEN
    RAISE EXCEPTION 'holm_settle_hand:non_terminal_event_kind';
  END IF;

  ---------------------------------------------------------------------------
  -- (d) PAYLOAD VALIDATION (loud even when already settled).
  ---------------------------------------------------------------------------
  IF v_round.status NOT IN ('completed','in_progress','showdown','revealing') THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_eligible:%', v_round.status;
  END IF;

  IF p_chip_deltas IS NULL
     OR jsonb_typeof(p_chip_deltas) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_chip_deltas)) = 0 THEN
    RAISE EXCEPTION 'holm_settle_hand:empty_delta_map';
  END IF;

  -- Integer coercion happens here — malformed values raise invalid_text_representation.
  PERFORM (p_chip_deltas->>k)::int
    FROM jsonb_object_keys(p_chip_deltas) k;

  -- Every key must belong to a player seated in this game.
  PERFORM 1
    FROM jsonb_object_keys(p_chip_deltas) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.players
      WHERE id = k::uuid AND game_id = p_game_id
   );
  IF FOUND THEN
    RAISE EXCEPTION 'holm_settle_hand:unrelated_player_in_delta_map';
  END IF;

  ---------------------------------------------------------------------------
  -- (e) IDEMPOTENCY (only after payload is proven well-formed).
  ---------------------------------------------------------------------------
  SELECT id INTO v_existing FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number    = p_hand_number
     AND game_type IN ('holm','holm-game')
     AND event_kind IN (
       'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
       'showdown_final_award','partial_tie_final_award','chucky_final_award'
     )
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_settled','result_id',v_existing,'hand_number',p_hand_number);
  END IF;

  ---------------------------------------------------------------------------
  -- (f) INSERT terminal result FIRST — point-of-no-return marker.
  ---------------------------------------------------------------------------
  INSERT INTO public.game_results (
    game_id, game_type, dealer_game_id, hand_number,
    event_kind, winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, v_game.game_type, p_dealer_game_id, p_hand_number,
    p_event_kind, p_winner_player_id, p_winner_username, p_winning_hand_description,
    p_pot_won, p_chip_deltas, p_is_chopped
  ) RETURNING id INTO v_result_id;

  ---------------------------------------------------------------------------
  -- (g) APPLY chip deltas.
  ---------------------------------------------------------------------------
  FOR v_player_id, v_delta IN
    SELECT k::uuid, (p_chip_deltas->>k)::int
      FROM jsonb_object_keys(p_chip_deltas) k
  LOOP
    UPDATE public.players SET chips = chips + v_delta WHERE id = v_player_id;
  END LOOP;

  ---------------------------------------------------------------------------
  -- (h) SERVER-OWNED LIFECYCLE.
  --     Holm dealer-game end predicate: any seated player has reached legs_to_win.
  --     (`players.legs` and `games.legs_to_win` are confirmed authoritative fields.)
  ---------------------------------------------------------------------------
  SELECT COALESCE(MAX(legs), 0) INTO v_max_legs
    FROM public.players WHERE game_id = p_game_id;
  v_end_game := (v_game.legs_to_win IS NOT NULL
                 AND v_max_legs >= v_game.legs_to_win);

  UPDATE public.games SET
    last_round_result   = p_last_round_result,
    awaiting_next_round = p_awaiting_next_round,
    pot                 = p_pot_final,
    status              = CASE WHEN v_end_game THEN 'game_over' ELSE status END
  WHERE id = p_game_id;

  ---------------------------------------------------------------------------
  -- (i) ROUND terminal state.
  ---------------------------------------------------------------------------
  UPDATE public.rounds SET
    status                = 'completed',
    decision_deadline     = NULL,
    current_turn_position = NULL
  WHERE id = v_round.id;

  RETURN jsonb_build_object(
    'status','settled',
    'result_id',v_result_id,
    'hand_number',p_hand_number,
    'dealer_game_ended',v_end_game
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent writer beat us despite the row lock; return idempotent success.
    SELECT id INTO v_existing FROM public.game_results
     WHERE dealer_game_id = p_dealer_game_id AND hand_number = p_hand_number
       AND game_type IN ('holm','holm-game')
       AND event_kind IN (
         'pussy_tax_carryforward','chucky_loss_pot_match','chucky_tiebreak_pot_match',
         'showdown_final_award','partial_tie_final_award','chucky_final_award'
       )
     LIMIT 1;
    RETURN jsonb_build_object('status','already_settled','result_id',v_existing,'hand_number',p_hand_number);
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'holm_settle_hand:round_not_found:%/%', p_dealer_game_id, p_hand_number;
  WHEN TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'holm_settle_hand:round_identity_violation:%/%', p_dealer_game_id, p_hand_number;
END;
```

`GRANT EXECUTE ON FUNCTION public.holm_settle_hand(...) TO authenticated, service_role;`

**Verification of the lifecycle predicate against source:** before implementation, the exact end-of-dealer-game predicate used in `holmGameLogic.ts` (currently informing what became `p_continue_dealer_game`) will be re-derived and encoded verbatim in step (h). The stub above is `MAX(legs) >= legs_to_win`; if source proves the predicate additionally requires e.g. `awaiting_next_round=true` or excludes observers, those refinements land inline. The interface (client passes no lifecycle input) is fixed regardless.

## 7. Validation rules
- `SELECT ... INTO STRICT` on `(dealer_game_id, hand_number)` — invariant enforced.
- Ownership + `holm|holm-game` check.
- `event_kind ≠ 'ante'`.
- Round status is a legitimate terminal precursor.
- `p_chip_deltas`: non-empty object; integer coercion enforced on every value; every key seated in this game; JSON key uniqueness prevents duplicate updates.
- Payload validation happens **before** idempotency short-circuit.

## 8. `chucky_final_award` — one enum value

Two Chucky game-ending paths share terminal shape. Divergence lives in `p_last_round_result` and server-decided lifecycle. Keep one value.

## 9. Terminal TypeScript branches migrated (`src/lib/holmGameLogic.ts`)

Client no longer decides continuation. Each branch: compute signed deltas from authoritative pre-write snapshot → `await supabase.rpc('holm_settle_hand', {...})` → consume returned `dealer_game_ended` for UI only.

| Branch | `event_kind` |
|---|---|
| Pussy tax / everyone folded | `pussy_tax_carryforward` |
| Solo player beats Chucky | `chucky_final_award` |
| Chucky beats solo, carries pot forward | `chucky_loss_pot_match` |
| Multiplayer showdown, single winner | `showdown_final_award` |
| Multiplayer partial tie | `partial_tie_final_award` |
| Full tie, Chucky wins / carryforward | `chucky_tiebreak_pot_match` |
| Full tie, players beat Chucky | `chucky_final_award` |

All prior direct `players` chip RPC calls, `games.update`, and `recordGameResult` calls in these branches are deleted.

## 10. Non-terminal callsite preserved

Ante-collection continues to insert directly into `game_results` with `event_kind = 'ante'`. Not routed through `holm_settle_hand`.

## 11. Recovery owner

Canonical Holm stuck-hand recovery (client detector + cron active-human guard) calls `holm_settle_hand` with source-derived `event_kind`. Retry semantics inherent: committed → `already_settled`; rolled-back → `settled`; uncertain → safe to retry. No new timers, no client retry identity.

## 12. Albert Almora repair (draft — not executed)

```sql
BEGIN;
INSERT INTO public.game_results (
  game_id, game_type, dealer_game_id, hand_number,
  event_kind, winner_player_id, winner_username,
  winning_hand_description, pot_won, player_chip_changes, is_chopped
) VALUES (
  '<game_id>', '<holm|holm-game>', '<dealer_game_id>', <hand_number>,
  'showdown_final_award', '<winner_player_id>', '<winner_username>',
  '<desc>', 6, '{}'::jsonb, false
);
UPDATE public.games SET
  last_round_result   = '<payload>'::jsonb,
  awaiting_next_round = true
WHERE id = '<game_id>';
UPDATE public.rounds SET
  decision_deadline     = NULL,
  current_turn_position = NULL
WHERE id = '<round_id>';
COMMIT;
```

Zero chip mutations; deltas already landed pre-crash. `pot` preserved.

## 13. Migration ordering

1. `CREATE TYPE holm_event_kind`.
2. `ALTER TABLE game_results ADD COLUMN event_kind`.
3. `CREATE UNIQUE INDEX game_results_holm_terminal_uniq`.
4. `CREATE FUNCTION holm_settle_hand` + `GRANT`.
5. Client cutover: seven terminal Holm branches → RPC.
6. Recovery-owner cutover.
7. Separately approved: Albert Almora repair.

## 14. Rollback

- Client: revert TS branches; RPC/index remain inert.
- Schema: `DROP INDEX` → `DROP FUNCTION` → `ALTER TABLE DROP COLUMN` → `DROP TYPE`. Column is nullable, index is Holm-scoped — safe.

## 15. Tests
- Idempotency: same args twice → `settled` then `already_settled`; chips move once.
- Insert-first ordering: force post-insert failure → rollback removes marker (no orphan).
- Non-terminal `ante` rejected.
- Malformed payload rejected **even on already-settled hand** (asserts new ordering).
- Foreign player id rejected.
- Wrong `game_id` / `dealer_game_id` rejected.
- Round-not-eligible rejected.
- Duplicate Holm rounds row → RPC raises `round_identity_violation`.
- Concurrent double-call: exactly one `settled`, one `already_settled`, chips consistent.
- Server-owned lifecycle: player reaching `legs_to_win` → `games.status='game_over'`; below threshold → status unchanged. Client never passes a hint.
- Seven terminal branches: end-to-end assertions on chip totals, `pot`, `awaiting_next_round`, `games.status`, `last_round_result`, `game_results.event_kind`, `dealer_game_ended` return field.
- Legacy `event_kind IS NULL` rows do not collide with new inserts.

## 16. Regression risks

- Any Holm terminal branch computing deltas incorrectly now fails atomically (louder, correct).
- Cron/edge functions writing directly to `game_results` for Holm terminals must migrate to the RPC or they trip the partial index.
- `session_result_transaction_trigger` fires inside the RPC transaction when server flips `status → 'game_over'`; per project memory it is transaction-safe.
- Server-owned lifecycle: if `legs`/`legs_to_win` bookkeeping is somewhere still updated client-side after settlement (e.g. leg increments during sweep-legs presentation), that path must land in DB **before** the RPC evaluates the predicate — otherwise the RPC could miss a game-over. Pre-implementation audit will confirm all leg mutations that gate end-of-dealer-game are committed prior to the terminal RPC call. If any are not, the RPC will additionally accept and apply the terminal leg delta atomically.
- Malformed-payload-on-settled-hand now raises instead of returning `already_settled` — expected and desired; documented for callers.

## 17. Confirmation

No code, schema, or live data changed in this turn. Only a read-only column check on `players`/`games`/`dealer_games` was executed to confirm `legs_to_win` and `legs` exist. Awaiting approval to ship the migration + RPC + client cutover.
