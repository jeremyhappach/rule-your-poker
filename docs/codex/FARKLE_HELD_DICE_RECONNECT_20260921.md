# Farkle committed holds after Roll N — reconnect contract proved

Product source: `7167e21b8309349ec46fe65bbeb3fc40b2633345`.
Result: **qualification assertion defect; no missing durable hold data**.
No product, authority, migration, production setting or scoring-default change.

## Authoritative ownership

`rounds.farkle_state.dice` describes the current roll. Roll N replaces it with
the dice in `available`; a partial Hold removes its indexes from `available`.
It is incorrect to require an earlier held die to remain in this array.

Every accepted action atomically inserts its semantic events and complete
`state_after` into `private.farkle_events`. A Hold's `dice_held` event records
the selected indexes, points, player and roll number. That receipt's saved
state retains the original dice values and scoring-cycle identity after later
rolls overwrite the live current-roll array.

The existing reconnect contract uses **two fresh authenticated server reads**:
`read_session_frame` supplies the current authoritative round, and
`farkle_read_replay(round_id)` supplies the ordered durable event/state receipts.
The session-frame JSON alone does not duplicate all historical Hold dice.
`FarkleGameTable` already fetches replay on mount and action-sequence changes;
`farkleCommittedHolds` reconstructs the current turn's scoring groups from those
receipts, then `FarkleActiveArea` renders them. No client-local history is required.

Owners: `public.farkle_apply_action`, `public.farkle_read_replay`,
`src/lib/farkle/presentation.ts`, `src/components/farkle/FarkleGameTable.tsx`.
The applied Wave 1 SQL remains unchanged.

## Actual fresh-client proof

Two isolated TEST ONLY games performed actual UI setup, ante, Roll, partial Hold
and Roll N through normal authenticated authority. Both original browser contexts
were then closed. A new context started with empty cookies/origins, logged in,
and fetched the canonical session frame and replay RPC on a fresh route mount.
No storage state, presentation state, cached replay or oracle data was injected.

| Check | First run | Durable test run |
| --- | --- | --- |
| Committed dice | indexes 0, 1, 2: 3, 3, 3 | index 1: 1 |
| Committed contribution | 300 | 100 |
| Current available indexes | 3, 4, 5 | 0, 2, 3, 4, 5 |
| Current roll values | 1, 5, 6 | 5, 4, 6, 2, 3 |
| THIS TURN | 300 | 100 |
| Current roll / cycle | 2 / 1 | 2 / 1 |
| Reconstructed held row | `3 · 3 · 3 +300` | `1 +100` |
| Result | passed, 26.5 seconds | passed, 24.3 seconds |

The proof checks exact dice indexes/values, contribution, identity, frozen config,
available dice, current roll, THIS TURN, receipt roll/cycle and current roll/cycle.
It verifies the rendered committed row and current dice, and confirms reconnect
did not change the authoritative state or action sequence. The test's prior-state
oracle is used only for assertions outside the browser.

## Proof-only correction and qualification status

The remaining matrix now checks committed groups against durable replay receipts
and the rendered scoring row instead of requiring held dice in the current-roll
array. It also checks contribution totals, available indexes and roll/cycle
continuity. Original failure artifacts remain unchanged.

Durable tests: `e2e/farkle/heldDiceReconnect.local.spec.ts` and
`e2e/farkle/remainingPlayable.local.spec.ts`. The focused test passed; the complete
remaining matrix and seven-game campaign were not resumed for this focused check.
Wave 2 remains unqualified and unmerged. Full application/build/release gates were
not rerun or represented as newly qualified by these two focused browser passes.

Fixture cleanup passed: no games, users, profiles, transfers or test telemetry
remain. Only the three pre-existing private controls and seven existing-game
defaults remain. Local creation is disabled and client/scheduler processes are
stopped. All 384 local functions match the previously recorded applied definitions,
owners, security attributes and grants. This is not a fresh production metadata
query; production was untouched, including its disabled creation, admin-only gate
and unapproved/unseeded scoring defaults.

Evidence: `supabase/farkle/wave2-qualification/20260921-held-reconnect/`.
