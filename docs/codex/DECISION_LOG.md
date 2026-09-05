# Durable decision log

## D-127 — Pause serializes with actions and freezes authoritative progression

Every game observes the same database pause guard. A versioned host/admin
request locks current rounds before the session and uses NOWAIT to reject a
competing transition without introducing a waiting lock cycle. Resume shifts
stored deadlines and restores the five authority contexts. Untimed decisions
remain untimed. The round, financial and progression guards apply to service
recovery as well as human actions; participation intent and graceful end remain
control operations. The trusted Yahtzee timeout wrapper uses the same envelope.

## D-126 — Genesis and automatic-play intent are server transactions

Session creation claims a request UUID and payload before returning its single
table/host result. Lost-response retries preserve identity; deletion leaves an
inert request receipt. Browser gameplay DML on games and players is closed,
retaining only an own-human deck-color preference grant. Server ante commands
own both human automatic acceptance and bot admission. A round-bound stop intent
is visible after reconnect and consumed by turn advance; old round delivery
cannot switch automation off in a newer dealer game.

## D-125 — Session lifecycle cannot bypass financial completion

The shared session-end command validates host/admin authority and exact phase
identity. Active dealer games record pending end; immediate terminal disposition
requires neutral unfunded setup or the exact trusted terminal settlement. Empty
fake rooms can be deleted, and real-money history is retained. Maintenance blocks
new non-admin rooms while existing games finish through their rule engines.
Browser game-row updates/deletes and obsolete end/participation APIs are revoked.
Canonical config expiry supplies and restores the family authority contexts.

## D-124 — Participation intent and setup exits have one server owner

Participant intent uses a per-player version and exact dealer-game identity;
host transfers use a host version and current-host authorization. Browsers cannot
edit those fields directly. Setup exits claim the session/deadline/dealer identity,
apply queued intent and choose disposition atomically, retaining participant rows
and balances. Two-player seat projection occurs before selecting the next dealer.
The 3-5-7 compatibility entrypoint forwards to this owner and preserves historical
receipts. Old browser evaluators, seat movers and setup cleanup chains are removed.

## D-123 — Rule configuration and dealer draws have no browser write alternative

`configure_dealer_game` remains the atomic configuration owner, and existing
session/Cribbage commands own dealer draws. Browser roles cannot mutate protected
rule fields or draw receipts, nor create their own dealer-game records. Removed
unused setup handlers and unreachable random draw code; presentation still consumes
the committed receipt. Later lifecycle/participation closure must use these owners
without reopening raw configuration writes.

## D-122 — Every supported game's completion uses its server disposition

Gin applies queued participation and pending end within its exact postgame claim,
matching Cribbage's transaction boundary. With both callbacks migrated, the generic
browser leader/cleanup/dealer-rotation chain is removed. All seven game callbacks
send identity and consume their server outcome; an unknown game type may refresh
but cannot invoke a generic authoritative writer. Shared shell presentation and
Session Ended admission remain the connected-client lifecycle owners.

## D-121 — Cribbage postgame intent belongs inside the settled claim

After exact round/dealer-game/hand validation and committed-settlement verification,
`cribbage_advance_postgame` locks participants and applies queued intent before
choosing continuation, waiting or session end. It retains participant history and
refreshes winner eligibility after departures. Browser completion submits identity
and reads the disposition; it never mutates participation or navigates on its own.
The existing private claim key remains the replay boundary, including waiting and
terminal outcomes. Existing scoring, payouts, dealer policy and shell presentation
ownership are preserved.

## D-120 — Account history is append-only and balance reads are exact

`admin_record_account_entry` owns manual deposits/payouts with an actor-scoped
request identity and immutable payload. `admin_reverse_account_entry` appends
one linked inverse entry; it never frees the original session-result claim.
The UI persists unresolved manual requests across refresh and retries that same
identity. PostgreSQL computes full balances; decimal text crosses the API and
keyset pagination controls statement size. Read failure is unavailable, never zero.
Real-money session/profile history cannot be removed through deletion cascades;
empty real rooms archive while explicit fake rooms retain destructive cleanup.
No historical discrepancy is corrected by inference.

## D-119 — Monetary changes derive from legal server commands

Browser roles cannot mutate chips, legs, pots, transfer cursors or result rows,
or invoke arbitrary financial helpers. Signed scores remain legal inside
authoritative transactions. Journal triggers describe committed movements;
they do not authorize a browser-selected movement. Obsolete browser financial
paths are removed instead of retained as fallback writers.

Jeremy approved whole-chip Holm remainder awards clockwise from the dealer.
The server uses the canonical seat ring's descending order with wraparound,
skips non-winners and treats the dealer as last. Both partial ties and Chucky
split awards use the same private helper. Each split exhausts the original pot.

Session creation uses the database's zero transfer cursor. Admission stamps
the authenticated creator as host before peers join; a missing host falls
back to the earliest currently seated human, never automatically to the latest
joiner. These boundaries are covered together by the financial genesis proof.

## D-118 — Participation does not restore money from history

The existing participant row owns its balance through departure and rejoin.
Server commands lock session then participant and compare a participation
version; old requests cannot reverse a newer seat/departure. Mid-hand departure
audit is private and separate from settlement snapshots. Live hands retain
their settlement/recovery owner, while postgame uses server disposition.
Taking a vacated seat preserves the old participant and all history. An
in-flight occupied seat remains reserved through its settlement. Browser
snapshot writes and snapshot-to-player balance restoration are retired.

## D-117 — Dice commands own rolls and durable completion

Horses/SCC follows the Yahtzee action boundary: UUID identity plus expected
action sequence admits an intent; only PostgreSQL generates dice, counters,
results and timestamps. Client holds may be optimistic presentation but cannot
replace the authoritative hand. Turn advance delivers an already committed
completion after its server timestamp, and recovery uses that same boundary
when the initiating client is gone. Presentation may delay result display to
the recorded roll boundary; it cannot complete or advance a hand.

## D-116 — Fixture execution requires explicit fake-money context

A global harness selection never overrides a game's money mode. Server deal,
cut and outcome owners admit fixtures only when authoritative `real_money` is
false. Missing context fails closed. Private cut helpers receive the round's
game UUID from the existing command owner rather than trusting a campaign
profile in state. Client dice consumers carry the same context while their
remaining server ownership migration is completed.

## D-115 — Holm public cards are a reveal projection

Private round storage owns full community and Chucky cards. Public rows retain
slot count and order but contain masked objects for unrevealed values. Projection
happens before public INSERT/UPDATE so Realtime never receives new future card
values. Only server decision and showdown owners hydrate private cards; client
bots evaluate the public revealed prefix. Round identity and committed cards
cannot change beneath the projection. Presentation geometry and reveal timing
remain owned by the existing shell and Holm presentation components.

## D-114 — Participant identity is immutable and contact reads are privileged

Player/session/user UUIDs and the bot/human flag cannot be reassigned after
insertion. Human admission is bound to the authenticated user; bot admission
uses `create_session_bot`, whose supplied bot UUID is also the retry identity.
The server records the actual authenticated actor and admits only host/admin
requests in a nonterminal fake-money session. Profile email is excluded from
public column grants and is returned only by an authorized admin projection.
Seat position remains a separate lifecycle intent, not a substitute identity.

## D-113 — Admin roles own privilege; profile flags are projections

`public.user_roles` is the sole admin authority. The legacy
`profiles.is_superuser` field is a protected projection maintained in the same
transaction as role changes so existing SQL and display consumers remain
compatible. It cannot grant a role. Browser admin changes use the serialized,
idempotent `admin_set_user_role` command; browser roles cannot mutate role rows
directly. Ordinary profile preferences remain self-editable, while identity and
activation/admin authority have independent database guards. Password recovery
uses verified recovery tokens; the legacy password-replacement endpoint is
retired and contains no service credentials or account mutation.

## D-112 — Freeze evidence is universal but player-operated

The Game Freeze Trace is a shared, admin-visible diagnostic availability gate,
not a harness or game-state owner. When Global Admin enables it, every active
game exposes the same explicit Start/Stop/Send control to its player. Until a
player starts it, it captures nothing; a bounded, card-free session buffer may
survive a reload and is persisted only through one player-initiated
`debug_events` send. Common route hydration evidence belongs to the universal
recorder; game-specific producers may add bounded diagnostic events without
changing polling, Realtime, timers, rules, or settlement.

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
events off by default. Production diagnostics retain one day. A separate
quota-critical owner independently bounds `debug_events`, `debug_sync_events`,
successful pg_cron history to one day, and failed pg_cron history to seven
days, so an unrelated diagnostic schema mismatch cannot suspend storage
control. Gameplay, financial, audit, and session-history tables are never part
of either retention purge.

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
use the authoritative dealer-game, `rounds.id`, and hand number. That key is
stable for the entire presentation plan even when one logical showdown emits
adjacent immutable pot-award and replacement-pot batches at different cursors.
Consecutive equal outcomes remain distinct because their rounds-row/hand
identity changes.

Transfer cursor is deliberately excluded from the plan key and retained in the
separate exact batch-admission/completion identity. A repeated delivery of one
batch is therefore deduped, a later batch in the same hand advances the
existing plan, and only exact `(dealer game, round, hand, cursor)` completion
evidence may release the client-local predecessor barrier. These keys remain
non-financial and do not alter settlement, balances, transfer batches, cursor
ownership, or disconnect recovery.

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

## D-051 - Holm predecessor completion is durable evidence, not a callback edge

A canonical Holm chip batch binds its presentation stage and exact dealer-game,
round, hand, and transfer-cursor identity when the ledger admits it. Settlement
must consume that captured identity; it may not reclassify the finished batch
against mutable result, phase, or successor props. The same identity rule
applies to showdown replacement-pot, Chucky loss, and Pussy Tax, while
zero-transfer completion is recorded at its exact visible boundary.

`Game.tsx` retains completion evidence independently of the live predecessor
barrier and reconciles the two idempotently. Evidence may arrive before the
barrier latches or after it is already held. Exact evidence releases the exact
predecessor in either ordering; a later hand, different cursor, duplicate, or
late callback cannot release another presentation. Dealer-game changes clear
both the barrier and evidence.

This client ordering rule never gates authority. PostgreSQL may publish the
prepared successor through acknowledgements or the durable missing-ack fallback
and immediately owns its decision deadline. Any authoritative current turn
remains enforceable even if all clients disconnect or one client still presents
the predecessor. A client renders that timer and its controls only when its
presented dealer-game/round/hand is the same authoritative hand; hiding a
successor timer from a predecessor surface does not suspend enforcement.

## D-052 - Holm client presentation is one reconstructable exact-hand transaction

Every connected Holm client owns one presentation transaction keyed by the
exact dealer game, rounds row, and hand number. Its chip prerequisite is the
authoritative transfer cursor's durable ledger state, never a transient delta
or animation callback. A live cursor releases deal admission only after the
client's actual financial flight settles; a historical or reconnected cursor
reconciles directly to authority without replay.

Hands, community, and Chucky are deterministic card manifests. The persistent
transport provider retains whether each exact intent is active, settled, or
dropped and its immutable metadata. A DealRuntime remount reconstructs only
the declared manifest for its exact hand; active IDs remain in flight, settled
IDs replay locally, unseen IDs dispatch, stale-hand settles are rejected, and
dropped/cancelled IDs never masquerade as completed presentation. Buck is
eligible only when the first new hands-wave intent is actually accepted.

A missing Holm DOM endpoint is readiness, not failure and not permission to
fake-settle. The intent remains pending until canonical DOM/layout readiness or
explicit lifecycle cancellation. Fresh mounts on an already-actionable
historical hand enter gameplay without replay; an exact prepared successor
still receives its deal. Deal-ready acknowledgement drains from the durable
ready barrier, so callback/remount ordering cannot lose it. None of these
client checkpoints owns settlement, successor publication, balances, or turn
deadlines; PostgreSQL continues independently and its durable missing-ack lease
remains the all-clients-disconnected fallback.

## D-053 - Explicit participation and post-game disposition commit together

An explicit Sit Out, Stand Up, or Leave result is authoritative participation
evidence, not ambiguous presence. At a settled post-game boundary, the server
must lock the session/cohort and commit the mutation with its lifecycle
decision: zero active humans ends now, fewer than two eligible participants
returns to Waiting with setup identity cleared, and an eligible cohort may
continue. No client-side count or later scheduler tick may become the owner of
that decision.

Heartbeat grace remains a separate absence-confirmation path only for a human
who is still authoritatively active and seated. Never-started rooms, live
dealer games, financial snapshot safety, and connected-client terminal
presentation retain their existing owners.

## D-054 - Public build identity gates new game admission

The public production `build-manifest.json` is the final source of the build
identity. The deployment publisher waits until that alias serves the expected
full Git SHA, and only then writes the versioned
`system_settings.release_publication` event through its verified Edge Function.
That event is a prompt for connected clients to refresh their manifest check;
it is never gameplay, session, balance, or settlement authority.

Because an external deployment signal can arrive after the public alias has
changed, lobby Realtime alone cannot be an admission guard. Every new game
route independently reads the no-cache public manifest before the `Game`
component mounts and fails closed on a mismatch or unavailable read. Once a
route has passed that one check, later publication events are deferred until
the player returns to a non-game route so live presentation continuity is not
interrupted.

## D-055 - Cribbage gameplay truth is private and server-owned

Cribbage hidden cards and mutable gameplay state live in
`private.cribbage_round_states`. The public round document is only a redacted
realtime projection; an authenticated state RPC restores the caller's own hand
without exposing an opponent hand or the unrevealed crib. Public table
privileges no longer imply authority to write a Cribbage round, player-card
row, dealer result, or hand counter.

Dealer draw and first deal, discard/cut, pegging play and Go, scoring and turn
selection, counting resolution, successor creation, and terminal settlement
are row-locked, replay-safe server transitions. Browsers submit immutable
identity plus intent and own presentation only. A one-second private recovery
owner advances dealer startup, bots, expired counting leases, and terminal
settlement, so client disconnect cannot become a gameplay or financial pause.

## D-056 - A Cribbage counting winner is terminal only when the count releases it

PostgreSQL may resolve the immutable counting plan and winning score before a
browser presents them, but it must not publish `complete`, expose the winner,
or admit settlement at that point. A counting-based winner remains private
`terminal_pending` while the public state stays in `counting`; the visible
threshold-crossing acknowledgement promotes the authoritative terminal state.

That acknowledgement does not choose the winner or calculate points. It only
releases a database-resolved outcome. If every browser disconnects, the same
private recovery owner promotes and settles after the durable presentation
fallback. Direct pegging and His Heels wins retain their existing terminal
path because their winning points have already been presented before the
terminal state is published.

## D-057 - Cribbage postgame continuation is one exact-settlement transition

A committed Cribbage settlement does not authorize a browser to clear the
outgoing dealer-game identity, choose the next dealer, or publish the next
setup phase with separate table updates. The browser submits the immutable
game, dealer-game, round, and hand identity only after terminal presentation.

PostgreSQL locks that round and game, proves the exact `cribbage_terminal`
result, derives the next eligible dealer under the lock, clears all outgoing
transients, and commits `game_selection` or `dealer_selection` once. A private
durable claim returns the same result to simultaneous clients and makes a late
replay harmless after a newer dealer game begins. This decision is scoped to
Cribbage; every other game's shared client-owned postgame boundary remains an
explicit audit item during that game's authority migration.

## D-058 - 3-5-7 bootstrap and postgame are returned database transitions

Both 3-5-7 dealer-game boundaries are atomic, exact-identity PostgreSQL
transitions. The bootstrap RPC validates admission and antes, commits startup,
derives and persists the first deal, and returns that committed result to its
caller. The initiating browser consumes the returned authority directly;
Realtime synchronizes peers but never triggers bootstrap.

The migration rollback proof executes the complete scheduled recovery function
as PostgreSQL runs it in production. Helper-only proof is insufficient because
an error elsewhere in the scheduled statement can abort and roll back an
otherwise valid recovery transition.

After settlement, the browser skips the shared dealer-game transient reset and
submits only exact game, dealer-game, round, and hand identity. PostgreSQL locks
the terminal round and game, proves the matching committed settlement, derives
the next dealer and configuration deadline, clears player ephemerals plus the
outgoing identity and counters, and publishes the next setup, waiting, or
terminal disposition atomically. A durable exact-identity claim returns the
stored result to duplicate callers and makes an older replay read-only after a
newer dealer game exists. Authority protections remain strict, and cleanup or
advancement database errors are surfaced as failures.

## D-060 - Yahtzee actions and continuation are exact server transitions

Yahtzee browsers submit intent plus exact round/player/action-sequence identity;
they do not generate durable dice, score categories, advance turns, create
successor rounds, or write the round document. PostgreSQL validates admission,
ownership, turn, Joker/category legality, and compare-and-set sequence, then
returns the committed state directly to the initiating client. Realtime is
synchronization for peers and reconnects, never the bootstrap or action trigger.

After settlement, a browser submits only the immutable game, dealer-game,
round, and hand identity. PostgreSQL locks the terminal round and game, proves
the matching settlement, derives the next dealer/deadline, clears ephemerals
and outgoing identities, and publishes the next phase atomically. A private
durable claim returns the stored outcome to duplicates and makes a late replay
read-only after a newer dealer game. The complete scheduled function is the
disconnect recovery owner and must pass rollback proof as one executable unit.

## D-061 - Yahtzee score presentation is sequence-bound and supersedable

Yahtzee scorecard/dice highlighting and score narration are local presentation
of one committed score action, identified by its authoritative round and
action sequence. The presentation may hold across the server's already-
committed turn handoff so both clients see the scorer's static card and result.

That hold is never authority: when a snapshot with a later action sequence
arrives, the client must retire the exact score visual and exact rail event in
the layout phase before it paints the newer action. A lagged observer may show
the old score only until it learns the newer state. Roll narration is likewise
derived from the durable current actor for the full turn, while score narration
is a higher-priority bounded overlay for its matching sequence.

## D-062 - 3-5-7 leg reserve is player-owned and setup decline is exact

A purchased 3-5-7 leg is value owned by the player and displayed beside that
player. Its purchase debits the player's chips and increments the durable leg
count, but never credits the table pot. Terminal settlement returns all owned
leg reserve and separately awards the carry-forward pot. The immutable chip
projection therefore orders a normal final leg as `leg`, `sweep`, `transfer`;
financial conservation includes chips plus pot plus outstanding leg reserve.

After the exact postgame handoff has published a setup owner and configuration
deadline, that owner may decline only through a row-locked database transition
tied back to the committed outgoing dealer-game/round/hand identity. The server
marks the owner sitting out, derives the next dealer or waiting/terminal state,
clears outgoing transients, and records a durable result. Duplicate callers get
that result, and a late replay cannot alter a newer dealer game. Shared browser
cleanup is not an authority fallback, and the authority guard remains strict.

## D-063 - Dealer configuration is one shared exact-identity transition

The seven supported dealer-selected games share one authoritative
configuration-to-ante boundary. A browser never creates a dealer-game row,
cleans players, publishes the game identity/phase, and sets ante decisions as
independent writes. It submits the selected configuration plus the exact game,
dealer player, dealer position, and committed configuration deadline.

PostgreSQL locks that identity, validates caller/dealer ownership and the
game-specific configuration, creates the dealer game, resets player
ephemerals, auto-antes the dealer, and publishes the complete ante phase in one
transaction. A private durable claim returns the stored result to an exact
duplicate, rejects a different payload for the same identity, and makes an old
replay read-only after a newer dealer setup exists. The initiating browser
consumes the returned game/dealer-game/player snapshot directly; Realtime is
peer and reconnect synchronization only. Cleanup, configuration, or result
validation errors are surfaced and never treated as successful completion.

## D-064 - Semantic financial notices follow committed identity, not animation

For 3-5-7, `Pussy Tax!` and `Re-Ante` are consequences of exact committed
game/dealer-game/round/hand/transfer-cursor identities. Every live client that
observes one of those identities publishes the same deduped semantic event;
receiving a Realtime insert or launching a local chip flight is not eligibility
for the notice.

Local transport remains presentation-only. An animated batch may retire its
matching notice at the real settlement edge, while a client that legitimately
reconciles the cursor without replaying financial motion receives a short,
non-blocking rail lifetime. Neither path delays deal admission or progression,
and neither creates a second owner for balances, settlement, or chip movement.

## D-065 - 3-5-7 presents one exact database frame

A 3-5-7 browser may not compose live gameplay from independent game, round,
player, and private-card reads. PostgreSQL returns the published game pointer,
its exact `(dealer_game_id, hand_number, round_number, round_id)`, the decision
roster, and caller-visible cards from one MVCC snapshot. An active participant
without the complete card count fails closed; an observer may receive an empty
private hand.

Realtime events are level-triggered synchronization signals only. A standalone
successor-round INSERT does not advance presentation, and a games UPDATE does
not clear or rotate 3-5-7 card state before the exact frame arrives. The client
admits game, round, roster, card context, and cards together, rejects a slower
older request, rejects active identity regression or conflicting round IDs,
and uses no newest-round fallback. This preserves transport and announcement
presentation while eliminating client-dependent bootstrap at round boundaries.

## D-066 - A charged 3-5-7 Round 1 owns its opening transfer batch

The mutable `games.chip_transfer_cursor` is synchronization progress, not a
durable Round 1 identity. Before a charged 3-5-7 opening or re-ante RPC returns,
PostgreSQL must force the complete deferred transfer projector, verify the
resulting immutable ante batch, and store that cursor on the exact round row.
The initiating caller consumes the stored claim directly; Realtime only wakes
peer and reconnect refetches.

Duplicate and late callers return that round-owned claim even when later chip
movement has advanced the game cursor. A missing claim may be created only
from the same transaction's pending ante journal; it is never reconstructed
from the current game cursor. Existing history is backfilled only from an
unambiguous charge-result/batch mapping. Missing, ambiguous, or mismatched live
claims fail explicitly instead of parking a client presentation gate.

## D-067 - 3-5-7 terminal presentation retains exact round identity

Final settlement may publish `game_over`, but it may not erase the outgoing
3-5-7 round address. The exact `(dealer_game_id, hand_number, round_number,
round_id)` that produced the committed terminal result remains authoritative
through the connected-client win sequence. The same atomic frame therefore
contains the terminal disposition, completed round, caller-visible cards, and
settlement cursor without an active-identity regression.

Only the exact replay-safe postgame handoff clears the outgoing dealer-game,
hand, and round pointers while publishing the next setup or terminal
disposition. Realtime remains a refetch signal, and scheduled recovery remains
a fallback for disconnected or stalled presentation; neither is the trigger
that makes a connected browser able to observe terminal settlement. A
A pre-handoff `game_over` or `session_ended` frame missing its exact round
identity fails explicitly on both the database and client boundaries. A
postgame `session_ended` frame is valid only with the deliberately cleared
dealer-game, hand counter, and round address.

## D-068 - 3-5-7 postgame participation is part of the exact handoff

After terminal presentation, a 3-5-7 browser submits the exact settled
`(game, dealer game, round, hand)` identity directly to PostgreSQL. It does not
run shared browser leader election, participation mutation, transient cleanup,
or dealer derivation first. Every connected client may submit; one durable
claim commits the transition and exact duplicates receive its stored result.

The locked postgame transaction verifies terminal resolution and settlement,
then applies queued participation intent in the established precedence:
Stand Up, Sit Out, 3-5-7 auto-fold, then waiting/rejoin. Only the reconciled
cohort may influence make-it-take-it, dealer rotation, configuration deadline,
or waiting/session-terminal disposition. It also clears player ephemerals and
the outgoing dealer-game identity before publishing that disposition.

A human marked left remains authorized to replay this exact claim but cannot
use that status to initiate a different transition; unrelated callers remain
rejected. Stood-up bots are removed, while the private terminal resolution and
postgame claim retain the immutable winner UUID so deletion cannot erase the
authority identity. Realtime synchronizes peers and scheduled recovery remains
a disconnect fallback; neither is the connected-client handoff trigger.

## D-069 - Game recovery has one serialized scheduler owner

PostgreSQL recovery functions may retain independent game-specific authority,
but their cadence is published by one non-overlapping scheduled dispatcher.
The dispatcher runs complete recovery functions sequentially under a
transaction advisory lock; one-second owners run every tick and slower owners
are admitted from durable cadence state. Independent high-frequency cron jobs
must not compete for the shared Postgres/PostgREST pool.

Each task executes inside its own exception subtransaction. A failure is
persisted as one durable, rate-limited task claim and does not roll back other
successful owners or cause overlapping retries. Recovery proof invokes the
complete installed dispatcher, not only its helpers. A protected game may be
mutated only through the same narrowly scoped trusted server context already
recognized by its authority guard; scheduler consolidation never weakens that
guard.

Client recovery signals are game-capability-specific. An empty shared
`player_cards` projection can indicate a missing hand only for games that
publish through that table. Diagnostic persistence is explicit and scoped to
the exact mounted game family and identity; a diagnostic wrapper may not turn
ordinary presentation rerenders into database traffic.

## D-070 - Production diagnostics persist invariants, not normal activity

Ordinary transitions, presentation renders, polling, expected snapshot
rejection, and guarded duplicate work are silent unless an exact forensic
channel is explicitly enabled. They may not create continuous production
database traffic.

A true invariant violation always persists through the canonical
`debug_events` owner, independent of a browser debug flag. The writer dedupes
the same exact game/round/hand/invariant edge for a short bounded window so a
single broken state remains visible without amplifying database pressure.

## D-071 - Yahtzee holds are one replaceable authoritative mask

A human Yahtzee client presents hold intent immediately and replaces one
desired five-die mask as taps continue. PostgreSQL commits that full mask under
the exact round and action-sequence guard; an identical replay is read-only,
and roll or score drains the latest pending intent before acting.

Per-die requests may not lock the entire dice row or silently discard a later
tap while network work is in flight. Optimistic presentation never becomes
authority: rejection restores the last committed mask and refetches the exact
round.

## D-072 - Expiring game phases are registered database work

Every gameplay, setup, ante, and postgame deadline that can change persistent
state is registered under exact authoritative identity and drained by the one
serialized PostgreSQL scheduler. A browser may submit intent or request an
idempotent early drain, but it may not own expiry, reset the clock on remount,
or be required for progression. Registration is generation-guarded,
replay-safe, and cancelled at game, dealer-game, round, or actor identity
boundaries.

Pause/resume is one authenticated database mutation that suspends and restores
all registered deadlines together with their authoritative source fields.
Fresh admission trusts current database phase and deadline state: expired
setup/ante UI does not remount, already-ended or confirmed-missing sessions go
directly to the lobby, and connected clients that observed the live terminal
scope retain the canonical Session Ended phase.

This ownership rule does not create a timer where game policy has none. Gin
Rummy and Cribbage human decisions remain untimed until a separate real-money
rule is chosen. Deterministic scheduled progression such as Cribbage's forced
`go` is recovery of an already-forced state, not a player timeout.

## D-073 - Network simulation is not a game-rule harness

Harnesses Mode gates only configured profiles that alter game rules, cards,
dice, scoring, or presentation progression. A signed-in user's
`profiles.network_sim_mode` independently controls local Realtime delivery
delay, reordering, and simulated disconnect behavior; disabling game
harnesses may not silently disable that transport simulation.

Network simulation remains client-local and cannot mutate payloads or become
gameplay authority. Its persistent logging preference is independent as well.
No separate global network gate is inferred from the game-harness setting.

## D-074 - A visible game action has one writer-admission owner

A game control and its mutation handler must consume the same synchronous
writer-admission decision. Rendered booleans and effect-maintained callback
refs may not become competing gates: their timing can diverge during an
identity, freeze, or presentation edge and reject an action the UI just
enabled.

For Cribbage, admission requires the exact render/current hand boundary,
writer/auth identity, presentation/auth identity, and the shared sync
framework's ref-backed `canInteractNow()` verdict. This client containment is
not gameplay authority. The exact-round PostgreSQL RPC still authenticates,
locks, validates phase and ownership, applies the action atomically, and
publishes the authoritative result.

## D-075 - PvP financial pacing follows exact visible presentation identity

A committed player-to-player batch may wait behind a presentation prerequisite
without changing settlement truth. For a 3-5-7 multi-stayer showdown, one exact
game, dealer-game, round, hand, result, stayer set, and transfer cursor owns the
opponent-card boundary, reading dwell, batch admission, and result announcement.
When Secret Reveal is enabled, permitted opponent faces paint before the
configurable dwell begins; transfer and announcement then release from the same
ready identity. When Secret Reveal is disabled, both are immediate and the
dwell owner is inert.

Holm Rabbit Hunt keeps Pussy Tax movement and narration concurrent with cards
3 and 4. Its configurable post-reveal dwell begins only from the canonical
community row's exact final-flip completion receipt and delays only the
continuation acknowledgement. It may not delay tax admission, replace the
result/transfer/final-card joins, choose or activate a successor, or become a
database settlement clock. Both timing values are bounded Game Defaults;
PostgreSQL remains the owner of balances, cursors, successor preparation, and
disconnect recovery.

## D-076 - Forced absence is distinct from voluntary Sitting Out

Sitting Out continues to retain a physical seat. A server-owned setup timeout
may create a private exact-player forced-absence watch only after a settled
postgame boundary. A qualifying heartbeat after that timeout retires the watch
and preserves ordinary Sitting Out; three server-measured missed windows instead
commit canonical Stand Up. The client may not infer or author either outcome.

Browser visibility is presence evidence, not departure evidence. Active or
never-seen tabs keep the fast postgame absence lease, while the latest hidden
heartbeat receives a bounded configurable grace that tolerates browser timer
throttling. All leases use actual server write timestamps. Session abandonment
remains legal only at settled postgame Waiting and continues through the one
serialized database recovery owner.

Terminal status may arrive before terminal presentation finishes. While an
exact `game_over` or `session_ended` presentation signal remains active, the
gameplay seat ring stays the sole mounted owner; only true completion permits
the single handoff to the pre-session seat layer.

## D-077 - Waiting presence leases are phase- and role-specific

D-076's forced-versus-voluntary distinction remains, but its postgame lease
policy is superseded here. Initial Waiting begins only after the first seated
human exists: a waiting human releases after five minutes without a database-
stamped heartbeat, and zero seated humans deletes only a proven-pristine
session. Returning to Waiting after leaving that initial phase is Subsequent
Waiting even when a setup timeout occurred before the first result.

On Subsequent Waiting, a timer-forced sitter releases after 15 seconds without
heartbeat, a voluntary sitter after 60 seconds, and an active human becomes
involuntarily Sitting Out after 60 seconds before receiving the 15-second
release confirmation. A heartbeat after any forced claim cancels stand-up but
does not reactivate the player; they retain the seat as Sitting Out and opt back
in normally. Visibility does not select a different lease.

Session disposition counts seated humans, not active eligibility or bots. Zero
seated humans ends a Subsequent Waiting session through its financial-safe
terminal path; a connected sitter keeps it open. Releasing the host atomically
transfers host identity to the deterministic next seated human. Live gameplay,
setup, ante, and terminal presentation remain outside the Waiting reconciler.

## D-078 - Serialized recovery owns admission, not unbounded task waiting

The platform retains one non-overlapping recovery dispatcher to protect the
Postgres/PostgREST pool. Each child owner has its own exception boundary and a
bounded lock-wait budget, so a locked Holm, Cribbage, Gin, Yahtzee, 3-5-7,
Horses/SCC, canonical-timer, or abandonment row cannot convoy every later
game. A bounded failure retries on the normal future tick; it does not create a
second scheduler, polling owner, or client progression path.

Task-level duration and failure evidence is durable and private because a cron
job's successful outer statement cannot prove every isolated child succeeded.
The dispatcher task list is cumulative architecture: replacing its runner must
preserve later-added owners such as `canonical_timers`.

## D-079 - Holm continuation waits for the current actor, not every cosmetic client

Settlement still prepares one exact non-actionable successor and the database
still owns activation, deadline, replay protection, pause, fallback, and
financial state. Normal release requires the exact prepared hand's current
actor to reach the canonical deal-ready boundary. Other connected clients may
finish that same immutable presentation locally; their animation completion is
not global gameplay authority. A bot actor is ready by definition, while a
missing/disconnected human actor retains the existing database fallback lease.

A true dealer-game/round/hand identity boundary outranks every within-hand
presentation latch. Solo and Chucky caches, reveal counters, ownership refs,
and admission stages must hard-reset even if the prior reveal was incomplete;
no cosmetic artifact may cross into the prepared successor.

## D-080 - Cross-country testing impairs the shared transport continuously

Cross-Country Chaos belongs beneath the shared Supabase client, not in selected
game callback wrappers. It must affect every HTTP request and every Realtime
channel on that client with one deterministic, client-specific, continuously
cycling schedule. An offline phase closes the actual Realtime socket so normal
channel status, resubscribe, and authoritative snapshot recovery are exercised.
Radio stalls may hold inbound delivery, but WebSocket message order remains the
order provided by the socket.

The harness may fail an HTTP operation before delegation or discard the
response after exactly one delegation, and may never retry writes. The latter
models the real ambiguous-commit boundary: the database may have committed
while the client believes the request failed, so recovery must come from an
authoritative snapshot. This preserves the database as gameplay and financial
authority and prevents the test tool itself from creating duplicate mutations.
Profile control and simulation telemetry bypass impairment so Chaos remains observable
and locally reversible even during its own offline phase. The harness may expose
phase/cycle status, but it may not add a polling owner, fabricate state, advance
gameplay, or replace the existing reconnect snapshot path.

## D-081 - Supplemental gameplay channels reconcile from the central recovery receipt

Every gameplay-critical supplemental Realtime subscription must close its
fetch-before-subscribe blind window with an exact authoritative snapshot on
each `SUBSCRIBED` edge. A private-state or dealer-game identity owner may not
assume that recovery of the central public game channel also repaired its own
local projection.

The central game subscription remains the only owner of fallback polling. A
successful reconnect, visibility resume, BFCache restore, or fallback snapshot
emits one local recovery receipt; mounted supplemental owners perform their own
exact read from that receipt. Full central snapshots are serialized and trigger
bursts coalesce, so they do not race. Supplemental reads retain anti-regression
admission; when reads were already in flight, a newer failed request must not
suppress an older successful authoritative result merely because the newer
request started later. This receipt
does not carry gameplay data, advance state, add a scheduler, or replace the
database as authority.

## D-082 - Holm connected and disconnected postgame share one database owner

A completed Holm presentation may submit only the exact game, dealer-game,
round, and hand identity. It may not elect a browser leader to consume queued
participation, derive the next dealer, clear the outgoing dealer game, or
publish the next lifecycle phase.

`public.holm_advance_postgame` validates session admission and exact round
identity, then delegates to the same private, replay-safe standard-postgame
owner used by the canonical timer. That owner requires the completed Holm
round and its single `chucky_final_award` settlement before mutation. The
existing durable claim dedupes connected clients, timer recovery, and late
replays. Presentation still decides when to submit while connected; Holm's
database recovery deadline is derived from the non-null
`game_defaults.holm_presentation_ack_fallback_seconds` value so normal result
and chip presentation is not raced by a shorter shared literal. Horses and
Ship/Captain/Crew retain their 15-second recovery deadline. Recovery never
depends on a surviving browser.

## D-083 - Dice completed-round progression is one exact database decision

Horses and Ship/Captain/Crew clients may submit only the exact game,
dealer-game, round, and hand identity after persisted dice reach complete.
They may not claim a tie in `games`, insert tie history, deduct re-antes, create
the successor round, or settle a winner through browser-authored multi-write
chains. `public.horses_scc_advance_completed_round` re-evaluates the persisted
dice and delegates to the same atomic tie-rollover or terminal-settlement owner
used by no-client recovery.

Connected win presentation similarly submits exact identity through
`public.horses_scc_advance_postgame`. That wrapper and the canonical timer use
one durable standard-postgame claim, which admits only an exact completed dice
round with one matching `horses_terminal` settlement. Browser leader election,
participant evaluation, dealer rotation, and client fallback timers are not
Horses/SCC progression owners. SCC retains its separate 6-5-4/cargo rules;
shared authority does not merge game semantics.

## D-084 - Liveness is proven by authoritative progress, not transport health

A subscribed WebSocket, a completed animation callback, or a response-start
order is not proof that a client has recovered. A game is live only when the
client has successfully reconciled a complete authoritative snapshot and its
presentation-only barriers can be derived from that snapshot.

Full game snapshots therefore run serially and coalesce burst triggers. A
failed newest request cannot invalidate an older successful result. Recovery
polling remains armed only while the Realtime channel or its full catch-up is
unhealthy, and it stops after one successful snapshot; it is not a gameplay
progression owner.

Skipped historical presentation must reconstruct its exact settled baseline.
It may not claim readiness with an empty ledger, and persistent cross-country
routes must classify entry from the preceding hydrated game type rather than
from component mount alone. Every browser-authoritative timeout or whole-state
repair is prohibited when an exact database action/recovery owner exists.

## D-085 - Real-money admission requires a healthy recovery owner

A new real-money dealer game may cross the atomic configuration-to-ante
boundary only while the single serialized database recovery owner has a fresh
successful completion heartbeat, no active task failure, and no overdue exact
timer for that unpaused session. The guard fails the entire setup transaction;
it may not partially publish a dealer game, ante, or financial state.

This is an admission circuit breaker, not a second scheduler. It does not pause
or advance an existing game, and paused games are excluded from stagnation
inspection. Gin and Cribbage human turns remain explicit untimed exceptions.
When authoritative client state expects a visible action but its presentation
surface is absent, the client may request one serialized authoritative
snapshot for that exact identity. It may not infer or submit the missing move.

## D-086 - An authoritative row receipt is indivisible at client ingestion

A PostgreSQL Realtime UPDATE is one authoritative row image. The client must
merge that image before running field-specific side effects; it may not choose
one present column such as `status` and silently discard simultaneously
committed dealer-selection state, result identity, timer state, or financial
cursor. A newer row receipt invalidates any older in-flight full snapshot, and
strictly older row timestamps cannot regress the local projection.

An initiating action must consume an exact committed RPC result when the
database returns one. Realtime remains peer synchronization and the serialized
full snapshot remains reconciliation; neither is a reason to delay presentation
already proven by the caller's database receipt. Presentation may gate its own
ordered stages on exact durable cursors and generation-matched animation
completion, but it never becomes financial or gameplay authority.

## D-087 - An atomic multi-table frame outranks each constituent row

When a game exposes one exact database projection that joins gameplay identity,
round state, roster state, and caller-private cards, that projection is the
only publishable active gameplay frame. A constituent Realtime row remains an
authoritative change notification, but it may only request a new exact frame;
it may not be merged into the active projection or invalidate an in-flight
exact-frame read.

This is a narrow refinement of D-086, not permission to discard ordinary row
receipts. Complete `games` rows remain directly publishable for every game
without an atomic frame and during shared pre-hand lifecycle phases. The
current exception is active 3-5-7. Its live-versus-historical deal provenance
is route evidence: an already-mounted route that witnessed pre-hand lifecycle
is live even when 3-5-7 is DG1, while a cold mount first observed in active
gameplay reconstructs without replay.

## D-088 - Body-portaled HUD peers require body-portaled blocking overlays

A full-screen overlay that must cover HUD Stack row 2 must mount beside the
tab-rail portal on `document.body` and use a named `SHELL_Z` band above
`HUD_TAB_RAIL`. A large descendant z-index cannot escape an ancestor stacking
context and is not valid proof of shell-wide ordering.

## D-089 - Holm terminal continuation requires the exact award receipt

A connected Holm client may submit terminal postgame only after two
identity-matched presentation receipts exist: the Chucky-win celebration has
completed and the immutable `chucky_final_award` transfer cursor is durably
`settled` or `reconciled`. A presentation-only clock, effect completion, or
result string is not sufficient financial-presentation evidence by itself.

The stage classifier derives this award from the exact pot-to-recipient
topology, winner UUID cohort, amount, and published cursor even though the
database journal reason is `transfer`. Unclassified Holm pot awards fail
closed. Reconciliation may release a reconnect without replaying financial
motion; if no browser obtains both receipts, the existing 15-second canonical
database timer remains the sole liveness fallback and converges on the same
replay-safe postgame claim.

## D-090 - Durable multi-wave results are presented locally without becoming progression authority

When PostgreSQL resolves a bounded multi-wave result atomically, connected
clients may derive an ordered presentation from authoritative wave identity.
For the session dealer draw, `preparedAt` identifies the receipt and each
card's `roundNumber` identifies its cumulative visual wave. A wave is complete
only after every expected card reaches the real DOM; stale or duplicate wave
acknowledgements cannot advance the presentation.

The database lifecycle never waits for client acknowledgement. A live client
may withhold its own successor modal until its final presentation dwell
completes, while the canonical database timer continues to guarantee progress
for delayed or absent clients. Cold mounts already beyond the presentation
phase do not replay the historical result.

## D-091 - Destructive test fixtures are exact-owner, expiring, and one-shot

A production smoke fixture that changes authoritative game input may not be a
global source patch or a persistent game profile when either can leak into an
unrelated session. The session dealer-draw tie fixture is armed only by an
authenticated admin, matches the exact `games.current_host` user id, expires
after ten minutes, locks its request with the game, and atomically records the
single consuming game before commit.

The fixture changes only deck order. The existing database rank loop, stored
result, timer, winner, and continuation remain authoritative. It is deliberately
independent of the persistent `harnesses_mode` switch because enabling that
switch would activate other saved profiles; arming or consuming this fixture
must leave that global gate byte-for-byte unchanged.

## D-092 - Terminal truth does not prove terminal presentation

An authoritative terminal result may settle before a connected browser paints
the cards and announcements that explain it. Celebration admission therefore
requires exact, hand-scoped visual receipts; a result string, terminal status,
or a vacuously complete unhydrated branch is never a substitute.

A local terminal presentation trigger remains identity-bound and live until
its real completion callback. If the table remounts while the authoritative
postgame handoff has a null dealer-game identity, that trigger may resume only
its immutable outgoing descriptor. Completion removes the trigger, and a
different concrete dealer game rejects the stale descriptor. This provides
remount recovery without an arbitrary timer or historical replay.

## D-093 - Contract coverage and two-client browser liveness are separate evidence tiers

A source assertion, pure state permutation, mocked transport, or component
render test may prove a useful invariant, but it is not evidence that two real
browsers survive cross-country disorder. The fast Vitest liveness contract is
retained for focused regression feedback; only the Playwright tier may claim
that it exercised independent authenticated clients, real application routes,
Supabase HTTP/Realtime traffic, a full route remount, and visible DOM recovery.

The browser tier always uses two distinct humans and fake-money sessions. It
may impair one browser's transport, including discarding an RPC response after
the database processed the request, but it may not enable bots, Real Money,
global rule harnesses, polling, hidden progression APIs, or a second gameplay
owner. Every game type runs independently so one failure does not suppress the
remaining evidence. Cleanup uses the existing database-guarded admin Blast
path and is mandatory; missing credentials, authority acknowledgement, or
cleanup fail the run closed.

## D-094 - Browser reconnection fans out exact recovery before full reconciliation

The browser `online` edge is an authoritative recovery trigger, not proof that
the current client projection is complete. It immediately fans out the
existing game-specific exact loaders and independently requests the serialized
full game snapshot. A slow or failed full snapshot may not prevent a Gin,
Cribbage, Holm, 3-5-7, or dice loader from recovering the exact private or
round state needed to render a legal action.

Each loader retains its existing game, dealer-game, hand, round, and monotonic
progress admission guards. The online event does not infer an action, advance
gameplay, replay financial movement, or install polling. Duplicate recovery
receipts are harmless because exact identity and semantic equality remain the
admission boundary.

## D-095 - Cribbage cut presentation provenance is hand-scoped

Route entry mode remains the authority for opening-table presentation, but it
must not decide a later hand's cut presentation. For each hand, only a client
that observed a pre-pegging phase may wait for its local discard/cut sequence.
A peer first arriving in pegging with an exposed authoritative cut reconstructs
that cut and crib from the authoritative facts and releases its controls.

This is presentation-only recovery: it neither infers a player action nor
changes database, scoring, settlement, or financial authority.

## D-096 - Parallel browser gauntlets require isolated evidence and account-pair leases

A concurrent browser result is admissible only when the worker has a unique
run namespace and a named identity slot. The harness isolates Playwright
artifacts by namespace, writes the generated fake-money game UUID and guarded
cleanup receipt to output, and locally leases a hash of the selected human
pair. A second local worker selecting the same pair fails before it can create
a session.

This is harness safety, not gameplay authority. It does not create test users,
change a product row, relax fake-money-only cleanup, or convert an
inconclusive concurrent artifact into evidence about the application.

## D-097 - Client-independent liveness is exact-identity authority work

Every persisted gameplay deadline must have a database/service recovery path
for every timed actor class, including humans. Recovery reuses the existing
authoritative action owner, locks the exact round, and requires the persisted
deadline plus action sequence to match before it acts. A service-only timeout
action may not broaden the ordinary authenticated action surface.

Presentation latches may retain an outgoing table only while they belong to the
current authoritative terminal frame. Once authority enters setup or rotates
dealer-game identity, a missed presentation callback is stale local state and
cannot block the next legal surface. Likewise, optional defaults or preference
reads may improve setup values but may never gate an already-persisted setup
deadline or hide the action surface behind an unbounded request.

## D-098 - A named realtime channel has one mounted owner per route tree

Realtime channel names are client-wide identities. Two independently mounted
hooks using the same name can cause the later hook to add a callback to the
already-subscribed channel, which Supabase rejects at runtime. Route-level
state that is shared by a parent and child therefore has one subscription
owner; descendants receive the resolved primitive state as props. This removes
duplicate callbacks, duplicate reads, and a post-login blank-route failure
without giving presentation a second authoritative owner.

## D-099 - Human-chaos browser evidence is production-targeted and wire-verified

The human-chaos suite is an evidence tier for two live browsers, not a local
frontend convenience test. Its commands therefore use the deployed HTTPS
production frontend and require the first observed Supabase runtime origin to
be the owned production project. Local Vite and a caller-supplied alternate
backend fail before any table is created. This prevents a write-locked retired
cutover source from being misclassified as a current gameplay or liveness
failure while retaining fake-money-only creation and database-guarded cleanup.

## D-100 - Session start is an atomic database transition

Start Game is not a browser choreography. `public.begin_session_dealer_selection`
is the sole authoritative owner of the waiting-session roster admission,
two-player topology normalization, lifecycle reset, and status flip. The
existing canonical timer trigger then owns high-card preparation/completion.
Duplicate requests are replay-safe; authenticated-host authorization and
non-waiting rejection are decided under the same game-row lock.

## D-101 - Prepared-hand readiness is level-triggered from authoritative identity

A prepared Holm successor acknowledgement is bound to the database-authored
dealer game, predecessor round, successor round, and hand number. The visual
completion callback and the authoritative fetch may arrive in either order;
installing a new exact prepared identity must wake the idempotent
acknowledgement drain so a callback/ref race cannot lose the next actor's
readiness receipt. The database remains the activation owner and retains its
missing-client recovery lease.

## D-102 - A vanished dealer-game identity is a hard presentation boundary

When an authoritative fetch clears or rotates the current dealer-game identity,
a game-specific sync projection from the outgoing dealer game cannot remain an
active gameplay surface. The route clears that projection and its lifted
gameplay caches while preserving the single canonical table, HUD, waiting/setup
surface, and any terminal presentation that has not yet reached the
authoritative postgame transition.

## D-103 - Hidden-card optimism cannot admit a reveal surface

An optimistic Gin action may improve the initiating player's responsiveness,
but a caller-specific projection with masked opponent cards cannot be used to
construct or paint an opponent reveal. Knock presentation waits until every
opponent face required by the display is known in the authoritative post-action
projection. Redaction remains server-owned, and the client neither infers nor
stores hidden card truth.

## D-104 - Real-money Yahtzee expiry pauses; fake-money expiry may auto-play

An expired Yahtzee turn in a real-money session is an interruption, never a
bot decision. The service-only due-turn owner locks the exact round, player,
deadline, and action sequence; resets one full server-owned turn window; then
uses the canonical game pause owner. No roll, hold, score, turn advance, or
settlement occurs. Fake-money Yahtzee retains deterministic automatic recovery
for harnesses and casual sessions. On real-money resume, canonical pause
bookkeeping shifts the fresh deadline by the paused duration.

## D-105 - Yahtzee timing is turn-scoped, not roll-scoped

One Yahtzee deadline belongs to the complete player turn: up to three rolls,
holds, and one category score. Rolls and holds must preserve its exact
authoritative identity; only a successful score assigns a new deadline to the
next eligible player. A late human action is rejected so it cannot race the
due-turn owner.

For fake money, timeout recovery marks the timed-out human auto-roll and
sit-out-next-hand, then completes the remaining turn atomically through the
existing authoritative action reducer. This is an automation preference, not
a change of human identity. The same player can explicitly clear both flags
from the visible Auto-roll rejoin control. Real-money expiry remains pause-only
and never writes either automation flag.

## D-106 - Gameplay request locks follow authority, not animation

An action's local single-writer gate remains closed until its authoritative RPC
settles or exact hand/phase identity makes the request obsolete. Presentation
animation may finish, skip, or cancel independently and may not reopen gameplay
admission.

Where an action RPC already validates an immutable expected sequence and returns
the caller-specific current projection, the client submits that intent directly
instead of inserting a separate state-read preflight. Bounded retries reuse the
same immutable identity. Presentation-only progress writes are single-flight and
coalesced so they cannot congest authoritative lifecycle actions.

## D-107 - Rare-rule fixtures are exact-game private authority inputs

A production fake-money rule fixture may select an existing authoritative rule
profile only when its request is keyed to one session UUID, armed by an admin
who is an active participant, bounded to the required human topology, expiring,
and atomically consumed once by the existing database state owner. Real-money,
terminal, stale, malformed, and cross-game requests fail closed.

The consumed profile may live in private state only for the hand that needs it.
Public/projected state strips the campaign marker, ordinary successor hands do
not inherit it, and neither the global harness gate nor configured global
profile is changed. Browser evidence must prove consumption and explicit
cancellation/cleanup; deterministic gameplay completion cannot override an
unmarked observer-budget breach.

## D-108 - Authoritative cards are not a live deal-wave receipt

For a live 3-5-7 transition, persisted private cards prove gameplay state but
do not prove that their canonical card transport has started or completed.
`PRE_DEAL` and active flights remain claim-only presentation phases. The
authoritative fallback may open only after the exact cumulative wave was
registered, that client observed its intents in flight, every intent became
inactive, and the local settled ledger is still incomplete. This preserves
lost-receipt liveness without allowing early card paint or replacing transport
with a timer. Historical/rejoin reconstruction remains a separate explicit
entry mode.

## D-109 - Recovery cadence admits work; heartbeat presence never owns safety

The single one-second database scheduler remains the only recovery heartbeat,
but an idle tick does not invoke every game owner. Exact due state admits its
owner immediately, and one complete owner rotates through a slower safety lane
on every tick. This prevents a slow game scan from being multiplied across all
games while retaining bounded recovery for fake money, disconnected clients,
stale heartbeats, legacy rows, and postgame continuation.

A browser heartbeat may be useful evidence but is never the prerequisite for
timeout, pause, settlement, abandonment, or replay-safe recovery. If an
admission predicate cannot classify a legacy row, the dispatcher runs that
owner through its established isolated failure boundary instead of allowing
the optimization to suppress authority work.

## D-110 - One exact 3-5-7 wave token opens both presentation and gameplay

The route owns one identity-complete 3-5-7 deal-readiness token and supplies it
to both the timer and decision/presentation surface. A table-local mirror is
not a second readiness owner: separate commits can otherwise admit actions one
render before the timer or keep the timer blocked after cards are actionable.

Rounds two and three are cumulative gameplay hands but exact presentation
waves. Their already-presented authoritative cards are the stable baseline;
only card IDs belonging to the current dealer-game/hand/round wave may extend
that baseline. Readiness still requires the exact transport lifecycle (or its
strict inactive missing-receipt recovery), and neither cards nor a timer may be
admitted from a prior or future wave.

## D-111 - 3-5-7 decision reveals share one authoritative clock

When every eligible 3-5-7 decision is committed, presentation derives one
pause-aware reveal window from the exact durable round-resolution identity.
The current frame and final decision receipt expose the same server timestamps;
receipt-relative timers, duplicate-delivery restarts, and client acknowledgments
may not own the ritual or progression. Late clients enter the current beat and
expired clients skip it.

Through `3 → 2 → 1`, all decision-bearing surfaces remain sealed. DROP opens
every decision together, after which the existing result and continuation flow
resumes. The felt artifact is a dedicated theatrical stack: canonical card-back
artwork with presentation-owned responsive sizing, one-pixel capped depth, no
fan/rotation/spread, and one whole-stack DROP animation. Ordinary canonical
card-stack geometry does not constrain this surface.

The same projection includes a short sealed lead-in before the numeral cadence
so a client receiving the final decision just after resolution still has a fair
chance to see `3`. The local HOME stack is a rail-adjacent variation of the
same artifact, not a different seat owner. Once the ritual owns a resolved
round, ordinary seat cardbacks remain suppressed until the exact round identity
changes and the normal deal path begins again.

The nonterminal recovery envelope must outlast the entire ritual plus its
result dwell. The current cadence is a one-second sealed lead-in, three 900 ms
numerals, a one-second DROP impact, and a 600 ms tableau hold, followed by the
existing four-second result dwell. The local stack center is the canonical
player-to-player transfer destination itself; presentation may decorate that
endpoint but must not shift it inward toward the pot.

Every result-presentation owner, including ordinary and terminal leg awards,
must use this same gate. Raw settled result text and player-leg deltas may be
observed for authority and recovery while the ritual is active, but neither
may create or consume an award presentation until the tableau has expired.
# D-128 — coherent gameplay frames and independent revisions (2026-09-04)

Active gameplay for every family is admitted from one coherent database frame;
Realtime game rows request catch-up. Persisted per-row counters, plus compact
deletion tombstones, compose a monotonic session revision without introducing
new session locks in action paths. Snapshot revision and gameplay progress are
independent: older revisions and conflicting equal-progress content are rejected.
Private card projections retain actor masking and carry the same revision domain
on reads and action responses. Round-scoped dice receipts use the stamped round
revision. Existing presentation contracts and identity resets remain unchanged.
# D-129 — isolate recovery by session and consolidate catch-up (2026-09-04)

The existing single dispatcher remains the durable owner. A malformed work unit
rolls back independently, records its exact session/round and retries with bounded
backoff. A failed session does not poison other sessions' family health. Retired
hand errors do not block a successor. Owner calls restore all authority/JWT
context on success and failure. Client safety reads share one schedule and one
serialized loader; they never repair gameplay by writing state. Both legacy Edge
deadline entrypoints are permanently inert HTTP 410 handlers.
# D-130 — cryptographic server outcomes and three-player crib (2026-09-04)

Persisted game outcomes use pgcrypto entropy under existing database authority.
Bounded integer draws reject the incomplete modulo interval; shuffle keys use
128 random bits. Client-supplied seeds/outcomes cannot control those draws.
Deterministic harnesses remain explicitly fake-money only. This contract does
not claim publicly verifiable randomness or independence from database operators.
PostgreSQL documents `gen_random_bytes` as cryptographically strong and `random()`
as unsuitable for cryptography: https://www.postgresql.org/docs/current/pgcrypto.html

Jeremy chose a four-card crib for three-player Cribbage. At the last discard the
server selects a fourth undealt card separately from the starter, then persists
both once. Existing two/four-player behavior and scoring are preserved.
# D-131 — Enforce composite session identity, preserve historical provenance gaps

Games.current_game_uuid, rounds.dealer_game_id and non-null snapshot dealer IDs
must belong to the same session. Validated deferred foreign keys preserve atomic
genesis and full fake-session deletion. New snapshots validate participant UUID,
session and user; active dealer identity is required. Historical null identities
and missing participants remain evidence, not candidates for inferred backfill.
Existing unique non-null snapshot keys continue to provide settlement replay
identity. Proof: session_identity_constraints_rollback_proof.sql and full suite.
# D-132 — Make validation enforce the deployed authority contract

The release build requires an explicit application typecheck and all src unit
suites before bundling. Tests now describe current transport/authority owners,
including retired browser writers and late game/round action receipts. Generated
types and Edge inventory are reconciled to the current project. Migration history
is mapped by actual body/name, not assumed equivalent from counts or timestamps.
Anonymous privileged functions are closed while effective authenticated/service
grants remain unchanged; five read-only RLS predicates are the explicit exception.
The historical -$6 discrepancy is preserved and is not considered repaired.
