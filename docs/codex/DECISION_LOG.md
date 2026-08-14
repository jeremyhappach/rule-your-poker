# Durable decision log

## D-001 — Database is authoritative

Gameplay, settlement, balances, snapshots, and persistent lifecycle truth live in Supabase/PostgreSQL. Client presentation may not become an alternate progression owner.

## D-002 — One canonical shell

The platform uses one table, felt, seat ring, spotlight system, and phase machine. Game artifacts live inside canonical slots.

## D-003 — Runtime smoke outranks source theory

A published runtime failure rejects an implementation even when typecheck and detached replicas pass.

## D-004 — No arbitrary timers/polling as state repair

Missed transitions are repaired through state observation, identity, scheduler drains, or authoritative ownership—not time-based guesses.

## D-005 — UUID identity, never alias

Player, bot, action, settlement, and dedupe identity use UUID/stable authoritative keys. Bot names are presentation.

## D-006 — Bot aliases are monotonic per session

Bot ordinals never reuse after removal. Allocation is durable and transactional.

## D-007 — Visible state confirms success

For Add Bot, the canonical yellow waiting seat confirms success. No success toast. Failure may show a destructive toast with the actual reason.

## D-008 — Snapshot identity includes dealer game

Hand numbers may repeat across dealer games. New snapshots key by game, dealer game, hand number, and participant.

## D-009 — Session Ended is a table phase

Connected clients keep shell/HUD and see results on felt. It is not a modal. Fresh mount of an already-ended session goes to lobby.

## D-010 — Preserve frozen repros

Do not mutate a production freeze until authoritative identity, action tape, and failure boundary are captured.

## D-011 — Broad audits are read-only first

Canonicalization and game-rule audits produce an inventory/plan before implementation.

## D-012 — Approval makes a fix publish-ready

An approved fix includes the required Git integration and push to `origin/main`.
Vercel publication is automatic; production smoke remains Jeremy's
responsibility.

## D-013 — Terminal settlement is one replay-safe transaction

A terminal settlement claim, chip movement, result row, post-payout snapshots,
terminal disposition, and session financial rows commit together or not at
all. Clients submit immutable authoritative identity and may replay; a durable
database key makes every financial consequence exactly once.

Immediate settlement does not authorize client teardown. When a connected
mount observed the exact live terminal scope, the route retains the existing
table through the game-owned win sequence and only then admits Session Ended.
A fresh mount or reconnect after settlement remains direct-to-lobby.

## D-014 — Vercel publishes GitHub main

`origin/main` is the production frontend release source. Vercel automatically
builds and publishes every pushed `main` commit, and Codex verifies the
deployment before handing the runtime to Jeremy for smoke testing. Manual
Lovable publication is no longer part of the delivery path.

Lovable Cloud was a temporary database and authentication dependency until the
controlled Phase 2 migration completed on 2026-08-03. D-018 records the live
owned-backend boundary. Frontend publication must not be coupled back to
Lovable.

## D-015 — Core cutover excludes forensic bulk

The owned Supabase cutover preserves users/password hashes, canonical gameplay,
financial/history data, Storage objects, schema/RPC behavior, and Realtime
membership. Persisted debug, incident, trace, voice, and operation telemetry is
not migration authority and is excluded from the core copy.

Normal production runs keep high-volume dice snapshots and persistent lifecycle
events off by default. When diagnostics are explicitly enabled, a target cron
purges the bounded diagnostic set after seven days. Gameplay, financial, audit,
and session-history tables are never part of that retention purge.

## D-016 — Rehearsal never silently cuts production over

An owned Supabase rehearsal may apply schema, copy approved data, deploy safe
functions, and prove parity without changing Vercel's production backend. The
actual environment-variable switch requires a completed rehearsal, provider
secret decisions, a final delta/freeze window, and explicit cutover approval.

## D-017 — Cutover keeps product truth, not retired dependencies

The owned backend retains real-money sessions, users/password hashes,
financials, and canonical history. Fake-money session history and orphaned
Cribbage archives are disposable rehearsal data. Trivia is retired. Voice
transcription calls OpenAI directly behind Supabase JWT verification and does
not persist audio or forensic voice telemetry. The unused, unauthenticated
`generate-music` Edge Function is retired rather than carrying an ElevenLabs
dependency into the owned backend; the separate static music UI is unchanged.
Historical chat-image attachments are disposable: the final import nulls
source-project `chat_messages.image_url` values and does not copy historical
objects, while the owned bucket, policies, and new-upload behavior remain part
of the product.

Final copy safety is a database write lock shared by source and target. The
lock is inert until explicitly enabled, blocks application and Storage writes,
and has one session-local bypass for the controlled import. It does not change
game lifecycle or settle/tear down active sessions itself.

## D-018 — Owned Supabase is production authority

As of 2026-08-03, `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`) owns production
database, Auth, Realtime, Storage, and Edge Function behavior. Vercel Production
and Preview variables point to that project, and GitHub `main` remains the
frontend publication authority.

The former Lovable-backed project is a locked rollback snapshot, not a parallel
write target. Do not dual-write, silently unlock it, or reintroduce its project
configuration into a production or preview build. A rollback requires a
separate explicit decision, a bounded data-loss assessment, and coordinated
frontend/backend switching.

## D-019 — Lovable runtime is retired without deleting the rollback snapshot

As of 2026-08-03, `ptown-poker.lovable.app` is unpublished and every cron job
on its former Cloud backend is inactive. The Lovable project and write-locked
backend remain intact solely for an explicitly approved rollback; GitHub,
Vercel, and the owned Supabase project remain the live production authorities.

## D-020 — Presence is a server lease and abandonment closes only at safe boundaries

The database-stamped `updated_at` on the four-second tab heartbeat is the
authoritative presence lease. Client timestamps, React renders, Realtime
Presence, unload callbacks, and durable `players.sitting_out` flags alone are
not proof that a human is connected.

Real-money abandonment reconciliation is database-owned and limited to safe
between-game states. Three missed beats may mark an absent player sitting out;
session closure requires a second server observation, and a narrow database
cron is the no-client fallback. Settled history completes through the existing
idempotent SessionResult trigger, pristine rooms receive a longer deletion
grace, and inconsistent history is preserved rather than guessed or deleted.
Generic abandonment handling never settles or advances an `in_progress` game.
The legacy monolithic deadline Edge Function is not this lifecycle owner.

## D-021 â€” Presence begins only at settled post-game waiting

The absence lease is never evaluated during a dealer game, its terminal
presentation, dealer setup, ante decision, or an initial waiting room. A
settled session with one active human returns to post-game waiting, which arms
one server-owned watch. The first, second, and third complete five-second
windows without a database-stamped post-boundary heartbeat are counted as
consecutive misses; the third marks that human Sitting Out. A delayed cron run
uses elapsed server time rather than treating a delayed invocation as a free
miss. A pre-boundary heartbeat is not presence for this lease, and a valid
post-boundary heartbeat resets its count. Once zero active humans is
authoritative, the database closes a result-bearing real-money session exactly
once from final snapshots. A live route stays on the canonical Session Ended
table; a fresh terminal mount goes to the lobby.

## D-022 â€” Sitting Out preserves a physical seat

`players.sitting_out` means the player is opted out of the next dealer game;
it never changes their physical seat or relative-seat projection. Seat
occupancy is determined only by a real player row whose status is neither
`observer` nor `left`; next-game eligibility is a separate opt-in count.
Timeout, ante decline, explicit Sit Out, and post-game absence all use the
same rule. Only explicit Stand Up or Leave may set `status='left'` and release
the position. A seated Sitting Out player returns through an opt-in action,
not an open-seat selection.

## D-023 — Post-game presence is lifecycle-neutral; terminal disposition is not

The post-game absence watch applies to both real-money and fake-money sessions
only after a result-bearing Waiting boundary with no active dealer-game
identity. It never evaluates an initial room, gameplay, terminal presentation,
setup, or ante. Three missed five-second server-stamped heartbeat windows may
mark a seated human Sitting Out while preserving their physical seat.

When that leaves zero active humans, the database chooses disposition by
session type: real-money retains the existing snapshot-guarded, exactly-once
financial finalizer; fake-money becomes `session_ended` without SessionResult,
balance, or transaction writes. Connected live routes retain the Session Ended
table, while a new terminal mount goes to the lobby.

## D-024 — Immutable transfer batches own financial presentation

The database remains the sole financial authority. Each player/pot balance
mutation is journalled and emits an immutable, game-scoped batch in the same
transaction, with database-captured opening and closing values. The shell
ledger—not raw realtime rows or per-game animation state—owns every touched
endpoint until the last flight settles and a fresh authoritative read confirms
the matching cursor.

Endpoint values are composed as ordered deltas, never independent client
snapshots. A balance mutation stages its next cursor in the same row so early
realtime delivery is held. A reconnect, missing endpoint, or dropped runtime
presentation cancels motion and reconciles directly to authoritative state; it
never replays financial effects. Game adapters may retain non-financial phase
callbacks, but may not render or author a duplicate chip movement.

When a committed transfer must follow an earlier canonical visual stage, the
game may register only a presentation-admission predicate with the shell
transport. The ledger retains its database-captured opening endpoint values
while closed and prevents later overlapping batches from starting first. This
does not defer settlement, release ownership, or introduce a game-owned
financial counter.

For a normal 3-5-7 final-leg win, that admission opens only at the canonical
pot stage after leg presentation has completed. The match-win announcement and
winner confetti begin with that stage, never with early settlement delivery.

## D-025 — Normal 3-5-7 terminal presentation is generation-and-scope owned

The normal final-leg prelude waits until the client has observed the concrete
dealer-game scope that matches its immutable terminal descriptor. It never
starts against a stale prior scope and then relies on a boundary reset to cancel
it. A local presentation record carries that descriptor generation through
award, legs-to-player, pot-to-player, and completion; callbacks from any other
generation or stage are ignored.

Only a different concrete dealer game cancels that record. Hand-context churn
and transient settlement nulls preserve it. The ordinary player-leg delta
detector advances its baseline but cannot start a descriptor-owned terminal
award. This keeps normal 3-5-7 in the one-owner terminal ordering while leaving
the database settlement and immutable transfer-batch ledger unchanged.

## D-026 — One financial settlement may expose ordered immutable presentation stages

When one authoritative transaction has distinct visible chip boundaries, it
may publish adjacent immutable batches from the same database-captured journal
rather than collapsing them into an absolute closing balance. A normal 3-5-7
final-leg terminal returns all purchased-leg value in a `sweep` batch and then
awards the pot in a `transfer` batch; settlement, result, snapshots, and
lifecycle state remain one replay-safe transaction.

The canonical ledger owns every touched endpoint across the entire chain.
Later raw rows carry the final cursor and are held until their predecessor and
the final reconciliation complete. Game code may admit the next non-financial
phase but may never synthesize a balance change or release the endpoint.

## D-027 - Signed balance labels are ledger lifecycle effects

A red/gold chip-balance label is not an independent game effect and may not be
derived from a raw player or pot row. The canonical presentation ledger emits
one signed label at the same boundary where it changes an endpoint: negative
at a source departure, positive at a destination arrival, and an authoritative
residual only where an immutable batch has a zero-flight change.

Labels use stable batch/transfer/boundary identities, so duplicates, remounts,
and late rows cannot replay them. Multi-sender antes compose into one pot
arrival label after all inbound chips land. When a batch is abandoned, its
labels are cleared with its motion; reconnect reconciles directly to the
database and never replays a settled financial effect. Game components provide
only visible endpoint anchors, not their own dollar-label writers.

## D-028 - Concurrent pot arrivals are one canonical presentation cohort

The shell transport's flight timers are independent of provider-context
identity, so a visible balance update at one arrival cannot cancel a sibling
timer. A multi-sender player-to-pot batch is one zero-stagger receipt cohort:
the ledger preserves the pot's opening value until every inbound flight has
arrived, then mutates it and emits one signed effect for the composed total.
This derives from immutable transfer topology, not a game-specific reason, so
antes, bets, and transfers share the same contract while staggered player
awards remain individual arrivals.

Opponent labels use the canonical felt frame and their actual chip-disc rect to
start on the rim facing the felt. Labels remain presentation-only and do not
change endpoint ownership, financial settlement, or reconnect behavior.

## D-029 - Holm showdowns expose pot legs, never a net player transfer

Holm's multi-player showdown is one financial settlement but has two visible
facts: the existing pot pays winner(s), then losing stayers build the next pot.
`holm_settle_hand` records those as adjacent immutable `win` and `transfer`
batches from its own staged database writes. It does not ask the client for
opening balances or reconstruct topology from a net delta after the fact.

`start_holm_initial_hand` labels its collection `ante`. The Holm adapter gates
only a batch whose immutable recipients/contributors match the current showdown
cohort; a generic player-to-pot transfer cannot be held behind that terminal
phase. The ledger owns each shared endpoint across the two cursors and releases
only after its existing authoritative reconciliation barrier. Disconnect and
reconnect still abandon presentation without replaying settled financial work.

## D-030 - A chip flight never hides its source seat cluster

The canonical ledger changes a source endpoint's displayed balance at the
departure boundary. A moving chip is an additive presentation artifact, not a
reason to remove the identity, chip disc, score line, or game-owned content
anchored at that player endpoint. The shared seat cluster therefore remains
rendered through every outbound player transfer; no game may reintroduce a
source-seat visibility suppression as a bounce workaround.

## D-031 - A Holm presentation plan is identified by its immutable hand scope

`games.current_round` is a rule-round number, not a Holm hand identity: it is
normally `1` for every hand. Holm showdown duplicate suppression must therefore
use the authoritative `rounds.id` (with the hand number as fallback) plus the
database-published immutable transfer cursor. Consecutive equal outcomes then
admit their own staged pot-award/replacement-pot batches, while a repeated
delivery of the exact same settlement remains deduped.

This key selects only a local non-financial phase plan. It does not alter
settlement, balances, transfer batches, cursor ownership, or the established
abandon-and-reconcile behavior on disconnect.

## D-032 - A leg cue is a 3-5-7-only transient, never a balance effect

`+L` is a non-financial 3-5-7 result cue and may be emitted only by the
recognized 3-5-7 surface. The shared table must unmount it outside that scope
and clear its trigger at canonical hand/game resets, so a stale cue cannot
cross into Holm or any other game. This does not suppress, replace, or alter
the ledger-owned signed monetary effects. Production smoke accepted this
invariant on 2026-08-10.

## D-033 - 3-5-7 rollover is distinct from its opening ante

The opening 3-5-7 Round 1 collects `ante_amount` once. Every later R3 ->
next-hand R1 transition derives `rollover_amount` from the locked authoritative
game row and adds only that amount per eligible player to the carry-forward
pot. The browser sends transition identity, never a financial amount.

`games` owns the active dealer-game rule; `dealer_games.config` retains the
same value as the historical configuration snapshot; `game_defaults` supplies
the default. Rollover uses its own hand-audit wording and result field while
retaining the existing one-transaction chip-transfer projection, including an
instant R1 sweep. This prevents a new presentation batch owner from splitting
the atomic game transition.

## D-034 - Harnesses Mode is the sole debug-harness execution authority

`system_settings.harnesses_mode` governs every executable harness path.
`game_defaults.debug_harness` retains the selected profile for Admin display
and later QA use, but it may not alter setup, rules, presentation, or an
outcome while the global gate is off. A failed settings refresh resolves to no
harness rather than retaining a stale override.

## D-035 - A transient cut flip may not strand an authoritative pegging turn

Cribbage may hold turn affordances while a local cut card visibly flips, but
the hold is scoped to the authoritative round/hand identity. Presentation
identity can advance, remount, or reconcile independently and must never
cancel the completion acknowledgement for the same exposed cut card. When
that identity changes during the flip, the renderer resolves the card face and
acknowledges the new boundary exactly once. A historical/rejoining client does
not replay completed cut presentation, so an authoritative exposed cut is its
own completion proof; only a live-transition hand waits for the flip callback.

A historical rejoin must seed both parts of that presentation boundary: the
face-up acknowledgement and the already-parked crib-card settlement count.
Either stale local value can suppress the spotlight and the legal pegging
actions, even while the authoritative turn is valid.

The database remains the owner of the cut, pegging turn, cards, scoring, and
settlement. The client gate is presentation-only: a fresh/reconnecting client
reconciles an already-exposed cut and resumes its existing legal action
without altering state or replaying a card action.

## D-036 - A rejoin onto an actionable turn admits Cards once

Shell-tab persistence is presentation continuity, not an action gate. When a
historical Cribbage entry arrives directly on the local player's authoritative
actionable turn, the table admits that mounted hand to Cards exactly once.
After that admission, an explicit player switch to Chat is retained. This
prevents a recovery client from appearing stranded on a persisted Chat pane
while preserving user tab choice during ordinary play.

This is a client-only admission correction. The database remains the owner of
the hand, current turn, cards, scoring, settlement, and transfers.

## D-037 - An exposed-cut rejoin is one authoritative presentation boundary

The pegging action boundary is not a collection of independently restored
local latches. For a historical entry whose authoritative Cribbage state is
already `pegging` with a cut and persisted crib cards,
`deriveCribbageCutPresentation` resolves the complete local boundary at once:
the cut is face-up and the crib cards are settled. Spotlight visibility,
pegging-card admission, crib rendering, and the post-render convergence effect
all consume that same decision.

Live transitions retain the visual cut hold until their local reveal callback
completes. Regression cases cover the real P0 ordering: initial empty local
state followed by authoritative exposed pegging state on the same hand key,
plus ordinary live gating and identity isolation. The focused suite runs in
the production `build` script using Vitest 3.2.4, which is compatible with
the pinned Vite 5 line.

## D-038 - Holm showdown timing is Game Defaults-controlled presentation

Holm's post-tabled, pre-Chucky, and multi-player showdown reading intervals
are persisted as millisecond defaults. The active table is the presentation
owner: it starts the solo interval from the lone-player fan's actual landing,
starts the multi interval after exposed hands paint, and gates the community
and Chucky artifacts by the current hand identity. The server consumes the
same defaults only to make the next authoritative artifact available on a
compatible cadence.

Those intervals never advance cards, evaluate a hand, move chips, settle a
pot, or change terminal state. A direct/rejoining client resolves an
already-authoritative showdown directly instead of replaying a historical
hold.

## D-039 - Dice disconnect recovery is a dedicated server owner

Horses and Ship-Captain-Crew may use mounted clients for visible rolls and
connected tie presentation, but they may not require a client for expired-turn
progress or terminal settlement. `public.horses_settle_game` derives the
outcome from locked persisted dice and atomically owns its replay-safe result,
chip transfer, snapshots, and terminal disposition.

The narrowly scoped database deadline driver advances only those dice games.
It honors each turn deadline for a single timed-out player, while the existing
three missed-heartbeat lease activates all-absent rollover/terminal completion.
It is intentionally separate from post-game presence reconciliation and the
legacy generic deadline Edge Function; neither may become an alternate dice
settlement owner.

## D-040 - Global Harnesses Mode gates database execution too

The database owns Holm's solo-vs-Chucky outcome, so a selected debug profile
is executable in `holm_submit_decision` only when `harnesses_mode.enabled` is
true. Client-side gating alone cannot protect real-money settlement.

## D-041 - A settled Holm Chucky loss remains revealable until continuation

`holm_submit_decision` settles a solo Chucky loss atomically, including its
carried pot and immutable player-to-pot transfer. Its completed `rounds` row
must nevertheless retain `chucky_active` and the fully revealed authoritative
cards until the next-hand continuation claims the transition. Clearing that
flag in the settlement commit prevents a connected client from ever caching or
revealing the cards, while a generic transition timer can still advance the
hand.

The client therefore retains the completed predecessor while PostgreSQL
durably prepares one non-actionable successor. The reveal-gated player-to-pot
transport acknowledges activation only after it settles. A service-only
presentation lease activates the same successor if every local callback is
lost; no presentation callback is the sole hand-creation owner.

## D-042 - Deadline workers submit, never synthesize settlement

An automated expiry owner may submit one exact expired action through the
same replay-safe database rule path as a player. It must not independently
deal opponent cards, set showdown/completed state, mark a result, move chips,
or start the next hand. A stale, locked, or interrupted presentation identity
is preserved for its canonical owner rather than guessed from a timer.

Service-only expiry adapters require an exact game/dealer-game/round/player
identity and browser roles cannot invoke them directly. Retired legacy
workers must return before constructing a database client so accidental
invocation is incapable of mutating gameplay.

## D-043 - Holm turn and hand publication are atomic identities

A Holm action is authorized by `(game_id, round_id, player_id)` and only the
player at `rounds.current_turn_position` may act. The accepted decision, next
seat, next deadline, monotonic `holm_turn_sequence`, and terminal decision
state commit together. A browser observes this result; it never advances or
repairs the turn.

The successor hand is a second replay-safe transaction keyed by the completed
predecessor `rounds.id`. It completes that row, clears decisions, rotates the
Buck, inserts the new round and all private-card rows with the new hand context,
and publishes the game pointers together. Reordered transport can delay a
snapshot but cannot expose a hybrid hand.

Network simulation is an executable harness and therefore obeys the global
Harnesses Mode gate. A profile selection may remain stored for later testing,
but while the gate is off its effective runtime mode is `off`.

Showdown recovery leases are presentation state and use
`rounds.presentation_fallback_at`, never `rounds.decision_deadline`. A failed
evaluation or settlement preserves the exact hand for retry; no browser error
handler may complete the round or publish `awaiting_next_round`.

## D-044 - Holm successor creation and actionability are separate durable identities

A completed Chucky loss prepares its exact successor inside the settlement
transaction and therefore before the financial flight starts. Preparation
deals community/private cards into a `dealing`
round keyed uniquely by `holm_predecessor_round_id`, but it does not reset
decisions, rotate the Buck, clear the result, publish game pointers, or start a
decision deadline.

Normal activation follows the canonical presentation boundary. If that
boundary is lost, only the service role may activate after the durable
`presentation_fallback_at` lease. Activation is replay-safe, pause-aware, and
terminal-aware. Endpoint cursor advancement may recover one exact missing
immutable transfer batch; it may not infer an amount or replay historical
financial motion.

## D-045 - A Cribbage successor does not exist before its count releases

Cribbage counting resolves score truth immediately, but PostgreSQL persists only
the scored predecessor and its server-derived presentation lease. It must not
insert the next round or next-hand cards while Hand N is still being presented:
any round selector that can observe Hand N+1 could otherwise cross the hand
identity boundary and reset the count. At normal release,
`cribbage_release_counting` creates and activates the successor together in one
transaction. If presentation callbacks disappear, only the service role may do
the same after the later fallback lease. Early calls return
`presentation_pending`; duplicate, late, terminal, and paused calls remain
inert. The prepared-row activator is compatibility-only for successors created
before this decision was corrected.

## D-046 - Cribbage count presentation progress is a monotonic durable cursor

`rounds.cribbage_state` retains the database-owned start anchor and a
lexicographic `(targetIndex, beatIndex)` cursor for the current visible count.
The authenticated `cribbage_record_counting_progress` RPC may only advance that
cursor on the exact active count; it must not replace the full JSON state or
modify score truth, the release lease, or lifecycle state. A mounting client
uses the durable cursor when present and derives the equivalent beat from the
start anchor only while the cursor is still initial. The derived cursor is
presentation continuity, never a source of gameplay or settlement authority.

## D-047 - Historical pegging notices are not counting-rejoin notices

The final pegging event remains authoritative history while the same hand is
counted, but a browser may present it after the phase transition only if that
browser previously observed the hand in `pegging`. A browser mounting directly
in counting instead derives its rail announcement from the durable counting
cursor and the matching highlighted combo. This presentation admission neither
changes the cursor nor replays score, settlement, or hand release.

The parent may retain its bootstrap shell during counting identity hydration
because count state does not carry dealt player hands. That shell may not emit
an ambient pre-deal/next-hand announcement when the authoritative phase is
`counting`: the resumed counting cursor is the sole rail owner until its active
combo is published.

Before the first authoritative snapshot, bootstrap must likewise remain silent:
absence of a local Cribbage state is not evidence of a next-hand lifecycle.
This may leave a slow-loading rail blank briefly, but cannot produce a false
phase announcement.

Production refresh and disconnect/reconnect smoke passed on 2026-08-13.

# Cribbage final discard is a database transition — 2026-08-12

The last discard, cut-card selection, His Heels result, and pegging admission
are one database-owned transition. Browsers may present the cut and may request
an idempotent reconciliation for a legacy completed crib, but may not be the
sole owner capable of progressing play.

## D-048 - A final Holm multi-player action resolves before it returns

An exact authenticated Holm action is the durable boundary for its final
multi-player showdown. When that action locks the last decision, PostgreSQL
must evaluate cards, reveal the final board, settle the immutable result, and
create the exact non-actionable successor in that same transaction when the
dealer game continues. A browser may request that resolver and later
acknowledge an already-created successor after its committed result paint; it
may not be the only evaluation, settlement, or continuation owner.

All-fold and solo-vs-Chucky outcomes retain their existing atomic action
owners. A service-only worker may replay the same resolver for a legacy
all-decisions-in multi-player hand, never invent a result or use a timer as the
normal resolution path.

## D-049 - Holm authority advances without a client; presentation remains per-client

A continuing Holm settlement prepares one exact non-actionable successor, and
PostgreSQL publishes it after a durable server-owned lease. Public clients may
neither activate that successor nor use the legacy proceed path. A database
cron worker is the normal release owner, so simultaneous disconnects cannot
strand the dealer game; duplicate jobs and late calls remain replay-safe.

Each browser may independently retain the completed predecessor until its own
canonical result and transfer presentation settles. This barrier holds the
existing Holm presentation snapshot and card-placement caches rather than
moving or re-latching cards: multiplayer showdown cards remain tabled at the
applicable seat/self cluster, and solo cards remain in the tabled area. A fresh
mount creates no predecessor barrier and admits current authority directly.

The barrier identity must come entirely from the hand that client is actually
presenting. It is immutable until an exact completion for the same dealer game,
round, hand number, and final transfer cursor arrives; a raw or hidden successor
may neither mark itself observed-live, overwrite the predecessor, borrow its
result/transfer gate, nor release it. For all-fold Rabbit Hunt, completion is
the join of the exact result paint, the visible final community-card flip when
Rabbit Hunt is enabled, and the exact Pussy Tax transfer settlement when one
exists. These boundaries may arrive in either order and are not replaced by a
timer.

A Holm Buck presentation event is scoped to exact session, dealer game, round,
hand context, and hand number. Only its receiving player may display it, only
for a live transition, and only at the accepted hands-wave transport start.
Changing dealer games clears the event so a previous game cannot replay it.

## D-050 - Holm normal continuation release is presentation-acknowledged

D-049's fixed server lease remains only as disconnect recovery; it is not the
normal presentation cadence. A continuing Holm settlement prepares one exact
non-actionable successor and an immutable cohort of the active human players.
After a browser finishes the predecessor's canonical presentation, it may deal
that exact successor locally. At the shared deal-settled/ready boundary it
acknowledges the full game, dealer-game, predecessor, successor, and hand
identity for its authenticated player. The last required acknowledgement
atomically publishes the already-prepared hand and begins its decision clock.

The acknowledgement conveys presentation completion only. It cannot choose
cards, settle chips, create a successor, or activate a different identity.
Duplicate and late acknowledgements are replay-safe, and each browser retains
its own exact predecessor barrier, so a faster client can never make a slower
client skip unfinished result or chip presentation. A reconnect that did not
observe the predecessor live enters the prepared successor instead of replaying
history.

If a required acknowledgement never arrives, PostgreSQL releases the same
prepared successor after a configurable durable recovery lease. Paused games
remain paused, terminal games remain terminal, and bot-only/zero-human cohorts
release server-side. This fallback guarantees authority cannot freeze when all
clients disconnect without imposing a fixed delay on the connected-client
normal path.
