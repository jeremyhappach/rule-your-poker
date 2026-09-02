# Current release and cutover state

Date: 2026-09-01

## 3-5-7 synchronized decision reveal — timing and local-stack polish published; smoke pending

- Migration `20260901093000_add_357_decision_reveal_projection.sql` projects a
  pause-aware server-time `3 → 2 → 1 → DROP` window from the existing exact
  round-resolution identity. It adds no gameplay, settlement, balance, or
  progression owner. The atomic current frame and final decision receipt expose
  the same immutable window; the existing recovery fallback remains independent.
- The canonical felt now presents one dedicated theatrical hand stack at each
  deciding player's canonical chip endpoint. It reuses canonical card-back
  artwork at a responsive roughly 1.7× size, uses one pixel of depth per extra
  card (capped at six pixels), and has no fan, rotation, or spread. DROP animates
  the whole stack as one object. The dealer bubble supports both remote seat
  anchors and the existing local HOME chip endpoint.
- Migrations `20260901101000_polish_357_decision_reveal_timing.sql` and
  `20260901113000_emphasize_357_decision_reveal_drop.sql` retain the same
  pause-aware projection but now give a one-second sealed lead-in and 900 ms
  per-beat `3 → 2 → 1`. The nonterminal presentation fallback is ten seconds,
  allowing the one-second DROP impact, tableau hold, and existing four-second
  result dwell to finish safely before recovery may advance. The local HOME
  stack is centered exactly on the canonical player-to-player transfer
  destination; remote placement is unchanged. DROP is a large pulsing stamp
  with one whole-stack impact animation. Ordinary canonical cardbacks remain
  suppressed for the resolved ritual round and return through the next-deal
  path only.
- Decision colors, badges, all-fold presentation, exposed cards, result
  narration, transfer dispatch, and continuation remain sealed through the
  countdown. All decisions open on the absolute DROP boundary; the existing
  result flow begins after the tableau hold and retains its four-second dwell.
  Every leg award uses that same gate, so neither an ordinary nor a terminal
  result can begin its leg animation before the ritual has fully expired.
  Duplicate Realtime delivery cannot restart the ritual, late mounts enter the
  current beat, and expired reconnects skip it.
- The deployed migration and unchanged authority path passed the complete
  rollback proof. The helper is private with no `anon` or `authenticated`
  execute grant. TypeScript, 23 focused reveal/frame assertions, all 39
  build-required Cribbage assertions, and the production build passed. Supabase
  advisors reported no new task-specific finding; the two flagged public RPCs
  are the existing intentional authenticated authority boundary.

## 3-5-7 atomic-frame-first convergence — production checkpoint

- The retained 7,611 ms ante peer-progress outlier was client hydration delay,
  not slow ante authority. The frozen `submit_ante_decision` request began 274
  ms after click and committed in 890 ms despite its response being lost under
  chaos. One client accepted the exact active frame and then regressed to a
  delayed `ante_decision` image; the peer waited for split game/player/default
  discovery before requesting the 204 ms atomic frame.
- Known 3-5-7 sessions now request `three_five_seven_current_frame` first and
  publish its game, exact round, roster/profiles, and caller-visible private
  cards without preceding split discovery. Cold/unknown sessions retain normal
  family discovery, and an exact `not_357_game` result falls back safely when a
  session switches families. A same/null dealer-game pregame image can no
  longer overwrite an accepted active frame; a genuinely new dealer-game UUID
  remains an admitted setup boundary. No database migration was required.
- TypeScript, 30 focused state/handoff assertions, all 39 build-required
  Cribbage assertions, and the production build passed. The broader liveness
  pack passed 260/262; its two misses were the change-caused source-wiring
  assertion (updated and then passing) and an unrelated pre-existing
  whitespace-sensitive dealer-draw migration assertion.
- Published acceptance ran on commit
  `f6b82afcbd5ccf94b29e2d48c51174d9478fa4f2` and Vercel deployment
  `dpl_BkRJ5YYsKHDiqo9T15TSNzmUS99S`. The exact isolated production fake-money
  `357-round-progression` scenario passed in 44.6 seconds. R1/R2/R3 published
  3/5/7 cards on their exact identities; 95 observer events, 80 snapshots, and
  499 requests produced zero presentation violations and zero unexpected 6,000
  ms peer-budget breaches. Ante peer progress was 1,994 ms versus 7,611 ms in
  the frozen evidence; overall peer p95/max was 3,428 ms. The one-shot fixture
  was consumed exactly once and cancelled, and guarded cleanup deleted fake
  game `90fe19f4-414b-437b-9b33-9d5284b1a60e`. No real-money game was opened or
  touched. This is focused ante/start and R1/R2/R3 convergence acceptance, not
  full 3-5-7 gameplay, lifecycle, deadline, or repetition coverage.

## Holm direct decision authority — production checkpoint

- The retained 9,776 ms Holm peer-progress outlier was browser-side read
  amplification, not a database freeze or Run It Back transition failure. A
  human Fold spent 4,775 ms in three sequential legacy GET preflights before
  calling the already-exact `holm_submit_decision` RPC; the deployed RPC itself
  revalidates game, round, player, ownership, turn, pause, and replay identity
  under its transaction locks.
- Human Stay/Fold, their armed predecision paths, and Holm bot decisions now
  submit exact game/round/player identity through one narrow adapter whose
  first request is `holm_submit_decision`. The generic preflight path remains
  unchanged for 3-5-7 and compatibility callers. Settlement, deadlines,
  Realtime/refetch, replay semantics, and the existing completion fallback are
  unchanged; no database migration was required.
- TypeScript, 21 focused authority/lifecycle assertions, all 39 build-required
  Cribbage assertions, and the production build passed. The broader Holm-named
  suite passed 159/160; its sole miss is an independently reproducible existing
  test-isolation defect in `HolmCanonicalCommunityRow.test.tsx`, not a runtime
  failure in this change.
- Published acceptance ran on commit
  `f00079cc916763e192c3845d70ee8ee241433390` and Vercel deployment
  `dpl_C3zQuYhMerTj2irogb6MZhpo2wLU`. The exact isolated production fake-money
  `holm-game-run-it-back-unchanged` scenario passed in 2.5 minutes with 191
  observer events, 172 snapshots, 764 requests, zero violations, and no 6,000
  ms peer-budget breach (peer p95/max 3,313 ms). Observed direct decision
  click-to-RPC admission was 54–128 ms, versus 4,775 ms in the frozen pre-fix
  evidence. Guarded cleanup deleted game
  `2c394868-d15c-4fbb-a09e-d98fa9f4fd7b`, and an independent database query
  confirmed zero matching game rows. No real-money game was opened or touched.
  This is focused decision-latency and unchanged-Run-It-Back acceptance, not
  full Holm coverage; the separate 3-5-7 ante outlier was subsequently closed
  by the atomic-frame-first checkpoint above.

## Recovery scheduler workload admission — installed; focused Yahtzee rerun accepted

- Migration `20260901085259_admit_due_recovery_work.sql` keeps the sole
  one-second `private.advance_due_game_state()` heartbeat, but no longer calls
  all eight recovery owners on every tick. Exact due work runs immediately and
  one full-safety owner rotates per tick, so each task still receives bounded
  fake-money, disconnected, stale-heartbeat, legacy, and postgame recovery.
  Browser heartbeat presence is not an authority prerequisite.
- The candidate and installed definitions passed isolated rollback proofs for
  scheduler failure/replay, canonical timers, authorization, pause/resume,
  fake- and real-money Yahtzee timeout behavior, session abandonment,
  winner/tie/continuation/terminal paths, and Cribbage, Gin, Holm, 3-5-7, and
  Horses/SCC authority. The canonical timer proof now correctly ignores
  historical cancelled rows when checking for an active human clock.
- In the first installed 45-second observation, all 43 cron runs succeeded,
  p95 was 51.8 ms, max was 53 ms, the latest complete dispatcher heartbeat was
  33 ms, and there were no active recovery failures or slow-task records. The
  pre-change 24-hour window had 18 failed starts and a 25.4-second maximum.

The first concurrent fake-money gameplay rerun used isolated Yahtzee, Holm,
and 3-5-7 pairs with the continuous observer and exact cleanup. The scripted
3-5-7 R1/R2/R3 path and Holm Run It Back path completed, but their observers
recorded peer-progress outliers of 7,611 ms (ante) and 9,776 ms (Holm Fold)
against the 6,000 ms campaign ceiling. The Yahtzee driver had queried the
nonexistent `data-shell-timer-running` attribute instead of the canonical
rail's `data-forensics-timer-running` contract. That harness-only oracle is now
corrected and locked by a focused test.

The retained Yahtzee failure was a client admission gap, not a scheduler or
database-authority failure: the table hid its timer at deadline zero while its
manual Roll, Hold, and Score surfaces remained enabled until recovery arrived.
The shared `isYahtzeeManualTurnOpen` predicate now fails those presentation and
request paths closed unless the server-owned deadline is still in the future.
At expiry the actor sees an inert timeout-recovery status; fake-money Auto-roll
and real-money pause remain database-owned and unchanged. All four manual
mutation handlers recheck the exact current time, so a stale render cannot
submit a late action.

TypeScript, 77 focused Yahtzee tests, 39 build-required Cribbage tests, and the
production build passed. Published acceptance ran on commit
`effdf6c400535891eb39e645a53669bae067d3f0`, Vercel deployment
`dpl_AwvYtoYWXnLG7ePUT9B7upvRMdvS`, and bundle
`assets/index-CdvlzMwH.js`. The exact isolated production fake-money
`yahtzee-gameplay-timeout-rejoin` scenario passed in 1.6 minutes: 51 observer
events, 37 snapshots, 427 requests, zero presentation violations, and no 6,000
ms peer-budget breach (peer p95/max 3,079 ms). Guarded cleanup deleted game
`1c98440f-40d9-425a-b8d2-1e3a95c8a9c7`, and an independent database query
confirmed zero matching game rows. No real-money game was opened or touched.
  This is focused deadline/remount admission acceptance, not full Yahtzee gameplay
  or lifecycle coverage; the separate Holm and 3-5-7 latency outliers were
  subsequently closed by their focused checkpoints above.

## 3-5-7 exact-wave baseline and readiness ownership — production checkpoint

- `Game.tsx` is now the sole owner of the exact deal-readiness token. It
  validates the token against the accepted atomic 3-5-7 dealer-game, hand,
  round number, and round UUID, then feeds that same token to both the route
  timer gate and `MobileGameTable` decision/presentation gates. The table no
  longer mirrors readiness in a second local state commit.
- Round 2 and Round 3 presentation retain the authoritative prior-round hand
  as a three- or five-card baseline and add only transport receipts whose card
  IDs belong to the exact current wave. A remounted runtime that lacks old
  receipt history therefore cannot collapse a five-card hand to the two new
  cards, while prior/future wave receipts still cannot reveal new cards early.
  The same exact-wave rule feeds local faces, opponent backs, and the final
  `PlayerHand` boundary guard.
- TypeScript, 149 focused 3-5-7 tests, 39 build-required Cribbage tests, and the
  production build pass. Production acceptance ran against commit
  `c5ee6d0bf7451ae797da30a260e023ce9e0736e9`, Vercel deployment
  `dpl_Aee4krFCH5CiyCLTiXTu6r5RiqQe`, and bundle
  `assets/index-B2LxinNU.js`; later documentation-only deployments do not
  change that accepted runtime source.
- The published two-client fake-money R1/R2/R3 progression passed in 53.5
  seconds. Both clients finished on the same Round 3 UUID with seven visible
  cards, one timer, enabled Drop/Stay controls, and no stale artifacts. The
  continuous observer recorded zero violations and no 6,000 ms breach (peer
  p95/max 3,412 ms); guarded cleanup deleted the exact session. Vercel reported
  no runtime errors. This is focused transition/readiness acceptance, not full
  3-5-7 rule or deadline coverage.

## Gin action-path mirror-write reduction — installed, smoke pending

- Migration `20260901034516_reduce_gin_player_card_mirror_writes.sql` keeps the
  private Gin state and redacted `rounds.gin_rummy_state` Realtime receipt on
  every accepted publication, but no longer updates a `player_cards` row when
  that player's exact hand is unchanged. A changed hand still updates and
  advances `source_version` once.
- This removes avoidable trigger, index, and WAL work from ordinary Gin actions
  without changing card authority, redaction, action replay, rules, scheduler,
  settlement, or lifecycle ownership. The existing authority proof now invokes
  the serialized recovery-task owner rather than the retired per-game cron job.
- The complete pre-change proof passed under rollback. The candidate migration
  plus proofs then passed under rollback, and the installed definition passed
  the same authority, mirror-version, normal/Gin/undercut/void/tie,
  authorization, duplicate/replay, continuation, scheduler, terminal
  settlement, and late-postgame suite under rollback.

Production two-human Gin smoke remains the acceptance gate; this database
optimization does not by itself establish a user-visible latency bound.

## 3-5-7 live deal-wave presentation admission

- In real-money session `015d269f-4651-4d45-abf8-6a170301d234`, both clients
  painted all three Round 1 cards during `PRE_DEAL`, 1.844–1.982 seconds before
  the canonical wave dispatch began. The authoritative-readiness recovery was
  treating a complete private card row as a presentation receipt even though
  the transport ledger still had zero settled cards and zero active intents.
- A live authoritative hand may now recover a genuinely missing local
  transport receipt only after the exact cumulative wave was registered, the
  client observed that wave's intents in flight, every intent became inactive,
  and the local settled ledger remained incomplete. Ordinary `PRE_DEAL`, an
  active animation, a mismatched wave target, and a normally completed
  transport cannot use the fallback. Historical/rejoin reconstruction and the
  existing database/gameplay authority are unchanged.
- Fifty-four focused 3-5-7, cross-country, action-surface, and liveness
  assertions, the installed TypeScript compiler, all 39 build-required
  Cribbage assertions, and the production build pass. Production smoke remains
  the acceptance gate for visual deal order.

## Holm configured postgame recovery fallback — installed

- Live real-money session `015d269f-4651-4d45-abf8-6a170301d234` completed
  its final Holm settlement correctly, but connected presentation did not
  submit postgame completion before the shared 15-second canonical recovery
  deadline. The browser advanced 1.373 seconds after that deadline while the
  one-second scheduler happened to be between passes, exposing a race between
  normal presentation and disconnected-client recovery rather than a
  settlement failure.
- Migration `20260901021531_align_holm_postgame_fallback_default.sql` keeps the
  existing canonical timer and replay-safe postgame owner, but registers Holm
  from `game_defaults.holm_presentation_ack_fallback_seconds` (currently 30)
  instead of the shared 15-second literal. Horses and Ship/Captain/Crew remain
  at 15 seconds.
- The complete rollback proof passed before and after installation for winner,
  chopped/tie, authorization, continuation, duplicate/replay/late replay,
  timer-only recovery, unsettled admission, and already-terminal state. It now
  also requires the registered Holm deadline and timer metadata to match the
  configured default. No historical session or gameplay/financial state was
  changed.

## Gin exact-outcome branch harness — production checkpoint

- Migrations `20260831203958_gin_rule_branch_harness.sql` and
  `20260831215500_gin_rule_branch_target_fallback.sql` add an admin-only,
  exact-game, expiring, fake-money-only one-shot fixture for normal knock,
  Gin, undercut, and stock-two void. Real-money, wrong-game, terminal,
  unauthorized, duplicate, replay, and late-arm boundaries fail closed.
- The fixture preserves the existing global debug-harness path. Near-Gin
  targeting follows the canonical session-host rule and falls back to the
  earliest participating human when `games.current_host` is temporarily null
  or unresolvable. The complete rollback proof passes both before and after
  production application.
- The initial normal-knock run deterministically completed two legal layoffs,
  then exposed stale presentation selection on the third (`9♣`): a same-phase
  felt-target layoff cleared the layoff target but not the lifted hand-card
  selection after the hand index shifted. Commit
  `8f4617725dab3eb37f14f3eb9b404bd0d8d3a4d8` clears both lifted selections on
  that successful path, matching the existing Cards-tab layoff behavior.
- All four production browser rows—normal knock with repeated layoffs, Gin,
  undercut with hand-two continuation, and stock-two void—then passed against
  that published commit with continuous observation, a 6000 ms peer-progress
  ceiling, exact authoritative outcome assertions, and verified fake-game
  deletion. Vercel reported no runtime errors in the campaign window. Evidence
  is retained under `artifacts/gin-outcome-fix/`.
- The focused nine-test selection contract, TypeScript `tsc --noEmit`, and the
  production build passed. The build included all 39 Cribbage preflight tests
  and only the existing Vite chunking warnings.

This is targeted Gin outcome and repeated-layoff coverage, not full Gin
coverage. No real-money browser session was created or touched.

## Supabase diagnostic quota retention — production checkpoint

- The owned production database reached 595 MB because the daily diagnostic
  purge failed before reaching its high-volume tables. The exact failure was a
  comparison between text `chat_messages.chat_operation_id` and UUID
  `chat_send_operations.id`; 398 MB of `debug_events` and 109 MB of
  `debug_sync_events` consequently remained unbounded.
- Migration `20260831194950_repair_quota_retention.sql` corrects that identity
  comparison, reduces broad diagnostic retention to one day, and installs an
  independent private quota owner. The quota owner retains `debug_events` and
  `debug_sync_events` for one day, successful pg_cron history for one day, and
  failed pg_cron history for seven days. It cannot be blocked by a future
  mismatch in an unrelated diagnostic family.
- The production reclaim preserved the newest 24 hours of both debug tables,
  removed 100,713 expired successful cron records, and then completed the
  repaired broad purge with 3,153 additional expired diagnostic rows removed.
  Database size fell from 595 MB to 92 MB. Gameplay, players, balances,
  results, audit history, session history, and real-money sessions were not
  touched.
- The one-second game-recovery dispatcher is unchanged. Storage is bounded by
  retention without making heartbeat presence an unsafe prerequisite for
  disconnect, timeout, pause, settlement, or fake-money recovery.

## Cribbage deterministic pegging and counting branches — production checkpoint accepted

- The two retained card-order failures were harness oracle defects, not product
  rule failures. The authoritative fixture defines the first-hand sequence by
  source index, while the browser intentionally presents the same hand in rank
  order; the generic terminal actor clicked the first displayed playable card
  and therefore exercised a different legal sequence. The branch driver now
  selects the intended visible card through the real UI and confirms each play
  against authoritative round state. No product rule, RPC, migration, or
  real-money behavior changed.
- Six focused harness contracts, installed TypeScript, the production build,
  all 39 Cribbage preflight assertions, and scoped ESLint passed. Commit
  `9b72339db4c853423d48671bb8b2eda4bfa3988c` published successfully as
  production bundle `assets/index-DUrPnM_Z.js`; Vercel and the public manifest
  identified that exact commit.
- The exact build ran the pegging 15/31/run/Go/reset and counting
  fifteens/flush/nobs rows concurrently as two isolated fake-money pairs. Both
  drove the intended `5,10,6,10,9,8,7,J` first-hand order, entered counting,
  reached terminal hand 4, passed in 5m40s and 5m26s respectively, cancelled
  their fixtures, and verified session deletion. First-hand authority recorded
  the expected 12-point player hand (fifteens, run, and flush), three-point
  dealer hand (pair and nobs), and 12-point crib pair score.
- Continuous observation recorded zero presentation violations and zero
  unexpected 6000 ms peer-progress breaches. The pegging row correlated all 43
  actions with peer p95 3442 ms and max 5939 ms; the counting row correlated
  all 42 actions with peer p95 3733 ms and max 5779 ms. Evidence is retained
  under `artifacts/cribbage-exact-sequence-9b72339db/playwright/`.
- Supabase completed 262 cron runs during the parallel window, but one
  `advance-due-game-state-1s` run ended with `job startup timeout` at
  05:55:43 UTC. It did not produce an observer violation, a peer-budget breach,
  or a failed game assertion, so it does not invalidate the deterministic rule
  results; it remains separate platform-health evidence requiring RCA before a
  stronger service-wide no-stall claim.

This accepts the two deterministic Cribbage rule branches on the exact
production build. It is targeted branch coverage, not full Cribbage coverage,
and no real-money browser session was created or touched.

## Browser presence heartbeat admission liveness — production checkpoint accepted

- The frozen Cribbage incident was not an authoritative game freeze. During a
  project-wide Supabase admission stall, each browser continued starting the
  four-second `voice_presence_heartbeats` auth/upsert path without waiting for
  the preceding request. Four clients accumulated 42 heartbeat writes while
  ordinary requests in a separate game also waited 36--44 seconds. Cribbage
  authority later reached terminal settlement correctly.
- Browser presence publication now has one request owner per tab. A stalled
  auth/upsert remains in flight while later route, context, visibility, and
  interval observations coalesce to the newest status; that newest status is
  drained before ownership is released. The four-second cadence, authenticated
  user lookup, payload, table, and best-effort failure behavior are unchanged.
  Cribbage scoring, counting, continuation, settlement, and terminal fallback
  were not changed.
- Focused tests prove burst coalescing, newest-status draining, and draining
  after a failed best-effort write. Nine combined heartbeat, serialized-fetch,
  and real-money-liveness tests passed, along with ESLint, installed local
  TypeScript, the production build, and all 39 Cribbage preflight assertions.
- Commit `859de6047f8d254918ee95a93104ea312ab3f456` published successfully as
  production bundle `assets/index-BPT27ZQ5.js`. Vercel reported the exact
  commit `READY`; `holm357.com` and its public manifest returned HTTP 200 and
  identified the same commit.
- The exact build then ran three isolated fake-money pairs concurrently with
  continuous observation and a 6000 ms unexpected-peer ceiling. Qualifying
  and nonqualifying crib-flush branches passed. The pegging 15/31/run/Go/reset
  and counting fifteens/flush/nobs branches both reached terminal settlement
  and verified cleanup, then failed the same post-terminal harness assertion:
  authority contained the expected eight cards in a different legal play
  order. That oracle discrepancy remains retained failure evidence and is not
  counted as accepted rule-branch coverage.
- Across the four completed games, every host and peer recorded a maximum of
  one concurrent `voice_presence_heartbeats` request, including a heartbeat
  delayed 15.1 seconds. All four observer exports recorded zero presentation
  violations and zero non-exempt peer-budget breaches. Every exact fixture was
  cancelled and every fake-money session deletion was verified. During the
  three-way window, Supabase recorded 890 successful cron runs and zero
  `job startup timeout` events. Evidence is retained under
  `artifacts/cribbage-heartbeat-859de6047/playwright/crib-heartbeat-859d-v3-*`.

This accepts the single-flight/coalesced presence-heartbeat admission boundary
on the exact production build. It does not claim full Cribbage branch coverage:
the two card-order oracle failures remain unresolved, and no real-money browser
session was created or touched.

## Full-seam Wave 0 Cribbage rule fixtures — latency RCA corrected; exact fixture cut passes

- `e2e/fullSeam/manifest.ts` is now the versioned campaign ledger. It inventories
  all 19 branch-smoke rows, seven terminal rows, and 79 lifecycle rows, and
  separately locks all 79 rule requirements from the gauntlet plan. Missing
  rule drivers stay explicit; they are not counted as coverage.
- The formerly blocked `cribbage-dealer-draw-forced-tie-rejoin` row now uses an
  exact-game, admin-and-participant-scoped, fake-money-only fixture. The request
  expires within 15 minutes, is atomically consumed once by the existing
  Cribbage dealer-selection authority, and can be inspected and cancelled by
  its owner. It never changes the global harness mode or the normal random draw
  path, and it refuses real-money and terminal sessions.
- The rollback proof passed before installation and again against the deployed
  functions. It covers authorization, real-money and terminal rejection,
  exact-game isolation, forced tie and winner, duplicate/replay, continuation
  into the first hand, late replay, expiry, cancellation, and preservation of
  the global harness gate. Contract tests and TypeScript also pass.
- Migration `20260830213000_cribbage_rule_branch_harness.sql` is installed on
  the owned production project. It exposes the three existing authoritative
  profiles (`near_double_skunk`, `max_pegging_fan`, and `perpetual_heels`) only
  through expiring, exact-game, fake-money, two-active-human requests. The
  authenticated admin participant owns arm/get/cancel; the private first-hand
  consumer atomically disarms the request. The campaign marker is removed from
  every public/projected state, successor hands are ordinary, global
  `harnesses_mode` and `game_defaults.debug_harness` are unchanged, and all
  real-money requests fail closed.
- The new rollback proof passed before installation and again against the
  deployed definitions. It covers winner, dealer-draw tie compatibility,
  duplicate/replay, late replay, authorization, exact-game isolation,
  deterministic continuation, terminal-from-cut, real-money/terminal/profile
  rejection, private-marker redaction, and preservation of both global harness
  owners.
- The retained latency traces showed two independent sources of false or
  avoidable contention: production Go-race tracing was default-on and issued
  non-deduplicated writes from both clients, and pegging history writes could
  start before the authoritative action RPC returned. Go-race tracing is now
  explicit opt-in, and successful applied-action history is derived from the
  returned authoritative state after the RPC receipt. The deliberate
  session-start peer-offline burst is labeled before its tracked click, so it
  remains observable without becoming an unmarked budget failure.
- Validation passed 12 focused ownership/activation/observer tests, local
  TypeScript, the production build, and all 39 Cribbage preflight assertions.
  The repository-prescribed `bunx tsgo --noEmit` path was unavailable on this
  host, so the installed local `tsc --noEmit` executable supplied the clean
  TypeScript result; no dependency was installed.
- The exact published target is commit
  `e8bf659772556bc3914895ba4bd0caa227bcb220` and production bundle
  `assets/index-B0pV1cEW.js`. GitHub/Vercel reported the deployment completed
  successfully at 2026-08-30 21:29 UTC; `holm357.com` and the public manifest
  returned HTTP 200 and identified that exact commit.
- Three isolated observer-enabled production fake-money rows then passed
  concurrently with an unchanged 6000 ms unexpected-peer budget. Near
  double-skunk completed in 71.0 seconds with 13 receipts, peer p50 1379 ms and
  p95/max 5290 ms. Nonterminal His Heels completed in 59.9 seconds with 13
  receipts, peer p50 830 ms and p95/max 6079 ms; its sole over-6000 sample was
  the explicitly labeled session-start outage. Max pegging/counting completed
  in 126.3 seconds through hand 2 with 18 receipts, peer p50 1395 ms, p95/max
  5128 ms, eight first-hand pegging cards, and three counting targets.
- All three rows recorded zero observer violations and zero unexpected
  peer-budget breaches, consumed and cancelled their exact fixtures, reached
  terminal settlement/admission, and verified guarded fake-money deletion.
  Evidence is retained under
  `artifacts/cribbage-latency-e8bf65977/playwright/crib-lat-e8bf-*`.

This accepts the near double-skunk, max pegging/counting, and nonterminal His
Heels rows on the corrected exact production build, alongside the previously
accepted terminal His Heels row. It is a targeted rule-fixture and latency
checkpoint, not full Cribbage coverage: topology/crib, complete pegging
branches, counting order/categories, all terminal-entry phases, targets/skunks,
and phase rejoins remain explicit missing drivers. No real-money browser
session was touched.

## Gin Rummy discard-pile rejoin lock — production smoke accepted

- The server already rejected discarding the card just taken from the discard
  pile, but the hand UI derived its disabled card only from a local
  draw-transition presentation latch. A reload mounted directly in the discard
  phase, so that latch was absent and the illegal card appeared selectable.
- The client now derives the one forbidden rediscard from the authoritative
  private Gin projection: playing/discard phase, exact current player,
  `drawSource = discard`, and that player's unmasked `draw_discard` last action.
  The same policy guards card selection, the disabled control, and discard
  submission. The local drawn-card latch remains presentation-only; stock draws
  remain legal to discard, and layoff, server rules, settlement, and financial
  behavior are unchanged.
- The branch-smoke matrix now has explicit first-upcard-take, dealer-upcard-
  after-pass, discard-pile-rejoin, and multi-hand Gin rows. Earlier production
  runs passed the first-upcard, dealer-upcard, and multi-hand branches; the
  discard-pile row supplied the frozen repro for this correction.

Validation: 33 focused discard-policy, presentation-identity, and Gin gameplay
assertions passed; the exact Playwright row was discovered; TypeScript passed;
and the production build plus its 39 Cribbage preflight assertions passed.
Published commit `ad4ab01e078b16c2a5b671fc6575219048aafcf9` served as
bundle `assets/index-BmWl12Ik.js` and passed the isolated production fake-money
`gin-discard-pile-rejoin` row in 5.1 minutes. The scenario proved both opening
passes, an automatic stock draw, ordinary stock draw/discard, route reload,
discard-pile draw, exactly one disabled taken card, continued play, and terminal
settlement at hand 3. All 119 observed actions had correlated evidence; RPC p95
was 987 ms, actor p95 94 ms, and peer p95 3007 ms. There were zero presentation
violations and zero unmarked 6000 ms peer-budget breaches; the one deliberate
request-timeout recovery was labeled separately. Guarded cleanup of fake-money
game `1edef64c-e8b5-4107-8fea-2102811e61d0` was verified. Evidence is under
`artifacts/gin-discard-lock-ad4ab01e0/gin_discard_rejoin_ad4ab01e0_1`.
No real-money session was touched. This accepts the targeted rule/rejoin seam,
not complete Gin rule-branch coverage.

## Gin Rummy live-action latency correction — production campaign accepted

- Production transition evidence isolated three competing read owners around
  ordinary Gin actions: every client polled `games` for existence and pause
  state, metadata-only `games` UPDATE receipts scheduled full parent snapshots,
  and first-draw Take/Pass serialized a private-state read ahead of the
  immutable action RPC. Under long-haul Supabase latency, those reads contended
  with the action and delayed peer projection installation beyond 6 seconds.
- Healthy live tables now rely on their existing `games` DELETE/UPDATE
  subscriptions, with cold-mount, foreground, reconnect, and channel-error
  snapshots retained. Metadata-only Gin game receipts install directly without
  a parent refetch; every lifecycle/routing-field change still fails closed to
  the existing transition handler. Other game families retain their prior
  receipt handling.
- First-draw Take/Pass now submit from the latest accepted caller-specific
  projection. `gin_rummy_apply_action` still validates immutable action count,
  authorization, phase, and replay identity. No database function, rule,
  settlement path, or financial behavior changed.
- The continuous observer now correlates Gin clicks to the mutation RPC rather
  than an adjacent read and explicitly labels the harness's one deliberate
  request-timeout/lost-response recovery. Only labeled delays are excluded from
  the ordinary 6000 ms peer budget.

Validation: 27 focused ownership, action-recovery, observer, and network tests
passed; the two-context browser observer contract passed; TypeScript passed;
and the production build plus its 39 Cribbage preflight assertions passed.
Published commit `f11c8ec552d949d3c66bed00b0dd75951046c6a6` served as
bundle `assets/index-Bp9afrkd.js` and passed the isolated production fake-money
`gin-rummy-same-game-changed-parameters` transition in 15.6 minutes. Both
50-point games settled, only `per_point_value` changed from 0 to 1, cleanup was
verified, and all 390 actions recorded correlated evidence. RPC p95 was 868 ms,
actor p95 93 ms, and peer p95 2726 ms, with zero presentation violations and
zero unmarked 6000 ms peer breaches. The two deliberate recovery delays were
recorded separately.

The applicable Gin deadline seams then passed concurrently: dealer-setup
timeout/rejoin in 1.5 minutes and ante timeout/rejoin in 39.9 seconds, both with
zero violations, zero page crashes, zero peer-budget breaches, and verified
guarded cleanup. Human Gin gameplay is intentionally untimed, so no gameplay
timeout scenario was invented. Evidence is under
`artifacts/gin-acceptance-f11c8ec55` and
`artifacts/gin-deadlines-f11c8ec55`. This is targeted lifecycle/liveness
coverage, not a claim of complete Gin rule-branch coverage. No real-money
session was touched.

## Gin Rummy transition configuration and campaign oracle — Run Back smoke accepted

- Gin Rummy Run It Back now submits the prior dealer game's immutable
  committed configuration directly. It preserves ante, points target,
  per-point value, Gin bonus, and undercut bonus, and fails closed if any field
  is unavailable instead of substituting setup-form defaults.
- The session client captures those Gin fields from the authoritative
  `dealer_games.config` row while the completed configuration is live. Other
  game setup and Run It Back paths are unchanged.
- The transition campaign now reads both committed dealer-game configs before
  driving successor play. Unchanged scenarios require exact equality; the Gin
  changed-parameter lane stays at 50 points and changes only per-point value
  from 0 to 1, so configuration defects fail immediately rather than surfacing
  as a 45-minute gameplay timeout.
- The continuous observer now treats opponent card-back count changes as peer
  progress. Hidden Gin stock draws are timed when the peer receives the card,
  rather than being misattributed to the later visible discard.

Validation: 10 focused Run Back and observer unit assertions passed; the
two-context browser observer contract passed; full TypeScript passed; and the
production build plus its 39 Cribbage render/rejoin preflight assertions
passed.

Published production commit `9b7b70c13726e836d63afcac83930bb47f9bdc86`
then passed the isolated `gin-rummy-run-it-back-unchanged` fake-money smoke.
The source and successor committed the exact same 50-point Gin configuration,
the successor reached terminal settlement, all 486 actions recorded RPC,
actor, and peer progress, the observer found zero violations and zero 6000 ms
breaches (peer p95 2497 ms, max 3282 ms), and cleanup was verified. An earlier
attempt failed in the source game before Run Back when one stock-draw RPC
failed after 9953 ms; it was cleaned up and remains separate liveness evidence
for later RCA.

The parallel changed-parameter smoke also completed both games and proved that
only `per_point_value` changed from 0 to 1 while the 50-point target, ante, and
bonuses stayed identical. It is not accepted as a full observer pass: 2 of 438
actions exceeded the peer budget (6943 ms and 11610 ms), both on peer discards
whose RPCs took more than 4.3 seconds. It had zero presentation violations,
settled successfully, and cleaned up safely. No real-money session was touched.

## Cribbage action-liveness correction — production smoke accepted

- Production fake-money gauntlet evidence isolated a Cribbage client request
  ownership defect. A card play performed an unbounded state-read preflight,
  while its local writer lock was released by card-animation settlement before
  the authoritative action RPC finished. Under observed Supabase latency this
  admitted duplicate immutable writes, then left the next playable card behind
  a pending read with no visible request gate.
- Cribbage now submits the current exact round/player/card/event-sequence intent
  directly to the replay-safe PostgreSQL action owner. Every play, Go, and bot
  action has a bounded two-attempt transport path; ambiguous response loss and
  PostgreSQL statement timeout replay the same immutable intent, so the server
  resolves it as the original commit or a stale authoritative projection.
- The local pegging writer lock now follows the RPC lifecycle, independently of
  card animation. Cards remain visibly disabled while authority is unresolved;
  animation settlement cannot admit a second writer. Exact hand/phase identity
  changes still clear obsolete locks.
- Counting presentation still persists only a monotonic cursor, but each client
  now permits one cursor RPC in flight and retains only its newest pending beat.
  Slow progress writes can no longer pile up ahead of counting completion.
  Scoring, rules, settlement, release leases, and database functions are
  unchanged.

Validation: 52 focused Cribbage request, counting, synchronization, and
liveness tests passed; TypeScript passed; the production build and its 39
Cribbage render/rejoin tests passed. The broad liveness suite retained its one
documented unrelated Windows line-ending failure in the session dealer-draw
tie-harness source assertion.

Published production commit `8cc8275fe5646a26ed4183e222702923067ed0d6`
then passed two concurrent, isolated fake-money mobile interaction smokes at
393x662 and the formerly failing 342x576 viewport. Both reached terminal hand
5 through repeated pegging/counting/next-hand transitions, recorded zero
continuous-observer violations, stayed under the 6000 ms peer-progress budget
(maxima 3325 ms and 3437 ms), and verified guarded cleanup. No real-money
session was touched.

## Yahtzee authenticated resume authority — production smoke accepted

- Production smoke exposed that canonical resume shifted Yahtzee's protected
  JSON turn deadline without opening the Yahtzee authoritative-write boundary.
  Authenticated host/admin resume therefore failed while the game correctly
  remained paused.
- Migration `20260828174500_yahtzee_resume_authority.sql` gives only the exact
  canonical Yahtzee resume mutation the same transaction-local authority used
  by other Yahtzee RPCs. Existing host/admin authorization, pause ownership,
  deadline shifting, and every non-Yahtzee path remain unchanged.
- The rollback proof now clears fixture authority and resumes as the actual
  authenticated host. It requires the game to unpause, both deadline copies to
  stay identical and future-dated, and action sequence zero to remain intact.
  The complete proof passed in a rollback transaction before deployment and
  again against the deployed definition. Published two-client smoke on
  2026-08-28 confirmed that the authenticated host can resume the paused game
  and the timed-out player receives a fresh configured turn timer.

## Yahtzee timeout presentation corrections — production smoke accepted

- Yahtzee now reads its own `game_defaults.decision_timer_seconds` row for
  timer presentation; the former hard-coded 60-second denominator is removed.
  Warning states are proportional to the configured turn: yellow at 25% and
  red at 10% remaining.
- Every viewer now derives the active human's countdown from the same
  authoritative Yahtzee deadline. The acting player retains the shell timer
  rail, while opponents see the canonical countdown ring around that active
  seat's chip stack. Fake-money auto-rolling humans receive the existing
  Horses/SCC bot indicator without changing their human identity.
- The authoritative game pause flag is now threaded into Yahtzee timer and
  tab presentation, so a real-money timeout freezes the local display. The
  `game_paused` ambient also preempts lingering gameplay announcements, making
  “Game is paused — only the host can resume” immediately visible to everyone.
- Follow-up production smoke proved two presentation races. The Yahtzee turn
  publisher could replace the pause ambient in the same render, and its action
  surface remained mounted even though the authoritative RPC correctly
  rejected paused actions. The client now suppresses turn announcements and
  every Roll/hold/score affordance while paused. The database timeout owner is
  unchanged.
- The opponent countdown now captures one immutable active segment and keeps
  descending across incoming display ticks. Yahtzee no longer paints the
  static yellow turn ring beneath that countdown, leaving one proportional
  green/yellow/red ring owner around the active opponent chip.
- Final smoke showed the shared timer's separate full-circle glow could still
  visually mask the correctly descending SVG arc. The full foreground border
  is removed; its glow and pulse now belong to the shrinking arc itself, with
  one muted track behind it. A regression test enforces that single foreground
  owner for every canonical seat-timer consumer.
- The first single-arc build exposed a geometry seam: the canonical seat
  cluster injects its 40px chip diameter into the HUD, leaving a same-size SVG
  entirely behind the chip. The SVG now projects to a 48px outer diameter, so
  its 4px stroke sits outside the chip without covering the value. The DOM
  proof exercises that exact production 40→48 geometry.
- Focused timer/announcement tests, TypeScript, and the production Vite build
  pass. Published two-client fake- and real-money smoke on 2026-08-28 at commit
  `b3051358abebea3cc7681a27074c0b499e2617bd` confirmed the configured
  60-second timer, proportional warning colors, pause presentation, and one
  visible decrementing opponent ring around the canonical chip stack.

## Yahtzee whole-turn timeout ownership — production smoke accepted

- Migration `20260828110000_yahtzee_whole_turn_timeout.sql` makes the
  server-owned deadline cover a complete Yahtzee turn, rather than renewing it
  after each roll or hold. An expired ordinary human action is rejected rather
  than racing the due-turn owner.
- In fake-money play only, the exact due-turn owner marks the timed-out human
  `auto_fold=true` and `sit_out_next_hand=true`, then arms a new server-only
  recovery window. The timed-out human’s authenticated browser uses the normal
  paced bot sequence, so each roll is an authoritative Realtime update visible
  to both players; its timer and manual controls are suppressed while Auto-roll
  is active. If no browser completes that armed turn, the next due event is the
  replay-safe server fallback. The player keeps their human identity. Yahtzee
  exposes the matching visible Auto-roll rejoin checkbox, which clears both
  flags for the next hand.
- Real-money expiry remains the existing pause-only path: it neither changes
  the player automation flags nor rolls/scores, and resume retains a fresh
  full-turn deadline. The pre- and post-migration rollback proof passed,
  including deadline preservation, late action rejection, whole-turn fake
  recovery/replay, settlement/continuation, and real-money pause/resume.
  Published two-human fake-money smoke on 2026-08-28 confirmed immediate paced
  auto-play across the full turn, peer-visible rolls, the bot indicator, and
  rejoin through the visible Auto-roll checkbox.

## Yahtzee real-money timeout safety — production smoke accepted

- Migration `20260827140000_yahtzee_real_money_timeout_pause.sql` changes
  only the authoritative due-turn owner. An expired real-money Yahtzee turn
  now pauses the exact game without rolling, holding, scoring, advancing, or
  settling any state. Fake-money Yahtzee retains deterministic timeout auto-play.
- Before the real-money pause is committed, the owner writes one fresh
  server-owned turn deadline for the timed-out player. Canonical resume shifts
  that fresh deadline by the paused duration, so resuming cannot immediately
  re-timeout the game.
- The complete rollback-only Yahtzee authority proof passed against the
  deployed project before and after the migration, including authorization,
  duplicate/late replay, tie/winner/terminal continuation, fake-money auto
  recovery, and the real-money pause/resume path. Published real-money client
  smoke on 2026-08-28 confirmed the pause announcement, inert action controls,
  no bot/sit-out inheritance, authenticated host resume, and a fresh turn
  timer after resume.

## Full human-to-human seam campaign — plan locked, execution held

- `FULL_SEAM_GAUNTLET_PLAN.md` now defines the closed coverage ledger,
  game-by-game rule branches, deterministic fault schedules, continuous
  assertions, latency/freeze budgets, parallel identity isolation, failure
  handling, invalidation reruns, and final completion gates for the next
  browser campaign.
- The plan keeps the existing 79 lifecycle rows distinct from the incomplete
  rule-branch inventory. It records that only 78 lifecycle rows are currently
  executable because the account-scoped Cribbage forced-tie dealer fixture is
  missing, and it makes that fixture plus deterministic rare-outcome fixtures
  a Wave 0 prerequisite.
- Execution is intentionally held. No browser, database, fixture, gauntlet,
  production canary, or deployment action was run while this plan was built.
  A separate go-ahead outside the scheduled real-money game window is required
  before Wave 0 or any scenario begins.

## Continuous human-chaos observation upgrade — campaign not started

- Human-chaos contexts now install a presentation observer before either
  browser logs in, so its evidence survives the intentional peer route remount.
  It continuously records canonical lifecycle identity, action surfaces,
  timers, visible face cards, announcements, setup/celebration layering, card
  transport, and session/round transitions on both clients.
- The browser campaign now fails closed on a visible masked card face,
  duplicate or persistently absent canonical shell/felt, timed legal controls
  without a timer, Dealer Setup or Sweep below the tab rail, and browser page
  errors/crashes. This converts the transient Gin `??`, 3-5-7 control/timer,
  and overlay seams from eventual-state blind spots into retained evidence.
- Every tracked action is correlated with its Supabase RPC and the first
  changed actor/peer presentation signature. Evidence reports RPC, local, and
  peer latency distributions. `PTOWN_E2E_MAX_ACTION_TO_PEER_MS` can make an
  agreed campaign latency budget fail closed; no threshold has been guessed or
  enabled before the execution plan is approved.
- Draw, deadline/rejoin, and transition specs attach the independent continuous
  observer artifact before guarded cleanup. The seven-test harness contract
  and its two-context Chrome injection contract pass, as do focused lint and
  TypeScript. No human-chaos scenario has been executed with this observer yet;
  campaign scope, ordering, repetition, and latency budgets remain the next
  planning step.

## Aug 26 real-money Cross-Country liveness corrections — pending smoke

- Production session `799b8a4d-a21b-4a75-acb9-767021fe4883` settled every
  Cribbage, Gin, Holm, and 3-5-7 result exactly once, but exposed three
  independent presentation/liveness boundaries. Holm prepared hands could
  lose their next-actor deal acknowledgement when visual completion preceded
  installation of a client ref; one canonical timeout was consumed by a
  transaction-stable `now()`/wall-clock disagreement; and the completed Holm
  projection survived after PostgreSQL cleared the dealer-game identity.
- The Holm client now derives its acknowledgement tuple from the authoritative
  prepared predecessor/successor rows and wakes a level-triggered drain when
  that exact identity arrives. The route hard-resets Holm gameplay projection
  and caches when authority clears or rotates the dealer game, while retaining
  the canonical table/HUD and the existing terminal presentation contract.
- Migration `20260827081000_holm_deadline_clock_and_reschedule.sql` uses the
  wall clock consistently for Holm deadline expiry. A defensive early call
  returns its exact deadline, and the canonical timer worker reschedules that
  outcome instead of completing the timer. Pre- and post-migration rollback
  proofs cover authorization, winner/terminal settlement, auto-fold
  continuation, duplicate/replay, late replay, the former cross-deadline race,
  and deployed function shape.
- Gin's knock display no longer paints locally derived opponent cards while
  their caller projection is masked; it waits for known faces from the exact
  post-knock projection. Actor RPC duration, authoritative fetch duration, and
  Realtime-to-peer-application duration are now attached to the existing Gin
  debug events for future production latency attribution.
- 3-5-7 now evaluates action eligibility, active tab, lifecycle, player,
  auto-fold, and setup gates as one decision-surface envelope. The DOM probe
  uses that same envelope and correctly cancels both animation frames, so a
  hidden tab/setup frame is no longer reported as a missing legal action.
- Thirty-four focused assertions, TypeScript, the 39-test build prerequisite,
  and the production build pass. The wider liveness contract remains 247/248
  solely because of the unchanged dealer-draw harness source-string whitespace
  assertion against untouched files. Production client smoke is still
  required before this becomes a stable checkpoint.

## Server-owned session start

- Production commit `a88af23c9` replaces the waiting-table Start Game
  sequence of independent client writes with authenticated
  `public.begin_session_dealer_selection`. The RPC locks the session, verifies
  the canonical session host and opted-in seated cohort, normalizes an exact
  two-player topology atomically, clears only the next-dealer-game scaffolding,
  and transitions to `dealer_selection`; the existing canonical timer trigger
  owns preparation and completion of the high-card draw.
- The correction closes the production failure in which the browser completed
  player/seat writes but its direct `games` update reached PostgREST as `anon`
  and was rejected by the deliberate `games` RLS privilege boundary. Duplicate
  starts return `already_started`; unauthorized, late, and terminal starts do
  not mutate lifecycle state.
- A rollback-only production proof covered start, duplicate replay, timer
  identity, authorization, high-card winner/tie continuation, late replay, and
  terminal-state rejection. The published production build then passed the
  two-human Cross-Country session-draw smoke in 24.8 seconds with guarded
  fake-money cleanup.

## 3-5-7 live authoritative-readiness recovery

- A two-browser production replay of the `3-5-7-run-it-back-unchanged`
  cross-country scenario found that one client could hold a complete current
  private hand while its local card-transport receipt never released. That
  presentation-only receipt suppressed both the legal action controls and the
  timer despite the authoritative round remaining live and actionable.
- Published commits `2315fbad6`, `54bac2637`, and `544372002` remove the
  dealer-host fallback-frame dispatch block, then allow only an exact,
  live, in-progress betting hand with the expected current-round card count
  to recover a missing local receipt. Historical entries, incomplete hands,
  terminal state, and mismatched hand/wave/round identity remain blocked.
  The recovery displays the same identity-matched authoritative hand rather
  than treating local animation state as gameplay authority.
- The final immutable production deployment for `544372002` passed the same
  two-human Run Back scenario with long-haul transport disorder and an
  injected offline burst: both clients reached the required 3-5-7 decision
  surface and guarded fake-money cleanup verified. This is targeted
  transition evidence, not a substitute for the wider full-game matrix.

## Parallel browser-campaign isolation gate

- The first parallel per-game pilot did not produce product evidence for every
  worker: concurrent processes shared Playwright artifacts and the configured
  environment supplied only one authenticated human pair. Gin, Holm, and
  3-5-7 passed their direct runs; Horses and Ship Captain Crew recorded
  failures; Cribbage and Yahtzee were inconclusive after artifact overwrite.
  No pilot result is attributed to product behavior beyond its retained direct
  evidence.
- Commit `0e85a0920` makes future parallel work fail closed without both a
  named identity slot and run namespace, leases the selected account pair
  locally, isolates artifacts/reports by namespace, and writes the generated
  fake-money game UUID plus guarded-cleanup receipt to the test output.
- The timeout, rejoin, high-card tie, and cross-dealer transition matrix may
  begin only after distinct configured identity slots exist for its workers.

## Branch-smoke matrix — initial execution

- The browser matrix now has eleven independently-run, two-human fake-money
  scenarios. It first drives a named rule branch, then requires the same
  dealer game to reach exact terminal settlement, connected Session Ended,
  fresh-client lobby admission, and guarded cleanup under cross-country
  transport disorder.
- The first systematic run completed all eleven entries in 30.4 minutes.
  Nine passed: Holm all-fold carry-forward, solo-vs-Chucky, and multi-stayer
  showdown; 3-5-7 both-fold, both-stay, and regular-leg-to-terminal; Horses;
  Ship Captain Crew; and the full Yahtzee scorecard.
- Cribbage's 61-point multi-hand scenario failed closed when neither client
  exposed a legal action surface. Gin's multi-hand scenario recorded a
  bounded authoritative-proof abort and then a cleanup route-redirect failure.
  Each failure has an independent Playwright trace, screenshots, and attached
  scenario evidence. No root-cause investigation or product-code change was
  performed during the matrix run.

## Two-human terminal-settlement gauntlet

- Production now has an independent full-match browser tier for all seven
  games. Each scenario uses two distinct signed-in humans, fake money, the
  cross-country transport profile, a lost committed ante response, and an
  offline burst after live gameplay. It plays legal actions until the exact
  terminal settlement exists; startup or a visible first action is not a pass.
- Holm, 3-5-7, Cribbage, Gin Rummy, Horses, Ship Captain Crew, and Yahtzee all
  passed against published runtime commit
  `4023c6c1ac891f4402e2ace59b132a3776cb0c92`. Every pass proved one exact
  terminal result with a winner, two distinct human terminal snapshots, the
  connected host's Session Ended table phase, the ended game row, and a fresh
  peer mount returning directly to the lobby. Guarded fake-money Blast cleanup
  completed for every session.
- The gauntlet found two production liveness defects before the complete pass.
  The 3-5-7 LAST HAND request was rejected by a direct client patch and now
  uses the replay-safe authoritative request RPC with the canonical fallback
  host identity. A Gin peer could remain on `Preparing hand...` after its exact
  private-state read failed during an offline burst; the browser `online` edge
  now immediately fans out the existing exact game-specific recovery loaders
  independently of the serialized full fetch. Existing identity/progress
  guards remain the admission authority, and no polling was added.
- Focused recovery assertions pass 10/10, TypeScript and the production build
  pass, and the existing rollback proof covers the 3-5-7 request's winner,
  tie, duplicate, replay, late-replay, authorization, continuation, and
  terminal-state paths. The wider contract run remains 239/240 solely because
  of the unchanged Windows line-ending assertion in the dealer-draw harness.
- The final Gin replay also hardened the test itself: simple-game configuration
  now waits for its defaults read before applying overrides, selectable-card
  transport must expose all eleven cards before discard, and a single aborted
  database-proof read gets one bounded retry. The replay passed exact terminal
  proof in 7.3 minutes. The product UI can still visibly accept a Gin setting
  before its defaults request resolves; correcting that separate setup race is
  deferred and is not classified as a gameplay freeze.

## Two-human browser liveness gauntlet

- The freeze audit now has an actual browser tier instead of counting Vitest
  source/contract checks as multi-client proof. Playwright launches two
  isolated signed-in Chrome contexts, creates a fake-money table, seats two
  distinct humans, and exercises all seven dealer-game types independently.
- The mobile peer receives deterministic long-haul HTTP and Realtime delay,
  loses connectivity during the session dealer draw, loses the exact response
  to a committed ante RPC, disconnects again after live gameplay exists, and
  remounts the whole route while delayed frames remain in flight.
- Each client must converge on the same authoritative session and dealer-game
  identities with one canonical shell and felt. The run also requires a real
  visible legal-action surface on at least one entitled client after recovery;
  an empty table, duplicate shell, bootstrap limbo, or identity split fails.
- The suite never enables Real Money, bots, a global game harness, polling, or
  a product-only progression API. Player 1 must have the existing guarded
  fake-money Blast authority, and cleanup is mandatory even after a failed
  scenario. Missing credentials or cleanup acknowledgement fail closed.
- The first authenticated production execution exposed and corrected one
  harness assumption: dealer configuration already commits the dealer's ante,
  so exactly the non-dealer receives the decision surface. The corrected
  harness dynamically impairs whichever client owns that decision instead of
  requiring both clients to see it. The complete rerun passed all seven games
  plus the isolation runner, 8/8 in 4.0 minutes, against published frontend
  commit `716ce39a93e8c38972981b1ab81f555dd2c6b1e1`; every fake-money session
  was removed through the guarded Blast path.
- Both application and browser-suite TypeScript checks, the new-file lint,
  all 35 build-required Cribbage assertions, and the production build pass.
  The full contract gauntlet remains 239/240: its sole failure is the unchanged
  CRLF-sensitive dealer-draw migration string assertion. Public signup's Auth
  database-save error remains a separate account-provisioning defect; it did
  not affect the run with the two supplied existing identities.

## Holm result-first celebration admission and 3-5-7 remount recovery

- Production session `Aug 24 - Dire Wolf` proved two independent client
  presentation failures while every authoritative Holm result, transfer, and
  later 3-5-7 postgame transition committed correctly. A lone Holm winner's
  terminal result could arm confetti and pot presentation before that browser
  painted the tabled hand. Separately, one 3-5-7 client entered terminal
  animation, lost its local table owner during the postgame handoff, and
  remained latched even after another client and PostgreSQL advanced.
- A Holm Chucky-win result is no longer a visual admission receipt. The exact
  client must first acknowledge the same hand's tabled cards, community
  reveal, hand-call emission, Chucky admission, and final Chucky flip before
  the celebration trigger reaches `HolmWinPotAnimation`. Multi-player Chucky
  outcomes retain their existing community/Chucky completion boundary.
- The route-owned 3-5-7 terminal trigger now survives until the real completion
  callback instead of being erased at animation start. An MGT remount may
  resume the immutable outgoing descriptor through the authoritative null
  dealer-game handoff; a missing trigger rejects completed-history replay, and
  a different concrete dealer game rejects the stale descriptor.
- No database or financial behavior changed. Thirty-five focused assertions
  and TypeScript pass. The full liveness gauntlet passes 239 of 240 assertions;
  its sole failure is the unchanged dealer-draw harness test's CRLF-sensitive
  source assertion against an untouched SQL migration.

## One-shot session dealer-draw tie smoke fixture

- Published two-client production smoke `Aug 24 - Dansby Swanson` passed at
  commit `f97aa9caec063ce8e4a88f30e3084baf124dd930`: both clients presented the
  tied first wave and K/Q tiebreaker before Dealer Setup, the modal covered the
  completed draw correctly, and the one-shot request consumed itself.
- Admin Game Defaults now exposes a dedicated session dealer-draw smoke
  fixture. Arming it targets only the authenticated admin's next hosted
  session, expires after ten minutes, and is consumed atomically by one draw.
- PostgreSQL remains the dealer-draw owner. The fixture orders a legal unique
  deck so the first two eligible seats receive tied aces and the tiebreaker
  receives K/Q; the ordinary rank loop, stored multi-wave receipt, winner,
  canonical timer, and setup continuation all run unchanged.
- This control does not turn on the persistent `harnesses_mode` gate, so saved
  Cribbage, Gin, Holm, or other game profiles cannot become active as a side
  effect. Wrong-host, expired, duplicate, late-replay, paused, and terminal
  paths fail closed or retain the normal shuffle.
- A rollback-safe database proof covers authorization, tie/winner, deck
  uniqueness, one-shot consumption, host/expiry isolation, replay, lifecycle
  continuation, terminal rejection, and preservation of the global harness
  gate. The installed definition passed that proof; TypeScript, all 232
  liveness assertions across 39 files, all 35 build-required Cribbage
  assertions, and the production build pass.

## Session dealer-draw tie presentation and setup admission correction

- Production smoke `Aug 24 - Chalk Dust Torture` produced a valid two-player
  tie in the session dealer draw. PostgreSQL correctly published one completed
  four-card receipt containing rounds 1 and 2, but the normal client rendered
  all four cards at once. The Cross-Country Chaos dealer did not paint the
  receipt until its local status was already `game_selection`, so Dealer Setup
  mounted before that client completed the draw presentation.
- The database remains the sole shuffle, winner, lifecycle, and timeout owner.
  Each connected client now derives cumulative visual waves from the durable
  cards' `roundNumber`, acknowledges a wave only when every expected card is in
  the DOM, and completes the receipt only after the final winner dwell. A live
  setup modal is withheld on that client until this receipt completes; an
  absent client never blocks PostgreSQL progression or setup timeout recovery.
- Receipt identity now includes authoritative `preparedAt`, so a later draw in
  the same session cannot be mistaken for an earlier identical card result.
  Delayed acknowledgements from an older wave are rejected, while a cold mount
  already in setup still does not replay historical cards.
- `DealerGameSetup` no longer uses global Tailwind `z-50` below the shell's z78
  high-card portal. Every setup surface uses the named canonical modal band and
  therefore covers high-card, chip, and card-transport layers defensively.
- The permanent real-money liveness gauntlet now includes ordered two- and
  three-wave ties, stale-wave rejection, exact DOM-card admission, both setup
  mount gates, and modal-layer ordering. All 229 assertions across 38 files,
  TypeScript, all 35 build-required Cribbage assertions, and the production
  build pass.

## Holm Chucky-win presentation completion correction

- Fake-money smoke `Aug 24 - DeMar DeRozan` settled the terminal Holm hand and
  immutable cursor-7 award exactly once: $6 moved from the pot to Hap and both
  endpoint balances reconciled. Both connected clients nevertheless entered
  postgame about nine seconds later without a visible win-pot sequence. The
  connected callback, not the 15-second database fallback, advanced setup.
- The canonical-ledger cutover had hidden `HolmWinPotAnimation`'s legacy chip
  markup with `presentationOwned` while retaining its 5.5-second completion
  clock. That clock plus the existing three-second dwell could submit postgame
  even if the canonical transfer never settled locally. Separately, the
  database journals `chucky_final_award` as reason `transfer`, while Holm's
  stage classifier recognized only reason `win` pot awards, so the exact batch
  settlement was not a terminal completion owner.
- Holm now classifies the exact Chucky recipient cohort, amount, and published
  cursor as `chucky-final-award`. Connected postgame requires both the existing
  celebration completion receipt and a durable `settled`/`reconciled` receipt
  for that immutable cursor. The legacy timer cannot advance by itself;
  unknown pot awards fail closed. PostgreSQL settlement, balances, Chucky
  reveal cadence, three-second result dwell, replay-safe postgame claim, and
  the 15-second disconnected-client fallback are unchanged.
- The permanent real-money liveness gauntlet now covers this exact gate,
  actual `transfer` journal reason, both receipt orderings, reconciliation,
  wrong-cursor rejection, and the absence of the legacy direct callback. All
  220 gauntlet assertions, 56 focused assertions, TypeScript, all 35
  build-required Cribbage assertions, and the production build pass. One
  pre-existing `HolmCanonicalCommunityRow` test remains independently red
  because it does not clean up its first DOM render; no community-row source or
  test was changed in this correction.

## Sweep-the-Legs HUD stacking regression correction

- The accepted freeze smoke exposed a separate P1 presentation regression:
  HUD Stack row 2 painted above the restored normal 3-5-7 Sweep-the-Legs
  celebration. The tab rail correctly lives in a `document.body` portal, but
  this older celebration still relied on a local `z-[1000]` inside the
  transformed gameplay tree. Its ancestor stacking context therefore lost to
  the body-portaled rail despite the larger local number.
- The shared Sweep-the-Legs owner now portals beside the tab rail and uses the
  named `SHELL_Z.CELEBRATION` band. Its backdrop covers and disables the rail
  during the four-second terminal beat. All three existing call paths inherit
  the correction without changing settlement, completion gates, animation
  duration, or the tab-rail owner.
- The permanent liveness gauntlet now asserts the portal target, canonical
  z-band ordering, and backdrop pointer ownership so a locally high z-index
  cannot silently recreate this failure.

## DG1 live-entry and dealer-draw regression correction

- The post-release two-client production smoke rejected the prior handoff
  release. In first-dealer-game 3-5-7, both connected clients reached DG1H1R1
  with no preceding hydrated game type, so the route incorrectly classified
  them as refresh/rejoin clients. That reconstructed six settled cards before
  the delayed ante presentation gate opened; the same R1 wave then tried to
  admit six more expected cards, leaving the deal barrier at 6/12 and
  suppressing both the decision timer and Stay/Fold surface.
- The persistent route now records whether it witnessed a real pre-hand
  lifecycle before its first complete 3-5-7 identity. DG1 is live for an
  already-connected route and historical only for a cold client whose first
  authoritative frame is already active. Independent exact-wave admission
  rejects any R1/R2/R3 manifest whose cumulative expected or per-player
  settled target is already owned, so a delayed presentation gate cannot
  double the deal ledger.
- Active 3-5-7 no longer publishes a constituent `games` Realtime row as a
  complete gameplay frame or lets that row invalidate an in-flight exact
  frame. Its atomic current-frame RPC remains the sole publisher of game,
  round, roster, and private-card state. All six other game families and all
  pre-hand lifecycle phases retain complete games-row publication.
- A completed session dealer draw now has an exact visual receipt. If status
  advances before that exact card result reaches the real felt renderer, the
  route carries the result across the dealer-selection-to-game-selection
  surface handoff and releases it only after a real render plus the existing
  winner dwell. Already-rendered and cold stale receipts do not replay.
- The liveness command now includes explicit first-DG coverage for all seven
  real-money families plus DG1 live-vs-cold provenance, exact 3-5-7 wave
  idempotency, atomic-frame publication, and dealer-draw receipt handoff. All
  189 assertions across 33 gauntlet files pass; TypeScript, all 35
  build-required Cribbage assertions, and the production build also pass.

## Authoritative presentation receipt handoff

- The `Aug 24 - Undermind` two-client production smoke completed without a
  freeze and with exact financial reconciliation, but exposed an eight- to
  ten-second client delay between committed 3-5-7 terminal settlement and the
  winning-leg presentation. The decision RPC already returned the committed
  game/result receipt; Stay and Fold now consume that receipt immediately
  before the serialized full snapshot reconciles it.
- The same smoke proved that both dealer-selection surfaces mounted but only
  one client rendered the stored two-card draw. The central `games` Realtime
  owner now merges the complete authoritative row image before status-specific
  side effects, so a co-published `status` can no longer suppress
  `dealer_selection_state`, `last_round_result`, or another field. A newer
  Realtime receipt invalidates an older in-flight snapshot, and strictly older
  games-row timestamps cannot regress the local projection.
- Normal third-leg 3-5-7 victories now present the existing Sweep the Legs
  overlay between the visible leg flight and pot flight. The pot stage requires
  both the exact immutable zero-flight `sweep` cursor and overlay completion for
  the same terminal generation; either arrival order is accepted, while stale
  generation callbacks are rejected. Instant 3-5-7 behavior and financial
  settlement are unchanged.
- The permanent liveness gauntlet now includes these handoffs and passes all
  172 assertions across 30 files. Focused tests, TypeScript, all 35
  build-required Cribbage assertions, and the production build pass.

## Real-money liveness admission and action-surface recovery

- The serialized database recovery pass now publishes a completion heartbeat,
  outcome, duration, and consecutive partial-failure count. The authenticated
  `get_real_money_liveness_health` RPC reports that heartbeat, active recovery
  failures, and exact overdue timers for one participant's session without
  exposing private gameplay state.
- A new database trigger guards the atomic dealer-configuration handoff. A new
  real-money dealer game cannot enter ante decision while the sole recovery
  scheduler is stale, partially failing, has an active task failure, or has an
  overdue exact timer. The whole setup transaction rolls back, so the guard
  cannot leave a dealer game or ante half-committed.
- Paused games are excluded from stagnation inspection and were not mutated.
  Gin and Cribbage human turns remain intentionally untimed; their bot,
  scoring, counting, terminal, and presentation recovery owners are unchanged.
- Holm/3-5-7, Horses/SCC, Yahtzee, Gin, and Cribbage now assert that an
  authoritative local action owner has a rendered action surface. A mismatch
  requests one parent-owned serialized snapshot for the exact identity and
  records durable evidence; it never selects an action or advances gameplay.
- Migrations `20260823235121_real_money_liveness_contract.sql` and
  `20260824000455_fix_real_money_liveness_phase_column.sql` are installed. The
  rollback proof passed for winner, tie, duplicate, replay, late replay,
  authorization, continuation, terminal state, and unchanged gameplay and
  financial rows. Post-install verification reports a healthy scheduler, zero
  active recovery failures, successful cron ticks, and no overdue timers for
  any unpaused active real-money game. The liveness gauntlet passes all 149
  assertions.

## Cross-game liveness and real cross-country recovery

- The persistent game route now records the game type that actually preceded
  each 3-5-7 dealer game. A live cross-country transition is no longer
  misclassified as a refresh merely because the route stayed mounted, so the
  canonical deal reaches its settled gameplay barrier and the Stay/Fold
  controls and timer can render.
- A genuine refresh/rejoin reconstructs the exact cumulative settled-card
  counts for the current 3-5-7 wave instead of declaring an empty skipped deal
  complete. Later waves grow from that reconstructed ledger, preserving both
  action admission and timer eligibility without replaying old animations.
- Full authoritative snapshots are serialized and burst triggers coalesce.
  Realtime transport is not treated as recovered until a full snapshot
  succeeds; a failed newer catch-up no longer suppresses an older successful
  response, and the canonical bootstrap visibly reports reconnect recovery
  instead of presenting an unexplained empty surface.
- The public build-manifest gate has an eight-second abort boundary, preventing
  a hung cache/version request from black-screening a game route indefinitely.
- Horses/SCC browser initialization, timeout auto-fold, null-turn repair, and
  full-state completion writes were removed. Connected clients now submit
  exact actions/identity through the existing RPC owners; database timers and
  recovery remain the only progression fallback.
- Cross-Country Chaos now includes a deterministic response-lost-after-send
  phase. The server receives the operation exactly once, while the client sees
  an ambiguous network failure and must recover from authoritative state. The
  liveness gauntlet covers all 49 ordered cross-country route pairs plus
  refresh, lag, reconnect, response-loss, deal, timer, Horses/SCC, Holm,
  Cribbage, Gin, and Yahtzee ownership seams. All 141 gauntlet assertions, 35
  build-required Cribbage assertions, TypeScript, and the production build
  pass.

## Horses / SCC connected progression authority

- A completed Horses or Ship/Captain/Crew round no longer enters the
  browser-owned tie claim, history insert, re-ante, and successor-round chain.
  Every connected participant submits the exact game, dealer-game, round, and
  hand identity to `public.horses_scc_advance_completed_round`; PostgreSQL
  re-evaluates the persisted dice and atomically selects the existing tie-
  rollover owner or terminal-settlement owner.
- Connected win presentation now calls
  `public.horses_scc_advance_postgame` before shared browser leader election,
  participant evaluation, or dealer rotation. The existing 15-second canonical
  timer uses the same hardened private standard-postgame owner, and the former
  Horses/SCC client fallback timer is removed.
- Dice postgame admission locks the exact completed round before the game and
  requires exactly one matching `horses_terminal` settlement. `game_over`
  alone cannot clear a dealer game. Duplicate clients, peer replays, and late
  replays are read-only; SCC keeps its distinct 6-5-4/cargo evaluator and LAST
  HAND still ends directly in settlement.
- Migration `20260823173530_horses_scc_connected_authority.sql` is installed.
  Its complete rollback proof passed before and after installation for winner,
  connected tie with healthy heartbeats, authorization, continuation,
  duplicate, peer and late replay, SCC terminal state, full canonical-timer
  recovery, and unsettled rejection. Thirty-one focused authority, freeze,
  timer, and Horses progression assertions pass, as do the installed
  TypeScript compiler and production build (including 35 required Cribbage
  regression assertions).

## Holm authoritative postgame handoff

- Connected Holm presentation completion no longer enters the shared browser
  leader/evaluation/rotation chain. Every client submits the exact game,
  dealer-game, round, and hand identity to `public.holm_advance_postgame`
  before that legacy boundary; the existing durable standard-postgame claim
  admits one transition and makes concurrent or late callers read-only.
- The canonical timer remains the disconnected-client fallback and uses the
  same hardened private owner as connected clients. Holm reads its configured
  presentation fallback (currently 30 seconds); Horses and Ship/Captain/Crew
  retain the shared 15-second deadline.
  Holm admission requires one completed exact round and one matching
  `chucky_final_award` settlement, so `game_over` alone cannot clear an
  outgoing dealer game.
- Queued Stand Up, Sit Out, auto-fold, and rejoin intent is consumed under the
  locked game/player cohort before the next dealer or terminal disposition is
  derived. Settlement, balances, result/snapshot identity, presentation
  cadence, Horses/SCC behavior, and the frozen production game are unchanged.
- Migration `20260823171449_holm_postgame_authority.sql` is installed. Its
  complete rollback proof passed before and after installation for winner,
  chopped/tie, authorization, continuation, duplicate, peer replay, late
  replay, timer-only recovery, unsettled rejection, and Session Ended.
  Forty-four focused Holm/freeze assertions, the installed TypeScript
  compiler, all 35 build-required Cribbage assertions, and the production Vite
  build pass.

## Gameplay supplemental Realtime reconnect recovery

- The central game subscription's authoritative reconnect snapshot now fans out
  to every gameplay-critical supplemental state owner. Cribbage private state,
  Cribbage dealer selection, Gin caller-specific state, and the dealer-game-
  scoped authoritative round identity can no longer remain stale after the
  public game/round snapshot has recovered.
- Every successful supplemental `SUBSCRIBED` edge performs one exact database
  snapshot, closing both cold subscribe and reconnect blind windows. Channel
  loss handles `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED` and retains the full
  Supabase error object for diagnosis.
- The existing central five-second fallback remains the only recovery poll.
  When it succeeds while WebSocket transport remains unavailable, it emits one
  local recovery receipt that refreshes the supplemental owners; no second poll
  or gameplay authority was added.
- Full central snapshots are serialized and coalesced. Supplemental exact
  reads remain anti-regressive, but a newer failed read cannot suppress an
  older successful authoritative result solely because it started later.
- Twenty-five focused assertions cover initial/reconnect catch-up, every loss
  status, stale-response rejection, recovery fan-out, all four wiring sites,
  monotonic identity, the shared sync framework, and the central reconnect
  owner. The installed TypeScript compiler passes.

## Continuous Cross-Country Chaos transport harness

- Cross-Country Chaos now runs below the shared Supabase client instead of
  wrapping only selected game callbacks. Every Supabase HTTP request and every
  Realtime channel on the client therefore experiences the same long-haul
  conditions used during the run.
- A seeded client-specific cycle continuously repeats healthy latency,
  long-haul lag, heavy jitter, a bounded radio stall, recovery, a true offline
  interval, reconnect recovery, and another healthy interval. The old finite
  approximately 90-second schedule can no longer stop on its last impairment.
- Offline physically closes the Supabase WebSocket and defers reconnect attempts
  until recovery, exercising the existing `CHANNEL_ERROR`/`CLOSED`, resubscribe,
  and authoritative snapshot catch-up owners. WebSocket frame order is retained;
  the harness does not invent a transport behavior TCP cannot produce.
- HTTP failures occur before send or after one exact delegation whose response
  is discarded. The harness never retries writes, so it can exercise an
  ambiguous committed request without manufacturing a duplicate mutation.
  Profile-control and simulation-telemetry requests bypass impairment so an
  affected client can always turn the harness off.
- Focused assertions cover deterministic replay, required phase coverage,
  continuous cycling, offline/recovery status, socket closure and deferred
  reconnect, fail-before-send and response-loss requests, exactly-once write
  delegation, shared Supabase wiring, and preservation of the reconnect
  snapshot owner.

## Cross-game freeze hardening

- Production evidence from the Aug 22 real-money session isolated four
  separate boundaries: one 52-second serialized scheduler convoy, Holm's
  all-client successor acknowledgement plus long cosmetic chain, a 3-5-7
  refresh baseline captured before round hydration, and `set_game_paused`
  resuming a protected 3-5-7 round without the authoritative-write context.
- Migrations `20260823010000_freeze_hardening.sql` and
  `20260823011000_restore_freeze_hardening_canonical_timers.sql` are installed.
  Each serialized recovery task now has a 750 ms lock-wait budget and durable
  14-day slow/error evidence, while the single scheduler/pool-protection owner
  is preserved. A post-install proof caught and corrected a missing later-added
  `canonical_timers` runner branch; active recovery failures are zero and the
  latest cron runs succeed.
- Holm prepared successors now release when the exact current actor's canonical
  deal acknowledgement arrives; other clients finish the immutable cosmetics
  locally and the 30-second database fallback remains. Untouched default
  presentation cadence is reduced to 500 ms tabled/pre-Chucky, 500 ms reveal
  steps, and an 800 ms final card. Exact hand boundaries bypass within-hand
  reveal latches and clear all solo/Chucky presentation state.
- 3-5-7 route provenance now waits for complete dealer-game, round, and hand
  identity. A cold refresh enters the already-persisted wave historically,
  while later exact waves on the mounted route remain live transitions. The
  pause RPC retains its existing host/admin/service authorization and gains
  only the transaction-local authority required for its protected 3-5-7 round
  deadline update.
- The complete migration passed a rollback-only compile/permission/ownership
  proof before installation. The TypeScript compiler, 56 focused freeze/owner
  assertions, 35 build-required Cribbage assertions, and the production Vite
  build pass. The reported real-money game was not resumed or advanced; it
  remains paused in hand 4, round 3 with 30 seconds remaining. Published
  two-client Holm and 3-5-7 refresh/resume smoke remains the acceptance gate.

## Ante-decision Sit Out client identity continuity

- The first published two-human 3-5-7 rerun on build `156104a36` proved the
  client correction was active but surfaced a deeper PostgreSQL rejection:
  `three_five_seven_game_authority_mutation:rpc_required`. In session
  `Aug 22 - War Drive`, the dealer had already anted, so the other player's
  Sit Out reached the shared fake-money not-enough-players disposition. That
  resolver established its existing local service claim only after the
  disposition branch; the 3-5-7 authority trigger correctly rejected the
  untrusted `ante_decision -> waiting` update and atomically rolled back the
  player's decision.
- Migration `20260822193000_fix_ante_decision_authority_context.sql` is
  installed on the owned Supabase project. The shared private ante resolver now
  establishes its transaction-local service claim immediately before both the
  insufficient-player disposition and normal game bootstrap. Public wrapper
  authentication and player ownership checks remain first; the private
  function retains an empty search path and remains non-executable by browser
  roles. No game-authority trigger was weakened.
- The complete rollback proof passed before and after installation with zero
  persisted rows. It clears every dealer-setup authority flag between simulated
  HTTP requests and directly covers authenticated final Sit Out for 3-5-7 and
  Yahtzee, 3-5-7 continuation, authorization, winner, tie, duplicate, replay,
  late replay, and terminal state. Published two-human Sit Out smoke remains
  the acceptance gate.
- Published human-client smoke reported that **Sit Out** on the ante-decision
  dialog could appear to do nothing. Production runtime logs contained no
  matching server exception, and a rollback-only production proof confirmed
  that the installed `submit_ante_decision` RPC still atomically accepts a
  voluntary Sit Out, marks the player Sitting Out, and performs the normal
  database-owned continuation. No proof rows persisted.
- The client dialog had split admission identity: its eligibility effect used a
  fresh player query, while its render/submission could fall back to the older
  route roster or an empty player id. The exact fresh player/dealer-game
  identity now owns dialog visibility and submission together. An accepted
  action closes the dialog; a lagging route roster receives one exact
  authoritative refetch.
- While either decision is in flight, the clicked action visibly reads
  `Submitting…` and both choices are disabled. Stale identity, deadline expiry,
  changed eligibility, pause, authorization, and RPC errors now display an
  explanation and trigger one authoritative reconciliation instead of silently
  reopening. Database ante authority, expiry, game startup/continuation, all
  seven game types, auto-ante preferences, and waiting-presence rules are
  unchanged.
- Nine focused assertions pass for accepted/duplicate Sit Out, stale route
  identity, deadline expiry, RPC failure, and source ownership. The installed
  TypeScript compiler, all 35 build-required Cribbage assertions, and the
  production Vite build pass. Published human-client Sit Out smoke remains the
  acceptance gate.

## Waiting-table presence and abandoned-seat release

- Waiting-table cleanup is now phase-specific and based on physical human
  seats rather than active eligibility. On subsequent Waiting, timer-forced
  sitters release after 15 seconds without heartbeat, voluntary sitters after
  60 seconds, and active humans become involuntarily Sitting Out after 60
  seconds before receiving the 15-second release confirmation. A heartbeat
  after that presence demotion cancels stand-up but deliberately leaves the
  player Sitting Out so they opt back in through the normal action.
- Initial Waiting is armed only after the first player row exists, avoiding the
  game-creation race. Waiting humans release after a five-minute heartbeat
  failure; zero seated humans deletes only a database-proven pristine session.
  Subsequent zero-seat sessions enter Session Ended, with result-bearing real
  money continuing through the existing snapshot-guarded exactly-once
  finalizer. Bots never keep an abandoned human session alive, and a departed
  host transfers atomically to the next deterministic seated human.
- Migration `20260822180000_waiting_presence_seat_release.sql` is installed on
  the owned Supabase project. The complete rollback proof passed before and
  after installation, covering winner, tie, duplicate and late replay,
  authorization, continuation, terminal state, initial cleanup, voluntary and
  involuntary leases, heartbeat recovery, config/ante timeout, host transfer,
  and bot exclusion. The installed TypeScript compiler also passes. The
  published two-human production smoke remains before this becomes a stable
  checkpoint.

## 3-5-7 postgame disconnect seat continuity

- Production session `Aug 22 - Duncan Keith` proved the server-owned config
  timeout returned the surviving client to Waiting, but the forced-absent
  dealer remained an active seated row because the abandonment reconciler
  intentionally excluded ordinary Sitting Out players. The same smoke exposed
  a background-tab false absence and a competing seat-owner handoff during the
  final-leg award.
- A private exact-player forced-absence watch now distinguishes config-timeout
  absence from voluntary Sitting Out. A heartbeat after timeout retires the
  watch and preserves the red Sitting Out seat; otherwise three complete
  five-second windows commit canonical Stand Up (`status=left`). Active/no-
  heartbeat players retain the accepted 15-second lease, while a latest hidden
  heartbeat receives the configurable `postgame_presence.hidden_grace_seconds`
  lease, defaulting to 300 seconds. Heartbeat lease timestamps now use actual
  server write time rather than transaction-start time.
- The canonical route now retains gameplay seat ownership through both
  `game_over` and `session_ended` while the exact terminal presentation signal
  is active. 3-5-7's final-leg cards, cluster, award, and transfer destination
  therefore remain under one mounted owner before the normal single handoff to
  Waiting/game selection.
- Migrations `20260822170000_postgame_forced_absence_and_hidden_presence.sql`
  and `20260822171500_index_postgame_forced_absence_player.sql` are installed on
  the owned Supabase project. The complete rollback proof passed before and
  after installation, including winner, tie, replay, authorization, terminal,
  canonical timer, and full serialized recovery cases. Eighteen focused client
  assertions, the installed TypeScript compiler, all 35 build-required
  Cribbage assertions, and the production Vite build pass. Jeremy accepted the
  repeat two-human production smoke on 2026-08-22 at commit
  `e1ee17935967d3408d419febfbc437a6c492ac84`: final-leg seat continuity,
  config-timeout forced stand-up, and hidden-tab retention passed. Production
  session `Aug 22 - Lake Avenue` then proved the absent survivor follows the
  configured 300-second hidden lease and reached `session_ended` about five
  minutes after its final hidden heartbeat. The phase-specific absent-seat and
  pristine Waiting cleanup follow-up is now installed as described above and
  awaits published smoke.

## Player-v-player showdown financial pacing

- 3-5-7's server-authoritative multi-stayer showdown publishes its immutable
  player-to-player batch with reason `win`, while the prior client admission
  gate recognized only the legacy `transfer` label. The current batch therefore
  bypassed opponent-card presentation and could begin before those faces were
  visible.
- `Game.tsx` now carries the accepted atomic frame's transfer cursor into the
  3-5-7 presentation snapshot. `showdownPresentation.ts` captures the exact
  game/dealer-game/round/hand/result/stayer/cursor identity and gates both the
  current `win` batch and generic result announcement. With Secret Reveal on,
  permitted opponent faces paint first, then one animation frame and the
  configured 2000 ms reading dwell elapse before transfer and announcement
  release together. With Secret Reveal off, both remain immediate and no cards
  are exposed.
- Holm preserves its established Rabbit Hunt concurrency: Pussy Tax movement
  and narration may release while community cards 3 and 4 flip. Only the exact
  continuation acknowledgement waits for the final-card visual completion
  receipt plus the configured 1000 ms post-reveal dwell; settlement, successor
  preparation, and disconnect fallback remain database-owned.
- Migration `20260822090000_pvp_showdown_pacing_defaults.sql` is installed on
  the owned Supabase project. It adds non-null, range-checked Game Defaults for
  both delays, and the Admin editor validates 0-10000 ms. The complete
  rollback proof passed before and after installation. Eight focused suites
  pass 88 assertions, the build-required 35 Cribbage assertions pass, and the
  production Vite build succeeds. Jeremy accepted the published two-human
  production smoke on 2026-08-22 at commit
  `8d873a5b6971254da1ad9fbe5da2253d35d056a9`: Secret Reveal on preserved the
  opponent-card reveal and configured reading dwell before transfer, Secret
  Reveal off remained immediate, and Holm preserved concurrent Pussy Tax
  presentation plus the post-Rabbit-Hunt continuation dwell. This is now a
  stable checkpoint.

## All-games dual-human Cross-Country Chaos checkpoint

- Jeremy reported the complete published production smoke clean on 2026-08-21
  at commit `8dd5e5b2d16e6304c89280e978c070ddd009b6d0`. All seven games
  played cleanly across two human clients with Cross-Country Chaos enabled.
  This is the current stable runtime checkpoint; reopen an accepted behavior
  only with a new production repro.
- This smoke accepts the current Gin self-draw admission, Cribbage durable
  high-card completion receipt, and Holm durable showdown stage-receipt work.
  Canonical database authority, cross-client synchronization, presentation
  continuity, and game rules remain the preserve boundary.

## Gin self-draw hidden-card admission

- The `Aug 20 - Hamilton Boulevard` real-money session retained 12 complete
  Gin hands with 621 valid private card instances and no missing or masked
  ranks/suits. Its public projection correctly masked all 264 stock instances,
  proving the observed `?/?` face was a presentation leak rather than persisted
  card corruption.
- Gin self draws now keep their exact action-scoped withholding claim until
  both independent receipts exist: the 700 ms transport has settled and the
  caller-specific authoritative projection has supplied an unmasked real card.
  Either receipt may arrive first. Failed actions release only after recovery
  restores committed state, and hand-identity changes discard stale claims.
- PostgreSQL card authority, peer redaction, caller projection, action legality,
  pile geometry, and draw animation cadence are unchanged. All 98 Gin tests
  pass, including focused animation-first, authority-first, masked-card, and
  identity-reset assertions; the installed TypeScript compiler and production
  Vite build also pass. Jeremy accepted the published cross-country two-client
  smoke as part of the all-games checkpoint above.

## Cribbage durable high-card completion receipt

- The live `Aug 20 - Hamilton Boulevard` repro committed its Cribbage dealer
  receipt and server fallback exactly once, then completed all eight hands and
  terminal settlement cleanly. The host browser nevertheless remained on the
  high-card presentation for roughly 44 seconds because the completion branch
  lived inside an initialization effect keyed only by host and eligible-player
  identity; the asynchronously arriving database receipt could not rerun it.
- Cribbage host completion now drains from its own exact, dealer-game-scoped
  receipt effect. It preserves the 2.2-second winner dwell, mirrors the stored
  cards and winner, uses the latest callbacks without restarting that dwell,
  deduplicates realtime/refetch delivery, and cancels cleanly when authoritative
  recovery advances first. Non-host behavior and the default/session dealer
  path are unchanged.
- Database fallback, replay-safe first-hand creation, balances, settlement, and
  all financial authority are unchanged. Eight focused delayed-arrival,
  dedupe, non-host, recovery, callback-continuity, and boundary assertions pass,
  as do the installed TypeScript compiler, all 35 build-required Cribbage
  assertions, and the production Vite build. Jeremy accepted the published
  Cribbage high-card smoke as part of the all-games checkpoint above.

## Holm durable showdown stage receipts

- The live `Aug 20 - Hamilton Boulevard` repro settled its first multiplayer
  showdown exactly once in PostgreSQL, but both connected clients stopped
  between the pot-award and replacement-pot presentation stages. The server's
  continuation lease correctly prepared later hands; the browsers remained
  held on hand 1 because the local phase machine consumed only a transient
  React batch-settled callback.
- `MobileGameTable` now observes the shell ledger's durable state for the exact
  adjacent showdown cursors: the final published cursor identifies the
  replacement-pot batch and its predecessor identifies the pot award. A
  `settled` receipt drains a missed callback, while `reconciled` releases a
  reconnect/historical baseline without replaying chip movement. Exact
  hand/cursor identity and per-action dedupe prevent hidden successors or
  repeated renders from releasing the wrong presentation barrier.
- Database settlement, balances, recovery leases, and RPC behavior are
  unchanged. The focused Holm suite passes 44 assertions, the installed
  TypeScript compiler passes, and the production build passes with all 35
  required Cribbage assertions. Jeremy accepted the published two-client Holm
  showdown smoke as part of the all-games checkpoint above.

## Holm Chucky canonical flip presentation

- Holm's configured Chucky reveal scheduler remains the sole cadence owner,
  but each admitted canonical Chucky card now turns from the existing card back
  to its measured face with a 600 ms three-dimensional flip instead of swapping
  surfaces instantly. Canonical slot geometry, face sizing, deck art, and the
  configured per-card delays are unchanged.
- The exact-hand presentation gate now remains closed until the final card's
  visible flip completes, so result announcements, Chucky-loss transport, and
  win-pot presentation cannot outrun the animation. The existing cache/sticky
  hold covers that final flip without changing database reveal, settlement, or
  financial authority.
- Already-revealed rejoin/historical mounts reconcile directly without replay,
  reduced-motion clients complete directly, and an exact card/hand identity
  change resets before the new surface can paint. Nine focused flip, timing-
  ownership, gate, and sizing assertions pass, as do focused ESLint, the
  installed TypeScript compiler, all 35 build-required Cribbage assertions,
  and the production Vite build. Jeremy confirmed the production Holm smoke on
  2026-08-21 at commit `fcce653ecd8906e967eb78a58e40daf7338c5f63`:
  every Chucky card retained the established reveal cadence, flipped visibly,
  and completed the final flip before the result presentation. This polish is
  accepted and closed.

## Yahtzee diagnostic deployment continuity

- A live tab left open across the Yahtzee observer-fix deployment remained on
  build `a1c6def` and attempted to lazy-load its retired
  `yahtzeeHeldDieTrace-B7pMZs5a.js` asset immediately after production moved to
  `c57361f`. The module request received the new SPA document, rejected, and
  repeatedly reached the global error toast while hold writes continued to
  commit normally.
- The always-on Yahtzee held-die trace is now statically bundled at all three
  call sites. Trace work remains deferred outside the caller stack, and both
  synchronous and asynchronous diagnostic failures are contained before they
  can reach gameplay or global error presentation. Gameplay state, hold RPCs,
  Supabase schema/data, and Horses/SCC behavior are unchanged.
- The focused diagnostic-containment and Yahtzee hold, authority, progress,
  and presentation suites pass (32 assertions), and the production build
  passes without emitting a separate `yahtzeeHeldDieTrace` asset.

## Yahtzee observer hold-mask parity

- The live DeMar DeRozan repro confirmed that PostgreSQL and the active roller
  agreed on two held sixes while an observer retained a stale intermediate
  `6-4-4` hold presentation.
- Yahtzee observers now derive held membership directly from the latest
  accepted atomic full-mask state. The shared component's legacy observer
  debounce remains unchanged for Horses and Ship, Captain, Crew; database
  authority, RPC behavior, dice movement, and roll animation ownership are
  unchanged.
- The focused observer-policy and existing Yahtzee authority, progress, and
  presentation suites pass (29 assertions), and the production build passes.

## Cribbage opening-hand writer admission

- Cribbage card controls and the discard, pegging-play, and `go` handlers now
  consume one synchronous writer-admission predicate. The prior handler-only
  effect refs could lag the rendered gate during the dealer-selection to
  opening-hand transition, so an enabled Send to Crib button could be rejected
  locally with `Hand updating — try again` before any RPC reached PostgreSQL.
- Admission still requires matching render/current hand keys, current writer
  round and hand, authoritative identity, presentation identity, and the shared
  sync framework's ref-backed `canInteractNow()` verdict. Stale, mismatched,
  frozen, and visual-contract states remain fail-closed. The deployed
  `cribbage_apply_discard` RPC continues to own authentication, membership,
  player ownership, phase, discard-count, index validation, serialization, and
  authoritative publication; no schema or production-state mutation is part
  of this frontend correction.
- Focused writer-admission, shared sync-reset, and Cribbage render-guard suites
  pass (36 assertions), as does the installed TypeScript compiler.

## Network simulation is independent of game harnesses

- A user's `profiles.network_sim_mode` and `network_sim_logging` settings now
  directly control that client's Realtime transport simulation. The app-level
  provider no longer reads, subscribes to, or fails closed on the global
  `harnesses_mode` setting.
- Harnesses Mode remains the master gate only for configured game-rule
  profiles. Cross-Country Chaos can therefore run while Holm, Gin, Cribbage,
  and other rule-changing harnesses remain inert. Existing per-user profile
  settings, client-local simulation behavior, and logging policy are
  preserved; no schema or production-data migration is involved.

## Canonical database-owned game timers

- Migrations `20260820180000_canonical_game_timer_ownership.sql` and
  `20260820190000_index_canonical_game_timer_foreign_keys.sql` are installed
  on owned production. A private exact-identity registry now feeds the one
  serialized recovery dispatcher for session dealer selection, dealer setup,
  ante decisions, Holm decisions, Horses/SCC round progression, and their
  postgame continuation. Expiry no longer requires a mounted or connected
  browser.
- Ante submission and pause/resume are atomic authenticated RPCs. Pausing a
  game suspends registered deadlines and their authoritative state fields;
  resume restores the remaining window. Fresh route admission renders only an
  unexpired authoritative setup/ante deadline, redirects already-ended or
  confirmed-missing sessions to the lobby, and otherwise hydrates the current
  table state. Connected live-flow clients still retain the canonical Session
  Ended table presentation.
- Timer admission is future-only at the migration cutover, so historical
  expired rows were not swept or fabricated. The rollback proof passed before
  installation and against the deployed definitions for authorization,
  winner, tie, duplicate, replay, late replay, continuation, terminal state,
  and pause/resume cases. The two registry foreign keys have covering indexes;
  the remaining advisor notices are the intended private RLS/no-policy and
  signed-in `SECURITY DEFINER` wrapper boundaries.
- Gin Rummy and Cribbage human choices intentionally remain untimed. Their
  deterministic database recovery (including Cribbage's mandatory `go`)
  remains scheduled progression, not a human-turn timeout or auto-fold rule.

## Antelope diagnostics, Yahtzee holds, and Cribbage continuity

- Yahtzee hold taps no longer wait on one RPC per die. The client now applies
  the full desired mask immediately, coalesces changes made while a request is
  in flight, and commits that mask through the exact-round,
  action-sequence-guarded `public.yahtzee_set_holds` RPC. Roll and score wait
  for the latest hold intent instead of silently dropping taps. Migration
  `20260820140918_atomic_yahtzee_hold_mask.sql` is installed on owned
  production; its rollback proof passed authorization, malformed-mask,
  replacement, idempotent replay, stale replay, handoff, and late-player cases.
- Yahtzee's completed-roll cache no longer compares a previous scorer's dice
  with the next player's authoritative state. Detailed held-die traces are now
  opt-in, removing the false invariant traffic that made Yahtzee look like a
  database writer during ordinary play.
- Cribbage's first counting paint now derives the committed plan baseline
  before effects run, so authoritative final scores cannot flash before the
  visible count begins. Exact-round Realtime remains the refetch signal; the
  client-wide 2--8 second fallback poll and always-on scoring trace are
  removed. Expected stale/future snapshot rejection and guarded duplicate
  work are opt-in sync diagnostics, not invariant failures.
- Production diagnostics are silent by default for transitions, rendering,
  polling, and expected gate rejection. True invariant violations continue to
  persist through the canonical `debug_events` writer with a 30-second
  edge-deduplication window. Targeted sync, Yahtzee-held, and 3-5-7 forensic
  traces require their explicit debug channels.

## Serialized cross-game recovery and scoped 3-5-7 diagnostics

- The paused Antelope Yahtzee session was not corrupt. At `01:58:53Z`, the
  independent one-second Holm, Cribbage, Gin, Yahtzee, and 3-5-7 recovery jobs
  overlapped for as long as 7.256 seconds; subsequent jobs missed startup for
  11--20 seconds and PostgREST returned global 503s. The separate abandonment
  job also failed every five seconds because it reached protected 3-5-7 state
  without the trusted server context. Antelope advanced normally once the
  database recovered, so no historical session mutation was performed.
- Migration `20260820023000_serialize_game_recovery_scheduler.sql` is installed
  on owned production. One advisory-locked one-second dispatcher now runs the
  complete Holm, Cribbage, Gin, Yahtzee, and 3-5-7 recovery functions in
  sequence and admits Horses/SCC plus abandonment every five seconds. Each
  task has its own exception boundary and one durable, rate-limited failure
  claim, so one broken owner cannot roll back or stampede the rest. The
  abandonment owner receives the existing transaction-local trusted 3-5-7
  context; the authority trigger remains strict.
- The complete rollback proof passed before and after installation, including
  an injected task failure, durable failure capture, recovery, all seven real
  task owners, five-second admission, immediate replay, and the exact installed
  cron statement. A later live-cadence check found one active schedule, no task
  failures, 60/60 successful recent runs, and a 78 ms maximum runtime.
- `Game.tsx` now treats an empty shared `player_cards` projection as recovery
  evidence only for Holm and 3-5-7, and skips that read entirely for Cribbage,
  Gin, Yahtzee, Horses, and Ship Captain Crew. The separate 3-5-7 database
  wartime sink is fail-closed unless Wartime Debug is explicitly enabled and
  the mounted table is an exact 3-5-7 game. Its timer-owner callbacks no longer
  change identity on ordinary React renders, preventing cancel/recreate event
  floods even during an enabled trace.

## 3-5-7 zero-transfer terminal sweep bypass

- Production game `f4e4be6b-97c2-4e40-90b3-91be52556734`, dealer game
  `fbdceb38-ab49-4c8b-be5c-047ed39192b0`, proved that its final decision and
  authoritative settlement were not delayed. The last decision was inserted
  at `22:06:17.293Z`, terminal settlement committed at `22:06:18.381Z`, and
  both connected clients received the complete `game_over` Realtime frame
  within roughly half a second of publication.
- The terminal client pipeline nevertheless serialized a 1.8-second winning
  leg award and a 3.5-second legs-to-player phase before pot flight. The cached
  roster contained only the winner's two existing legs. The animation tested
  whether that unfiltered roster was empty, then excluded the winner and
  produced zero leg transports, but still held the sequence for the full
  3.5-second timer. Pot flight consequently began 6.83 and 8.26 seconds after
  the final decision on the two clients.
- `LegsToPlayerAnimation` now selects positive opponent-leg transports before
  entering the timed phase. A winner-only roster completes immediately through
  the existing exact sweep-credit/pot handoff; a real opponent-leg transfer
  retains the existing animation and duration. Winning-leg presentation,
  financial settlement, terminal identity, and authoritative postgame
  advancement are unchanged.
- Fourteen focused component/helper/sweep-credit assertions, TypeScript, all
  33 build-required Cribbage assertions, and the production build pass.
  Published two-client winner-only-leg smoke passed on 2026-08-19 at commit
  `045cd01f2d3e2b11cbf44946ac43afb67559a4f3`; this defect is closed.

## 3-5-7 atomic terminal participation handoff

- Production dealer game `d36b5353-ba30-4e10-85f0-1c4a82e8a31f` completed
  settlement and its connected-client win presentation normally, but then
  remained visually idle for 10.964 seconds. Presentation completed at
  `20:59:10.575Z`; the durable postgame claim was not committed until
  `20:59:21.539Z`. The browser advanced it 7.4 seconds before the scheduled
  fallback, so cron and the win animation were not the delay owners.
- `Game.tsx` still routed 3-5-7 through shared browser leader election and
  `evaluatePlayerStatesEndOfGame` before its authoritative postgame RPC. With
  no participation changes, that path made eight serial database requests
  before the one transition that mattered. Simply skipping it was unsafe
  because the existing RPC cleared queued Sit Out, Stand Up, auto-fold, and
  waiting flags without first applying them.
- Migration `20260819213000_atomic_357_postgame_participation.sql` is installed
  on owned production. Under the exact terminal round/game locks it verifies
  settlement, applies participation precedence (`Stand Up` > `Sit Out` >
  3-5-7 auto-fold > waiting/rejoin), removes stood-up bots, derives the active
  cohort and make-it-take-it dealer, clears outgoing transients, publishes the
  next phase, and records one exact replay result. Former participants may
  replay their own stored result; outsiders remain rejected. Private terminal
  winner UUIDs survive deletion of a winning bot.
- The browser now enters this RPC before shared leader election or player
  evaluation, consumes/refetches the committed result, and surfaces failures.
  Its diagnostics also use the exact round UUID instead of attempting to write
  a round number into `debug_events.round_id`.
- The complete candidate and deployed rollback proofs pass normal terminal
  settlement, make-it-take-it, waiting rejoin, Sit Out, auto-fold, human and bot
  Stand Up, winner-bot deletion, former-participant and outsider replay,
  duplicate/late replay, session terminal handling, and the complete scheduled
  recovery function. Ninety focused 3-5-7/client assertions and TypeScript
  pass, as do all 33 build-required Cribbage assertions and the production
  build; two-client terminal smoke remains the acceptance gate.

## 3-5-7 exact terminal round identity

- Production dealer game `f6e1f5cd-cc1d-4d84-b0f3-6a91b39b97d4`
  committed its final-leg resolution, leg/sweep/pot transfers, exact terminal
  result, and `game_over` disposition immediately. Both connected browsers
  received the Realtime game update, but neither presented the award or win.
  The scheduled recovery function advanced the already-settled game only after
  its 30-second presentation fallback.
- Settlement had cleared `games.current_round` while preserving the outgoing
  dealer game and hand. The atomic frame reader therefore returned
  `game_over` without a round, and both clients correctly rejected H4/R1 to
  H4/R-null as a regressive active identity. Realtime was only a refetch
  signal, so the initiating client and peer failed at the same frame-admission
  boundary.
- Migrations `20260819193000_preserve_357_terminal_round_identity.sql` and
  `20260819200000_guard_357_session_terminal_identity.sql` are installed on
  owned production. Terminal settlement now preserves the exact
  `(current_game_uuid, total_hands, current_round)` through presentation; the
  existing exact postgame owner remains solely responsible for clearing that
  identity and publishing the next setup disposition. Database and client
  frame validation fail explicitly if pre-handoff `game_over` or
  `session_ended` ever lacks that identity; the deliberately cleared postgame
  `session_ended` frame remains valid.
- The complete authority rollback proof passed before and after installation.
  It now proves the exact terminal frame and private hand, financial batch
  order, settlement replay, full scheduled terminal recovery statement,
  postgame duplicate claim, identity clearing, setup authorization, and late
  replay safety. Fourteen focused frame tests, TypeScript, all 33 build-required
  Cribbage assertions, and the production build pass. Frontend publication and
  two-client final-leg smoke remain the acceptance gates.

## 3-5-7 exact opening-transfer claim

- Frozen production session `Aug 19 - Brandon Morrow` proved the repeated
  R3-to-R1 P0 was a financial-presentation identity split, not missing cards.
  PostgreSQL had committed H3/R1, both three-card rows, and re-ante batch 9,
  but the initiating advance RPC returned the pre-commit game cursor 8 because
  the transfer projector is a deferred constraint trigger. The peer's later
  duplicate received cursor 9. The initiating client retained cursor 8, could
  never admit batch 9, and therefore never released its deal gate.
- Migration `20260819150000_exact_357_opening_transfer_claim.sql` makes every
  charged Round 1 own the immutable ante-batch cursor that opened that exact
  `(game, dealer game, hand, round, round row)` identity. The bootstrap and
  R3-to-R1 RPCs force the complete deferred projector before returning, store
  the claim on the round, and return it directly to the initiating caller.
  Duplicate and late callers replay the stored claim even after the mutable
  game cursor advances; they cannot claim a newer batch or alter a newer hand.
- Existing claims are backfilled only where one charge result and one
  immutable ante batch prove the mapping. Ambiguous or missing active claims
  abort rather than silently waiting. The atomic current-frame RPC validates
  the round claim against its immutable batch, and the client no longer derives
  new-hand presentation identity from `games.chip_transfer_cursor`.
- The migration is installed on owned production. The complete rollback proof
  passed before and after installation, including atomic bootstrap, winner,
  tie, authorization, continuation, R3-to-R1, duplicate, a late replay after a
  newer cursor, terminal handoff, zero-charge openings, and the complete
  scheduled recovery function. A read-only assertion also verified the frozen
  `Brandon Morrow` round against its exact immutable ante batch. Thirty focused
  client assertions, TypeScript, all 33 build-required Cribbage assertions,
  and the production build pass. Published two-client rollover smoke passed
  on 2026-08-19 at commit `d025d95825a88e87b01e8404a01d218e8ca91367`.

## 3-5-7 atomic current-frame hydration

- Frozen production session `Aug 18 - David DeJesus` proved the repeated
  R3-to-R1 P0 was not a deal or re-ante failure. PostgreSQL had committed the
  H3/R1 game pointer, exact round, both three-card rows, and the two-player
  re-ante batch at cursor 9. Happach Gmail's browser nevertheless rendered the
  successor identity with an empty private-card source and never recovered.
- The client previously read game, round, players, and cards in separate
  requests. It published the new card context before the card request returned;
  a later generic Realtime refetch could supersede that response. The live
  selector also fell back to the newest inserted round when the game pointer
  still named the predecessor, allowing a mixed hand/round frame.
- Migration `20260818140000_atomic_357_current_frame.sql` is installed on owned
  production. `three_five_seven_current_frame` returns the exact game pointer,
  exact round, decision roster, and caller-visible cards from one PostgreSQL
  snapshot. Active participants fail closed if their complete hand is absent.
  Realtime only requests this RPC; it never clears or rotates 3-5-7 card state.
- `Game.tsx` admits the returned frame as one unit, rejects slower older
  requests and regressive/conflicting live identities, and no longer selects a
  standalone successor round. The H2/R3-to-H3/R1 boundary now publishes game,
  round, roster, card context, and cards together. The paused production
  session was not mutated.
- The complete rollback proof passed before and after installation, including
  authorization, bootstrap, winner, tie, duplicate/replay, R3-to-R1
  continuation with the caller's exact three cards, terminal/late replay, and
  the complete scheduled recovery function. Eight focused frame/race tests,
  the existing 16 advancement/progress tests, TypeScript, all 33 build-required
  Cribbage assertions, and the production build pass. Published two-client
  smoke remains the acceptance gate.

## Shared atomic dealer configuration handoff

- Migration `20260817230000_atomic_dealer_game_setup_handoff.sql` is installed
  on owned production. Its post-install rollback proofs pass against the
  deployed definitions.
- The shared `DealerGameSetup` boundary for all seven games no longer inserts
  a dealer-game row, sanitizes players, and publishes `ante_decision` through
  separate browser writes. `configure_dealer_game` locks the exact
  game/dealer/deadline identity, validates the selected game configuration and
  caller, creates the dealer game, resets player ephemerals, auto-antes the
  dealer, and publishes the complete ante phase in one transaction.
- An exact durable setup claim returns the stored committed game, dealer game,
  and player rows to duplicate callers. A mismatched duplicate is rejected;
  a replay for an older dealer/deadline identity is read-only after a newer
  setup exists. Human and bot dealer paths consume that result directly;
  Realtime only synchronizes peers.
- The 3-5-7 first-hand caller now consumes the complete opening RPC result and
  refetches its private cards directly. H1/R1 and later new-hand R1 deal
  admission use the exact durable chip-transfer cursor, eliminating the
  edge-order race where the arrival could precede the browser's baseline.
- Routine 3-5-7 investigation traces are debug-gated again, and repeated wave
  dispatch decisions are fingerprint-bounded so a stalled presentation cannot
  amplify into continuous diagnostic database traffic.
- The rollback-only database proof passes all seven game configurations,
  human and bot ownership, authorization, failed-config atomicity, duplicate,
  payload mismatch, and late replay. The complete 3-5-7 authority proof also
  passes in that transaction, including its actual scheduled recovery entry
  point. Twenty-six focused setup/Round-1 assertions, TypeScript, all 33
  build-required Cribbage assertions, and the production build pass.

## 3-5-7 server-authority cutover

- Migrations `20260816213000_three_five_seven_authority_cutover.sql` and
  `20260817123000_optimize_357_hidden_cards_rls.sql` are installed on owned
  production. PostgreSQL now owns atomic admission/bootstrap and first deal,
  exact player decisions and expiry, winner/tie/all-fold resolution, successor
  rounds, instant sweep and terminal settlement, winner-card consent, and the
  exact-settlement transition into the next dealer-game setup.
- The bootstrap RPC commits and returns the opening round to its initiating
  client; Realtime only synchronizes peers. Postgame progression skips the
  shared browser-authored transient reset. Its row-locked durable claim returns
  the stored disposition to duplicate callers and makes a replay for an older
  dealer game read-only after a newer dealer game exists.
- The one-second database recovery function and both deadline Edge Function
  paths call the same server transition. The complete scheduled recovery entry
  point passed the rollback proof before and after production deployment,
  including opening, expiry, continuation, terminal settlement, duplicate and
  late replay, authorization, tie, all-fold, and terminal-state cases.
- TypeScript, the nine focused 3-5-7 progress assertions, all 33 build-required
  Cribbage assertions, and the production build pass. Published two-client
  startup, disconnect recovery, rollover, settlement, and postgame smoke remain
  the acceptance gate before this becomes a stable checkpoint.
- Smoke of session `Aug 17 - Estimated Prophet` exposed two follow-up defects.
  Purchased legs were being transferred into the pot even though settlement
  also returned the leg reserve, minting one leg-reserve total at terminal;
  and the setup owner's Sit Out action still entered shared browser cleanup,
  whose protected game update was correctly rejected by the authority guard.
- Migration `20260817131736_fix_357_leg_reserve_and_setup_decline.sql` is now
  installed on owned production. A leg debits its owner and increments the
  owned leg count without changing the pot. A normal terminal publishes the
  immutable ledger stages `leg`, `sweep`, then `transfer`, preserving chips,
  pot, and owned reserve exactly.
- `three_five_seven_decline_setup` now accepts only the exact committed
  postgame dealer/deadline handoff, locks the game, verifies the setup owner,
  marks that player sitting out, derives the next eligible dealer or terminal/
  waiting disposition, clears outgoing transients, and stores one durable
  exact-identity replay result. Both 3-5-7 modal call sites bypass the shared
  browser cleanup. Make It Take It changes now require and verify the returned
  persisted setting row before the client reports success.
- The complete candidate and deployed rollback proofs pass, including owned
  leg reserve, exact terminal conservation and ledger ordering, Make It Take It,
  setup-owner authorization, duplicate replay, and late replay after a newer
  dealer game. TypeScript, 13 focused 3-5-7/ledger assertions, all 33 required
  Cribbage assertions, and the production build pass. Published two-client
  acceptance remains required; the historical smoke session was not rewritten.
- The paused `Aug 17 - Albert Almora` H2/R1 P0 was a client presentation
  deadlock, not missing cards: both private hands and exact rollover batch 14
  committed atomically, but Happach Gmail armed an edge-triggered ante gate
  after its own transient arrival label had already expired. New-hand Round 1
  admission now consumes the initiating client's committed advance-RPC result,
  immediately refetches the round/private cards, and waits on the durable exact
  batch cursor (`settled` or `reconciled`). Peers derive the same exact identity
  from committed game + round state; stale direct results cannot cross a newer
  hand or dealer game. Realtime remains synchronization only.
- The later `Patrick Wisdom` DG1 failure exposed the same edge-order contract
  on H1/R1 after the old multi-write setup handoff temporarily exposed a torn
  ante phase. The shared atomic handoff and H1 durable cursor above close both
  sides of that first-hand race; the paused production session was not mutated.
- Nineteen focused 3-5-7 advancement/rollover assertions, TypeScript, and the
  production build pass for this P0 correction. The frozen session remains
  untouched; resume smoke must verify both clients see H2/R1 cards after the
  rollover flight. The two separately queued P1 presentation flashes remain
  out of this correction.
- Jeremy accepted the published two-client 3-5-7 P0 smoke on 2026-08-17 at
  commit `8f6890caa`: the repaired atomic setup and exact first/new-hand deal
  admission completed cleanly. Preserve the initiating-client RPC result,
  private-card refetch, and exact durable transfer cursor; Realtime remains
  peer synchronization only.
- The current presentation-only follow-up keys timer and decision admission to
  the exact mounted 3-5-7 hand runtime, so the prior hand's ready state cannot
  flash controls before Round 1 deal transport lands. A normal terminal final-
  leg award now renders the immutable `targetLegs - 1` baseline once, so a
  player with two legs keeps both visible while the winning third leg arrives.
  Nonterminal leg awards, instant sweeps, database authority, and settlement
  remain unchanged.
- Twenty-seven focused 3-5-7 assertions, TypeScript, all 33 build-required
  Cribbage assertions, and the production build pass for the P1 candidate.
  Jeremy accepted the published two-client smoke on 2026-08-17 at commit
  `845f5865b`: the two-leg baseline remained visible while the third leg
  arrived, and Round 1 controls stayed hidden until deal transport landed.
- The accepted smoke exposed one separate P2 after terminal teardown: swept
  legs can repaint before the next dealer game exists. During the intentional
  null `current_game_uuid` handoff, `MobileGameTable` substitutes the long-lived
  session `gameId` as a dealer-game scope. That false concrete boundary clears
  the outgoing terminal owner; once the local phase returns to `idle`, the leg
  renderers may expose their still-cached outgoing counts. The current
  presentation-only candidate preserves the null scope, records the exact
  outgoing dealer game when the visible sweep completes, suppresses self,
  opponent, and lobby leg stacks through that handoff, and releases them only
  for a different concrete dealer game. Database settlement and postgame
  advancement are unchanged. Thirty-two focused 3-5-7 assertions, TypeScript,
  all 33 build-required Cribbage assertions, and the production build pass;
  published smoke remains the acceptance gate.
- Migration `20260818090518_fix_357_all_fold_wave_handoff.sql` is installed on
  owned production. An all-fold resolution now finalizes its pussy-tax ledger
  batch in the decision transaction, persists that exact cursor in the durable
  resolution, and returns the committed game, completed round, and resolution
  directly to the last-decision caller. A duplicate same-decision caller gets
  the stored result; a stale result cannot authorize a newer round.
- All-fold no longer enters the generic four-second result delay. Connected
  clients call the exact server advance only at the tax cursor's settled/
  reconciled boundary. The existing eight-second database recovery lease
  remains only for a missing or disconnected client. The initiating client
  immediately refetches its RPC result instead of waiting for its own Realtime
  event.
- 3-5-7 action/timer readiness now proves dealer game, hand, round row, round
  number, wave identity, and the cumulative runtime card count. R1 readiness
  therefore cannot flash controls over R2's retained three cards before cards
  four and five land. Historical rejoin still reconstructs without replaying
  old transports.
- The 3-5-7 wartime sink validates UUID columns independently and retries a
  failed batch at most once; the pregame `round_id='0'` placeholder is stored
  as null and can no longer generate a permanent HTTP 400 loop. The complete
  rollback proof passed in the applying transaction, including the actual
  scheduled recovery function on an unacknowledged all-fold result. Thirty-
  three focused 3-5-7 assertions, TypeScript, all 33 build-required Cribbage
  assertions, and the production build pass. Published two-client smoke is the
  remaining acceptance gate; the paused `Aug 18 - Monroe Street` session was
  not mutated.
- Published follow-up smoke confirmed the financial handoff but exposed three
  presentation-owner conflicts. The current client candidate suppresses raw
  `All players folded` and solo-stay audit narration from the generic result
  rail. An actual committed all-fold tax batch now owns exactly one `Pussy
  Tax!` scope while its immutable cursor is queued/running; the identity-
  deduped leg-delta owner remains the sole ordinary `<player> won a leg!`
  publisher.
- The legacy browser-timed `Rollover` notice is removed. A later-hand Round 1
  batch now owns `Re-Ante` from the same exact cursor already gating its chip
  transport and deal. Pussy Tax retires when its cursor settles, the server
  commits the R3 -> R1 continuation, and Re-Ante then exists only while that
  distinct cursor is queued/running. Historical/reconciled cursors never
  replay either notice, and neither announcement adds a progression delay.
  Database settlement, pot, leg reserve, authority guards, and replay claims
  are unchanged. Thirty-six focused 3-5-7 assertions, TypeScript, all 33
  build-required Cribbage assertions, and the production build pass; published
  two-client smoke remains the acceptance gate.
- Paused `Aug 18 - Ryan Dempster` smoke proved a two-client cursor seam in that
  presentation candidate. After one client advanced the database to the next
  hand, the slower client recomputed away its exact outgoing pussy-tax claim.
  The shared ledger correctly held the overlapping re-ante batch behind that
  unadmitted tax cursor, leaving the later announcement visible without its
  chip transport or deal. The client now retains each immutable 3-5-7 financial
  cursor claim within the exact game/dealer-game scope until a newer claim or
  identity reset replaces it. Cursor 8 can therefore finish before cursor 9 on
  both clients even after authoritative state advances. `Pussy Tax!` and
  `Re-Ante` publish only for a running transfer, never for a merely queued one.
  Database state and the paused repro remain untouched. Fifty-three focused
  3-5-7 assertions, TypeScript, all 33 build-required Cribbage assertions, and
  the production build pass; published two-client R3 -> R1 smoke remains the
  acceptance gate.
- Paused `Aug 18 - Roquan Smith` smoke proved the remaining announcement edge:
  the database committed cursor 4 Pussy Tax, cursor 5 Re-Ante, and H2/R1
  correctly on both clients running commit `4fe757e30`, but one client skipped
  the transient React render in which cursor 5 was `running`. The canonical
  ledger now exposes an optional exact batch-start callback after endpoint
  ownership and before dispatch. Only 3-5-7 uses it to publish `Pussy Tax!`
  and `Re-Ante`; exact batch settlement/reconciliation retires the scope.
  Cursor state is cleanup-only and can no longer be the announcement trigger.
  Existing Cribbage, Gin, Yahtzee, Holm, transport timing, database authority,
  and financial progression are unchanged. Seventy-three focused 3-5-7/
  ledger assertions, TypeScript, all 33 build-required Cribbage assertions,
  and the production build pass. The paused production session remains
  untouched; published two-client R3 -> R1 smoke remains the acceptance gate.
- Paused `Aug 18 - Stella Blue` smoke rejected that candidate: both clients on
  commit `9fe57529f` consumed the same committed cursor 4 Pussy Tax and cursor
  5 Re-Ante sequence, but Hap never painted `Re-Ante`. The canonical rail's
  `retireTransientScope` contract said synchronous while its live-event ref was
  actually cleared later inside a React state updater. A same-tick lower-
  priority successor could therefore enqueue behind the retired tax and be
  removed at its own settlement without ever becoming visible.
- The current client candidate makes scope retirement synchronous at the rail
  state-machine boundary, promotes any unrelated queued priority owner before
  admitting a successor, and prevents a stale promotion task from overwriting
  a newer live event. A mounted-provider regression covers the exact Pussy Tax
  -> Re-Ante handoff under pending React work; separate cases preserve unrelated
  priority ordering and Cribbage counting-target retirement. Debug-gated
  exact-identity evidence now records disposition, actual paint, and retirement
  for both 3-5-7 financial notices. Forty-eight focused assertions, TypeScript,
  all 33 build-required Cribbage assertions, and the production build pass;
  published two-client R3 -> R1 smoke remains the acceptance gate.
- Paused `Aug 18 - Notre Dame` smoke rejected that candidate on commit
  `672e0321f`: both clients received the same committed cursor 4 Pussy Tax,
  cursor 5 Re-Ante, and H2/R1 authority, but only the client that launched the
  local cursor-5 chip flight ran the batch-start callback. The other client
  correctly reconciled the immutable cursor without replaying financial
  motion, so an animation-owned semantic trigger could never publish
  `Re-Ante` there. The different H2 timer/deal arrival times corroborated the
  two legitimate local presentation paths; the paused session was not mutated.
- The current candidate moves both financial notices to a dedicated owner fed
  by their exact committed game/dealer-game/round/hand/cursor identities.
  Every live client now publishes the same event once after observing that
  identity. A locally animated batch is only an early-retirement boundary;
  a reconciled/no-flight client keeps the non-blocking notice for its short
  rail TTL. Tax is synchronously retired before the distinct Re-Ante identity
  publishes, H1 remains an opening ante, and transport, deal admission,
  balances, settlement, and database authority are unchanged. The bounded
  disposition/paint/retirement proof now bypasses the opt-in debug gate and
  carries client/build correlation during production smoke. Seventy-four
  focused 3-5-7/provider assertions, local TypeScript, all 33 build-required
  Cribbage assertions, and the production build pass; published two-client
  R3 -> R1 smoke remains the acceptance gate.
- The completed `Aug 18 - 46 Days` dealer game exposed the same forbidden
  edge dependency in normal terminal presentation. Both clients held the
  exact committed settlement and postgame handoff, but Hap reconciled the
  zero-flight leg-reserve sweep batch as history. Because pot presentation
  depended only on a local batch-settled callback, Hap remained in
  `sweep-credit`, never published the win notice, never animated the pot, and
  kept the already-committed setup modal behind its local terminal hold.
- Normal terminal presentation now directly refetches the one immutable
  zero-flight sweep batch for the exact outgoing game/dealer-game generation.
  Its cursor releases the armed continuation at either `settled` or
  `reconciled`; the live batch callback remains only an immediate path through
  the same exact-identity one-shot. Round, hand, terminal result, winner, and
  generation mismatches reject duplicate or late release, so an old terminal
  can never advance a newer dealer game. Settlement, postgame authority, and
  financial motion are unchanged. Seventy-two focused 3-5-7 assertions,
  local TypeScript, all 33 build-required Cribbage assertions, and the
  production build pass; published two-client terminal smoke remains the
  acceptance gate. The historical session was not mutated.

## Yahtzee remote-score presentation handoff

- Published two-client smoke after the authority cutover exposed a
  presentation-only regression: the atomic score commit advanced the real turn
  before the observer's effect installed its score highlight. The next player's
  `isMyTurn` branch therefore mounted a felt scorecard for one frame, and the
  unbound category highlight made it resemble the outgoing scorer's card.
- The client now recognizes an unseen latest `lastAction` score synchronously
  and binds that presentation to its player and action sequence. The observer
  keeps the scorer's dice on the felt and the scorer's read-only scorecard in
  the active-player box through the existing highlight, suppressing the next
  player's interactive felt surface until release. Authoritative turn state,
  RPC admission, scoring, and Realtime ownership are unchanged.
- Seventeen focused Yahtzee assertions, TypeScript, and the production build
  passed locally as the first stage of the released presentation correction.
- The presentation follow-up suppresses the incoming player's action strip
  while that remote scorer presentation is active, so its `Scoring…`
  reservation cannot move the scorer's scorecard before it tears down.
- The next follow-up removes every helper line above the opponent scorecard,
  moves roll and score narration onto the canonical announcement rail, and
  gives the mobile HUD a score-first, two-column layout: scores never shrink,
  while only an overlong player name may ellipsize. Initial hydration now
  marks durable prior actions as already presented, so refresh cannot replay
  an opponent's old scoring dice or highlight before the local turn resumes.
- Twenty-two focused Yahtzee/announcement assertions, TypeScript, and the
  production build passed locally as the second stage of the released
  presentation correction.
- The current presentation follow-up gives the exact active Yahtzee player a
  persistent canonical-rail status (for example, `Hap is rolling`) through
  every roll, hold, and category choice. A committed score immediately overlays
  that next-turn status at higher rail priority, and the local scorer, remote
  scorer presentation, and score narration now share one 2.5-second release
  interval. This remains presentation-only; the database turn already advances
  atomically at score commit.
- Twenty-six focused Yahtzee/rail assertions, local TypeScript checking, and
  the production build gate pass. Vercel production deployment
  `dpl_3PTo2K2BRcLksVjFswgSbgd5VQ1B` and the public manifest serve commit
  `987f9a31be249bae3d2c26ddeaa6dfa13840e9a3`.
- A slow observer may legitimately receive an older score snapshot after the
  next player is locally ready, but it must never retain that score once the
  newer durable action reaches it. Score presentation and rail narration are
  now keyed to the exact round/action sequence; a newer sequence dismisses the
  active or queued score notice and cached score visual in the layout phase.
  The bot scorer now uses the same 2.5-second maximum presentation interval.
- Jeremy accepted the published two-client Yahtzee smoke on 2026-08-17 at
  commit `987f9a31be249bae3d2c26ddeaa6dfa13840e9a3`: opponent scorecards
  remain static while scoring, the rail narrates the active roller or the
  committed score without helper-text displacement, mobile scores remain
  visible, refresh does not replay a prior score, and a delayed score visual
  retires as soon as the next durable action arrives.

## Yahtzee server-authority and postgame cutover

- Migration `20260816210000_yahtzee_authority_cutover.sql` is installed on the
  owned production database. PostgreSQL now validates completed antes and
  atomically creates/replays the first or tie-successor Yahtzee round, including
  the canonical lower-position clockwise order and committed opening state.
- `public.yahtzee_apply_action` owns server-generated rolls, holds, Joker-aware
  category legality and scoring, the monotonic action sequence, atomic score
  plus turn handoff, terminal state, and settlement invocation. The initiating
  browser consumes the returned committed snapshot directly; Realtime remains
  peer/reconnect synchronization. Direct Yahtzee round JSON writes are rejected.
- `public.yahtzee_advance_postgame` locks the exact terminal round and game,
  verifies its committed settlement, uses a durable exact-identity replay claim,
  derives the next dealer/deadline, clears outgoing identities and ephemerals,
  and publishes the next setup or terminal disposition atomically. Yahtzee now
  bypasses the shared browser-authored transient reset.
- The one-second scheduled owner runs the same bootstrap, bot, terminal, and
  postgame transitions without swallowing database errors. The full deployed
  rollback proof passes winner, tie, duplicate, stale action, authorization,
  continuation, terminal, late-replay, direct-write guard, and complete
  scheduled-recovery cases. TypeScript, 20 focused assertions, the 33-test
  release gate, and the production build pass locally; published multiplayer
  smoke remains pending.

## Cribbage authoritative postgame handoff

- Production smoke after terminal-counting acceptance exposed a separate
  post-settlement freeze: the shared browser lifecycle owner attempted to clear
  protected Cribbage hand counters directly, the authority guard rejected that
  write, and its later `game_over` claim failed for the same reason. Settlement
  remained correct and exactly once, but the session never reached the next
  dealer-game setup.
- Migration `20260816153000_cribbage_postgame_authority.sql` is installed on
  owned production and adds an authenticated, exact-identity
  `cribbage_advance_postgame` RPC plus a private durable replay claim. The RPC
  locks the terminal round then game, requires
  the matching committed `cribbage_terminal` result, derives make-it-take-it
  or normal dealer rotation in PostgreSQL, clears outgoing dealer-game state,
  and commits the next setup phase atomically. Duplicate clients and late
  replays are read-only.
- `Game.tsx` now delegates only the Cribbage continuation branch to that RPC;
  all other game families retain their existing postgame path. The complete
  rollback proof covers direct-write rejection, authorization, exact terminal
  settlement, dealer derivation, duplicate callers, and a late replay after a
  simulated newer dealer game. TypeScript, 33 focused Cribbage assertions, and
  the production build pass.
- Jeremy accepted the published two-client Cribbage smoke on 2026-08-16 at
  commit `a73855939c2737f685e0cefc9b5851473bfbe54f`: startup, partial-discard
  refresh, visible terminal counting, exactly-once settlement, and progression
  into the next dealer-game setup all completed cleanly.

## Cribbage terminal-counting lease and partial-crib rejoin repair

- Production smoke on **Aug 16 - Aramis Ramirez** proved that a counting-based
  winner was finalized in the same transaction that entered counting. Both
  clients received `complete` with a 31-point winner while the durable counting
  cursor was still at target `0`, beat `-1`; their pegboards then reconstructed
  the correct 24-point pre-count baseline after terminal presentation had
  already started. The database nevertheless settled exactly once.
- Migration `20260816143000_defer_cribbage_terminal_until_counted.sql` is
  installed on owned production. PostgreSQL now persists a counting winner as
  `terminal_pending`, keeps the winner identity private, and publishes the
  immutable scoring plan without admitting `complete`. The visible crossing
  acknowledgement promotes the authoritative terminal state; the scheduled
  owner performs the same promotion and exactly-once settlement after the
  presentation fallback when every browser disconnects.
- A refreshed client that rejoins after its own partial discard now reconstructs
  already-parked crib cardbacks from the authoritative crib count. That one-time
  hydration does not consume later live opponent growth, so normal
  discard-to-crib transport and cut gating remain unchanged.
- The complete authority rollback proof passed before and after deployment and
  now covers private pending-winner projection, duplicate scoring, premature
  settlement rejection, authorization, connected promotion, disconnect
  fallback, and settlement replay in addition to dealer winner/tie, action
  replay, late replay, and continuation. Thirty-three focused Cribbage
  assertions, the local TypeScript no-emit check, and the production build pass.
  The published end-to-end smoke was accepted on 2026-08-16.

## Cribbage dealer-selection startup hotfix

- Production smoke after the authority cutover exposed one Cribbage startup
  handoff with two coupled failures. The client that completed ante processing
  wrote `cribbage_dealer_selection` and then depended on receiving its own
  realtime update, so only the peer mounted the draw. The scheduled recovery
  owner then called a nonexistent `jsonb_object_length(jsonb)` function; its
  statement aborted and rolled back the otherwise valid first-hand start.
- Migration `20260816124000_fix_cribbage_startup_handoff.sql` is installed on
  owned production. `public.cribbage_begin_dealer_selection` now validates
  completed antes and commits the status plus replay-safe dealer result in one
  transaction. A private JSON-object count helper makes the existing recovery
  owner executable. The initiating client calls the atomic RPC and explicitly
  fetches its committed row, while non-host receipt ignores semantically
  duplicate completed snapshots.
- The complete rollback proof passed before and after deployment. It now calls
  the full recovery owner and covers incomplete antes, authorization, dealer
  tie/winner identity, duplicate/replay, initial-hand recovery, hidden-state
  projection, continuation, late replay, and terminal settlement. The parked
  production repro recovered to exactly one hand/round in `discarding`; the
  latest cron run succeeded. Thirty-two focused Cribbage assertions, the
  available TypeScript no-emit check, and the production build pass. The
  published end-to-end startup smoke was accepted on 2026-08-16.

## Cribbage server-authority cutover

- Migration `20260816113000_cribbage_authority_cutover.sql` is installed on
  owned production. Hidden hands and crib cards now live in
  `private.cribbage_round_states`; `rounds.cribbage_state` is a redacted
  realtime projection, and authenticated callers receive only their own hand
  through `cribbage_get_state`.
- PostgreSQL now owns dealer draw, first-hand creation, discard merge and cut,
  every pegging play/Go/score/turn transition, counting totals, successor
  creation, bot recovery, and terminal settlement. Round, player-card, dealer,
  and hand-counter guards reject browser-authored Cribbage mutations. The
  scheduled recovery owner continues dealer startup, bots, expired counting
  leases, and settlement when every browser disconnects.
- The rollback proof passed before and after deployment. It covers dealer-draw
  ties, winner identity, hidden-card projection, authorization, duplicate and
  replayed actions, stale late replay, continuation, terminal scoring, and
  replay-safe settlement. TypeScript, the 30 focused Cribbage preservation
  assertions, and the production Vite build pass. Published two-client gameplay
  smoke was accepted on 2026-08-16.

## Holm Chucky card-face slot sizing

- The Holm Chucky stage deliberately fills its canonical `HolmAnchoredSlot`
  with percentage dimensions. `PlayingCard` could not derive face density from
  those percentage strings, so it used a device-category fallback and produced
  oversized or cropped rank/suit art in Chrome desktop mobile emulation.
- `MobileGameTable` now measures that existing slot with a bounded
  `ResizeObserver` owner and passes the measured width through the shared
  `faceFillPx` API. Stage geometry, card aspect ratio, deck art, and canonical
  card rendering remain unchanged; no viewport breakpoint or core geometry
  contract was changed.
- The focused sizing regression check, TypeScript no-emit check, and Vite
  production build passed. Commit `9509c16bfb9fdf43c2e2e469fa09e57fc9cffdb0`
  reached Vercel production `READY`, and Jeremy confirmed the reported
  Chucky-card face-size smoke on 2026-08-16.

## Stale published-build admission gate

- Production commit `504956f1dacc14d4a60750e5fbb520dc15038210` added a
  versioned `system_settings.release_publication` signal, emitted only after
  the public production manifest serves the matching SHA. `ReleaseVersionGate`
  rechecks that manifest on the release signal, page resume, reconnect, and
  foregrounding; a stale lobby receives the non-dismissible **Not on current
  build** refresh dialog.
- Runtime smoke exposed the original publisher-to-client race: the public
  bundle could be live before the workflow wrote the release signal. Commit
  `02233d8913e7629f8847e29ad5931d95b1e1b18b` closes that admission boundary:
  every new `/game/:gameId` route performs its own no-cache manifest read
  before `Game` mounts and fails closed on a mismatch or unavailable manifest.
  Once admitted, an active game remains uninterrupted; the next lobby visit
  remains the update boundary.
- The GitHub publisher's public-alias retry cadence is five seconds while
  retaining its ten-minute maximum wait. Focused release tests, TypeScript,
  the Cribbage preservation suite, and the Vite production build passed.
  Jeremy confirmed the production stale-lobby smoke working on 2026-08-16.

## Holm dealer-game teardown card retirement

- The ordinary Holm dealer-game rollover clears `games.current_game_uuid`
  before it publishes the next setup status. The persistent table correctly
  remains mounted through that boundary, but its cached card surface had not
  consumed the existing `currentRoundNotReadyForPresentation` admission
  signal. The old community row could therefore briefly reappear in its
  two-face-down/two-face-up state while the game still read `game_over`.
- `MobileGameTable` now retires the entire Holm card surface (community,
  tabled-player, and Chucky cards) in the same render that the authoritative
  dealer-game/round identity is no longer valid. The normal terminal reveal
  remains visible until the dealer-game boundary actually clears; no database,
  settlement, deal transport, or next-game lifecycle behavior changed.
- The focused two-assertion boundary regression check, TypeScript no-emit
  check, and Vite production build pass. The existing isolated
  `HolmCanonicalCommunityRow` suite still exposes its known pre-existing test
  cleanup leakage (the prior render remains mounted); it is unrelated to this
  change. Jeremy's production smoke passed on 2026-08-16 at commit
  `8cd3cc884e88393a548c99edae8a75139a42c10b`: after a Holm dealer-game
  teardown, no community cards reappeared before next-game setup.

## Admin fake-money session blast control

- Migration `20260815180000_admin_blast_fake_money_game.sql` is installed on
  owned production. The security-definer
  `public.admin_blast_fake_money_game(uuid)` checks the authenticated admin
  role and the fake-money flag under a game-row lock, removes the independently
  archived Cribbage records, then deletes the authoritative game row and its
  cascading session graph. Missing-session replays are safe no-ops; real-money
  sessions are rejected and are never eligible for deletion.
- `PlayerOptionsMenu` exposes **Blast This Game** only when `Game.tsx` has
  already established both conditions: the signed-in user is an admin and the
  current game is fake money. It invokes the guarded RPC immediately; a local
  in-flight latch prevents duplicate clicks. A central `games` DELETE realtime
  listener sends every connected client directly to the lobby, bypassing the
  prior missing-game retry cycle.
- The later one-tap follow-up removed the confirmation dialog but left its
  obsolete state setter in the post-RPC success path. The session was deleted,
  then the undefined setter threw and produced a misleading failure toast. The
  client now continues directly from the successful RPC result into the
  existing recovery release and lobby navigation; database deletion, guards,
  peer ejection, and real-money protection are unchanged.
- The rollback proof passed before and after the production migration. It
  covers winner and tie cleanup, duplicate/late replay, authorization,
  continuation controls, terminal state, and the real-money guard. TypeScript,
  the 30 focused Cribbage preservation assertions, and the production Vite
  build pass. Live smoke remains pending.

## Atomic explicit post-game participation checkpoint

- Migration `20260815163818_atomic_explicit_postgame_stand_up.sql` is
  installed on owned production. `public.stand_up_and_resolve_postgame` now
  commits an authenticated human's Stand Up flags and the settled post-game
  lifecycle disposition under one game/player lock.
- Zero active humans ends immediately: real-money sessions reuse the existing
  snapshot-backed exactly-once finalizer, while fake-money sessions enter
  `session_ended` without SessionResult, balance, or financial-transaction
  writes. One remaining active participant returns to Waiting with setup
  identity cleared; two or more eligible participants preserve continuation.
  The fifteen-second heartbeat grace remains only for still-active seated
  humans whose presence is ambiguous.
- `Game.tsx:handleStandUpNow` now calls that RPC after the existing departing
  real-money snapshot. Never-started rooms and non-post-game states explicitly
  fall back to the prior cleanup owner. No deal transport, cards, game rules,
  settlement trigger, heartbeat reconciler, or canonical presentation guard
  changed.
- The new rollback proof passes before and after deployment and covers the
  exact two-client fake-money repro, real-money winner settlement, duplicate
  and late replay, authorization, one-player Waiting, eligible continuation,
  initial-room exclusion, and live-game exclusion. The complete existing
  winner/tie/heartbeat abandonment proof, TypeScript, 30 focused Cribbage
  preservation assertions, and the production Vite build also pass.
  Production smoke confirmed immediate Session Ended on both clients with no
  setup-dialog recurrence. A narrow presentation follow-up now suppresses
  open-seat join affordances whenever `MobileGameTable` is in its existing
  `sessionEndedPhase`; the stood-up viewer still uses the established absolute
  observer projection. Jeremy reported the follow-up production smoke clean on
  2026-08-15 at commit `8b5e8f4ecc4d42f3028a48f71492b34aec80112b`;
  the zero-active closure and Session Ended affordance gate are accepted.

## Holm DG1H1 Buck and paused-session announcement checkpoint

- Migrations `20260815155602_mint_holm_initial_buck_presentation.sql` and
  `20260815160011_preserve_holm_initial_ante_transfer_reason.sql` are installed
  on owned production. `public.start_holm_initial_hand` now mints the same exact
  server-authored `SERVER_BUCK_TRANSFER` event used by later Holm hands, from
  the authoritative dealer seat to H1's authoritative Buck position. The event
  is bound to the new dealer-game, round, hand-context, and hand-1 identity in
  the startup transaction. The follow-up retains the canonical `ante`
  classification for both sides of the opening chip-transfer journal batch.
- The existing client remains the sole Buck-overlay presentation owner. Only
  the recipient client may show `Buck's on you`, and only when the matching
  live H1 hands-wave transport is accepted. No card transport, `DealRuntime`,
  timer, settlement, or continuation code changed.
- `SessionLifecycleAnnouncer` now owns one `game_paused` ambient for every
  game family, including Cribbage. Its stable event identity uses the
  authoritative host user UUID; the host display name is presentation-only.
  While `games.is_paused` remains true the rail says
  `Game is paused - only <host name> can resume`, and authoritative resume
  retires only that announcer-owned ambient.
- The complete H1 rollback proof passed before and after both migrations. It
  covers exact event shape, duplicate and late replay without event
  replacement, authorization, paused startup, continuation rejection,
  winner/tie terminal state, unique deal, exactly-once ante movement, exact
  canonical ante journal classification, and rollback cleanup.
  Thirty-six focused checkpoint-1/2 assertions, five Buck-ownership
  assertions, TypeScript, 30 Cribbage preservation assertions, and the Vite
  production build pass. Jeremy reported checkpoint 2 production smoke clean
  on 2026-08-15 at commit `6f0951b8ea652633212dbec2a162c5fe86ced8fd`;
  the H1 Buck and persistent paused-session announcement are accepted.

## Holm DG1H1 live-entry provenance checkpoint

- Repeatable two-client smoke reached Holm dealer-game 1, hand 1 with an
  authoritative `betting` round and deadline, but the first active player's
  timer never became visible. Read-only production evidence from `Aug 14 -
  East Peoria` showed both mounted clients transition from `ante_decision`
  with no Holm presentation hand directly into the same H1 betting identity.
- `Game.tsx` captured the first Holm identity only after that H1 existed, then
  treated the matching identity as a historical reconnect. That skipped the
  live deal path, so no accepted hands/community transport could naturally
  settle and release the existing timer gate. Later hands and dealer games
  already classified live because their identities differed from H1.
- The route now remembers only whether it actually rendered a pre-hand phase
  before its first Holm presentation identity. A mounted setup/ante client
  classifies the arriving DG1H1 as `live-transition`; a cold mount whose first
  frame is an already-active H1 remains `historical-entry`, and later hand or
  dealer-game identities remain live.
- Checkpoint 1 changes no `DealRuntime`, timer-eligibility, transport,
  settlement, continuation, database, Buck-event, or pause-announcement code.
  Regression assertions explicitly preserve the rolled-back rule that an
  initially skipped runtime is not fabricated as settled or released.
- The focused checkpoint suite passes 32 assertions; the wider Holm sweep
  passes 114 of 115 assertions, with the sole failure reproduced independently
  as pre-existing test cleanup leakage in
  `HolmCanonicalCommunityRow.test.tsx`. TypeScript, 30 Cribbage preservation
  assertions, and the production build pass. Production commit
  `372dd2cf7fb4ef7bce948d812c38048cad100ec4` reached `READY`, and Jeremy
  accepted checkpoint 1 after a clean two-client DG1H1 transport, timer, and
  continuation smoke on 2026-08-15.

## Holm exact-hand presentation transaction

- The paused production session `Aug 14 - Candyman`, game
  `71bd8700-1614-4365-98e4-ef03822b4974`, dealer game
  `07bff0e4-5226-49c3-b697-9fb4732d8990`, hand 1 proved that PostgreSQL
  atomically dealt four private cards to both players and both browsers
  selected their exact cards, while one browser never displayed them. The
  frozen session was inspected read-only and remains unmodified.
- The immediate regression was the August 11 ante-to-deal gate: it could
  reopen only from a two-second balance-delta edge. A reordered delta or one
  missing chip endpoint frame permanently closed that client's deal admission.
  The wider Holm audit found the same edge-only failure shape in card-wave
  dispatch, DealRuntime remount, cross-hand settle admission, Buck timing, and
  prepared-successor acknowledgement.
- Holm H1 admission now observes durable state for its exact authoritative
  chip-transfer cursor. The ledger retains `queued`, `running`, `settled`,
  `reconciling`, or `reconciled` state; historical/reconnected cursors baseline
  without replay, while live cursors release only after their actual flight
  settles. The transient signed delta remains visual decoration only.
- Holm card waves are deterministic manifests. The persistent card provider
  records each intent as active, settled, or dropped and can replay exact-hand
  settled metadata into a remounted DealRuntime. Hands, community, and Chucky
  reconcile unseen/active/settled IDs instead of setting one-shot dispatched
  refs before acceptance. DealRuntime filters every settle by exact hand,
  declared manifest, and generation; stale hand events cannot count.
- Missing Holm chip/card anchors remain pending until canonical DOM/layout
  readiness or explicit hand-identity cancellation. No elapsed-time release or
  fake settlement exists in the Holm path. Other games retain their existing
  endpoint-recovery behavior. Buck fires only when at least one new hands-wave
  intent is accepted. Fresh historical betting mounts enter gameplay directly;
  live or exact prepared-successor presentations deal normally.
- The ready barrier now drains prepared-successor acknowledgement from durable
  exact-hand readiness as well as the immediate PhaseHost boundary. PostgreSQL
  remains the only authority owner and retains the existing configurable
  no-ack/disconnect recovery lease. Settlement, balances, deadlines,
  Rabbit/Pussy/showdown table placement, continuation barriers, and terminal
  behavior are unchanged.
- The focused Holm suite passes 95 tests, including active/settled
  duplicate reconciliation, stale-settle rejection, cancellation, and
  same-hand unmount/remount reconstruction. TypeScript, 30 Cribbage preservation
  assertions, and the production build pass. Publication and two-client
  production smoke remain required.

## Holm split-showdown presentation-plan identity correction

- Production session `Aug 14 - Metamora`, dealer game
  `a429c78c-c476-4386-bf67-fd6567c73e04`, hand 1 proved that PostgreSQL
  settled the multiplayer showdown correctly but both connected clients could
  remain presenting hand 1 while hidden successor hands continued. The hand
  published adjacent immutable batches at cursors 8 (`pot -> winner`) and 9
  (`loser -> pot`); neither client produced hand-1 completion evidence or
  acknowledged prepared hand 2.
- The regression came from conflating two identity scopes. The client keyed
  the one-hand showdown phase plan by transfer cursor, so arrival of cursor 9
  re-created the same hand's plan at `pot-to-winner` after cursor 8 had already
  settled. Cursor 8 could not replay and cursor 9 required
  `losers-to-pot`, producing a permanent local deadlock. The stricter
  acknowledgement/barrier release added on August 14 exposed this formerly
  masked missed callback instead of letting a generic timer skip it.
- Holm nonterminal presentation plans now use one stable
  `(dealer game, rounds row, hand number)` key across every batch in that hand.
  Exact transfer cursor remains mandatory only for immutable batch admission,
  completion evidence, and predecessor-barrier release. Prepared-successor
  acknowledgement retains its separate exact predecessor/successor identity.
  The same separation now governs multiplayer showdown, Chucky loss, and Pussy
  Tax latches; terminal win/reveal retains its separate stable result identity.
- No database, settlement, balance, card-placement, authoritative timeout, or
  recovery-fallback behavior changes. All 118 focused Holm assertions plus the
  two isolated community-row cases pass; TypeScript and the production build
  pass. Publication and two-client production smoke remain required.

## Game-route temporal-dead-zone hotfix

- Production smoke immediately after commit `fa64f8c05` created the waiting
  game `Aug 14 - Carl Edwards Jr` successfully, then Safari's Game route error
  boundary reported `Cannot access uninitialized variable` before the room
  rendered. Database creation and the waiting game row were intact.
- The Holm timer correction had added `currentRound` to an effect dependency
  array before that component-local `const` was initialized. Dependency arrays
  are evaluated synchronously during render, so every fresh Game-screen mount
  on the new bundle was exposed even though TypeScript and Vite both passed.
- The timer now depends on the already-initialized authoritative round inputs
  (`current_game_uuid`, `current_round`, `total_hands`, and `rounds`) that fully
  determine the in-progress round. Exact-hand timer presentation and
  server-owned timeout enforcement are unchanged. A focused source-order
  regression assertion, TypeScript, and the production build pass; production
  publication and fresh Game-screen smoke remain required.

## Holm durable predecessor-completion reconciliation

- Production session `Aug 14 - Jeff Samardzija`, dealer game
  `f566d49f-74d7-4a7c-8d0b-32608d9b623d`, proved a faster client could enter
  authoritative hand 5 while the slower client completed hand 4's correct
  showdown transfers and then remained held on hand 4. PostgreSQL correctly
  activated hand 5 through the missing-acknowledgement fallback; the defect was
  a lost client-local predecessor completion, not settlement or successor
  authority.
- `MobileGameTable.tsx` now captures the immutable Holm stage and exact
  `(dealer game, round, hand, transfer cursor)` completion identity when the
  canonical chip ledger admits the batch. Ledger settlement consumes that
  captured identity instead of reclassifying against mutable props that may
  already describe the successor.
- `Game.tsx` retains exact completion evidence and reconciles it idempotently
  with the predecessor barrier. Completion-before-barrier and
  barrier-before-completion both release the same hand; later rounds and
  different transfer cursors cannot release it. The rule applies uniformly to
  showdown replacement-pot, Chucky loss, Pussy Tax, and zero-transfer
  continuations, without a release timer.
- Visible Holm decision timers and controls now require the exact presented
  dealer-game/round/hand identity. The authoritative deadline still runs and
  remains server-enforceable even if another client is disconnected or still
  presenting the predecessor; this correction changes presentation only.
- No database migration or RPC change is required. All 102 focused Holm
  assertions pass when the two community-row cases are run in their existing
  isolated processes; TypeScript and the Vite production build pass.
  Production publication and two-client showdown smoke remain required.

## Holm acknowledgement-driven presentation release

- The fixed nine-second publication lease introduced by the preceding Holm
  continuation release is replaced. A continuing settlement still prepares
  one exact, non-actionable successor, but each browser now keeps the completed
  predecessor mounted through its exact result, Rabbit Hunt/Pussy Tax, and
  settlement presentation, then locally deals only that successor.
- At `DealRuntime`'s canonical deal-settled/ready boundary, the authenticated
  player acknowledges the exact
  `(game, dealer game, predecessor, successor, hand)` identity. PostgreSQL
  records that acknowledgement against the immutable active-human cohort made
  when the successor was prepared. The final required acknowledgement
  atomically publishes the already-dealt successor and starts a fresh decision
  deadline; duplicate and late acknowledgements are replay-safe.
- A browser acknowledgement does not select cards, settle money, or manufacture
  a hand. Tabs remain independently ordered behind their own predecessor
  barriers even if another client publishes the successor first. Fresh mounts
  during a prepared successor skip historical predecessor presentation, deal
  that exact successor, and acknowledge it. Buck presentation is minted at
  preparation but remains exact-hand gated until the successor deal starts.
- Migration `20260814190000_holm_acknowledged_presentation_release.sql` is
  installed on owned production. Its private acknowledgement cohort is not
  client-readable or client-writable. If acknowledgements never arrive, a
  pause-aware PostgreSQL worker publishes after the configurable 30-second
  recovery lease; zero-human/bot-only cohorts release server-side without a
  client. The fallback is disconnect recovery, not normal presentation timing.
- The rollback proof covers winner, tie, duplicate, replay, late replay,
  authorization, continuation, pause/resume, terminal state, no-ack fallback,
  and bot-only release. Focused client ownership/selection tests and TypeScript
  pass; production publication and live two-client smoke remain required.

## Holm server-owned continuation and ordered presentation

- The first post-release Rabbit Hunt smoke in the paused `Mike Olt` session
  proved authority remained healthy while both clients deadlocked locally:
  hand 1 settled Pussy Tax, the server published hand 2 after its lease, hidden
  hand 2 timed out, and the server published hand 3. Both connected clients
  continued to display completed hand 1 because its Pussy Tax transfer could
  miss a one-render admission trigger; raw hand 2 was then incorrectly marked
  observed-live and replaced the active hand-1 barrier. Hand 1 deducted $1
  from each player and hidden hand 2 later deducted another $1 from each; the
  paused production session was not mutated during investigation.
- Production inspection proved the existing 20-second "service fallback" was
  not operationally server-owned: `enforce-deadlines` was invoked by a browser
  poller, and no deployed cron job called either Holm activation path. A table
  with every client disconnected could therefore remain prepared forever.
- Migration `20260814130000_holm_server_owned_presentation_release.sql` is
  installed on owned production. Settlement still prepares one exact
  non-actionable successor, but a one-second PostgreSQL cron worker now
  publishes it after a nine-second durable lease. Activation and the legacy
  proceed RPC are service-only, release-due-only, replay-safe, pause-aware, and
  terminal-aware; no client action can advance authoritative Holm state.
- Each client that actually observed the predecessor in live betting holds its
  own Holm presentation snapshot until its final canonical result/transfer
  paint completes. The barrier is now an exact presented-hand identity and is
  non-overwritable: raw/hidden successors cannot mark themselves observed,
  borrow a predecessor result gate, or release it with a later transfer cursor.
  Rabbit Hunt completion joins the exact result paint, visible card-4 flip when
  enabled, and exact Pussy Tax batch settlement in either realtime ordering.
  A faster server snapshot is buffered from the presentation owner only;
  tabled showdown cards stay beside the applicable chip stacks/self and solo
  cards stay in the tabled area. Fresh mounts admit current authority
  immediately instead of replaying historical results.
- Buck events now carry exact session, dealer-game, round, hand-context, and
  hand-number identity. The recipient shows `Buck's on you` only when the
  matching live hand's accepted hands-wave transport starts. Dealer-game
  changes clear any prior Buck event.
- The deployed rollback suite passes winner, tie, duplicate, replay,
  late-replay, authorization, pause, continuation, terminal-state, exact Buck
  identity, and no-client worker cases. The follow-up client correction passes
  88 focused Holm tests, TypeScript, and the Vite production build. The
  repository-wide suite still contains unrelated pre-existing Cribbage, Gin,
  Yahtzee, participant-scoping, and snapshot assertion failures. The reported
  `Mike Olt` game remains paused and unmodified; production smoke remains
  required.

## Holm presented-hand continuation correction

- The first live smoke after database-owned multiplayer resolution settled
  hand 2 and prepared hidden hand 3 correctly, but both browsers appeared
  frozen for roughly 25 seconds. `Game.tsx` kept the official presentation
  round on hand 2 while its separate card fetch selected the newest round in
  the dealer game, which was already hand 3. The presentation identity gate
  correctly rejected those successor cards, leaving no stayed-player cards to
  open the showdown reveal and transfer stages. The browser-invoked fallback
  later activated hand 3. The authoritative transfers and balances had already
  committed exactly once; no balance repair or production-session mutation is
  required.
- Holm card hydration now selects the exact published
  `(dealer_game_id, games.total_hands, games.current_round)` identity. A
  prepared successor and its cards remain invisible until activation advances
  the published hand. Missing published identity fails closed instead of
  falling back to a newest-round query.
- This correction preserves the existing render owners rather than latching a
  screen position: multiplayer stayed cards remain tabled through their
  canonical seat clusters beside the chip stacks (including self when
  applicable), solo cards remain in the dedicated tabled-self area before
  Chucky appears, the private self-hand region relinquishes ownership, and
  folded cards remain hidden.
- The follow-up server-owned continuation release above replaces client
  activation/reconnect recovery. Every browser now orders only its own
  presentation, while PostgreSQL advances independently of every connection.

## Holm database-owned multiplayer resolution hardening

- A production Holm hand could persist both final decisions but still rely on
  the browser to evaluate cards, settle the result, and request the next hand.
  When that callback was lost, the deadline service later recovered the game,
  producing the observed roughly 30-second freeze.
- Migration `20260814020000_holm_database_resolution_hardening.sql` is
  installed on owned production. `public.resolve_holm_showdown` now locks the
  exact active hand, evaluates all multi-player stayers and Chucky with the
  existing database evaluators, records the canonical settlement, and creates
  the non-actionable successor within the same transaction when play
  continues. The final exact-round `holm_submit_decision` action invokes it
  before returning; all-fold and solo branches retain their established
  atomic owners.
- The generic four-second result transition is excluded for every Holm result.
  The canonical ledger's committed-paint acknowledgement activates the exact
  successor after any ordinary winner, tie, Chucky, or zero-transfer result.
  `enforce-deadlines` version 8 additionally replays only a legacy
  all-decisions-in multi-player hand with the same database resolver.
- Production rollback proofs passed authorization, winner, tie, duplicate and
  late replay, terminal, all-fold, legacy recovery, and the real final-action
  path. Focused Holm tests, TypeScript, and the Vite production-mode build
  passed. Vercel publication completed; Jeremy's live two-player Holm smoke
  exposed the client presentation mismatch documented above.

## Cribbage counting rejoin announcement

- The durable counting cursor already resumed the correct target and combo, but
  a fresh counting mount also treated the persisted final pegging event as a
  new announcement. The rail could therefore show `Last +1` until a scheduled
  scoring beat replaced it.
- `CribbageMobileGameTable` now admits a final pegging presentation only when
  that client observed the same hand in `pegging`; His Heels remains a
  separately admitted cut-card event. `CribbageCountingPhase` publishes an
  active resumed combo with its restored highlight and suppresses the normal
  duplicate publish while retaining its one score application and duration.
- Follow-up reconnect smoke exposed a second, one-frame owner collision:
  counting has no authoritative player hands, so the parent intentionally
  retains its safe bootstrap shell while render identity hydrates. Its ambient
  bootstrap effect incorrectly emitted `waiting_for_next_round` during that
  interval. An authoritative `counting` phase now suppresses every bootstrap
  rail message; the counting cursor remains the sole announcement owner until
  the current combo is restored.
- A replacement smoke still caught that notice for one paint because the
  component begins with no local Cribbage snapshot at all. Bootstrap now emits
  no rail message until an authoritative phase has arrived, so it cannot infer
  a next-hand state from absence. A slow initial load may leave the rail briefly
  blank; gameplay and the explicit live next-hand transition are unchanged.
- Focused cursor/announcement tests, TypeScript, and the production Vite build
pass locally. Production refresh and disconnect/reconnect smoke during a
highlighted counting combo passed on 2026-08-13: the rail now restores directly
to the matching highlighted combo, without a stale pegging or next-hand frame.

## Cribbage counting rejoin cursor

- During the visible count, a refreshing or returning client could bootstrap at
  the initial beat when no browser had yet persisted progress, then lose the
  rest of the count when the database-owned presentation lease released the
  successor. The count start anchor was durable, but the client did not derive
  a resumable cursor from it.
- Migration `20260814010000_cribbage_counting_rejoin_cursor.sql` adds
  `public.cribbage_record_counting_progress`. It advances only the lexicographic
  `(countingProgressTargetIndex, countingProgressBeatIndex)` tuple under the
  locked active round; it cannot regress progress or overwrite the finalized
  score, release lease, or another state field. `CribbageCountingPhase` uses
  the same database start anchor as a deterministic bootstrap fallback until
  that cursor arrives.
- The production rollback proof covers cursor advance, regressive replay,
  result preservation, and unauthorized calls. Focused resume/progress tests,
  TypeScript, and the production Vite build pass. The `938d89437` production
  deployment and Jeremy's reconnect/refresh counting smoke both passed.

## Cribbage lazy successor release

- The Aug. 13 counting handoff introduced an eager PostgreSQL successor: the
  trigger resolving Hand N inserted Hand N+1 as `dealing` before the visible
  count. `Game.tsx` retained the official Hand N pointer, but the child
  authoritative-state selector still admitted `max(hand_number)`. Both clients
  therefore switched to the hidden successor and reset presentation before any
  count could render. The later presentation lease only delayed the official
  pointer and could not make that already-inserted row invisible.
- Migration
  `20260814003750_defer_cribbage_successor_until_release.sql` leaves no successor
  row or next-hand cards behind counting. PostgreSQL applies the score and
  persists the exact release/fallback lease on Hand N; normal presentation
  release or the service-only disconnect fallback then creates Hand N+1,
  player cards, predecessor completion, and the game pointer in one transaction.
  Already-prepared rows from the superseded implementation remain compatible.
  The migration is installed on owned production Supabase and
  `enforce-deadlines` version 7 owns the service-only fallback.
- The rollback proof covers tied continuation, no pre-release successor,
  authorization, early acknowledgement, atomic release, duplicate and late
  replay, service fallback, pause preservation, terminal winner preservation,
  and legacy prepared-row compatibility. TypeScript, all 27 mandatory Cribbage
  tests, and the production Vite build pass. Vercel publication and production
  smoke remain required.

## Cribbage durable final-discard transition

- Production hand 8 in real-money `Aug 12 - Piper` committed both players'
  discards but remained in `discarding` with no cut card. The former
  `cribbage_apply_discard` RPC saved the crib while the last browser alone
  owned the second cut/pegging write; a lost cross-country callback therefore
  left no legal action.
- Migration `20260812213000_atomic_cribbage_discard_cut_transition.sql` adds
  a row-triggered authoritative cut transition and an authenticated,
  idempotent rejoin reconciliation RPC. It selects only a card absent from the
  stored hands and crib, preserves the globally gated test harness paths, and
  applies His Heels/terminal state when required. Piper recovered to pegging
  with a legal 5-diamonds cut; chips, scores, discards, and settlement history
  were unchanged.

## Holm durable Chucky-loss continuation

- Production hand 4 in `Aug 12 - The Wheel` proved that PostgreSQL settled the
  Chucky loss and immutable cursor-6 player-to-pot batch exactly once, and both
  live clients received the completed result, but no successor hand existed.
  The uninterrupted-live branch had made
  `ChipPresentationLedger.finishBatch` the sole caller of gameplay
  continuation; a missed or abandoned local transport therefore suppressed the
  animation, displayed balance release, and next hand together.
- Migrations `20260812194500_durable_holm_chucky_loss_continuation.sql` and
  `20260812201000_prepare_holm_successor_in_settlement.sql` add a replay-safe
  two-stage successor. Chucky-loss settlement invokes
  `prepare_next_holm_hand` in the same transaction, dealing one exact
  non-actionable successor while retaining the completed predecessor and its
  result. `activate_prepared_holm_hand` publishes the turn, decision deadline,
  Buck rotation, decision reset, and game pointers only after presentation.
  A service-only `rounds.presentation_fallback_at` lease is the recovery owner
  if every browser callback is lost; a paused or terminal game remains inert.
  The legacy `proceed_to_next_holm_hand` contract now activates a prepared
  successor when one exists and otherwise delegates to its unchanged core.
- `ChipPresentationLedger` now treats a newer authoritative endpoint cursor as
  an exact cue to fetch the single missing immutable batch. The recovery is
  event-driven, cursor-deduped, and does not poll or synthesize financial state.
  The Chucky-loss callback activates an already-prepared hand; it is no longer
  capable of being the sole creator of gameplay progression.
- The invalid non-3-5-7 `show_cards_eligibility_changed` diagnostic emission
  that wrote numeric `round_id="0"` into a UUID column is removed. The
  diagnostic is now 3-5-7-only and uses the authoritative round UUID.
- The pre-migration and post-migration rollback suites cover ordinary winner,
  partial tie, duplicate settlement, decision/continuation replay, late replay,
  authorization, pause, normal prepared activation, service-lease recovery,
  and terminal preservation. Focused Holm/ledger tests, TypeScript, mandatory
  Cribbage tests, and the production Vite build pass. Production smoke remains
  required.

## Holm physical Buck hand-boundary ownership

- Paused production session `Aug 12 - Till the Morning Comes` exposed a
  client-only ownership regression in hand 1: PostgreSQL retained the one
  authoritative Buck at position 4 after that player folded and advanced the
  decision turn to position 7, with no server Buck-transfer event, while the
  table prop incorrectly preferred `currentTurnPosition` and rendered the Buck
  at position 7 as well.
- Holm now supplies the table's physical Buck, deal origin, self-hand deal
  ordinals, and roster Buck marker solely from authoritative
  `games.buck_position`. `rounds.current_turn_position` remains the independent
  action-button and timer owner. A fold can therefore advance the turn without
  moving the Buck; only `public.proceed_to_next_holm_hand` publishes the next
  hand's rotated Buck and server presentation event.
- No production session or database state was mutated. The focused Holm
  ownership/progress/continuation suite (69 assertions), both Holm community
  reveal checks, mandatory Cribbage suite (27 assertions), TypeScript, and the
  production Vite build pass. Production smoke remains required.

## Holm Chucky-loss stable completion and recovery

- Production hand 3 in session `Aug 12 - Sampler` proved that the loss and its
  immutable $8 player-to-pot batch committed correctly, but the live client
  remained forever at their opening balances. The broad awaiting-result effect
  re-entered on every render and replaced the Chucky-loss `Date.now` trigger;
  the result announcement's post-paint acknowledgement was therefore always
  one trigger behind, so fail-closed transfer admission could never open.
- A Chucky loss is now latched by exact dealer-game, round, hand, and immutable
  transfer-cursor identity. Financial participants come from authoritative
  stayed-player UUIDs rather than display-name parsing, and the same classifier
  covers normal losses plus solo and multi-player "ya tie but ya lose" results.
  Every such result is excluded from the generic auto-proceed timer.
- Superseded by the durable two-stage continuation above: uninterrupted live
  presentation still supplies the normal activation acknowledgement, but the
  successor is already prepared and the database presentation lease owns
  callback-loss recovery.
- The focused Holm ownership/identity/recovery suite (44 assertions), canonical
  ledger/transport/progress suite (29 assertions), both Holm community-reveal
  checks, mandatory Cribbage suite (27 assertions), TypeScript validation, and
  the production Vite build pass. Production Holm smoke remains required.

## Holm fail-closed terminal transfer admission

- Production hand 3 in session `Aug 12 - Anthony Rizzo` proved that the
  database-owned solo settlement and immutable player-to-pot batch can reach a
  client before React has received and classified the accompanying Chucky
  result. The prior Holm admission fallback treated that temporarily unknown
  `transfer` batch as ordinary movement and launched it while the felt was
  still tabling the player's cards.
- Holm player-to-pot settlement batches now fail closed until their exact
  showdown-replacement, Chucky-loss, or pussy-tax context is present. Initial
  antes remain independently admitted by their immutable `ante` reason. The
  same pure policy covers batch-first/result-second delivery, multi-player
  replacement pots, Chucky losses, and pussy tax.
- A Chucky-loss successor hand is now requested only from the canonical
  immutable batch-settled boundary. The presentation-only `AnteUpAnimation`
  arrival timer no longer owns continuation, so an early, replayed, or missing
  local callback cannot consume the hand transition.
- The focused ordering/admission suite, Holm authority/recovery/progress tests,
  canonical chip-ledger/provider tests, and TypeScript validation pass.
  Production build verification also passes; Holm smoke remains required.

## Holm atomic turn and successor-hand authority

- Migration `20260812150000_atomic_holm_turn_and_continuation.sql` is installed
  on production. A Holm action now supplies its exact `rounds.id`; PostgreSQL
  locks that hand/current seat and commits the decision, next seat, deadline,
  monotonic `holm_turn_sequence`, and any all-fold/solo settlement in one
  transaction. Out-of-turn, stale-hand, paused, duplicate, and late calls are
  inert.
- `public.proceed_to_next_holm_hand` now owns the complete continuation commit:
  predecessor completion, decision reset, Buck rotation event, new round,
  community/private deal, `player_cards.hand_context_id`, and game pointers.
  Clients no longer clear `awaiting_next_round` before cards/round identity
  exist.
- The Holm presentation progress vector includes both the server turn sequence
  and exact deadline epoch. Betting snapshots retain real decision locks, the
  physical Buck follows the one current-turn owner, and a reordered older
  deadline cannot expire and then refill the visible timer.
- A configured per-user network simulation is executable only while global
  Harnesses Mode is enabled. With the master gate off, a persisted
  `cross_country_chaos` profile resolves to `off` and cannot perturb ordinary
  or real-money play.
- `enforce-deadlines` version 4 no longer invents a replacement full timer when
  a canonical Holm deadline is missing; it records the invariant failure and
  makes no mutation. The exact-round service adapter remains the only expiry
  action path.
- Holm showdown recovery no longer stores a presentation lease in
  `decision_deadline`; it uses `presentation_fallback_at`, leaving gameplay
  timers null once decisions finish. Evaluation and settlement failures are
  fail-closed: the client cannot mark a round complete, fabricate a result, or
  set `awaiting_next_round` after an error.
- The combined rollback proof passed before and after installation for
  authorization, out-of-turn/stale/paused actions, continuation, duplicate and
  late replay, early/expired deadlines, winner/tie projections, harness gating,
  card-context integrity, and terminal preservation. Focused tests, TypeScript,
  and the production Vite build pass. Production smoke remains required.

## Holm Chucky-loss announcement-before-payment correction

- A settled solo loss to Chucky now keeps its committed player-to-pot transfer
  in the canonical presentation ledger until the exact result announcement has
  rendered. Chucky's visible cards alone are no longer sufficient to start
  the loss animation or change its displayed player/pot balances.
- The gate is keyed by the settled hand and loss trigger, so a prior hand's
  rendered result cannot admit a later loss. It is shared by the ledger
  admission, pre-flight pot lock, and legacy loss animation trigger; settlement,
  cards, pot amount, and compare-and-set continuation remain unchanged.
- Focused regression coverage, TypeScript, and the production Vite bundle
  build pass. Production Holm smoke remains required: tabled cards, community
  cards three/four, Chucky, result announcement, then loss transport.

## Holm deadline settlement containment

- Migration `20260812030000_route_holm_deadlines_through_canonical_settlement.sql`
  is installed on production. An expired Holm turn now locks its exact
  game/dealer-game/round/player identity and delegates to
  `public.holm_submit_decision`; it cannot independently deal Chucky, settle
  chips, complete a showdown, or advance a dealer game. Solo and all-fold
  results therefore retain the same database-owned outcome, cards, reveal
  state, transfer batches, result claim, and continuation as a normal action.
- The active `enforce-deadlines` Edge Function is version 3. It requires an
  authenticated active participant, uses a separate service-role client only
  for the service-only deadline adapter, and leaves stale/locked/showdown
  state untouched. The prior forced-showdown recovery has been removed.
- The unused legacy `enforce-all-deadlines` Edge Function is version 5 and
  returns `410 Gone` before creating a database client. Production has no
  schedule for it; accidental or manual invocation can no longer move chips,
  settle a hand, or start a new dealer game.
- Rollback proofs passed before and after the migration for continuation,
  duplicate and late replay, terminal preservation, a natural Chucky loss
  with retained four-card reveal, service-only access, and human auto-fold.
  Production Holm smoke remains required.

## Holm Chucky-loss presentation and continuation correction

- Migration `20260812020000_preserve_holm_chucky_loss_presentation.sql` is
  installed on production. A settled solo loss to Chucky now retains the
  completed round's active, fully revealed Chucky cards until the next hand
  begins. The settlement, transfer batch, result claim, and carried pot remain
  database-owned and unchanged.
- The active Holm table no longer starts its generic auto-proceed timer for
  that result. It advances through the existing compare-and-set continuation
  only after the reveal-gated player-to-pot transport completes, so the felt
  shows Chucky, the result, and the loss before the next hand can start.
- The rollback proof passed before and after the migration. It covers the
  globally disabled force-winner profile's natural Chucky loss, the retained
  four-card presentation state, duplicate/replay inertness, and the enabled
  harness control outcome. Production smoke remains required.

## Holm global harness gate and Brennen Davis live repair

- Migration `20260812010000_gate_holm_forced_winner_and_restore_brennen_davis.sql`
  is installed on production. `public.holm_submit_decision` now treats a
  configured forced-winner profile as executable only when the globally
  persisted `harnesses_mode.value.enabled` is true. With the global gate off,
  Holm always uses the stored card evaluation; this matches the existing
  client-side execution boundary and fails closed when the setting is absent.
- The real-money `Aug 11 - Brennen Davis` final Holm dealer game was verified
  to have awarded a one-pair hand over Chucky's two pair while the global gate
  was off. Its false terminal award, final snapshots, and SessionResult rows
  were removed under exact identity/card preconditions. The $6 award reversal
  is preserved as an immutable canonical `restore` transfer batch, returning
  the pot to $6 rather than deleting financial history.
- The session is restored to the recorded pre-award action state and paused:
  the prior fold remains locked, the remaining player is active to decide,
  Chucky is unrevealed, and the normal 30-second decision window is frozen.
  The combined rollback proofs passed before and after deployment. Production
  smoke remains the acceptance gate.

## Horses / SCC roller-only timer and observer felt correction

- The shared dice-table owner now renders the canonical timer rail only for
  the local active roller. An authoritative dice deadline is still shared for
  rules and timeout handling, but it no longer creates a visible timer for the
  observing player; the same ownership rule applies while a dice game is
  paused.
- The observer's pre-roll felt stage now always stays a placeholder until the
  roller's dice are available. It cannot reuse a cached active-roller Beat
  badge, so that badge cannot mask observer dice presentation.
- Live-play Horses and SCC over-seat result badges are now suppressed. Those
  badges used the same result visuals as the Beat target and were published to
  every client, making a completed observer's own hand look like a second Beat
  badge. They remain available for terminal result comparison; during play the
  active roller's center-felt Beat artifact is the sole score owner.
- The center-felt Beat artifact now renders at its authored responsive size.
  Its pre-roll branch no longer passes the two-row label through the generic
  assigned-rectangle fitter that compressed it into the shallow Beat stage.
- Horses and Ship/Captain/Crew share this owner and receive the same behavior.
  TypeScript and the production Vite bundle build pass. Production smoke
  remains the acceptance gate.

## Horses / SCC autonomous disconnect settlement

- Migrations `20260811010000_horses_scc_disconnect_safe_settlement.sql` and
  `20260811011500_preserve_horses_scc_partial_turn_rolls.sql` are installed on
  production. `public.horses_settle_game` is now the one
  replay-safe financial owner for both dice games: it derives the terminal
  outcome from stored dice, claims the result, transfers the pot, records
  post-payout snapshots, and selects `game_over` or `session_ended` in one
  transaction.
- The isolated five-second `enforce-horses-scc-deadlines-5s` database job
  advances expired auto-roll turns without a browser. A single timed-out human
  becomes auto-roll while a live opponent continues normally. When every human
  heartbeat is absent for the established three-window lease, the server also
  carries ties into their successor hands and resolves the dealer game to
  `session_ended` without an available client.
- The initial complete rollback proof passed before and after installation for
  Horses and SCC winner, tie rollover, duplicate/late replay, authorization,
  continuation, single-player timeout, and all-player-disconnect terminal
  cases. The post-correction proof also covers interrupted one-/two-roll
  turns. Production smoke remains the acceptance gate.

## Ante landing admission and solo pot-rail timing

- Player-to-pot ante presentation now owns the local admission boundary for
  the initial deal wave. The trigger closes admission in its first render;
  Holm and 357 then withhold their opening cards until the canonical ledger
  reports the aggregate ante arrival at the pot. Horses and SCC likewise
  withhold their first playable action until that same actual landing boundary.
  Gameplay truth, chips, and settlement remain database-owned.
- In a Holm solo showdown, the felt pot box now yields as soon as the lone
  player's tabled cards have landed. The ambient announcement begins with
  `Pot $X`, adds the player's hand call after community cards three and four
  reveal, and remains in place until the final result replaces it.
- TypeScript and the development production bundle build pass. Jeremy's
  production smoke passed on 2026-08-11 at commit
  `0bc5718ba8087df4ce19217f111b423bceba7ecd`: card transport waited for the
  actual aggregate ante arrival at the pot before dispatching.

## Holm Rabbit Hunt and terminal solo-showdown presentation correction

- Migration `20260811223516_make_holm_rabbit_hunt_authoritative.sql` is
  installed on production. The database-owned `holm_settle_hand` operation now
  raises `community_cards_revealed` to four inside the same transaction that
  claims an all-fold pussy-tax settlement when Rabbit Hunt is enabled. The
  normal `holm_submit_decision` path can therefore return `server_resolved`
  without bypassing the reveal. Rabbit Hunt off preserves the two-card state.
- The deadline-enforcement fallback applies the same conditional reveal when
  it completes an all-fold round. The unreachable client-side all-fold reveal
  writer was removed, leaving settlement authority in the database. The Pussy
  Tax call, existing player-to-pot tax transport, and sequential community-card
  reveal can begin together; no presentation wait is tied to the chip flight.
- A solo showdown now keeps the authoritative final result behind the full
  presentation sequence: tabled cards land, the configured after-tabled hold
  ends, community cards reveal, the lone player's hand call appears, the
  configured pre-Chucky hold ends, and Chucky reveals before the outcome can
  replace that call. The hand call and `Pot: $X` now occupy the same persistent
  ambient rail state through Chucky's reveal; the final result replaces it.
  The terminal result follows the same boundary, preventing a settled game
  from leaving Chucky hidden and the table frozen.
- The complete rollback proof passed before and after installation for Rabbit
  Hunt on/off, winner, partial tie, duplicate/replay, late replay,
  authorization, continuation, and terminal-state cases. Chucky's deal/reveal,
  settlement, tax collection, balances, and terminal truth remain
  database-owned. Jeremy's fresh production Rabbit Hunt smoke passed on
  2026-08-11 at commit `22d4aa8c258fbac461d3ce92966d4924b9955a62`:
  the both-player all-fold path showed the Rabbit Hunt marker and sequentially
  revealed community cards three and four while pussy-tax presentation began.

## Holm Game Defaults startup correction

- The active Holm table now reads the showdown-timing defaults through its
  already-initialized Supabase client. The released timing change had imported
  that client under the local `__mgtSupabase` name but referenced an undefined
  `supabase` identifier, crashing Holm when the timing read ran. This is a
  presentation-config read only; gameplay, cards, settlement, and defaults are
  unchanged. Production smoke remains the acceptance gate.

## Holm configurable showdown presentation cadence

- Migration `20260811113000_holm_showdown_presentation_timing_defaults.sql`
  is installed on production. Holm Game Defaults now expose integer-ms values
  for after-tabled (`1500`), pre-Chucky (`1500`), and multi-player showdown
  (`2000`) delays.
- The active table admits solo community cards only after the actual lone-player
  fan lands and the configured after-tabled hold. It emits the solo hand call
  after the last community flip, then holds that call before admitting Chucky's
  stage and visual stepper.
- Multi-player showdown starts its configured reading window after the exposed
  hands have painted locally. The raw database reveal may arrive early, but
  cannot bypass that presentation boundary. Rejoin/historical state renders
  the authoritative current surface without replaying a previous showdown.
- The matching server-side solo and multi availability waits consume the same
  Game Defaults; the replaced 2-second solo and 3-second multi hard-coded
  reveal waits are gone. Settlement, cards, balances, and terminal lifecycle
  remain database-owned.
- The complete rollback proof passed before and after the migration for winner,
  partial tie, duplicate/replay, late replay, authorization, continuation, and
  terminal-state cases. Production smoke remains the acceptance gate.

## Cribbage cut-reveal recovery for live pegging hands

- The cut-reveal completion gate is now scoped to the canonical hand identity,
  rather than the presentation identity that can change while a flip is in
  progress. An interrupted flip acknowledges the current hand boundary as
  face-up instead of leaving play, Go, and bot actions blocked forever.
- A `historical-entry` client that joins an already-exposed cut now reconciles
  that presentation directly. It intentionally does not replay old discard or
  cut animation, so it must not wait for a callback from an animation owner
  that is absent on rejoin. A live-transition hand keeps the normal cut-flip
  gate.
- That reconciliation also seeds the local discard-settlement counter from
  the already-authoritative crib. A stale zero counter had continued to hide
  the turn spotlight and disable pegging cards despite the exposed-cut
  acknowledgement.
- The two presentation facts now come from one pure authoritative recovery
  derivation (`deriveCribbageCutPresentation`), used by the recovery effect
  and the rendered spotlight/cards/crib boundary. Its direct-rejoin cases run
  before every production build. Vitest is pinned to the Vite-5-compatible
  3.2.4 line, so the release test is executable rather than aspirational.
- If a rejoining player is already the authoritative actionable player, the
  client admits that one rejoin state to Cards rather than restoring a
  persisted Chat tab. Later tab selections remain explicit player choices.
- This corrects the `Aug 10 - Victor Caratini` real-money P0. The frozen hand
  remains database-owned pegging state; its cards, turn, results, settlement,
  and transfer history are not changed by this client recovery. A freshly
  loaded client reconciles the already-exposed cut and resumes the existing
  legal turn.
- Regression coverage covers a normal cut completion and a hand-identity
  change during its flip. The production bundle build passes; the installed
  Vitest/Vite versions still cannot start focused suites because Vitest imports
  Vite's unavailable `module-runner` export.

## Harnesses Mode is the sole executable debug-harness gate

- The production `harnesses_mode` setting now gates every executable harness
  path: cached game rules, imperative setup helpers, React presentation
  hooks, and Holm's solo-versus-Chucky result override.
- Admin-selected profiles remain visible while the master switch is off, but
  they resolve to `none` for gameplay. A failed fresh settings read also
  fails closed rather than applying a stale configured profile.
- This corrects the `Aug 10 - Here Comes Sunshine` P0: production had the
  Holm `force_player_beats_chucky` profile selected with Harnesses Mode off,
  causing Happach's two pair to defeat Chucky's actual three of a kind.
  Cross-Country only exposed the issue; it never changed cards or results.
- Focused regression coverage was added and the production bundle build
  passes. The installed Vitest/Vite versions cannot start the focused suite
  (`ERR_PACKAGE_PATH_NOT_EXPORTED` for Vite's `module-runner`); published
  smoke remains required.

## Holm solo-showdown pot context

- In the mobile solo-vs-Chucky tabled-card presentation, the readable pot
  value now moves to the existing canonical announcement rail as `Pot $X`.
  The felt pot remains mounted but invisible, preserving its transport anchor
  while leaving the lone player's cards unobstructed.
- The subsequent Holm result plate keeps the same pot value with the outcome.
  Pot transfer, settlement, chip movement, and all other game layouts are
  unchanged. TypeScript validation and the production bundle build pass;
  mobile solo-showdown smoke accepted this correction on 2026-08-10.

## Cribbage discard, cut, then pegging presentation sequence

- Discard-to-crib presentation now queues both players' discard pairs instead
  of replacing an active flight when authoritative updates arrive close
  together. All four cards therefore reach a terminal visual outcome before
  the cut card can appear.
- The existing cut flip is now the local boundary for pegging presentation:
  turn cues, player actions, bot actions, and automatic Go wait until the cut
  is visibly face-up. Gameplay and settlement remain database-owned and
  unchanged.
- The focused queue regression proof and TypeScript check pass; the production
  bundle builds cleanly. Production smoke remains the acceptance gate.

## 3-5-7 opening ante and rollover are separate rules

- Migration `20260810210000_separate_357_rollover_amount.sql` is installed on
  the owned production database. A 3-5-7 dealer game now persists an opening
  `ante_amount` and a distinct `rollover_amount`; the initial rollover default
  is `$1`.
- The opening client path still collects the ante once. The database-owned
  R3 -> next-hand R1 transition now derives only the persisted rollover,
  records `Rollover` in the hand audit, and returns rollover-specific result
  fields rather than ante fields. R1 -> R2 and R2 -> R3 collect neither.
- The configured value is retained in the dealer-game JSON snapshot and in
  session Run Back memory. Setup and Defaults each show Ante, Leg Value, and
  Rollover in one compact row; the redundant 3-5-7 description was removed.
- The complete rollback proof passed before and after migration for initial
  ante preservation, rollover amount, duplicate/replay/late replay,
  authorization, continuation, tie-labelled rollover, and terminal state.
  Published 3-5-7 smoke remains the acceptance gate.

## Holm repeated-showdown presentation identity

- The original August 10 correction moved the Holm showdown latch off
  `games.current_round`, which remains `1` across hands, and onto the
  authoritative rounds-row/hand identity. Its inclusion of transfer cursor was
  superseded on August 14: cursor distinguishes exact immutable batch
  completion, but cannot distinguish a presentation plan because one showdown
  intentionally contains adjacent pot-award and replacement-pot cursors.
- This is a client admission correction only. The existing `holm_settle_hand`
  transaction, its ordered immutable `pot -> winner` then `loser -> pot`
  batches, endpoint ownership, and disconnect/reconnect reconciliation are
  unchanged. Production smoke accepted the consecutive-hand correction on
  2026-08-10; the split-showdown follow-up is documented above.

## 3-5-7-only leg cue scope

- The non-financial `+L` cue is now mounted and emitted only by recognized
  3-5-7 presentation. The shared table clears that transient cue at hand and
  game identity resets, so a prior leg event cannot surface beside a Holm,
  Horses, SCC, or Yahtzee chipstack.
- Canonical monetary `+$`/`-$` effects remain ledger-owned and unchanged.
  Production smoke accepted the correction on 2026-08-10.

## Canonical source-seat continuity during chip transfer

- The source participant's canonical seat cluster now remains visible during
  every outbound chip flight. The shared ledger still decrements the displayed
  source balance at departure, but its nameplate, disc, score line, and
  game-owned attached content are never hidden with the moving chip.
- This removes a cross-game shell suppression that affected player-to-player
  transfers in Holm and any other canonical-seat game. Financial settlement,
  transfer timing, destination behavior, and endpoint ownership are unchanged.
- The focused source-seat regression test is typechecked and the production
  bundle builds cleanly. Production smoke remains the acceptance gate.

## Holm staged showdown transfer projection

- Migration `20260810201500_stage_holm_showdown_transfer_projection.sql` is
  installed on the owned production database. A first Holm hand now journals
  its player-to-pot collection as `ante`, so it admits at the hand boundary
  rather than being mistaken for a terminal replacement-pot transfer.
- A normal or partial-tie multi-player showdown remains one replay-safe
  `holm_settle_hand` transaction and one result claim, but now publishes two
  adjacent immutable batches: old pot to winner(s), then losing stayer(s) to
  the replacement pot. Each stage carries database-captured opening and
  closing balances; the shared ledger owns common endpoints through the chain.
- The Holm adapter classifies the immutable transfer topology and advances its
  second phase only after the first canonical batch settles. It no longer uses
  invisible legacy animation timers to advance financial presentation. Rollback
  proofs passed for initial authorization, continuation/terminal and late
  replay, standard transfer batching, winner, partial tie, and duplicate
  settlement. Production smoke remains the acceptance gate.

## Concurrent chip-delta cohorts and opponent label origin

- The transport runtime now holds its lifecycle timers through ledger/provider
  rerenders. A first concurrent chip arrival can no longer cancel the sibling
  arrival timer, so all immutable transfers in the same visible cohort reach
  the ledger exactly once.
- Any multi-sender player-to-pot batch—antes, bets, or transfers—now uses its
  shared zero-stagger landing boundary to hold the pot until the final inbound
  chip lands, then show one composed `+$total` effect. Player-target awards
  retain their individual landing boundaries.
- Opponent stack effects now originate at the actual chip disc rim facing the
  canonical felt center, while self and pot anchors retain their established
  geometry. This is shell-only presentation work; database settlement and
  transfer ownership are unchanged. Production smoke remains the acceptance
  gate.

## Canonical signed chip-balance effects

- The shell ledger now emits the red/gold `-$ / +$` label from the exact same
  departure, arrival, and zero-flight settlement boundaries that mutate its
  presentation-owned balance. The source label/decrement occurs once when the
  chip leaves; the destination label/increment occurs once when it lands.
- These effects are deduped by immutable batch/transfer/boundary identity,
  compose from database-captured opening/closing values, and never infer a
  financial change from raw realtime rows. Multi-player antes hold the pot
  until the final chip lands, then emit one combined pot increment and label.
- Legacy per-game dollar `ValueChangeFlash` producers have been removed. The
  one remaining `+L` cue is explicitly non-financial. On a dropped endpoint,
  disconnect, or unmount, any in-flight labels for that batch are discarded
  with the transport and the display reconciles directly to authoritative
  state. Production smoke remains the acceptance gate.

## 3-5-7 normal final-leg reserve-return projection

- Migration `20260810193000_split_normal_357_leg_sweep_transfer_projection.sql`
  is installed on the owned production database. A normal final-leg terminal
  still settles financially in one replay-safe transaction, but now emits two
  adjacent immutable, game-scoped presentation batches: the winner's returned
  purchased-leg value during Sweep the Legs, then the pot award.
- The shared ledger remains the sole owner of the winner and pot endpoints
  through both batches. It composes the database-captured deltas and releases
  only after the final cursor reconciles, so early/late realtime rows cannot
  expose the final balance between the sweep and pot flight.
- The normal 3-5-7 adapter holds its existing terminal sequence at the new
  ledger-owned sweep-credit phase. For a $4 stack, $2 leg, and $6 pot, the
  visible order is now $4 -> $2 at final-leg award, $2 -> $4 during the sweep,
  then $4 -> $10 when the pot chip arrives. Rollback proofs passed for staged
  projection, winner, tie, duplicate, late replay, authorization,
  continuation, and terminal state. Production smoke remains the acceptance
  gate.

## 3-5-7 normal terminal presentation correction

- The approved source candidate gates the normal final-leg award on a
  synchronized concrete dealer-game scope, then carries one immutable terminal
  generation through award, leg sweep, pot flight, and completion. A late
  boundary observation no longer cancels and re-arms the same award.
- Generic player-leg delta detection is suppressed for descriptor-owned normal
  terminals, and late award/leg/pot callbacks are rejected once their
  generation has advanced or completed. Database settlement and the canonical
  transfer ledger are unchanged. Production smoke remains the acceptance gate.

## Phase 1 delivery cutover

- GitHub `main` is connected to the Vercel project `ptown-poker`; pushes create
  production deployments automatically.
- The canonical production frontend URL is <https://holm357.com>. The original
  <https://ptown-poker.vercel.app> address remains attached as a fallback.
- Vercel reports `holm357.com` as a valid Production domain, and the HTTPS root
  returned the P-Town Poker app with HTTP 200 on 2026-08-03.
- The Vercel Production and Preview environments now point to the owned
  Supabase project `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`). Production
  deployment `dpl_9DxrLEW3xwuZQCZv2USavnqr7uDC` reached `READY` on
  2026-08-03. The emitted bundle contains the owned project URL and identifier
  and contains no reference to the retired Lovable-backed project.
- `vercel.json` owns Vite SPA deep-link routing so `/auth`, `/game/:gameId`, and
  other client routes resolve through `index.html`.
- The owned Supabase project is the production database, Auth, Realtime,
  Storage, and Edge Function owner. The former Lovable-backed project remains
  write-locked as a rollback snapshot and is no longer referenced by the
  production frontend.
- The obsolete `https://ptown-poker.lovable.app` publication was unpublished
  on 2026-08-03. All three preserved jobs on its retired Cloud backend are
  inactive; the project and write-locked backend remain available only as the
  rollback snapshot.
- The approved workflow is now plain-English issue -> diagnosis -> one approval
  -> implementation, validation, required migration, Git push, automatic Vercel
  publication, then Jeremy's real-user smoke.

## Authoritative post-game abandonment reconciliation

- Migration
  `20260807233000_authoritative_session_presence_reconciliation.sql` is
  installed on the owned production database. The existing four-second tab
  heartbeat now has a database-stamped `updated_at` lease on both insert and
  update; client-supplied time is not lifecycle authority.
- Sessions are watched only after a post-deployment safe-boundary or
  player-state signal. The migration deliberately does not enroll or mutate
  the historical open-session backlog. The frozen `Aug 7 - Joakim Noah` repro
  remains `waiting`, unarmed, and without SessionResult rows.
- Migration
  `20260809173000_postgame_waiting_session_resolution.sql` narrows the
  presence lease to settled post-game `waiting` / `waiting_for_players` only,
  with no active dealer-game identity. It never applies during an initial
  waiting room, live gameplay, terminal presentation, dealer setup, or ante
  decision. A heartbeat from before that boundary does not keep a departed
  player active.
- Migration
  `20260809190000_fast_postgame_presence_confirmation.sql` arms one
  result-bearing post-game watch at that boundary and preserves its original
  arm time across later game/player writes. A Waiting-table entry emits one
  ordinary immediate heartbeat; the server then counts complete five-second
  windows from database-stamped post-boundary heartbeats. Three consecutive
  missed windows (fifteen seconds) mark a human Sitting Out. The five-second
  scheduler reads only due watches, so it is an indexed no-op while no
  post-game watch exists; it never evaluates gameplay, setup, ante, or an
  initial waiting room.
- Migration
  `20260809200000_extend_fake_money_postgame_presence.sql` applies that same
  narrowly armed watch to fake-money sessions. At zero active humans, the
  real-money branch remains the existing replay-safe financial finalizer;
  fake-money instead moves to `session_ended` without snapshots, balances,
  `SessionResult` rows, or financial transactions.
- One active human returns to the post-game waiting table. Once an absent
  player is authoritatively marked Sitting Out, zero active humans closes a
  result-bearing real-money session immediately through the database and
  records exactly-once SessionResult financials. The five-second watch sweep
  is the no-client fallback; it never advances an active dealer game.
- A continuously mounted route now remains on the canonical Session Ended
  table after this later server-side closure and renders final seated players,
  including Sitting Out adornments. Fresh mounts and reconnects of an already
  ended session remain direct-to-lobby.
- Shared waiting-table and shell seat projection now treat `sitting_out` as a
  participation state, never a seat release. A sitting-out player remains in
  their relative position with the Sitting Out status; only explicit Stand Up
  or Leave changes `status` to `left`. Start eligibility remains a separate
  opt-in count, and a seated player returns through Return to Play rather than
  choosing a new `+` seat. The smoke passed on 2026-08-09.
- Sessions with settled `game_results` close only when every current human has
  a matching final snapshot; the existing deduplicated terminal trigger then
  mints SessionResult rows in the same transaction. Incomplete settlement
  evidence is preserved for recovery. A genuinely pristine real-money room is
  deleted only after fifteen minutes with zero active humans. Generic cleanup
  never advances an `in_progress` game.
- The complete rollback proof passed before and after installation, covering
  first/second/third missed windows, a post-boundary heartbeat reset,
  exactly-once zero-sum financials, winner/tie, duplicate and late replay,
  authorization, continuation, and initial-waiting/live-game exclusion.
- The fake-money extension passed rollback proofs before and after installation:
  winner, tie/continuation, trigger arming, duplicate and late replay,
  initial-waiting/live-game exclusion, seat retention, non-financial terminal
  disposition, and unchanged real-money finalizer behavior. Production smoke
  passed on 2026-08-09.

## 3-5-7 decision-timer continuity

- The frozen `Aug 7 - Hector Rondon` repro proved two overlapping presentation
  defects: 3-5-7 reused a round-number timer identity instead of the exact
  deadline, and visual-bug pause/resume granted a fresh maximum decision
  window rather than continuing the frozen window.
- 3-5-7 now uses the proven deal-settled presentation latch and exact deadline
  identity: the timer remains absent during card transport, its first visible
  frame is full, and it can only descend within that deadline epoch.
- Pause now records the active deadline window, writes the resumed deadline
  while clients remain paused, and resumes from the saved remaining seconds.
  This preserves authoritative expiry and simultaneous decisions while
  preventing visual-bug cancellation or ordinary host resume from refilling
  the timer.

## 3-5-7 completed-round terminal correction

- Production disconnect smoke on 2026-08-07 exposed an admission mismatch in
  normal final-leg settlement: `endRound` correctly claimed resolution by
  marking the round `completed`, while `three_five_seven_settle_game` rejected
  that same completed round. The connected client therefore saw the leg
  animation from the committed player state, but no terminal result, payout,
  or game-over disposition followed.
- Migration
  `20260807143000_allow_completed_three_five_seven_terminal_round.sql` is
  installed on the owned production database. It admits only the existing
  `betting` instant-sweep state and the `completed` normal-final-leg state;
  immutable identity, authorization, single-winner, durable-claim, and
  lifecycle guards remain authoritative.
- The client candidate adds one exact-state replay through the same idempotent
  RPC when a connected or reconnecting client observes `in_progress` plus a
  completed current round and exactly one terminal winner. It adds no timer,
  polling loop, financial writer, or presentation owner.
- Complete rollback proofs passed before and after migration for winner, tie,
  duplicate, replay, late replay, authorization, continuation, LAST HAND
  terminal disposition, payout, snapshots, and zero-sum balances. Production
  disconnect smoke remains the acceptance gate; the frozen repro was not
  manually repaired.

## Phase 2 owned-Supabase production cutover

The owned project `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`) now contains a
validated production copy of the core backend and is live behind
<https://holm357.com>.

- The final source and target locks were enabled only after proving there was
  no recent real-money activity. The final reconciliation removed six
  disposable target fake-money games, the single owned-preview real-money smoke
  game, its two transactions, and five target-only test bots.
- All 20 retained application datasets then matched source by row count and
  content hash. Final authority includes 179 real-money games, 527 dealer
  games, 420 rounds, 337 players, 2,653 real-money results, 2,630 retained
  snapshots, 331 financial transactions, and 4,846 profiles.
- All 11 Auth password fingerprints and metadata manifests match source. The
  per-profile financial ledger matches exactly.
- After the production bundle proved its owned backend identity, the target
  lock was disabled and a rollback-only write proof succeeded. The source lock
  remains enabled. Both maintenance-mode settings remain disabled.
- Jeremy reported the ordinary production sign-in and lobby clean on
  `holm357.com` on 2026-08-03. The migrated password worked without a reset,
  and the production lobby loaded against the owned backend.
- Jeremy then reported the combined production fake-money smoke clean: game
  creation and play worked, authenticated voice-to-text worked, the game
  completed, and it appeared under Completed Sessions.
- Production password recovery also passed on `holm357.com`: the recovery email
  arrived, its link returned to the production reset form, password update
  succeeded, and sign-out plus sign-in with the new password worked. All owned-
  Supabase cutover acceptance gates are complete.

- All 245 source migration records are represented by exact local versions and
  SQL; 19 deployed-but-missing migrations were recovered into
  `supabase/migrations/` and Lovable's filename/version drift was reconciled.
  Five target migrations add the bounded diagnostic purge, its explicit
  audit/session-history preservation boundary, and the source-equivalent Data
  API grants required by new Supabase projects, plus atomic Yahtzee terminal
  settlement and its late-replay correction, for 250 target records.
- Schema parity was proved before the target-only retention migration: 48
  public tables, 42 routines, 133 policies, 20 enabled application triggers,
  and 18 Realtime publication tables.
- Auth contains the same 11 users, identities, and password hashes. Sessions,
  refresh tokens, MFA claims, and one-time tokens were intentionally not
  copied, so users perform an ordinary sign-in after cutover but do not need a
  password reset.
- The target now retains all 179 real-money sessions and their financial/history
  rows. All fake-money sessions and fake/orphan Cribbage archives were removed;
  331 financial transactions, 4,846 profiles, and all 11 auth users remain.
  Persisted debug, incident, trace, voice, and operation telemetry was
  intentionally excluded.
- Historical chat-image attachments were declared disposable on 2026-08-03.
  The target's one retained source-project `image_url` was normalized to null
  without deleting its `chat_messages` row or changing any other row fields.
  The five previously copied objects (4,526,239 total bytes) remain in the
  public `chat-images` bucket but are not cutover authority. The current chat
  UI has no attachment entry point because voice-to-text replaced it. The
  bucket, policies, and upload code remain for future use; fresh upload/render
  smoke is deferred until the attachment capability is redeployed and does not
  block the backend cutover.
- The target's `voice-to-text` Edge Function now calls OpenAI directly with
  `gpt-transcribe`, requires a Supabase user JWT, and persists no voice
  diagnostics. `finalize-voice-operations` is retired. Trivia was removed from
  the app; the formerly deployed target function is an authenticated 410
  tombstone with no provider call.
- `OPENAI_API_KEY` is installed directly on the target. Authenticated voice
  transcription returned the spoken text to the unsent draft in owned-preview
  smoke on 2026-08-02. Custom Auth SMTP is now enabled on the target through a
  sending-only, domain-scoped Resend key and the verified
  `auth.holm357.com` sender domain. Native recovery email delivery, callback,
  password update, sign-out, and sign-in with the new password passed against
  the owned preview on 2026-08-03. The unused, unauthenticated
  `generate-music` Edge Function was removed from the repository and owned
  project on 2026-08-03; no ElevenLabs secret is required for cutover.
- Gameplay cron is disabled on the target. The sole active job purges retained
  diagnostic rows older than seven days. High-volume dice snapshots and
  lifecycle persistence are also off by default in the frontend.
- The target database is 31 MB. Security/performance advisors report inherited
  source-schema warnings, not target drift; remediation is a separate scoped
  hardening task.
- Data API access now matches the source project: all 48 public tables retain
  RLS and authenticated/service roles have table DML; anonymous access is
  read-only for `games`. Future public tables must declare grants explicitly.
- Migration `20260802184800_cutover_readiness.sql` is installed on source and
  target. Its lock remains enabled on the retired source and is disabled on the
  live owned target. It provides 47 public-table statement guards, Storage
  write guards, an explicit import bypass, and the verified fake-session purge
  used only on the target.

The detailed evidence and remaining cutover gates live in
`docs/codex/SUPABASE_CUTOVER.md`.

### Owned-Supabase preview runtime

- Vercel Preview branch `codex/supabase-preview` retains its branch-scoped
  owned-project variables. The general Production and Preview variables now
  also point to the owned project.
- The preview build for commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`
  reached `READY` and serves the app at
  <https://ptown-poker-git-codex-supabase-preview-jeremy-8e2b.vercel.app>.
- Supabase Auth allows that exact preview hostname (all paths) and
  `https://holm357.com/**`. The owned project's Site URL is now
  `https://holm357.com` for production-cutover readiness.
- Vercel Authentication protects the preview. After restoring the target's
  explicit Data API grants, the signed-in browser loads the lobby, profile
  balance, history dependencies, and game list without the prior table
  permission errors. Jeremy reported the create-game/game-entry rerun and the
  authenticated voice-transcription path clean on 2026-08-02. A complete
  fake-money game and its Completed Sessions appearance passed against the
  owned preview on 2026-08-03. A two-human real-money Cribbage LAST HAND
  disconnect smoke also passed durable settlement on 2026-08-03: the target
  ended the session, wrote one terminal result, and wrote exactly one `-10`
  and one `+10` SessionResult transaction. The broader backend-cutover smoke
  checklist remains tracked in
  `docs/codex/SUPABASE_CUTOVER.md`.
- The first owned-preview Holm deadline smoke failed on 2026-08-03 in game
  `8bb30eac-cacc-43d4-a306-ecf2e0a4d71e`; the corrected build at commit
  `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220` then passed the replacement
  smoke in fake-money game `25662485-03b6-434b-85f0-f96e983dfe7e`.
  The timer remained suppressed through the deal, expiry folded and scheduled
  the human to sit out, the all-fold pussy-tax branch progressed, subsequent
  hands auto-folded the player, rejoin worked, and the game completed normally.
  Resolution remains in `endHolmRound` behind its atomic
  `betting -> processing` claim; the churn-prone polling recovery remains
  removed for this edge. The recurring initial-fill animation was corrected at
  commit `d7149e0d4ab3a3409ee6fbbc3aa15cf7f1c810e2` and passed production smoke
  on 2026-08-06: the first visible frame was full and the timer then descended
  monotonically. The separate one-second timeout rebound/card-reactivation
  flicker remains queued.

## Frozen Lovable cutover baseline

- Lovable development is finished. No additional Lovable publish or reclone is
  required for cutover.
- Commit `400eecc2625eaa2ffaa0c614c2b825985e4c7fbf` is permanently tagged
  `lovable-final-cutover-2026-08-01`.
- That tag is the frozen final Lovable baseline. It intentionally contains the
  known iOS Session Ended long-list scrolling defect.
- Commit `c094f6aef15578a2bbb92887c148e4893c2abc26` is the later
  documentation-handoff commit.
- A `lovable-final-stable-2026-08-01` tag was not created and is not required
  for cutover.
- `bunx tsgo --noEmit` was not run during ingestion: neither Bun nor
  `node_modules` is available, and dependencies were not installed.

## First Codex P0

The first Codex implementation task is the published iOS Session Ended Results
panel. Long participant lists render all rows but cannot be vertically
touch-scrolled. The source in
`src/components/canonicalShell/SessionEndedTablePhase.tsx` contains
`overflow-y-auto`, `touch-pan-y`, and WebKit momentum-scroll styling, but
the failed production runtime smoke outranks that plausible source fix.

Codex acceptance requires new published iOS smoke proving:

- one felt-contained vertical scroll owner;
- pinned title;
- every Hap + 10 bots row reachable;
- short lists compact;
- no page, HUD, or table-shell scroll.

## Cribbage atomic settlement

The current source candidate moves Cribbage terminal settlement into
`public.cribbage_settle_game`. One transaction now owns the durable result
claim, server-derived skunk payout, player chips, completed round, post-payout
snapshot batch, `game_over`/`session_ended` disposition, and real-money
`SessionResult` rows. Connected clients and reconnects submit only the
immutable game, round, dealer-game, and hand identity; presentation remains
local.

Migration `20260802001500_atomic_cribbage_terminal_settlement.sql` was applied
to the live Lovable Cloud database on 2026-08-02 as one transaction and recorded
in `supabase_migrations.schema_migrations`. Live verification proved both
unique indexes, the restricted result-insert policy, authenticated-only RPC
execution, and the deduped `record_session_results` trigger definition. The
matching app build is deployed through Vercel. Source-production and owned-
preview smoke now cover disconnect during LAST HAND real-money closure with
one financial result per human; direct duplicate-caller acceptance remains.
Both runtimes deterministically reproduced the separate connected-client win-
presentation bypass tracked in the backlog. The 2026-08-03 source correction
adds a route-owned, exact-identity live-terminal latch so an already-connected
Cribbage client retains its mounted table through the child-owned terminal
sequence, while a fresh mount of an ended session still goes directly to the
lobby. The first production smoke proved that route hold but exposed a local-
hand blink: the ordinary stale-complete guard mistook the terminal His Heels
reveal for a completed hand awaiting its successor. The follow-up source
correction excludes `complete` states with authoritative `winnerPlayerId` from
that bootstrap guard while preserving non-winning stale-hand suppression.
Settlement and financial authority are unchanged. Published follow-up smoke
on commit `f9c7b1ebba91287049916e4caa09d281ace3df5a` passed on 2026-08-03,
including continuous visibility of the remaining connected client's hand
through the terminal cut-card reveal and win presentation. Cribbage is now the
accepted disconnect-safe settlement and connected-terminal-presentation model
for the remaining games.

## Yahtzee atomic settlement

Migration `20260803234111_atomic_yahtzee_terminal_settlement.sql` is installed
on the owned production database. `public.yahtzee_settle_game` now derives a
unique winner or tie from the persisted complete scorecards, reads the fixed
stake from the immutable dealer-game configuration, and keys every request to
the authoritative round row and `rounds.hand_number`. This corrects the former
post-tie identity bug where client writers continued to use JSON
`yahtzee_state.currentRound = 1` on later hands.

For a unique winner, one transaction owns the durable result claim, fixed-
stake zero-sum chip transfer, completed round, post-payout snapshot batch,
`game_over`/direct `session_ended` disposition, and real-money SessionResult
trigger output. A tie moves no money, writes no result, completes the exact
round, and atomically publishes the existing rollover flag. Replayed callers
perform no financial writes. The function has an empty fixed search path;
Public and anonymous execution are revoked; authenticated callers must be a
session participant or admin.

Follow-up migration
`20260804000259_fix_yahtzee_settlement_replay.sql` keeps an exact durable
settlement replay valid after ordinary lifecycle progression changes the
session's current game, type, stake, pot, or status. Those mutable current-game
fields remain mandatory for a first settlement but are no longer allowed to
invalidate a matching completed claim. A rollback-only production proof
settled one synthetic match, changed the session to a different live Holm
dealer game with different stake and pot, then replayed the old Yahtzee
identity as `already_settled/game_over` without changing its result, chips,
snapshots, or the newer lifecycle. Rollback left zero synthetic rows.

The matching client candidate removes the elected browser's direct payout,
result, snapshot, and lifecycle writes. Every mounted client may replay only
immutable settlement identity. The route's exact live-terminal hold is now
shared by Cribbage and Yahtzee: an already-connected LAST HAND client retains
the same table through the real winner/chip-animation completion callback,
while a fresh mount of an already-ended session still goes directly to the
lobby. Final human and bot category scoring now persists the score and
`gamePhase='complete'` together before the two-second local highlight, and the
terminal animation retains its round roster even when a settled participant
leaves. Production rollback proofs cover legacy replay plus synthetic tie,
later-hand identity, LAST HAND and ordinary-win settlement, duplicate callers,
fixed-stake zero-sum payout, snapshot overwrite, authorization, and one
SessionResult per human. All synthetic rows rolled back to zero. Published
two-human terminal-disconnect smoke passed on 2026-08-03: the remaining client
retained the table through terminal presentation, settlement completed once,
and the session ended correctly. The winner chip did not bounce during
celebration; that isolated presentation defect is queued separately and does
not reopen settlement acceptance.

## Gin Rummy atomic settlement

Migration `20260804010000_atomic_gin_terminal_settlement.sql` is installed on
the owned production database. `public.gin_rummy_settle_game` is now the
replay-safe owner of the final hand-history record, terminal result claim,
match payout, post-payout snapshots, and `game_over`/`session_ended`
disposition. It accepts only immutable game, round, dealer-game, and hand
identity; clients retain presentation only.

The matching client submits settlement before the terminal announcement and
chip sequence. Gin now uses the same route-owned exact-identity terminal hold
as Cribbage and Yahtzee, so a connected LAST HAND client retains the table
until Gin emits its completion token; a fresh ended-session mount still goes
directly to the lobby. Production rollback proof passed winner, tie, duplicate,
replay, late-replay, authorization, continuation, and terminal-state cases;
published two-human runtime smoke remains the acceptance evidence.

The 2026-08-05 `Aug 4 - Grandview Drive` production evidence also proved a
separate ordinary-hand rollover defect: pairs of authoritative Gin hands were
created 100--440 ms apart. Every connected client processed the same completed
hand, but `startNextGinRummyHand` derived its successor from the mutable
database maximum. The first caller inserted H+1; the next caller observed that
row and incorrectly inserted H+2, so presentation legitimately launched a new
deal and upcard for each skipped identity.

The current source candidate makes Gin creation predecessor-keyed. The opening
entry point always targets H1/R1, and ordinary rollover always targets the
completed predecessor's H+1/R1. The deployed unique
`(dealer_game_id, hand_number, round_number)` index now arbitrates concurrent
callers because all of them attempt the same row; losing and stale callers load
and reuse that exact authoritative round. Shared card transport, deal timing,
rules, and settlement are unchanged. Published two-client multi-hand smoke
remains required.

## Holm atomic initial-hand startup

The 2026-08-05 `Aug 5 - Pioneer Parkway` production repro proved that Holm's
former browser-owned startup could create two authoritative hands 1.066 seconds
apart. The first caller consumed `games.is_first_hand` and published the ante
pot before inserting its round; a second client then interpreted that visible
partial state as recovery, derived `max(hand_number) + 1`, and created hand 2.

Migration `20260805175524_atomic_holm_initial_hand.sql` is installed on the
owned production database. `public.start_holm_initial_hand` now locks the game
row and owns the first-hand identity, exactly-once ante movement and audit,
deck/deal, round and player-card inserts, and game-pointer publication in one
transaction. Duplicate and delayed callers receive the same hand-1 round.
Anonymous execution is revoked; an authenticated caller must be a seated
participant or superuser. The client candidate removes the partial-state
recovery branch and submits only the game identity.

The rollback proof passed authorization, first start, card uniqueness,
exactly-once ante, duplicate, replay, winner/tie late replay, continuation,
terminal-state, and legacy-recovery rejection cases with zero persisted test
rows. Jeremy reported the fresh two-client production smoke clean on
2026-08-05: one opening deal was shown and refresh retained the same
authoritative hand. The frozen Pioneer Parkway session is evidence only and is
not repaired or replayed.

## Frozen Lovable cutover scope

### Holm bot scheduling

Two scheduler defects were identified:

1. A wake arriving while `botProcessingRef` was true could be discarded.
2. A realtime authority edge could be missed entirely; fetch/remount
   observation did not always stamp authority because stamping was nested under
   an unrelated deadline branch.

The checked-out source latches/replays dropped wakes, stamps Holm authority on
relevant fetches, compares a full round/turn/epoch authority key, adds
event-driven drains on reconnect/focus/visibility, retains database
exactly-once action guards, and does not add a steady-state repair poll.
Future changes to this behavior still require the bot-heavy smoke below.

### Add Bot

Recorded behavior:

- menu shows `Adding bot...`;
- duplicate taps are blocked;
- success is confirmed by the canonical yellow waiting seat, not a success
  toast;
- failure may show a destructive toast with the actual reason;
- waiting bots remain outside the current hand and join at the next canonical
  boundary.

### Bot aliases

- durable `games.bot_alias_seq`;
- backfill from `session_events` `bot_added` history;
- transactional `create_session_bot`;
- aliases persist in authoritative usernames;
- removed aliases are never reused;
- concurrent creation serializes.

A previously recorded bot-heavy smoke produced Bot 7-10 correctly after
removals.

### Four-color deck

The active-hand shell source no longer paints a white gradient over four-color
faces. Known debt: Holm still has a separate local-hand path besides shared
`ActiveHandFan`.

### Session snapshots/results

Source-backed snapshot identity:

```text
(game_id, dealer_game_id, hand_number, player_id)
```

The checked-out migration/source set includes dealer-game stamping, an ordinary
unique index compatible with SQL/PostgREST conflict inference, database-
idempotent writers, current-roster override, departed-participant snapshot
fallback, and no fabricated historical balances.

### Session Ended

Source and prior smoke evidence support:

- Holm player/community/Chucky cards retire together;
- pot, spotlights, active labels, gameplay cards, and transports retire;
- HUD/tab rail/chat/history remain;
- Back to Lobby is local-only;
- rostered and departed participants merge into Results;
- results are constrained to a felt-safe region.

Production evidence now narrows the remaining failure: participant inclusion is
correct, but vertical touch scrolling is not.

## Codex P0 and follow-up smoke

The frozen Lovable cutover tag already exists. These are Codex-era acceptance
checks, not prerequisites for cutover:

1. Published iOS long-list scrolling passes with Hap + 10 bots. **Failed in the
   current published build.**
2. A short Session Ended list remains compact.
3. A bot-heavy Holm hand completes without a parked bot.
4. Add Bot shows an immediate yellow waiting seat and monotonic alias.
5. Four-color and standard active hands remain legible.
6. Session Ended contains all expected current/departed participants once.
7. `bunx tsgo --noEmit` is clean.
8. Required migrations are deployed.

Items 2-8 were not re-run during the read-only/documentation-only ingestion.
The repository itself cannot prove deployed migration state or published
runtime acceptance.

## Tag policy

- Do not move or recreate `lovable-final-cutover-2026-08-01`; it permanently
  identifies the final Lovable product baseline, including the known scroll
  defect.
- Codex work proceeds from that frozen baseline plus the later documentation
  handoff. It does not wait for another Lovable publish, reclone, or stable tag.
- A future stable tag may be created after Codex fixes and production smoke
  pass. Such a tag is optional post-cutover release bookkeeping, not a cutover
  prerequisite.

## Canonical chip-transfer presentation ledger

Migrations `20260809170000_canonical_chip_transfer_ledger.sql` and
`20260809210000_stage_chip_transfer_cursors.sql` are installed on the owned
production database. Every player-chip or table-pot mutation is journalled in
its financial transaction and commits an immutable, game-scoped transfer batch
with database-captured opening and closing endpoint balances. The balance row
stages the next cursor before it is published, so an early realtime balance
can never render ahead of its batch.

`ChipPresentationLedger` inside the shell transport provider is now the sole
presentation owner of touched player/pot endpoints. It composes ordered deltas
for overlapping batches, releases only after a fresh authoritative fetch
confirms the batch cursor, and abandons/reconciles directly on endpoint loss or
reconnect without replaying settled money. A game may register a
presentation-only admission prerequisite for a committed batch; the ledger
retains the authoritative opening balances and blocks later overlapping batches
until that prerequisite opens. Legacy game animations remain only as phase
callbacks; the canonical runtime renders the financial flight.

The rollback-only proof `supabase/tests/canonical_chip_transfer_ledger_proof.sql`
passed after deployment. It covers authorization, multi-sender antes,
player-to-player composition, pot payout, opening/closing values, cursors, and
empty pending-journal cleanup. Production smoke passed on 2026-08-09 at commit
`79cfdcc75efd31c479f69cf7c72aa6a2398fba20`: a Holm solo-vs-Chucky payout
waited for the community and Chucky reveal stages before the pot departed, with
no balance bounce or duplicate financial movement. Destination-chip bounce is
separate presentation debt in Backlog item 8.

Production smoke at commit `cd88b3d1d5965593236c68324743e3f32d6a5eee`
confirmed the 3-5-7 normal final-leg ordering: leg award, leg sweep, then the
canonical pot flight together with the winner announcement and confetti. The
destination-chip bounce remains separate presentation debt in Backlog item 8.
The same smoke exposed winner cards without an explicit Show Cards action;
that consent defect is isolated in Backlog item 3H and is not accepted.

## 2026-08-25 — Cross-country liveness release candidate

- The `codex/gin-action-liveness` branch validated a bounded, replay-safe Gin
  action retry against an intentionally lost action response.
- Cribbage now resets pegging-boundary presentation at each hand identity,
  retains live Go/31 release timers across same-phase snapshots, and decides
  cut-reveal recovery per hand rather than per route mount.
- The authenticated two-client `cribbage-multi-hand` preview scenario reached
  terminal settlement, peer recovery, and guarded teardown at commit
  `42faab42a`. This is preview evidence pending publication of the verified
  branch to `main` and Jeremy's production smoke.

## 2026-08-26 — Freeze-liveness hardening release candidate

- The post-login lobby no longer mounts the same maintenance-mode realtime
  channel twice. `Index` is the sole subscription owner and passes its
  read-only maintenance state to `GameLobby`; the previous duplicate channel
  name caused Supabase to throw during the second mount and left the lobby
  route blank.
- Human-chaos commands now use the deployed HTTPS production frontend by
  default and verify that their first observed Supabase request reaches
  `xvhmbuppghwmwpwrkzao`. They cannot silently fall back to local Vite, whose
  intentionally write-locked retired source backend previously made Create
  Game appear to fail. The production Yahtzee gameplay-timeout/rejoin scenario
  passed with guarded fake-money cleanup after this target correction.
- Deployed `yahtzee_human_deadline_recovery`: an expired human Yahtzee turn is
  now recovered by the service scheduler through an exact deadline/action
  sequence identity. The new `deadline_auto` path is rejected for ordinary
  authenticated callers; existing player actions remain authenticated.
- A missed local 3-5-7 terminal callback no longer blocks dealer setup after
  authoritative status leaves the outgoing terminal frame or rotates to a
  different dealer game.
- Cribbage Go/31 presentation blocking now requires a non-zero action sequence
  from the current hand. Auto-Go re-arms when the exact round, hand, action
  sequence, actor, count, Go set, or actor hand changes.
- Dealer setup renders and arms its authoritative deadline directly from the
  game snapshot; optional defaults reads no longer hide the form or gate human
  timeout enforcement.
- Human-chaos deadline observation now reads the authoritative JSON state for
  Horses/SCC and Yahtzee. Terminal probes and guarded fake-money cleanup have a
  larger bounded transport retry budget, and intentional lost-response fetches
  have an explicit bound.

Validation: the deployed Yahtzee rollback proof passed; deployed privileges
and zero overdue human Yahtzee deadlines were verified; TypeScript, focused
liveness tests, and the production build passed. The broad liveness suite was
239/240, with the sole failure an unrelated pre-existing Windows line-ending
source assertion in the session tie-harness test. Two browser attempts stopped
before table creation at the existing post-login `Game Lobby` assertion, so no
two-client runtime acceptance is claimed for this candidate yet. After the
lobby correction, both configured live-browser identities reached Game Lobby
and exposed Create New Game. The first full chaos scenario then reached its
next hard gate but did not navigate after Create Game; it is recorded as a
blocking gauntlet failure pending a separate RCA, not as passing coverage.

## 2026-08-29 — Cribbage visual-report forensics candidate

- Read-only production evaluation of the completed real-money `Aug 28 -
  Bouncing` session found no authority, settlement, or lifecycle corruption:
  all 130 recorded play-card writes applied once. The three visual reports
  instead described recoverable client-presentation symptoms, but their exact
  local latches were absent because the promised Cribbage active-hand snapshot
  and wartime producers had been replaced with no-ops.
- The source candidate restores diagnostic evidence without changing gameplay.
  Cribbage deal, active-hand, parent-gate, pegging-boundary, and interaction
  producers write to a 200-entry, per-payload-bounded in-memory ring scoped by
  exact session and dealer-game identity. A visual report attaches that tail,
  live action-gate state, DOM card counts, and discard-button center-point
  hit-testing only at submit time. A Cards-subtree disappearance retains the
  same-scope last snapshot while stale cleanup and later dealer games are
  rejected.
- `CRIBBAGE_RENDER_SOURCE_MISMATCH` now excludes `PRE_DEAL` and `DEALING`,
  where transport intentionally renders only the settled prefix of the six
  authoritative cards. Post-deal mismatches remain always-on invariants.

Validation: 41 focused Cribbage/render/diagnostic tests passed after the final
snapshot/trace scope hardening, TypeScript 5.8
`tsc --noEmit` passed (the repository's preferred `bunx tsgo` runtime is not
installed on this host), and the production Vite build passed with only the
existing chunking warnings. Published runtime smoke remains acceptance truth;
this candidate does not claim that the underlying visual symptoms are fixed.

## 2026-08-31 — Gin post-knock rejoin correction

- A mid-layoff reload no longer leaves the visible deadwood cards detached
  from the actionable hand. Once Gin reaches `knocking`, `laying_off`,
  `scoring`, or `complete`, the cards tab uses the admitted authoritative hand
  instead of an opening-deal `PRE_DEAL` prefix. Ordinary opening-deal
  transport, private-card redaction, self-draw withholding, and database
  action authority are unchanged.
- Commit `aeb2427f6f51a26ca7039f5f6a023bda2416098c` is published at
  `holm357.com` as bundle `assets/index-CoK0hQ-a.js`.
- Three isolated production fake-money rows passed concurrently with the
  continuous observer and a 6000 ms peer budget: `gin-knock-layoff-rejoin`,
  `gin-successor-hand-rejoin`, and `gin-scoring-terminal-rejoin`. Each session
  was deleted and cleanup was verified.

This is focused rejoin/terminal evidence, not a claim of complete Gin rule or
server-authority coverage. The broader Gin authority migration remains a
separate queued phase.

## 2026-09-01 — Target rule gauntlet discovery checkpoint

- Added an exact-game, fake-money-only deterministic rule harness and a
  45-row browser matrix for Yahtzee, Holm, and 3-5-7. The fixture is guarded by
  admin/participant identity, target game type, human topology, expiry, and
  one exact dealer-game/hand/round consumption. It cannot arm for real money.
- The final rollback proof covers authorization, real-money refusal, exact
  consumption, replay, deterministic state, terminal Yahtzee settlement, and
  explicit cleanup. The existing Yahtzee, Holm, and 3-5-7 authority rollback
  proofs also pass against the deployed definitions.
- Production fake-money discovery attempted 66 gameplay, deadline/rejoin, and
  lifecycle rows with the continuous observer and a 6000 ms peer budget. The
  strict result was 27 pass and 39 fail. Cleanup verification found zero of 76
  exact campaign/canary games remaining and zero armed fixture requests.
- Because timer, latency, setup, transition, and assertion failures remain,
  this checkpoint does not claim freeze-free behavior or full coverage. Exact
  outcomes and artifact roots are recorded in
  `docs/codex/TARGET_GAUNTLET_20260901.md`; failures remain frozen for separate
  RCA.
