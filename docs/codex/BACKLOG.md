# Backlog

Priority is ordered. Re-rank only for a current production blocker.

## P0 — release/correctness

### 1. Final iOS Session Ended long-list scroll

Status at handoff: accepted only after published iOS smoke.

Acceptance:

- felt-safe panel remains inside ellipse;
- one real WebKit-safe scroll owner;
- sticky Results title;
- Hap + 10 bots all reachable;
- short lists intrinsic;
- no page/HUD scroll.

### 2. Regression-proof Holm bot scheduler

Current fixes cover dropped wakes, missed realtime edges, remount, focus, visibility, and reconnect.

Codex follow-up:

- audit whether `makeBotDecisions` returns before its internal two-second delayed action commits;
- consider making promise lifecycle represent the actual authoritative attempt;
- preserve no-polling and DB exactly-once behavior;
- add a focused deterministic test only if existing test architecture supports it reliably.

### 2C. End-to-end Holm lifecycle seam audit

Status: Implemented on 2026-08-14; publication and two-client production smoke
pending. Requested during the multiplayer-showdown client-freeze investigation
and expanded after the paused `Candyman` dealer game proved one client could
fetch its exact H1 cards without ever opening local deal presentation.

- Inventory every Holm identity boundary and presentation handoff: dealer
  setup/ante, Buck transport, deal transport, betting and deadline enforcement,
  fold/all-fold, Rabbit Hunt/Pussy Tax, multiplayer showdown/table placement,
  immutable chip-transfer stages, prepared-successor acknowledgement/fallback,
  reconnect/remount, and dealer-game/session terminal flow.
- For each seam, prove the authoritative owner, exact dealer-game/round/hand
  identity, lifecycle reset, duplicate/replay behavior, disconnect behavior,
  and whether completion is durable/level-triggered rather than a lossy
  one-shot callback.
- Preserve the contract that authoritative deadlines continue independently of
  client presentation. A connected client must present hands in order, while
  a disconnected or stuck client must not block the server or another client
  from observing an enforceable current-turn timeout.
- Deliver a ranked land-mine report and bounded correction plan with focused
  race tests before changing additional product code. Do not use timers,
  polling, or per-symptom patches to bridge a missed identity transition.
- Partial result on 2026-08-14: the bounded nonterminal presentation/release
  identity audit found one repeated invariant violation across multiplayer
  showdown, Chucky loss, and Pussy Tax. Their one-hand plan latches included
  mutable transfer cursor even though exact cursor belongs only to batch
  completion/release evidence. The approved correction removes that duplicate
  cursor-bearing plan-key API and adds cursor-reordering regressions. The wider
  setup/Buck/deal/betting/reconnect/terminal seam audit then found three red
  boundaries: transient ante admission, non-reconstructable card-wave
  dispatch/settlement, and one-shot deal-ready acknowledgement. They now share
  one exact-hand presentation transaction: durable chip-cursor state,
  deterministic card manifests with provider-owned lifecycle snapshots,
  exact-hand settle filtering/remount replay, accepted-transport Buck timing,
  and a level-triggered prepared-successor acknowledgement drain. Holm endpoint
  readiness is DOM/lifecycle-driven with no elapsed-time release. PostgreSQL
  settlement, authoritative deadlines, the no-client recovery lease,
  Rabbit/Pussy/showdown completion barriers and table placement, and terminal
  flow were audited and preserved. Focused race coverage and the production
  build pass; keep this item open only until published two-client smoke accepts
  the full flow.

### 2A. Cribbage LAST HAND win presentation bypass

Status: Resolved and accepted in published production smoke on 2026-08-03.
Durable settlement and connected-client terminal presentation are clean.

- Production smoke reported 2026-08-02 on the Vercel build at commit
  `22da08820d453186a431088520100a88672b6782`.
- Repro: two-human real-money Cribbage, game to 1, `perpetual_heels`
  harness; host selected End Session for LAST HAND, discarded, then left;
  remaining human discarded and the cut card should have produced His Heels
  and the terminal win.
- Expected: the remaining connected client sees the cut-card/win/settlement
  presentation and Session Ended table phase before choosing Back to Lobby.
- Actual: the table unmounted and the remaining human was sent directly to the
  lobby. The session correctly appeared under Completed Sessions and balances
  were correct, proving durable terminal settlement and financial writes
  completed.
- Root cause: the persisted `phase='complete'` effect added with atomic
  Cribbage settlement invokes `cribbage_settle_game` immediately, while the
  His Heels presentation path intentionally keeps `winSequencePhase='idle'`
  until the cut-card reveal and `+2` rail item retire. The parent therefore has
  not yet observed `onTerminalPresentationActiveChange(true)` when the RPC's
  realtime `session_ended` snapshot arrives. `Game.tsx` treats the client as
  non-admitted, drops the Cribbage render branch, and then follows its existing
  fresh-mount/reconnect redirect path.
- Production evidence for game `9d69b82f-6a8f-4c89-92e0-c1efc688da07`:
  persisted terminal state was a Jack of hearts / `his_heels` win; the remaining
  client mounted `Hap: His Heels (+2)` at `14:13:32.147Z`, received
  `session_ended` at `14:13:32.599Z`, and unmounted the Cribbage table at
  `14:13:32.603Z`. Exactly one `cribbage_terminal` result recorded the expected
  `+10/-10` chip changes.
- Owned-Supabase preview smoke on 2026-08-03 reproduced the same remaining-
  client boot for game `4b6fce29-de49-4c68-8ff2-71d48d6d35d9`. Authoritative
  target state is `session_ended` with one `cribbage_terminal` result and
  exactly two distinct-profile SessionResult transactions of `-10/+10`
  summing to zero. This proves the presentation failure is deterministic across
  the source and target backends while durable settlement remains correct.
- Preserve the proven atomic settlement and direct-to-lobby behavior for
  genuinely fresh mounts of already-ended sessions. The correction should
  establish the route-owned live-terminal hold before the delayed His Heels
  presentation begins; it must not delay or return settlement authority to the
  client presentation sequence.
- Required contract clarification from Jeremy: immediate authoritative
  settlement is intentional and must remain independent of client presence.
  Settlement reaching `session_ended` must not itself tear down a table that
  was already mounted and observed the live terminal event. Any such connected
  client must retain the existing table, felt, seats, HUD, and round context
  through the complete game-specific win sequence, then enter the transient
  Session Ended table phase. Only a genuinely fresh mount/reconnect after the
  session is already ended should bypass presentation and go directly to the
  lobby.
- Initial hosting triage found the Vercel deployment `READY`, no Vercel runtime
  errors, and no application-source change in the cutover commit. Treat this as
  a client lifecycle/presentation defect unless contrary evidence appears.
- Implemented correction: `Game.tsx` now owns an identity-scoped Cribbage
  live-terminal latch before the child publishes animation liveness. The latch
  admits only the exact game/dealer-game/round/hand observed live on this mount,
  holds the existing table through the child-owned completion callback, and is
  absent on a fresh terminal mount. `liveTerminalPresentationHold.test.ts`
  covers live capture, sparse realtime rows, exact-identity rejection, fresh
  terminal mount, nonterminal release, and leaving Cribbage. No settlement,
  financial, timer, or database behavior changed.
- Production smoke on commit `7a9f56931996089f7775364993f5149f8763a2fe`
  proved the remaining client now stays at the table through cut reveal and
  celebration. The local active hand disappeared during the cut-card reveal,
  then reappeared when celebration began.
- Follow-up root cause: `isStaleCompleteAwaitingNext` in
  `CribbageMobileGameTable.tsx` classifies every `phase='complete'` render with
  `winSequencePhase='idle'` as an ordinary completed hand awaiting the next
  hand. A His Heels win intentionally has that exact presentation state while
  its cut reveal and `+2` rail item run, but it also has authoritative
  `winnerPlayerId`. The stale-hand guard ignores that terminal discriminator,
  enters bootstrap mode, and unmounts the Cards pane. Celebration moves the
  win sequence out of `idle`, which releases the guard and remounts the cards.
- Approved correction: exclude authoritative terminal-complete states
  (`winnerPlayerId` present) from the stale-next-hand guard, while preserving
  the existing suppression for ordinary non-winning completed hands. Add
  focused pure coverage for both sides of that boundary; do not change rules,
  settlement, timing, card data, or Session Ended admission.
- Published follow-up smoke on commit
  `f9c7b1ebba91287049916e4caa09d281ace3df5a` passed on 2026-08-03. The
  remaining connected client's hand retained continuity through the terminal
  cut-card reveal and win presentation. This closes the separate presentation
  defect without reopening the already-proven atomic financial settlement.

### 2B. Cribbage refresh replays the deal and temporarily drops crib backs

Status: Resolved and accepted in published two-client smoke on 2026-08-16.

- Refresh Player 1 after the deal, before or after that player's discard but
  before pegging. The deal presentation replays even though the authoritative
  hand identity did not change, and the existing crib card backs disappear.
  They return only when the other player discards; cut and pegging then proceed.
- A no-refresh run also reproduced the crib/presentation instability during the
  same incident window. Treat identity-before-state initialization and crib-back
  seeding as the suspected presentation boundaries, not as proven causes.
- Preserve the authoritative deal, committed discards, cut, scores, and the
  lazy counting successor correction. Reconnect must restore the current hand
  without replaying a completed deal or hiding already-committed crib cards.
- The accepted correction hydrates only the already-persisted partial crib on
  rejoin and leaves later live opponent growth available to the normal
  transport owner. Both committed cardbacks now survive refresh.

### 3. Remaining terminal-authority migrations

Yahtzee delivery status: server-authoritative bootstrap, rolls, holds, scoring,
atomic turn handoff, recovery, settlement, and exact-identity postgame
continuation are implemented. Migration
`20260816210000_yahtzee_authority_cutover.sql` plus the earlier settlement and
late-replay migrations are installed on the owned production database. The
client candidate consumes committed RPC results directly, rejects direct round
writes, and skips shared browser cleanup. The complete rollback proof and local
validation pass; published multiplayer authority smoke is pending. The earlier
two-human terminal-disconnect smoke remains a stable settlement/presentation
checkpoint. The separate missing winner-chip bounce is queued below.

Normal 3-5-7 delivery status: the atomic settlement RPC and connected-client
presentation latch are implemented. The full server-authority cutover in
`20260816213000_three_five_seven_authority_cutover.sql` is installed on owned
production: atomic bootstrap, decisions, expiry, round resolution and
continuation, terminal settlement, exact replay-safe postgame handoff, and
one-second recovery are database-owned. The complete scheduled recovery entry
point passed rollback proof before and after deployment. Published two-client
startup, disconnect, rollover, settlement, and successor-setup smoke remain
before this becomes a stable checkpoint.

Remaining game-by-game delivery order after 3-5-7 acceptance:

1. Horses + SCC as one shared dice-resolution delivery with separate rule
   validation and acceptance for each game.
2. 3-5-7 instant-win/initial-Round-1 residual seam.

#### 3-5-7 authority migration — deployed 2026-08-17

Status: Implemented and deployed; awaiting published two-client acceptance
smoke before stable-checkpoint promotion.

- `three_five_seven_begin_game` locks and validates admission and antes,
  commits the opening round/deal, and returns the committed result directly to
  the initiating client. Bootstrap no longer depends on a self-delivered
  Realtime event.
- Exact-identity decision, expiry, resolution, continuation, settlement, and
  recovery transitions reject browser-authored gameplay truth. The rollback
  proof executes the complete scheduled recovery entry point and covers winner,
  tie, all-fold, duplicate, replay, late-replay, authorization, continuation,
  and terminal cases.
- `three_five_seven_advance_postgame` locks the terminal round and game, proves
  the exact committed settlement, derives the next dealer/deadline, clears the
  outgoing identity, counters, and player ephemerals, and publishes the next
  disposition atomically. Its durable exact-identity claim returns the stored
  result to duplicate callers and prevents an older replay from changing a
  newer dealer game. The 3-5-7 client skips the shared transient-reset owner,
  and cleanup/advancement failures now propagate.
- Smoke follow-up `20260817131736_fix_357_leg_reserve_and_setup_decline.sql`
  is installed. Purchased legs now debit only the owner into visible leg
  reserve and never enter the pot; terminal settlement projects ordered
  `leg`/`sweep`/`transfer` batches without creating value. Setup-owner Sit Out
  now uses its own exact committed-handoff RPC and durable replay claim rather
  than shared browser cleanup. The Make It Take It toggle requires the returned
  persisted setting row before reporting success. Two-client published smoke
  must recheck all three observations before checkpoint promotion.
- Published smoke follow-up, 2026-08-17, session `Aug 17 - Albert Almora`:
  Happach Gmail's self hand remained invisible at DG2/H2/R1 while the peer
  dealt normally. Jeremy paused the game at the repro. Read-only evidence
  proves the round and both private three-card rows committed atomically with
  correct ownership. Happach's client mounted the exact H2 runtime but emitted
  6,891 consecutive `awaiting_ante_presentation_landing` deferrals: its
  transient ante-arrival delta had already occurred before the local admission
  gate armed, so no later edge could release the deal. Corrected on the
  approved 3-5-7 branch: the initiating client consumes the exact committed
  advance result and immediately refetches the new round/private cards; H2+
  Round 1 deal admission waits on that exact durable transfer cursor. Peers
  select the same committed identity after refetch, reconciliation releases
  without replaying historical financial motion, and a stale direct result is
  rejected across hand/dealer-game boundaries. Published resume smoke remains
  required before checkpoint promotion.
- P1 from the same smoke: at H1/R1 the decision timer and action buttons paint
  briefly when the authoritative betting row arrives, disappear when deal
  transport begins, then return at transport landing. The timer's boolean
  permission and the action-card predicate can both inherit the previous hand's
  ready state before the new hand runtime reports its identity. Gate both on an
  identity-matched DealRuntime readiness token; a prior hand's `true` value may
  never admit the new hand.
- P1 from the same smoke: when a player has two legs and wins the third, the
  static display briefly drops to one and the incoming third leg reads as a
  second. The terminal presentation enters its win phase using a cached
  pre-award count of two, then the generic pending-leg renderer subtracts one
  again. For a normal terminal descriptor, render the immutable final-leg
  baseline (`targetLegs - 1`) exactly once and let the award add the final leg;
  preserve nonterminal leg animation and instant-sweep behavior.

### 3A. Cross-game postgame continuation ownership

Status: Queued for each remaining game authority migration; recorded from the
Cribbage post-settlement freeze on 2026-08-16.

- The shared `Game.tsx:handleGameOverComplete` path still lets an elected
  browser derive the next dealer and write the outgoing dealer-game reset for
  non-Cribbage games. An atomic `status='game_over'` filter deduplicates a
  successful write but does not make the browser an authoritative lifecycle
  owner or make the derivation disconnect-safe.
- Cribbage now uses an exact-settlement, row-locked, replay-safe database
  transition. During every queued game authority migration, explicitly inspect
  that game's terminal-to-next-setup boundary and apply the same ownership
  rule where its lifecycle requires it. Do not change unrelated games through
  the Cribbage delivery.

### 3B. 3-5-7 disconnected winner during next-game setup

Status: Queued for a subsequent disconnect-lifecycle pass; reported during
production smoke on 2026-08-09.

- Scenario: Player 1 chooses Stay in 3-5-7, disconnects, and wins the terminal
  leg while Player 2 folds and remains connected. Player 2 must see the normal
  dealer-game settlement and the next-game setup state naming Player 1 as the
  setup owner; no client may have to be present for Player 1's setup timeout.
- Required continuation: server-side expiry moves the absent setup owner to
  Sitting Out, returns the connected player to the post-game waiting table,
  and preserves the normal leave/stand-up routes. If the remaining player also
  becomes absent, the authoritative abandonment reconciler must close and
  settle the historical real-money session exactly once.
- Preserve the separate current correction: the 15-second absence grace begins
  only after a completed session reaches post-game waiting, never while a
  dealer game or its setup/terminal presentation is live.

Requirements: database owns claim, payout, snapshots, disposition; idempotent settlement key; post-payout snapshot; disconnect-safe; client owns presentation only.

Every delivery must also include the connected-client half of the accepted
Cribbage model: immediate settlement may not tear down a table that observed
the live terminal identity. The route owns an exact-identity hold through the
game's full terminal presentation and true completion token; a fresh mount of
an already-ended session still goes directly to the lobby.

Source-proven ingestion findings:

- Cribbage's former multi-write terminal sequence was replaced by
  `public.cribbage_settle_game`; it is the completed atomic-settlement model,
  with the separate live-presentation acceptance tracked in 2A above.
- The former Yahtzee terminal result/snapshot writers used
  `yahtzee_state.currentRound` instead of the authoritative
  `rounds.hand_number`. After a tie rollover, the new round has hand 2 or
  greater while those writers still passed hand 1. The atomic settlement
  candidate removes that client authority and uses the round row identity.
- Yahtzee setup/start comments describe an ante or score-difference payout, but
  no ante enters a pot and terminal settlement transfers a fixed configured
  amount from each loser.
- Yahtzee was first because its elected client credited/debited chips, wrote
  result/snapshot, waited for presentation, and only then claimed terminal
  status. The delivered candidate preserves the actual fixed-stake rule and
  keys settlement to authoritative `rounds.hand_number`, not the JSON
  `currentRound` field that remains 1 after tie rollover.
- Normal 3-5-7 terminal settlement is now owned by
  `public.three_five_seven_settle_game`: it atomically claims the result, pays
  the winner, snapshots post-payout balances, resets terminal player state,
  and commits game/session disposition. The exact completed-round recovery
  correction is published as a candidate and awaits repeat production smoke.
- Gin terminal settlement is now `public.gin_rummy_settle_game`: it atomically
  writes the final hand-history row and terminal claim, moves chips, snapshots
  post-payout balances, and disposes the game/session. Published two-human
  disconnect smoke remains before it becomes a stable checkpoint. Configurable
  bonus discrepancies remain separate rule work.
- Horses and SCC share one controller and settlement sequence, so migrate their
  completed-round resolver together but retain explicit game-type winner
  derivation and separate tests. Their transaction must handle both sole-
  winner payout and tie rollover/re-ante; first-hand setup can remain separate.
- Preserve the already-atomic later-Round-1 `advance_357_round` sweep while
  migrating normal 3-5-7. Its missing post-payout snapshot, broad function ACL,
  initial-Round-1 client path, and incomplete-round re-ante repair remain the
  final residual slice rather than expanding the normal-terminal correction.

### 3D. 3-5-7 rollover-ante transfer reason and instant-sweep projection

Status: Queued; found in the 2026-08-10 cross-game post-Holm ante sweep.

- The initial 3-5-7 Round 1 calls the canonical transfer RPC with reason
  `ante`, but the deployed `advance_357_round` R3-to-R1 path updates player
  chips and the pot directly. The immutable journal therefore defaults that
  normal rollover ante to generic `transfer`.
- The shell admits player-to-pot batches immediately in 3-5-7, so this cannot
  reproduce Holm's delayed-terminal re-ante presentation. Horses and SCC also
  use the explicit `ante` reason and have no equivalent admission gate.
- Keep the correction inside the existing atomic R1 RPC: publish an explicit
  ante stage for an ordinary R3-to-R1 rollover. Do not add only a reason label
  to the instant-sweep branch: it presently combines ante collection and the
  sweep in one transaction, and needs ordered ante/sweep projection with the
  existing ledger ownership and terminal-admission proof.

### 3C. Server-authoritative dealer-setup and ante deadline enforcement

Status: Queued; reported during the `Mercury` real-money smoke on 2026-08-09.

- The visible setup/ante clock is presentation only. The server must enforce
  each persisted deadline without relying on the dealer's browser, a mounted
  modal, or a best-effort client timeout callback.
- Audit the full chain for both phases: deadline creation, the scheduled
  enforcer invocation, RPC admission/expiry guards, player disposition, and
  idempotent continuation or post-game resolution.
- Expiry with zero active humans must call the authoritative post-game resolver
  and may never launch dealer selection, setup, or ante. One active human
  returns to Waiting; zero settles a result-bearing session exactly once.
- Preserve pause/resume semantics, game-specific valid continuation, and the
  existing rule that the post-game presence lease does not run during setup or
  ante.
- Mercury-specific note: the observed zero-second dealer modal followed a
  terminal presentation failure and is not by itself proof that the deadline
  RPC failed. Reproduce config and ante expiry from their legitimate live
  statuses during this dedicated audit.

### 3D. Post-game abandonment detection latency

Status: Implemented; production smoke pending.

- The accepted post-game waiting flow works, but the current 30-second sweep
  can take longer than a minute before an absent player is visibly Sitting Out.
- Evaluate a server-owned short-cadence watcher only while a post-game
  abandonment watch exists. A candidate is a five-second indexed no-op sweep
  when no watch is armed, requiring three consecutive missed heartbeat windows
  before changing a player state. Do not let a client, an arbitrary UI timer,
  or a gameplay-phase heartbeat decide presence.

### 3E. Sitting Out retains the player's seat

Status: Verified in real-money smoke on 2026-08-09. This is a shared
seat/projection correction.

- Sit Out means keep the existing seat and opt out of the next dealer game;
  it must remain in the relative-seat model on every entry path. Only Stand Up
  or Leave changes the player to an observer/unseated presentation.
- In current real-money session `Aug 9 - Peoria Stadium`
  (`01b271aa-c7f9-4f14-9dcd-19ef63d41b5e`), the post-game absence reconciler
  correctly kept Hap at position 4 and set only `sitting_out=true`; the Waiting
  UI nevertheless reported one player seated. This is a presentation filter/
  projection defect, not a reason to change the authoritative Sit Out state.
- Define a later inactivity-forfeiture policy (time and/or dealer-game count)
  separately. It must be authoritative and must not redefine an immediate
  Sit Out as a stand-up.

### 3E.1 Fake-money post-game heartbeat reconciliation

Status: Verified in production smoke on 2026-08-09 (migration
`20260809200000_extend_fake_money_postgame_presence.sql`).

- The prior database abandonment watch, its 15-second/three-miss heartbeat
  confirmation, and post-game resolver rejected `real_money=false` before
  they could mark an absent human Sitting Out.
- The deployed correction extends only the safe post-game waiting boundary to
  fake-money sessions:
  after real results exist and `current_game_uuid` is null, three missed
  five-second windows must mark an absent seated human Sitting Out. It must
  never run during initial waiting, live gameplay, setup, ante, or terminal
  presentation.
- With zero active humans, fake-money sessions should finish through a
  non-financial terminal disposition. They must not write SessionResult rows,
  balances, or financial transactions. Connected clients retain the Session
  Ended table; fresh reconnects go to the lobby. Rollback proofs and production
  runtime smoke passed.

### 3E.2 Explicit zero-active post-game closure latency and setup divergence

Status: Completed and production-smoked on 2026-08-15. Migration
`20260815163818_atomic_explicit_postgame_stand_up.sql` is installed on owned
production.

- Original observation: a dealer game ended; during the subsequent dealer
  setup one human chose Sit Out, returning the session to the post-game Waiting
  table. The other human then chose Stand Up Now. With no active seated humans,
  that should have ended the session. The standing player's client entered
  Session Ended, while the sitting-out player's client instead opened Game
  Setup.
- Replacement smoke on 2026-08-15 did not reproduce the client divergence.
  The same path remained on Waiting for roughly fifteen seconds, then both
  continuously open clients entered Session Ended.
- Read-only ownership trace: `Game.tsx:handleStandUpNow` writes the departing
  player as `status='left'` and `sitting_out=true`, then its legacy cleanup path
  only restores `games.status='waiting'`. The deployed player-state trigger
  merely arms the five-second post-game reconciliation watch and explicitly
  does not evaluate lifecycle state. The scheduled reconciler excludes both
  Sitting Out and Left rows from active-human and heartbeat evaluation.
- Therefore open tabs should not preserve this session after those two explicit
  choices. The observed delay is consistent with an already-known zero-active
  state falling through scheduled reconciliation, not proof that either open
  client missed a heartbeat. The fifteen-second absence lease should remain
  reserved for an active seated human whose presence is genuinely ambiguous.
- Expected contract: an explicit transition to zero active humans at a settled
  post-game Waiting table closes immediately through the authoritative
  post-game resolver, and no client may open or retain Game Setup after the
  terminal identity arrives. Preserve Sitting Out seat retention and the
  disconnect-only heartbeat grace.
- Required missing boundary: immediately after an explicit participation
  mutation and before publishing the next lifecycle state, one server-owned
  transaction must lock the session/cohort and evaluate the authoritative
  counts. Zero active humans ends the settled session now; at least one active
  human but fewer than two game-eligible participants returns to Waiting with
  every setup/dealer-game pointer cleared; an eligible cohort may continue to
  dealer selection/setup. Only a still-active seated human with ambiguous
  presence enters the heartbeat-grace path. The existing
  `resolve_postgame_participation` is a partial version of this boundary, but
  Stand Up and fake-money branches do not consistently pass through it.
- Delivered correction: `Game.tsx:handleStandUpNow` now routes the exit through
  `public.stand_up_and_resolve_postgame`. The RPC locks the session and caller,
  writes the complete Left/Sitting Out flag set, then atomically ends at zero
  active humans, returns to Waiting below two active participants, or preserves
  an eligible continuation. Never-started rooms and live dealer games remain
  with their prior owners; the heartbeat reconciler is unchanged.
- Smoke the original sequence with two continuously open clients: after one
  human chooses Sit Out during post-game setup and the other chooses Stand Up
  Now at Waiting, both clients should enter Session Ended immediately and no
  Game Setup dialog may mount. Also preserve a one-human Waiting result and a
  three-human stand-up continuation.
- Core production smoke passed on 2026-08-15: both clients entered Session
  Ended immediately and no Game Setup dialog mounted. The stood-up viewer
  correctly changed to absolute observer projection, but `MobileGameTable`
  also exposed open-seat `+` controls. The approved presentation-only follow-up
  adds `!sessionEndedPhase` to that existing control gate; it deliberately does
  not alter observer geometry. Jeremy reported the follow-up production smoke
  clean at commit `8b5e8f4ecc4d42f3028a48f71492b34aec80112b`;
  this item is closed.

### 3F. 3-5-7 pot-to-winner label uses the committed pot

Status: Queued; production smoke observation on 2026-08-09.

- The 3-5-7 winner chip animation displayed `$0` for an authoritative `$6`
  pot. The root cause was the legacy presenter inferring a winner amount after
  the authoritative pot was already zero. The cross-game immutable transfer
  ledger now supplies the actual database transfer amount and owns every
  sender/recipient display during motion. Validate 3-5-7 plus multi-sender
  antes and multi-winner payouts in published runtime smoke.

### 3H. 3-5-7 winner-card consent leak

Status: Queued (P1); observed in production final-leg smoke on 2026-08-09.

- A winning player who did not select Show Cards had their cards exposed to the
  rest of the table during terminal presentation. The explicit Show Cards
  consent latch must remain the only admission path for winner-card exposure;
  terminal settlement, the leg/pot phase, and the match-win announcement must
  never imply consent. Preserve the accepted chip-transfer ordering.

### 3I. 3-5-7 normal final-leg presentation replays during terminal settlement

Status: In validation (P1); observed in the `Columbia Terrace` production all-game
smoke on 2026-08-10.

- Earlier production runs skipped the normal winning-leg award because its
  completion raced a matching legacy fallback timer. Build `518bbf4ea` removed
  that timer race, but the subsequent `Aug 10 - Scents and Subtle Sounds` smoke
  revealed the complementary replay: the award stutters/double-starts, then can
  fire again during or after pot settlement.
- The deployed trace proves the failure boundary. A normal terminal award is
  armed for dealer game `2c228ea2-…`, then the late dealer-game scope reset
  cancels that same generation (`cross_dealer_game_cancelled`) even though the
  active scope is also `2c228ea2-…`. It clears the local latch and permits a
  re-arm. On a second client, a stale final-leg completion then advances again
  after pot settlement.
- Correct the one normal-terminal owner so it starts only after the concrete
  dealer-game scope is synchronized, preserves its generation through that
  generation's award/sweep/pot sequence, and rejects stale completion after
  cancellation or release. The ordinary leg-gain detector must not compete for
  a descriptor-owned normal terminal. Reset only for a genuinely different
  dealer game, not a late first observation or transient settlement state. Do
  not change authoritative settlement, the transfer ledger, or add a timer.

### 3K. 3-5-7 final-leg sweep omits the visible leg-reserve return

Status: In validation (P1); observed after the normal final-leg replay
correction in production on 2026-08-10.

- The final-leg deduction is projected as its own immutable cursor, but the
  terminal settlement combines the winner's leg-reserve return with the pot
  transfer in one later batch. The batch correctly records the return as an
  unmatched player delta, but the canonical ledger has no presentation stage
  for it. It therefore holds the stack at the post-leg value through the sweep,
  adds only the pot amount when that flight lands, and then reconciles to the
  final authoritative closing value.
- Preserve the actual financial settlement. Split the immutable presentation
  projection into ordered, same-transaction leg-sweep and pot-award stages so
  the leg return is visible during Sweep the Legs and the pot amount is visible
  only at the pot-flight destination. The generic ledger must retain endpoint
  ownership across both stages and release only after the final authoritative
  cursor has reconciled.

### 3L. Canonical signed chip-balance delta labels

Status: In validation (P1); approved cross-game shell migration on 2026-08-10.

- Production smoke subsequently confirmed the concurrent pot receipt total and
  opponent felt-facing label origin. Keep the remaining reports below scoped as
  separate presentation seams; neither authorizes another financial writer.

- Follow-up correction in validation: concurrent player-to-pot transfers could
  visibly compose the pot total while emitting only one individual `+$amount`
  label, because a provider rerender cancelled sibling arrival timers. The
  canonical transport now keeps timers through ledger rerenders and the ledger
  composes every multi-sender pot receipt (ante, bet, or transfer) into one
  landing effect. Opponent destination labels now originate at the felt-facing
  rim of their chip disc instead of its obstructed center. Await production
  smoke for concurrent `+$total` and readable opponent receipt labels.

- Every immutable player-to-player, player-to-pot, and pot-to-player transfer
  must show one red negative label and decrement when its chip visibly leaves,
  then one gold positive label and increment when its chip visibly arrives.
  The same applies to the active-player pane and opponent seat stacks.
- The shell ledger now owns the label stream. It derives residual, zero-flight
  changes strictly as `closing - opening - immutable-flight-net`, so the 3-5-7
  final-leg debit, sweep credit, and pot award remain three distinct composed
  changes rather than a doubled net snapshot. Multi-player antes produce one
  combined pot increment only after every inbound chip lands.
- Legacy game-specific money flashes are removed. Stable ledger identities
  dedupe each effect, and an interrupted batch discards its labels along with
  its transport before direct authoritative reconciliation. Validate normal
  player-to-player, multi-ante, and 3-5-7 final-leg/pot paths in production.

### 3M. Holm first-hand ante is delayed into showdown and its pot legs are lost

Status: In validation (P0); corrected under the approved high-risk branch on
2026-08-10. Production smoke remains required.

- The database committed one legitimate initial-Holm ante batch at 20:13:42Z:
  both players paid `$3` into a zero pot before either decision. It did not
  financially re-ante after the winner was decided.
- That batch was journaled with generic reason `transfer`, so Holm's admission
  gate treated it as a terminal loser-to-pot movement and held it until
  showdown. The later settlement correctly changed the winner by `+$6`, loser
  by `-$6`, and retained a `$6` replacement pot, but generic net-delta pairing
  projected it as one player-to-player transfer. The required semantic legs
  (`pot -> winner`, then `loser -> pot`) were therefore unavailable to the
  canonical ledger.
- Correction: `20260810201500_stage_holm_showdown_transfer_projection.sql`
  labels the first-hand ante `ante`, journals multi-player settlement as
  adjacent immutable pot-award and replacement-pot stages with authoritative
  staged openings/closings, and has the Holm phase gate match actual transfer
  cohorts. Preserve the actual once-only settlement and initial-hand ante rule.

### 3N. Source seat cluster disappears during an outbound transfer

Status: In production validation (P1); corrected on 2026-08-10.

- During opponent-to-self transfer, the entire opponent seat cluster (disc,
  nameplate, and attached content) becomes invisible. The shell's source-seat
  suppression currently applies `visibility: hidden` to all of those nodes,
  though only a moving chip is intended to leave.
- Keep the source cluster visible with its ledger-owned decremented balance;
  remove the broad static-seat suppression from the canonical seat owner. This
  is a cross-game shell correction, not a per-game workaround.
- Correction: `CanonicalSeatCluster` no longer consumes the source-seat
  suppression set or applies `visibility: hidden` to any cluster node. The
  retired hook is removed from `ChipTransportProvider`; the ledger remains the
  sole presentation owner of the source balance. A focused regression test
  covers an active player-to-player flight with the nameplate, chip, and both
  attached regions still visible.

### 3O. Terminal chip-delta label burst during teardown

Status: Queued (P1); observed after a 3-5-7 pot win in production smoke on
2026-08-10.

- Several `+$`/`-$` helper labels appeared rapidly as the terminal table was
  tearing down. The label runtime keeps completed effects alive for two seconds
  and only explicitly abandons a running batch, so terminal lifecycle must be
  correlated with immutable batch boundaries before changing it.
- Preserve valid departure/arrival labels and the direct authoritative
  reconnect contract. Do not suppress terminal labels by timer or add a second
  financial/presentation owner.

### 3P. Holm can render a stale 3-5-7 `+L` leg cue beside the self chipstack

Status: Completed; production smoke accepted on 2026-08-10 at commit
`0e6498d83c1e65faf3872a21dd344223dfc51c22`.

- With two players staying and the self cards tabled, the self chipstack can
  display a cue such as `+L1`. Legs have no meaning in Holm and must never be
  presented there.
- The only writer for this cue is the non-financial 3-5-7
  `winnerLegsFlashTrigger`, but the self chipstack renders it without a
  game-type guard. Component state can therefore survive a game transition and
  be interpreted in Holm. Restrict every leg cue to its 3-5-7 presentation
  owner and clear its transient state at the canonical hand/game identity
  boundary; do not affect monetary delta labels.
- Correction: all three shared-table `+L` render sites now mount only for a
  recognized 3-5-7 game, its writer rejects any other game type, and the
  transient trigger clears with hand and game cache resets. Monetary
  `+$`/`-$` ledger labels are unchanged.

### 3Q. Consecutive identical Holm showdowns suppress canonical transfer presentation

Status: Completed; production smoke accepted on 2026-08-10 at commit
`4eaf5b0be8c20eac4f3e33d5d3699b85f98d1588`.

- The final two of three consecutive two-player showdowns settled correctly
  but showed neither required `pot -> winner` nor subsequent `loser -> pot`
  flight. The immutable batches exist for every hand, with staged
  authoritative openings and closings.
- The client duplicate latch currently keys a Holm showdown with the game-wide
  `current_round` number. In Holm this remains `1` across hands, so repeated
  winner, loser, pot, and match values collide with the prior hand. Key the
  presentation plan by the authoritative round identity/hand, preserving
  duplicate suppression only for re-delivery of that exact settlement.
- Original correction: `buildHolmShowdownPresentationKey` combined the
  authoritative rounds-row/hand identity with immutable transfer cursor and
  fixed equal outcomes across consecutive hands. August 14 production evidence
  proved that cursor-bearing plan identity was incomplete: the normal two-batch
  showdown changed cursor inside one plan and could reset its phase. The helper
  is now removed; hand identity owns the plan and cursor-exact identity owns
  batch completion/release evidence. Financial settlement remains untouched.

### 3J. Gin iPhone screen dim regression

Status: Queued (P1); observed in the `Columbia Terrace` production all-game
smoke on 2026-08-10.

- Gin dimmed the iPhone screen during play. Gin's canonical table presentation
  must never request a dimmed surface. Trace the actual overlay/dimming owner;
  do not apply a device-specific CSS override before finding it.

### 3G. Suppress invalid production debug-event writes

Status: Queued; observed in production logs on 2026-08-09.

- An active mobile client is posting `debug_events` with `game_id='0'`, causing
  repeated UUID errors (roughly twice per second). Guard debug writers against
  placeholder identities; do not add durable production instrumentation.
- The 2026-08-14 P0 Holm freeze in paused session `Aug 14 - Jeff Samardzija`
  reproduced the same defect through `round_id='0'`: the Android client posted
  HTTP 400 once per second from 16:22:29Z through 16:22:42Z, while PostgreSQL
  recorded `invalid input syntax for type uuid: "0"`. Validate every UUID
  field independently so a missing round identity does not discard otherwise
  useful incident evidence. This remained an observability failure; the frozen
  Holm presentation had a separate client barrier-release cause.

### 3A. Source-proven rule, ledger, and harness discrepancies

These findings are separate from the broader terminal-authority migrations
above. Preserve their exact game-specific semantics during later triage.

- Cribbage three-player setup deals five cards to each player and takes one
  discard each, producing a three-card crib. The source comment expects the
  dealer to supply the standard fourth crib card, but no current path does so.
- Gin dealer setup stores configurable `gin_bonus` and `undercut_bonus`,
  while scoring uses hardcoded 25-point constants.
- Gin per-hand `game_results.player_chip_changes` records plus/minus ante
  deltas even though
  `src/lib/ginRummyRoundLogic.ts:recordGinRummyHandResult` explicitly performs
  no chip transfer.
- Holm partial-tie payout uses integer division. When the pot is not divisible
  by the number of tied winners, the remainder has no proven conservation
  owner.
- The 3-5-7 admin forced-card harness assigns forced cards without removing
  them from the randomized deck, creating a duplicate-card risk.

## P1 — account access

### Password reset failure

Status: Resolved 2026-08-03.

- Reported 2026-08-01: `mcru81` is trying to reset their password, and the
  reset flow is reportedly not working correctly in the production runtime.
- Expected: the account owner can request a reset, follow the recovery link,
  set a new password, and sign in with it.
- Exact failed step, visible error, device/browser, and whether a recovery
  email arrived were not supplied with the initial report. Follow-up confirmed
  that no recovery email arrived.
- Read-only production evidence confirms the `mcru81` profile exists, is
  active, and has an email address. The live `/auth` reset request UI renders.
- Failure boundary: delivery occurs before the recovery callback. The live UI
  calls Supabase Auth `resetPasswordForEmail`; the repository contains no
  deployed SMTP configuration evidence, and its older Resend-backed
  `reset-password` Edge Function has no live caller.
- The exact provider/log error remains unverified because the current operator
  sign-in did not grant access to the Supabase project dashboard. Do not claim
  a specific SMTP error until deployed Auth configuration/logs are available.
- The owned target now uses verified custom SMTP through Resend. Native recovery
  delivery, callback, password update, sign-out, and sign-in with the new
  password passed against the owned preview on 2026-08-03.
- The same complete recovery flow passed on production `holm357.com` on
  2026-08-03, closing the account-access acceptance item.

## P1 — canonical architecture integrity

### 4. Platform-wide bespoke-artifact audit

This is not Holm-only. Audit all seven games for unjustified game-specific implementations overlapping canonical owners:

- card faces and active-hand fans;
- tabled/revealed cards and dice;
- seat clusters/chip stacks/dealer markers;
- pot/transports/celebrations;
- announcements/HUD/tabs;
- active panes/action strips/spotlights;
- table/felt geometry;
- setup/configuration;
- terminal and Session Ended presentation.

Classify each as a necessary narrow exception built on canonical primitives, or unjustified duplication to migrate/delete.

Acceptance invariant: a shared visual/lifecycle change is made once and reaches every applicable game automatically.

Run read-only inventory/plan before implementation. This is also a reasonable Claude Code analysis task.

### 5. Holm active-hand canonicalization

Audit Holm `PlayerHand`/self-hand against shared `ActiveHandFan`.

Preserve four-card geometry, Fold/Stay interaction, highlights, tap behavior, responsive sizing, and tabled transitions. Migrate fully when possible; otherwise isolate only irreducible behavior while sharing canonical `PlayingCard` theme/face treatment.

### 6. Formalize or remove misleading host state

`games.current_host` was null across inspected games and was not Holm bot-controller ownership.

Prove remaining reads/writes, then remove or clearly debug-scope it. Do not conflate it with production ownership.

### 7. Retire legacy bot alias allocator

The standalone `allocate_bot_alias_number` path can burn ordinals outside transactional `create_session_bot`.

Prove no callers; revoke/remove or mark migration-only; preserve transactional creation.

## P1 — cross-game presentation

### Ante landing before initial card transport

Status: Complete; production smoke passed on 2026-08-11 at commit
`0bc5718ba8087df4ce19217f111b423bceba7ecd`.

- In every game that collects an opening ante, the canonical player-to-pot
  transport must reach its pot endpoint before the initial card-deal transport
  begins. The visible order is: antes land, then cards deal.
- This is a shared presentation-admission requirement, not a change to
  authoritative ante collection, card assignment, settlement, or game rules.
- Audit all ante-bearing games and their common card/transport owners together;
  do not add Holm-only timers or let a client delay database-owned gameplay.
- The final implementation closes admission in the first ante-trigger render
  and reopens it only from the canonical ledger's aggregate ante-to-pot arrival
  event. Holm, 3-5-7, Horses, and SCC retain database-owned gameplay truth.

### 8. Canonical win celebration

3-5-7, Horses, and SCC historically completed pot-to-player transfer but missed canonical destination bounce/confetti. Apply the shared celebration owner without reopening settlement.

The 2026-08-09 accepted Holm canonical-transfer smoke also had no destination
chip bounce despite the transfer and balances being correct. Treat it as the
same cross-game presentation-only defect; preserve the accepted ledger,
settlement ordering, and exactly-once endpoint ownership.

The accepted 3-5-7 final-leg smoke on 2026-08-09 also had no destination-chip
bounce after its otherwise correctly ordered pot flight. It is the same
deferred presentation-only defect.

The `Columbia Terrace` all-game smoke on 2026-08-10 also confirmed missing
destination bounce for the terminal player-to-player transfers in Cribbage,
Gin, and Yahtzee. Extend the same shared presentation owner to both pot and
player destinations; preserve the canonical ledger's timing and balance
ownership.

### 9. Dealer Configuration modal cleanup

Historical Lovable backlog path:

`.lovable/backlog/dealer-configuration-modal-cleanup.md`

Goals: viewport-safe layout, scrollable body, fixed footer, compact selectors, no game-specific modal fork.

### 10. Geometry Lab/polish

- felt aspect ratio and safe gutters;
- shared safe frame;
- active-player spacing;
- card rank/suit gap;
- opponent nameplate offsets;
- 3-5-7 round-3 group semantics;
- Gin score-rail collision;
- Holm long-tail visuals;
- Yahtzee held-dice reorder/scatter.

### 11. Cribbage deal transport burst recurrence

Status: Queued; reported by production smoke on 2026-08-04.

- One connected client saw a visible card burst during the deal and submitted a
  Visual Bug report at the time it occurred.
- Treat this as a card-transport presentation defect until the report is
  correlated with an authoritative hand/deal identity. Do not reopen the
  accepted scoring or settlement model from this observation alone.

### 12. Cribbage reconnect inherits stale final-pegging announcement

Status: Completed; production smoke passed on 2026-08-13. Reproduced by production smoke on 2026-08-04.

- Refreshing during counting correctly resumes the authoritative counting
  sequence and score presentation, but the announcement rail initially shows
  the durable final-pegging message (for example, `Last +1`) until the next
  counting announcement replaces it.
- The likely seam is reconnect admission for the presentation-only pegging
  notice: it is valid during the live pegging-to-counting handoff but should
  not be revived when the client mounts already in counting. Preserve the live
  final Last/Go notice and the persisted counting sequence.
- The candidate admits final pegging presentation only to a client that
  observed the same hand in `pegging`, then immediately publishes the resumed
  combo announcement that matches the restored highlight. It does not change
  the durable cursor, scoring, or hand release.
- Follow-up smoke found a separate one-frame `waiting_for_next_round`/“next
  hand” notice before that combo: counting legitimately retains the bootstrap
  shell while its render identity hydrates, but the bootstrap ambient must not
  claim the rail when the authoritative phase is already `counting`. The
  candidate now suppresses that ambient only for counting and leaves real
  pre-deal and post-count next-hand transitions intact.
- The next smoke showed that the first client paint has no local Cribbage state
  yet, so phase-aware suppression alone still allowed one inferred bootstrap
  notice. Bootstrap now remains silent until an authoritative phase arrives;
  the acceptable tradeoff is a brief blank rail on a slow load, never a
  misleading next-hand announcement.
- Final production smoke passed: refreshing and disconnecting/reconnecting
  during a highlighted counting combo restores the matching combo directly,
  without a stale final-pegging or next-hand announcement frame.

### 13. Holm Chucky card fronts use a fixed-pixel fallback in desktop mobile emulation

Status: Completed; production commit
`9509c16bfb9fdf43c2e2e469fa09e57fc9cffdb0` passed the reported smoke on
2026-08-16.

- The Holm Chucky stage is positioned through the canonical felt-relative
  `HolmAnchoredSlot`, and it renders the shared `PlayingCard` / Card Front
  Design component. In the active call site, though, `PlayingCard` receives
  `width: '100%'` and `height: '100%'`. Its face-density resolver accepts only
  concrete pixel dimensions, so it falls back to the `lg` device-size values
  when calculating rank and suit typography.
- The resulting front density is visibly overlapped and cropped in Chrome
  desktop mobile emulation. Preserve the canonical stage geometry, deck art,
  card aspect ratio, and the normal card-front design; do not add viewport
  breakpoints, device-specific pixel patches, or a Holm-only card component.
- Route the assigned canonical stage dimensions into the shared card-front
  resolver (for example via its existing explicit face dimensions or a bounded
  measurement owner), then verify Chucky card faces in desktop mobile
  emulation and supported mobile layouts without overlap or crop.
- Completed by a bounded slot measurement owner in `MobileGameTable`: it
  observes the existing canonical Chucky slot and supplies its measured width
  to `PlayingCard` through `faceFillPx`. Jeremy confirmed the formerly
  oversized/cropped face art now fits; stage geometry and responsive contracts
  were preserved.

## P2 — known low-severity defects

### 11. 3-5-7 refresh transport

Refreshing during later rounds can suppress later-round deal transport for the rest of the hand. Authoritative play remains intact.

### 12. 3-5-7 timeout/sitting-out card scaling

After timeout/sitting-out transition, local active cards may grow/overlap after initially rendering correctly.

### 13. Post-match visual residue

Audit only with a current repro:

- duplicate chip stack;
- stale title/stakes;
- Horses transition delay.

### 13B. Yahtzee winner chip does not bounce

Status: Queued; reported by production two-human terminal-disconnect smoke on
2026-08-03.

The remaining client saw the correct winner sequence, Session Ended flow, and
exactly-once settlement, but the winner chip did not bounce during celebration.
Treat this as presentation-only: preserve the accepted atomic settlement and
live-terminal hold while restoring the animation.

### 13A. Yahtzee static music assets

Status: Queued; discovered during owned-Supabase music-provider retirement on
2026-08-03.

- `MusicToggleButton` is mounted only by Yahtzee and uses
  `useBackgroundMusic`.
- The hook references five `/music/bluegrass-*.mp3` files, but no matching
  audio assets are tracked in the repository.
- The hook reports `hasMusic=true` from the non-empty hardcoded path list, so
  the control renders even when every referenced asset is absent.
- The retired `generate-music` Edge Function was never a caller or fallback for
  this UI. Decide separately whether to supply licensed static assets or hide
  and remove the nonfunctional control.

### 13B. Chat image upload acceptance on redeployment

Status: Queued; runtime entry point intentionally absent as of 2026-08-03.

- Voice-to-text replaced the attachment icon in the current chat UI, so the
  owned-Supabase preview has no user path for a fresh image upload/render smoke.
- Do not remove the existing `chat-images` bucket, Storage policies, or dormant
  upload/render code solely because the entry point is absent.
- When attachment UI is redeployed, require an owned-target preview smoke that
  uploads a new image and renders it in chat, then repeat in production before
  calling the capability live.

### 13C. Holm timer initial-fill regression

Status: Completed; corrected at commit
`d7149e0d4ab3a3409ee6fbbc3aa15cf7f1c810e2` and accepted by production smoke
on 2026-08-06.

- Runtime: commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`, fake-money
  Holm game `25662485-03b6-434b-85f0-f96e983dfe7e`.
- Actual: when the human turn begins, the visible timer first appears roughly
  70% full, animates upward to full, and only then begins counting down.
- Expected: after the deal-settled gate releases, the timer's first visible
  frame is full and all subsequent movement is a monotonic countdown.
- This is a known defect that had previously been corrected and has regressed.
  Preserve the newly accepted rule that no visible Holm timer appears while
  card transports are still active.
- Accepted correction: publish one atomic remaining/total/deadline snapshot,
  key the canonical rail to that deadline epoch, and suppress transitions on
  its first paint. Production smoke confirmed a full first visible frame and
  monotonic countdown.

### 13D. Holm timeout rebound and transient card reactivation

Status: Queued; new non-blocking presentation defect first observed in owned-
Supabase preview smoke on 2026-08-03.

- Runtime: commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`, fake-money
  Holm game `25662485-03b6-434b-85f0-f96e983dfe7e`.
- Actual: deadline expiry folded the human and showed auto-fold for about one
  second; the clock then rebounded to roughly one second and the folded cards
  briefly reactivated before a second visible fold/auto-fold transition became
  stable.
- Expected: one monotonic terminal timer transition. Once the authoritative
  fold arrives, the timer stays retired, the cards remain inactive, and the
  auto-fold/sitting-out presentation does not flicker or replay.
- Authoritative progression was not harmed: the game advanced, auto-folded the
  player for subsequent hands, allowed rejoin, and completed normally. Do not
  reopen the accepted atomic Holm resolver or add a second action owner while
  correcting this presentation seam.

### 13E. Retire residual Lovable social metadata

Status: Queued; discovered during final owned-Supabase production verification
on 2026-08-03.

- The application and production bundle no longer reference the
  Lovable-backed Supabase project, but root `index.html` still declares a
  Lovable-hosted `og:image` and the `@Lovable` Twitter account.
- This is social-preview metadata, not a gameplay, Auth, database, publication,
  or runtime dependency; it does not block the completed backend cutover.
- Replace it with an owned image/domain and P-Town Poker social metadata, then
  verify the published HTML contains no `lovable.dev` or Lovable-branded
  social tag.

### 13F. Player Balances list escapes its modal

Status: Queued; reproduced in owned-Supabase production on 2026-08-03.

- Runtime: `holm357.com`, immediately after the clean production sign-in and
  lobby smoke.
- Actual: with the full player list open, balance rows continue below the white
  Player Balances dialog and render over the dark page overlay. The screenshot
  shows the `mcru81` row crossing the dialog's lower edge and the next row
  beginning entirely outside it.
- Expected: the dialog remains viewport-safe; its title, close control, sort
  control, and description stay contained while one internal list body scrolls
  through every player. No player row or name may render outside the dialog.
- Current source owner:
  `src/components/AdminPlayerListDialog.tsx`. Its `DialogContent` declares
  `max-h-[80vh]` while the nested `ScrollArea` has an independent
  `max-h-[400px]`; preserve sorting, balance colors, row selection, and the
  transition into transaction history when correcting the containment.

### 13G. Holm community-row test leaks its first render into the second case

Status: Queued; test-harness defect discovered during checkpoint-1 Holm
validation on 2026-08-15. Product source was not implicated.

- Running `src/components/HolmCanonicalCommunityRow.test.tsx` by itself passes
  its live-reveal case, then fails the historical-rejoin case because both
  rendered rows remain in `document.body`; `screen.getByTestId('face-Q')`
  therefore sees two matching nodes.
- Running only the historical-rejoin case passes, confirming this is missing
  per-test cleanup rather than a community-card presentation failure.
- Add explicit Testing Library cleanup (or the repository-wide equivalent)
  without changing `HolmCanonicalCommunityRow` behavior, then restore the
  two-case file as a reliable member of the focused Holm suite.

## Documentation/bootstrap

### 14. Complete exact game-rule documentation

Run a read-only source audit to document legal actions, state machines, scoring, dealer/hand/session terminal rules, settlement owners, bot behavior, and source paths. No product changes during the documentation pass.

### 15. Complete repository map

Populate `REPO_MAP.md` from the final tagged source after cutover.
