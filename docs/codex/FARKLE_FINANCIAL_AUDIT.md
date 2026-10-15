# Independent Farkle financial integrity audit — October 15, 2026

**Overall assessment: FAIL — authorization.** Farkle's canonical settlement is
implemented and passed the financial proofs below. It is not a Run21-style
missing-ledger implementation. However, a deactivated account with an existing
authenticated identity can still finalize a real-money game and start a new
real-money Run Back. This violates the application's inactive-account boundary
and prevents qualification under the mandatory financial release gate.

No production writes, migrations, repairs, backfills, deployment, access changes
or gameplay edits were performed. Existing sessions and historical evidence were
preserved. Corrections and containment below are recommendations only.

## Evidence and scope

- Repository: `2059a816ab8b0f3ad789210c3abeb86a6af34332` on `main`.
- Production: `https://holm357.com/`, Supabase `xvhmbuppghwmwpwrkzao`.
- Production inspection used explicit read-only transactions. Definitions,
  indexes, constraints, triggers, policies, grants, release configuration,
  scheduler state and retained financial rows were captured on October 15.
- [Evidence JSON](../../supabase/farkle/financial-audit/20261015/evidence.json)
  contains exact synthetic identities, balances, transfer batches, result IDs,
  outcomes, production reconciliation and definition hashes. It records 68
  passing assertions/cases, four raw race observations, and two failed
  authorization observations. A successful harness exit is not a passing gate.
- [Main proof](../../supabase/farkle/financial-audit/20261015/proof.mjs),
  [supplemental proof](../../supabase/farkle/financial-audit/20261015/supplement.mjs),
  [immutability proof](../../supabase/farkle/financial-audit/20261015/immutability.mjs),
  [isolated schema builder](../../supabase/farkle/financial-audit/20261015/create-empty.mjs)
  and [attestation](../../supabase/farkle/financial-audit/20261015/attest.mjs)
  are retained. Captured metadata inputs remain under ignored
  `qualification.local/farkle-audit-20261015/`; their SHA-256 hashes are in the
  evidence. No dependencies were installed.

The final proof database was created empty on loopback port 55439, using actual
deployed definitions, not candidate migrations or mock financial tables.
Attestation found **zero function, constraint, trigger, index or policy drift**:
179 captured functions/procedures, all 167 public/private triggers, 341
constraints and 162 policies were reproduced. All 25 Farkle routines were
captured. Browser roles were non-superuser and did not bypass RLS. Financial
constraints and guards remained enabled throughout successful proofs.

Production runs PostgreSQL 17.6/Linux; the existing local runtime is PostgreSQL
17.10/Windows with real pgcrypto. Definer ownership is local `tri_test` instead
of production `postgres`, with the same owner privilege needed by these paths.
The local service role lacks production's BYPASSRLS, so scheduler tests run as
the trusted database owner, as production cron does. Browser calls use the real
`authenticated` role and captured `auth.uid()`/`auth.jwt()` definitions. JWT
claims are fixture inputs: GoTrue token issuance, PostgREST transport and live
browser networking were not reproduced. No production HTTP exploit is claimed.

Ordinary cases use BEGIN/ROLLBACK and verify fixture removal. Genuine concurrent
connections and backend termination require committed fixtures; those were
confined to disposable local databases, subsequently dropped and checked absent.
An initial reused metadata clone was rejected as proof infrastructure because
its constraints were incomplete. Final evidence uses the fresh reproduction.

## Mandatory financial release gate

| Requirement | Status | Owner, proof and risk |
|---|---|---|
| Authoritative outcome | PASS | `farkle_apply_action`, `farkle_reduce_v1`, `farkle_finish_turn_v1`, secure pgcrypto dice. Complete legal RPC games; Hot Dice/Farkle reducer cases; all three endgame modes; all-player and subset ties. Clients supply actions/indexes, not scores or payouts. |
| Canonical chip balances | PASS | `farkle_settle_v1` updates `public.players.chips`. Actual +5/−5, +15/three −5, +30/six −5 and tie-break outcomes; all net zero. Real and fake money exercised. |
| Balanced canonical ledger | PASS | Chip journal/staging triggers → deferred `finalize_gameplay_transfer_batch` → `farkle_begin_terminal_transfer_v2`. Actual committed batches, UUID endpoints, exact opening/closing values, empty unmatched deltas, no residual pending changes/handoffs. |
| Atomic persistence | PASS | Final action transaction owns outcome, result, chips, snapshots, disposition, event and action receipt; deferred journal completes before commit. Result, snapshot, terminal and journal failures roll back the whole action. An actual COMMIT-time journal rejection and terminated backend also roll back. |
| Replay and concurrency safety | PASS | Round/game/player locks and actual unique indexes. Duplicate and different request IDs, stale sequence, duplicate settlement, late replay after Run Back, four independent-connection race types, concurrent postgame and worker restart. One payout/result/batch. Lock-order deadlocks remain a separately identified operational risk. |
| Authorization and stake validation | **FAIL** | Outsiders, direct privileged helpers, forged payloads, changed identity/configuration and invalid stakes reject. **Inactive-account checks are absent** from Farkle setup/action authority; inactive real-money finalization and Run Back both succeed. |
| Disconnect and zero-client recovery | PASS | Canonical timer dispatch, `farkle_advance_due_v1`, service bot policy. Full fake-money competition without browser calls, final-boundary canonical timer, bot competition, competing workers and killed-worker retry. Real-money human expiry pauses without financial changes; canonical resume works. Production cron and health checked read-only. |
| Terminal lifecycle and continuation | **MISSING** for fresh live-browser acceptance; database/component checks PASS | SQL continuation, fresh Run Back identity, terminal real-money SessionResult and old replay isolation pass. 36 focused Farkle/shared terminal tests pass. No new two-browser rendered session/reconnect/history acceptance was performed in this audit. |
| Actual authority and containment | PASS for database proofs | Captured deployed financial functions, all financial/shared guards and conflict indexes reproduced and attested; no disabled triggers or mock ledgers. Rollback and disposable-database removal contain synthetic records. Infrastructure differences are explicit above. |

The demonstrated authorization failure determines the overall **FAIL**, even
without the remaining live-browser evidence. Passing financial tests do not
waive it.

## Financial architecture and identities

| Operation | Authoritative owner and identity |
|---|---|
| Dealer selection/configuration | `public.configure_dealer_game`: session UUID, dealer-player UUID, expected seat and exact configuration deadline; `private.dealer_game_setup_commits` dedupes the request. |
| Farkle configuration | `private.farkle_resolve_config_v1` and `farkle_config_guard_v1`; immutable `dealer_games.id/config`. Release gate and approved defaults are consulted. New setup validates positive stake ≤1,000,000, positive target ≤1,000,000,000, supported endgame/scoring/timing. Run Back copies the original frozen configuration. |
| Eligibility/start | `submit_ante_decision` → `advance_ante_phase_exact` → `farkle_begin_v1`; UUID roster of 2–7 admitted, seated, non-sitting-out players; one round per dealer-game. No upfront stake debit; pot remains zero. |
| Dice/scoring | `farkle_apply_action` creates random dice via `secure_random_int(6)` using rejection sampling over pgcrypto bytes. `farkle_score_v1`/`primitive_score_v1` and `legal_holds_v1` derive legal scoring. |
| Turns/banking/Farkles/Hot Dice | `farkle_reduce_v1` and `farkle_finish_turn_v1`; round UUID, action sequence, current-player UUID and frozen config. Hot Dice resets six available dice; a Farkle loses unbanked turn points only. |
| Winner/ties | `farkle_finish_turn_v1`: `immediate`, `equal_turns` or `one_last_turn`. Equal leaders enter repeated equal-opportunity tiebreaks until one winner. There is no chopped/all-tie payout configuration. |
| Settlement | `private.farkle_settle_v1(round_id)`: exact session/dealer-game/round/hand and terminal authoritative state. The durable financial claim is the `game_results` row with `settlement_key='farkle_terminal'`. |
| Canonical financial journal | Player-chip update triggers journal changes and stage cursors; deferred `finalize_gameplay_transfer_batch` validates the Farkle handoff, assigns the committed cursor and inserts `gameplay_transfer_batches`. |
| Results/snapshots | `game_results` and `session_player_snapshots` are written in settlement. History trigger projections and `farkle_read_replay` consume recorded outcome/events. |
| Account ledger | `record_session_results` writes one `player_transactions` SessionResult per human at real-money **session closure**, using final snapshots. Ordinary game-over and fake money do not create these account credits. |
| Terminal continuation | `farkle_advance_postgame`, private postgame receipt and timer. Clears live family/round state, resolves deferred participation and returns canonical setup/waiting/ended disposition. New configuration creates a fresh dealer-game UUID. |
| Presentation | `FarkleTerminalPresentation` admits the exact canonical batch, dedupes announcement/completion and emits a local terminal token. `Game.tsx`/shared local-terminal owner preserve the table then continue. Animation never writes money. |
| Recovery/pause | `farkle_sync_timer_v1`/`farkle_sync_postgame_v2` persist timer work. Shared cron → recovery dispatcher → canonical timers → Farkle action/postgame. Fake-money expiry uses automatic control; real-money human expiry freezes via `set_game_paused`. |

Key unique identities verified against deployed indexes:

- Results: `(dealer_game_id, hand_number, settlement_key)` where key is non-null.
- Snapshots: `(game_id, dealer_game_id, hand_number, player_id)`.
- Action receipts: `(round_id, request_id)`; changed replay payload rejects.
- Events: `(round_id, sequence)`.
- Transfer batches: `(game_id, cursor)`.
- Deferred handoff: `(transaction_id, game_id)`.
- Postgame receipt: `(game_id, dealer_game_id, round_id, hand_number)`.

## Exact transaction boundary and reconciliation

The final `farkle_apply_action` locks round → game → actor, validates identity,
sequence/controller and config, reduces the bank action and updates the round.
Within that same transaction, settlement locks participating players and writes
the result, updates canonical chips, completes the round, upserts final
snapshots, publishes `game_over`/`session_ended`, and stages a private terminal
handoff. The outer action then inserts its authoritative event and receipt.

At deferred constraint execution, `farkle_begin_terminal_transfer_v2` requires
the same transaction, exact terminal round/config/action sequence, matching
result/winner, matching event and action receipt, and matching live closing
balances. The shared finalizer obtains the permitted cursor-write claim,
publishes the canonical batch, restores the previous claim and clears pending
journal rows. **Returning from the action body is not the commit boundary.**
An invalid handoff or failed deferred write aborts everything.

The observed two-player 5-chip proof was:

| Participant UUID | Before `players.chips` | After | Delta |
|---|---:|---:|---:|
| Winner `2434a6e4-0fcd-4367-ba3a-e3ef06074ccc` | 0 | 5 | +5 |
| Loser `df332928-24ed-4c82-a3e8-426c67b1b2a6` | 0 | −5 | −5 |
| Total | 0 | 0 | 0 |

Session `273ef3eb-52a9-4708-8c96-677219f46bb4`, dealer-game
`d05f2be1-0794-4bf3-a887-7c4abb1c86b2`, round
`b065bfd9-0b31-4b00-b0b0-3d67279dcc95`. The one result was
`7cb20ee3-88f7-4dd3-9315-aeb996f37ce5`; batch
`c498ea21-29f9-4152-a2a2-50f24b94a225`, cursor 1, contains one 5-chip
loser→winner transfer. Both post-settlement snapshots match. Pending journal and
handoff counts are zero. These are synthetic local identities, not production.

For N competitors and frozen stake S, the sole winner gains `S*(N−1)` and
each other original competitor loses S. Tiebreak eligibility narrows scoring
participation, not the original payout roster. Two-/three-player all-ties moved
no chips or results before a decisive tiebreak; a subset-tie case still collected
all original stakes. Negative session chips are net session losses, not a
separate prefunded wallet. Real-money closure wrote account amounts +5 and −5;
ordinary real-money game-over wrote zero SessionResults.

## Findings

### F1 — release blocker: inactive accounts retain financial command authority

`PlayerManagement.tsx:54` deactivates by setting `profiles.is_active=false`.
`Auth.tsx:128–138` treats that flag as Account Inactive and signs the user out.
Run21's `private.run21_actor_allowed` enforces it inside server commands.
Farkle's `farkle_apply_action` checks `auth.uid()` against the participant, but
never checks `is_active`; shared setup's `user_is_in_game` only checks a player
row. The Farkle configuration branch adds no account-status check.

Two isolated tests exercised actual authenticated-role calls:

1. Deactivate the current competitor immediately before final banking in a
   real-money game. The call returns `applied` and commits canonical +5/−5.
2. After settlement and continuation, deactivate the next dealer and call Run
   Back. The server returns `configured` with a fresh real-money dealer-game.

Captured database role settings contain no PostgREST pre-request/pre-config
hook, and no such application function was found. This is a proven database
authorization failure. A request through production HTTP with an already
issued JWT was not performed. There is no evidence that an unrelated outsider
can pay themselves or choose a score: the demonstrated actor is a formerly
authorized participant whose account has been deactivated.

**Smallest recommended correction:** enforce the existing active-account rule
at Farkle's human mutation boundaries, including initial setup/Run Back and
actions that can settle money. Audit the Farkle postgame command under that same
rule. Scope the shared configuration change to Farkle. Keep trusted recovery,
immutable receipt replay and settled history intact. Do not substitute a UI
check. Add negative SQL proofs for disabled actors before setup, ante, action,
final settlement and continuation; verify reactivation and authorized recovery.

Preserve scoring, payout formula, config snapshots, UUID identities, financial
trigger chain, dedupe keys, real-money pause semantics, canonical presentation
and all existing records. No financial rewrite or historical repair is justified.

### F2 — recovery/player lock inversion, financially contained

The concurrent final-action/recovery test reproduced SQLSTATE `40P01`.
Recovery locks `game_timer_registry` before the round; player action locks the
round before its synchronization trigger cancels/updates that timer. The trace
identifies `cancel_game_timers` → `farkle_sync_timer_v1` → `farkle_apply_action`.

The winning transaction settles once; PostgreSQL aborts the competing write.
An earlier interleaving left the timer scheduled with a recorded deadlock and
the normal five-second retry deadline. The final retained run had recovery
complete while the player request aborted. Two recovery workers produced one
processed timer and one skip. No partial transfer or duplicate settlement was
observed. Client error/retry presentation was not qualified.

Recommended separate correction: give the Farkle timer/action boundary one
consistent lock order, or make recovery's round-lock contention retryable
without holding a mutually blocking timer lock. Preserve durable scheduling and
existing transaction ownership; do not add browser polling or arbitrary timers.

## Recovery and retained production history

Production job `advance-due-game-state-1s` (job 33) is active and calls
`private.run_game_recovery_batch()`. Its batching procedure has approximately
32-second job-run records; this is not a 32-second heartbeat interval. The
dispatcher was fresh at 14:13:56 UTC and independently healthy at 14:21:47 UTC
(last completion 14:21:46 UTC). No task failures or Farkle session failures were
present. Canonical timer dispatch explicitly handles `farkle_turn` and
`farkle_postgame`; registry rows persist across worker interruption.

The isolated canonical timer completed a terminal boundary with no browser,
including actual deferred settlement. A complete competition from its opening
roll also finished using only server recovery calls; elapsed deadlines were
supplied as isolated fixture inputs. Real-money human timeout intentionally
pauses instead of making a gambling decision for an absent person. Resume
preserves the same competition. A worker killed after financial writes but
before commit left zero financial effects; a fresh connection completed once.
No long-running hosted cron process was restarted in production.

Authenticated attempts to rewrite terminal results, final snapshots and
committed batches all rejected and left the complete financial state unchanged.
Direct invocation of the public deferred-journal trigger also rejected: trigger
functions cannot be called as ordinary RPC functions, even when their EXECUTE
grant is present. Farkle private financial helpers deny browser EXECUTE and
private-schema access; the general chip-transfer RPC is service-only.

Read-only history found 20 Farkle rounds: 16 completed and four paused live
fake-money games. All 16 retained completions had exactly one terminal result,
one balanced canonical batch, correct configured winner/loser deltas and matching
final snapshot balances. Fifteen were two-player; one was three-player. All
were fake-money, stake 1. There were no residual terminal handoffs. This is
consistency of retained records, not evidence about deleted history or a real-
money production smoke; real-money behavior was proven in isolation.

## Remaining evidence and containment

There is no observed loss, duplicate payment or unbalanced historical batch.
The immediate risk is conditional but real: deactivation does not revoke
Farkle financial command authority for an existing authenticated identity.
At inspection, no active real-money Farkle session was present. That limits
observed current exposure; it does not repair admission.

Recommend temporarily close **new Farkle starts/Run Back** through the existing
`private.farkle_release.creation_enabled` gate until F1 is corrected and the
gate rerun. This existing gate affects both money modes and leaves the action,
settlement and recovery owners for existing games in place. Do not end or
repair historical/paused sessions. **No containment was applied.** Jeremy must
approve a correction or production-access change separately.

Before qualification, rerun negative active-account cases through authenticated
SQL and an isolated real JWT/PostgREST path, then perform two-client terminal
and reconnect/history smoke. Include real/fake payout, all/subset ties, rollback
at COMMIT, duplicate/late replay, Run Back, race and worker-restart regressions.
The 36 existing focused component tests passed; shared Session Ended tests
emitted existing React `act` environment warnings. No product build or deployment
was necessary for this audit-only work.

Important deployed MD5 fingerprints:

| Function | `md5(pg_get_functiondef(...))` |
|---|---|
| `private.farkle_settle_v1(uuid)` | `e4b72f5ee9376b4791e83be0db15ab9f` |
| `public.farkle_apply_action(...)` | `54b2ef0f284857e4df624f967f732f95` |
| `private.farkle_begin_terminal_transfer_v2(...)` | `efccf63654170d70f4d088cba2ba365d` |
| `public.finalize_gameplay_transfer_batch()` | `5d1c8703caee40ce7392d4eb6de1aaf9` |
| `public.farkle_advance_postgame(...)` | `8349700190717dcd40e814bfcf490797` |

**Final assessment: FAIL.** Canonical financial settlement is substantiated;
inactive-account authorization must be corrected, and the stated missing
runtime evidence completed, before full financial release qualification.
