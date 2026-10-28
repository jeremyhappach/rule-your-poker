# Multi-game asynchronous matches — architecture for review

October 28, 2026. Extend the released parent-match model to a mixed lineup of
Words, Run21 and TriTowers, with repeated instances and an individual agreed
stake for every child. Keep the initial expansion fake-money only. This document
proposes the expansion; no multi-game implementation or activation is included
in the published Words polish release `77c7c7151`.

## Financial contract

Accepting an invitation freezes the lineup and activates its children. Acceptance
does not create canonical players, move chips, post transactions, reserve stakes
or check an available balance. There is no funded wallet or ring-fenced balance.
Existing account treatment of negative balances remains unchanged.

Each child produces one immutable authoritative result: its identity and frozen
stake/configuration, normal completion versus forfeiture or draw, winner, signed
outcome for each participant, terminal revision, and game evidence. Its signed
amounts sum to zero. The parent displays their cumulative total as **Provisional
match-to-date**. These records do not change account balances, canonical player
chips or financial transaction history.

Only when every expected child is terminal does the parent recompute the net from
those records and settle in one database transaction. For +5, -10, +5, +10, it
posts +10 and -10 once. The net loser may have a negative account balance under
the existing rules. A zero net produces a receipt and no chip-transfer batch.
For future real-money activation, the unchanged canonical account trigger also
writes its normal two zero-valued SessionResult history entries; those entries
do not transfer funds. Child history remains available after settlement.

## Verified foundation and reconciliation boundary

Production already has `private.delayed_matches`, `delayed_children`, immutable
`delayed_outcomes` and `delayed_settlements`, request receipts, incident holds,
participant-only projections and persistent notifications. Its settlement owner
already aggregates children. The deployed child table permits ordinal 1–32 and
game identities Words, Run21 and TriTowers. **That schema capacity is not admission:**
`delayed_create` and `delayed_respond` explicitly restrict production to one Words
child and fake money. Those guards remain in place until a separately qualified
expansion is approved.

The preserved `delayed-head-to-head` worktree contains Run21/TriTowers adapters,
a trusted server commit boundary and recovery worker. Its checkpoint is
`docs/codex/DELAYED_HEAD_TO_HEAD.md`. Reuse its shared-rule adapters and proof cases;
do not replay its installation scripts wholesale. They create objects that now
exist and predate the current canonical transfer definition, Words adapter,
notification polish and recovery heartbeat.

Current owners are `supabase/delayed/authority.sql`, `words.sql`, `views.sql`,
`health.sql` and `incidents.sql`; `src/pages/Delayed.tsx` and the delayed components
own navigation. The catalog in `src/lib/gameCatalog/index.ts` supplies discovery
and defaults identity. Actual server capability/admission remains authoritative.

## Canonical settlement and concurrency

Keep the existing canonical functions unchanged:

| Owner | Role and limit |
|---|---|
| `settle_gameplay_chip_transfers(uuid,jsonb,text)` | Locks the canonical game/players and applies chip deltas. Allows negative chips. It has no general request idempotency key. |
| `finalize_gameplay_transfer_batch()` | Deferred ledger construction from actual chip changes. It records `unmatched_deltas`; merely invoking it is not proof of a correct balanced settlement. |
| `session_player_snapshots` | Final canonical player values consumed by account posting. |
| `record_session_results()` | On real-money terminal closure, posts SessionResult entries from snapshots. Its partial unique index on `(source_game_id, profile_id)` deduplicates account history. Fake money creates no real-account entries. |
| `private.delayed_finalize(uuid)` | Parent lock, all-child verification, aggregate calculation, canonical accounting lifecycle and unique receipt. This is the settlement entry point. |

All mutations use the same lock order: incident gate, request lock when needed,
parent row, then child row. Recovery must follow it too. The finalizer checks the
unique parent receipt before doing any financial work. It verifies the frozen
lineup count and one terminal outcome for every child, sums authoritative deltas
using a wide integer, and validates the supported amount range.

Within that transaction it creates a nonjoinable canonical accounting session
using the parent UUID, two canonical players starting at zero, one aggregate
game result, and one balanced transfer for a nonzero net. It records final
snapshots, closes the accounting session to invoke the existing account trigger,
validates expected postings, inserts the immutable parent receipt and closes
the parent. Deferred ledger processing commits with the same transaction.
No live session or seat is created while children are being played.

If the last two children finish together, transaction A locks the parent, records
its child and commits without paying if another child remains. Transaction B
then acquires the parent lock, sees A's outcome, records its child and settles.
An additional retry sees the stored receipt. A crash or failure before commit
rolls back the final child result and all financial writes together; retry uses
the same request identity. No network transfer or client action sits between
debit and credit. A failed response after commit is resolved by reading/replaying
the receipt, never by issuing another raw transfer.

The receipt's unique match key, parent UUID as accounting-session identity,
canonical result key, immutable child-result key and SessionResult index are
independent backstops. Qualification must inspect actual chips, ledger balance,
snapshots and account entries, including `unmatched_deltas = {}`. A receipt alone
does not satisfy the financial release gate.

## Data model

| Record | Required contents and changes |
|---|---|
| Parent | Two account UUIDs, money mode, frozen ordered offer/hash, orchestration policy version, status, acceptance/expiry/settlement times, revision. No balance fields. |
| Child | Unique parent/ordinal, existing stake units and validation, frozen shared rule/configuration and adapter version, persisted starter, actor/segment/revision, private state, availability and gameplay deadlines. Preserve existing Words children. |
| Outcome | One immutable row per child, signed zero-sum amounts, reason/winner and terminal evidence. The immutable child reference supplies the agreed stake; expose that stake with every history record. |
| Settlement | One immutable row per parent, aggregate amounts, outcome digest/count and canonical session/dealer/result references. |
| Requests | Actor/request UUID and exact fingerprint with authoritative response. Preserve Words receipts; add other adapter receipts behind the same public contract. |
| Notifications | Existing unique recipient/match/kind rows; one actionable turn row per match, plus invitation/acceptance/settlement history. |
| Recovery/incidents | One coordinated dispatcher and health/hold policy. Each deadline claim binds child, segment, revision and expected deadline. No competing Words and prototype adjudicators. |

Use an additive forward migration. Keep existing records and shared-rule versions
readable. A new orchestration version may describe mixed lineups; it must not
fork scoring, randomness, bonuses or gameplay clocks into separate async rules.
Do not install a second accounting ledger, copy account balances or rewrite
historical outcomes.

## Lineup, gameplay and notifications

The bell's persistent Async Matches link and existing setup flow lead to a
builder using catalog identities and Game Defaults. Choose a supported game,
configure its existing options, set its individual stake and add it to the
lineup. Allow duplicates, edit/removal and stable ordering. Display the complete
lineup and sum of maximum losses before choosing an opponent and sending.
The existing database capacity is 32 children; validate the bound on the server
and qualify the largest offered lineup before exposing it.

The opponent reviews the exact frozen lineup, individual stakes, total exposure
and timing/forfeit rules before accepting. Retain the 72-hour invitation expiry
and pre-accept cancellation/decline. Accepted obligations cannot be cancelled
unilaterally to erase a losing provisional result.

On acceptance, choose the starter independently for each child and persist the
evidence. Words keeps its shared opening tile draw; Run21/TriTowers use the
approved fair starting-player assignment. Do not replace game-specific opening
rules with a blanket organizer-first or forced alternating policy.

The parent home shows all children, scores where permitted, own/opponent turn,
remaining time, normal win/loss versus forfeit, child stake/result and provisional
net. Completed children stay visible. Play Turn opens the saved authoritative
child; finishing its legal segment returns home. A Play Next Available Turn
button chooses the earliest due eligible child after re-reading authority.
For several available turns, a bell action opens the parent; the existing direct
navigation for exactly one eligible turn can remain.

Each available segment gets 36 hours; Last Call begins at 24 hours. Opening or
reloading gameplay never restarts that window. Preserve the prototype's segment
boundaries: one Words move, one Run21 round, one TriTowers stage. The normal shared
gameplay clock runs once its segment starts, including across disconnects.
Resolve an earlier gameplay deadline at its persisted time; at an exact tie,
availability expiry forfeits the child. Segment completion legitimately hands
off and creates the next window. No new async time banks or player pauses are
included. A missed segment loses only its child at the agreed stake.

One turn notification per recipient/match contains available count, earliest
deadline and Last Call status. Reading it does not dismiss an outstanding turn.
Last Call escalates the same row; it does not add one notice per child. Realtime
signals invalidate participant snapshots; reconnect refetches authority. Timers
are display-only. The scheduler handles absence of all browsers.

Use independent private deals with identical frozen rules and distributions for
Run21/TriTowers, as in the preserved design. Do not impose a shared deck that
exposes the second player's future cards. Keep opponent unpaired scores and
private boards concealed until the approved comparison boundary. Each adapter
reuses the canonical game presentation without mounting a live session's
financial or terminal owner. Existing synchronous gameplay remains untouched.

## Catalog and rollout

The current catalog contains 22 game descriptors. Catalog membership alone does
not establish deployed availability or async qualification.

| Game(s) | Async fit and proposed placement |
|---|---|
| Ptown Words | Existing alternating-turn adapter. First prove multiple independent Words children and aggregated notifications. |
| Run21 | Preserved independent scored-round adapter using shared rules and private deals. Include after terminal, tie-extension, recovery and mixed-parent qualification. |
| TriTowers | Preserved scored-stage adapter using shared SQL rules, bonus eligibility and private deals. Include after version reconciliation and mixed-parent qualification. |
| Quintzee | Next candidate for independent scored attempts; shares Arcade/multiplayer rules but needs an async adapter, frozen timer and result/privacy qualification. Current catalog is fake-money only. |
| Six-Card Golf | Interactive turns across holes. Needs saved draw/discard/reveal boundaries and separation of game outcome from synchronous payouts. Later phase. |
| Battle 31 | Interactive draw/discard/knock progression. Needs final-lap and hidden-information resumption proof. Later phase. |
| Cribbage, Canasta | Stateful interactive hands, hidden information and multiple scoring/terminal phases. Later dedicated adapters. |
| Mega Card Golf | Current catalog is solo Arcade, one player. Competitive comparison, ties and stake semantics must be designed before an async multiplayer adapter. |
| Gin Rummy, Holm, 3-5-7 | Cataloged multiplayer; dedicated turn/hand and financial-semantics review required. Existing variable or repeated wagering must not be relabeled as a fixed maximum-loss child stake. |
| Horses, Ship Captain Crew, Yahtzee, Farkle | Cataloged dice games; define complete legal roll/score segments and preserve rerolls, holds, bonuses and tie behavior before qualification. |
| 11 Up, BoxDrop, Trip Flip, Take Two, Royal Flash, Race Poker | Cataloged competitive games; later per-engine review of attempt/turn boundaries, randomness, privacy, continuation and settlement coupling. No compatibility claim beyond catalog presence. |

## Financial and operational risk

Unsecured exposure is intentional: one parent's maximum loss is the sum of its
child stakes, and simultaneous parents can add exposure. Show it clearly; do not
turn it into a reservation or admission gate. Synchronous results may change an
account while async children remain open. Settlement must apply deltas through
the existing account mechanism, never overwrite a previously read balance.

The important failure cases are duplicate completion, stale deadline jobs,
conflicting outcomes, partial final settlement, missed recovery and leaked
opponent state. Use the existing immutable identities and database locks. Invalid
or incomplete authoritative evidence must leave settlement uncommitted for
investigation; it must not be coerced into a draw or silently dropped.

Retain measured operational incident holds. A confirmed platform failure holds
adjudication and shifts relevant clocks by the recorded outage duration through
the existing incident owner. No arbitrary grace period is added. Suspended
accounts cannot submit actions, but accepted obligations and records persist;
an exceptional resolution requires an audited operator decision. Disputes do
not rewrite immutable results or delete a receipt. Any approved subsequent
account correction uses the existing correction mechanism and retains linkage.

## Phased implementation proposal

1. **Reconcile admission and versions.** Build on current published main. Compare
   only the preserved adapters and their ownership differences. Define the mixed
   lineup capability response, freeze current shared rules/defaults and preserve
   old Words offers/receipts. Do not import prototype table-creation scripts.
2. **Prove parent aggregation first.** Exercise two or more Words children and
   mixed signed outcomes through actual canonical accounting. Cover net winner,
   net loser, zero net, normal/forfeit combinations, duplicate/conflicting/late
   requests, authorization, frozen stakes, injected rollback, simultaneous last
   children and overlapping parents with shared accounts. Prove zero interim
   writes and negative-account behavior for a future real-money qualification.
3. **Reconcile adapters and one recovery owner.** Add Run21/TriTowers through their
   shared rule bases. Retain word RPC compatibility. Test private randomness,
   complete matches, ties/bonus stages, earliest gameplay deadlines, 36h expiry,
   stale jobs, two-device races, zero-client recovery and operational incidents.
4. **Complete lineup UX.** Extend the builder, invitation review and styled parent
   home; preserve per-match notification aggregation. Verify duplicate games,
   distinct parameters/stakes, earliest-deadline navigation, refresh/reconnect,
   two phone identities and canonical game rendering. Include the full invite
   and acceptance chrome in this expansion rather than the already shipped fix.
5. **Qualify and release the approved expansion.** Use additive migrations with
   new scope closed, candidate/installed rollback proofs and real concurrency
   checks, then the normal test/build/review/publish workflow. Preserve live
   synchronous games and existing async matches throughout. Verify exact-SHA
   publication before enabling the new fake-money lineup and performing mobile
   owner smoke. Real-money async activation remains a separate release decision.

The proposed product choice is the first mixed lineup: Words, Run21 and
TriTowers. The financial contract, negative balances, 36h/24h policy, child-only
forfeits and parent-only settlement are already settled decisions. Async time
banks remain excluded pending the previously requested quantity/duration choice;
they do not block this design or require invented defaults.
