# Full human-to-human seam gauntlet plan

Status: **plan locked; Wave 0 in progress; browser matrix held**
Plan date: 2026-08-27  
Scope: human-to-human gameplay for Holm, 3-5-7, Cribbage, Gin Rummy,
Horses, Ship Captain Crew, and Yahtzee.

This is the execution contract for the next browser campaign. It is designed
to replace ad hoc smoke testing with a closed coverage ledger and retained
evidence. It does not claim that the current suite already covers every row.

## Safety hold

No scenario may start merely because this plan exists. Before execution, the
primary orchestrator must receive a separate go-ahead from Jeremy and must
confirm that the run is outside a scheduled real-money game window.

The campaign must:

- use fake-money sessions and dedicated test identities for browser work;
- never join, pause, repair, mutate, or clean up a real-money session;
- abort its preflight if a configured blackout window is active;
- preserve evidence before guarded fake-money cleanup;
- avoid product-code changes, database migrations, and root-cause work while
  the matrix is running;
- avoid bots except where a rule explicitly cannot be exercised by humans.
  Such a case is recorded as a gap, not silently substituted with a bot.

## Completion claim

The campaign earns the following statement only when every gate in this
document is satisfied:

> Every enumerated human rule, action, lifecycle, deadline, rejoin,
> settlement, presentation, and dealer-game transition seam passed with live
> isolated browsers on the exact published build, under the declared healthy
> and deterministic chaos schedules, with no unresolved freeze or defect.

This is the highest practical confidence statement. It does not assert that
all possible network timings or future defects are mathematically impossible.

## One coverage ledger

Before browser execution, one versioned manifest must contain every executable
row. No spec file may carry an unlisted campaign scenario.

Each row must have:

| Field | Requirement |
|---|---|
| Scenario ID | Stable, unique, human-readable ID |
| Game/topology | Game plus required two-, three-, or four-human browser topology |
| Setup profile | Every relevant parameter and boundary value |
| Rule branch | Exact legal action, scoring, continuation, or terminal outcome |
| Starting identity | Session, dealer-game, hand, round, actor, and observer roles |
| Boundary | The authoritative-to-presentation seam being crossed |
| Fault schedule | Fixed schedule ID and seed; never unexplained random chaos |
| Expected authority | Exact database phase, identity, balances, result, and next owner |
| Expected presentation | Controls, timer, cards, announcement, overlay, transport, and terminal posture |
| Latency budget | Profile-specific action-to-RPC, actor-progress, peer-progress, and recovery limits |
| Fixture | Account-scoped, one-shot fixture ID or `none` |
| Result | `Not run`, `Pass`, `Fail`, `Blocked`, or justified `N/A` |
| Evidence | Build SHA, browser artifacts, observer JSON, database proof, and cleanup receipt |

`Covered by another scenario` is allowed only when the ledger points to the
exact row and proves that all fields above are identical. Broad labels such as
“terminal tested” or “game smoked” are not coverage.

## Coverage dimensions

The manifest combines six dimensions. It does not attempt an infinite full
cross-product. Every individual value is covered, every pair of dimensions is
covered where legal, and historically risky three-way combinations receive
explicit rows.

1. **Rule outcome:** legal choices, scoring outcomes, ties, continuation,
   terminal settlement, and every setup-option boundary.
2. **Lifecycle boundary:** session draw, setup, ante, first deal, action,
   reveal/counting/scoring, next hand/round, settlement, postgame, and next
   dealer game.
3. **Client role:** acting human, observing human, dealer/setup owner,
   nondealer, reconnecting human, and postgame initiator.
4. **Failure timing:** before submit, during commit, after commit before the
   response, after response before Realtime, and during presentation.
5. **Transport ordering:** healthy, long-haul, response loss, delayed Realtime,
   delayed/failed full fetch, offline/rejoin, remount, and duplicate replay.
6. **Human topology:** two browsers for the core matrix; three or four browsers
   only where a supported rule or seat-order outcome cannot exist with two.

## Rule-branch closure

The rows below are requirements for the executable manifest. Each bullet is a
separate row unless a deterministic scenario visibly and authoritatively
proves multiple bullets without weakening fault placement.

### Shared session and table shell

- Waiting table to session dealer draw, both normal and tied/redraw.
- Session draw presentation completed on every client before setup admission.
- First dealer game and later dealer games enter the same canonical shell
  without being mistaken for refresh/recovery.
- Dealer setup accept, changed parameters, explicit sit-out, and setup timeout.
- Ante stay, ante sit-out, ambiguous committed response, ante timeout, and
  rejoin into the resulting posture.
- Own identity row always reports Active, Sitting Out, or Waiting correctly.
- First deal admits cards, legal controls, and a timer only after the canonical
  ante/deal presentation boundary.
- Connected terminal presentation, ordinary continuation, LAST HAND Session
  Ended, and fresh-ended-session lobby admission.
- One shell, one felt, one seat ring, one HUD/tab rail, and one lifecycle owner
  survive every transition.

### Holm

- All fold with Pussy Tax off and Rabbit Hunt off; carry into the next hand.
- All fold with Pussy Tax on; exact tax collection and carry-forward pot.
- Rabbit Hunt on; ordered hidden-community reveal, tax concurrency, configured
  post-reveal dwell, and successor-hand release.
- Solo stayer beats Chucky; tabled cards, celebration, transfer, exact terminal
  settlement, and postgame release.
- Solo stayer loses or ties Chucky; no premature celebration, capped/uncapped
  pot match, replacement pot, and next hand.
- Multiple stayers with a unique winner; loser match and continuation.
- Partial top tie plus losing stayer using the minimum required human topology;
  split, remainder/conservation proof, loser match, and continuation.
- Every stayer ties, then players beat Chucky; split terminal award.
- Every stayer ties, then Chucky wins/ties; matches and continuation.
- Pot cap off/on at the boundary, Pussy Tax off/on, Rabbit Hunt off/on, and
  Chucky card-count minimum/maximum are each exercised, with pairwise option
  coverage rather than an unbounded full cross-product.
- Human decision timeout before and after another player's committed decision.
- Next-hand buck rotation, no repeat ante, prepared-hand acknowledgement, and
  stale completed projection rejection.

### 3-5-7

- Both fold with Pussy Tax off and on.
- Exactly one stayer buys a regular leg.
- Multiple stayers produce a unique winner and player-to-player transfer.
- Multiple stayers tie; no chip transfer and correct continuation.
- Round 1 to Round 2 to Round 3 retains 3/5/7 cards and changes the wild rank.
- Round 3 to a new Round 1 collects rollover exactly once, not opening ante.
- Regular nonterminal leg, regular terminal leg, and exact pot/leg-reserve
  settlement.
- Round 1 exact 3-5-7 instant sweep; ordered reveal, Sweep the Legs overlay,
  leg/pot transfer, and terminal handoff.
- Reveal at showdown off/on, legs-to-win minimum/representative value, pot cap
  off/on, and leg/rollover/Pussy Tax boundaries receive pairwise coverage.
- One timed-out undecided player and all undecided players; authority resolves
  once and both clients expose the successor.
- Setup owner declines/sits out and the remaining roster reaches a legal state.
- No prior-round cards, timer, controls, overlay, leg cue, or transport survives
  a round, hand, dealer-game, or game-type identity change.

### Cribbage

- Normal and tied/redraw Cribbage dealer selection; every client completes the
  draw presentation before dealing begins.
- Two-player discard/crib construction and supported three-/four-player
  discard/crib construction using live humans where required.
- Cut presentation and His Heels, both nonterminal and terminal.
- Pegging: 15, 31, pair, triple, quadruple, run, Go, last card, blocked player,
  and sequence reset; 31 must not also receive last-card points.
- Counting order: nondealer hand, dealer hand, then crib.
- Counting categories: fifteens, pairs, run multiplicity, normal flush,
  qualifying/nonqualifying crib flush, and nobs.
- Terminal reached during pegging, His Heels, nondealer counting, dealer
  counting, and crib counting; no unshown score is skipped.
- Ordinary hand rollover rotates dealer and clears pegging/counting artifacts.
- Full 121, Half 61, Super Quick 45, Sprint 31, and a Custom target each run;
  ordinary, skunk, and double-skunk multipliers run where the mode permits.
- Rejoin during discarding, cutting, pegging, counting, successor creation,
  and connected terminal presentation.
- Human gameplay timeout remains an explicit accepted `N/A`; disconnect
  recovery must restore state but is not required to invent an automatic move.

### Gin Rummy

- Nondealer takes the first upcard.
- Nondealer passes and dealer takes the upcard.
- Both pass and nondealer draws from stock.
- Normal turns draw from stock and discard pile; the just-taken discard cannot
  be immediately discarded.
- Normal knock with no layoff, normal knock with legal layoffs, Gin, undercut,
  and a void hand when the stock reaches two cards.
- Nonterminal hand scoring, exact dealer rotation, and next-hand deal.
- Terminal match settlement for ordinary knock, Gin, and undercut outcomes.
- Every supported match preset plus representative Custom target/per-point
  values; configured bonus behavior is either proven or retained as a named
  product discrepancy rather than treated as passing.
- Rejoin during first draw, ordinary play, knock reveal, layoff, scoring,
  successor-hand creation, and connected terminal presentation.
- No private opponent face paints early, no visible `??` face, and all entitled
  post-knock cards paint before the score/result releases.
- Human gameplay timeout remains an explicit accepted `N/A`.
- Every committed action meets the healthy and long-haul actor/peer latency
  budget; latency is a pass condition, not informational logging.

### Horses

- First roll, hold, release, reroll, early lock, and automatic third-roll end.
- Ordinary repeated-rank evaluation with ones wild and the pure five-ones top
  hand.
- Unique winner terminal settlement.
- Highest-hand tie; One Tie All Tie carry, exact re-ante, same dealer, and new
  hand.
- Make It Take It off/on and canonical turn-order handoff.
- Timeout before any roll, after a partial hold, and at the final-roll boundary;
  auto-completion/sit-out occurs once and the peer advances.
- Rejoin during rolling, held-dice state, completed result, tie rollover, and
  connected terminal presentation.

### Ship Captain Crew

- Ordered Ship then Captain then Crew acquisition across rolls.
- Partial and failed qualification; qualified dice remain held.
- Cargo reroll behavior, prohibited individual cargo hold, qualified early
  lock, and Midnight auto-lock.
- Unique qualified winner, qualified tie, and all-No-Qualify tie.
- One Tie All Tie carry, exact re-ante, same dealer, and successor hand.
- Make It Take It off/on and canonical turn-order handoff.
- Timeout before qualification, after partial qualification, and after full
  qualification; auto-completion/sit-out occurs once.
- Rejoin during qualification, cargo, completed result, tie rollover, and
  connected terminal presentation.

### Yahtzee

- Roll, hold, release, reroll, third-roll limit, category choice, and exact
  next-human handoff.
- Every upper and lower scorecard category is selected at least once, including
  a deliberate zero/scratch.
- Upper bonus immediately below and at the threshold.
- Repeat-Yahtzee bonus and Joker forced-category behavior.
- A complete 13-category scorecard for both humans and exact terminal scoring.
- Unique winner fixed-stake settlement and tied-scorecard rollover.
- Timeout before first roll, after a hold, and before category selection;
  authority advances once and a rejoining client sees the committed state.
- Rejoin during rolling, category highlight/handoff, terminal presentation, and
  tie rollover.

## Lifecycle inventory already declared

The existing human-chaos manifest declares 79 lifecycle scenarios:

| Family | Count | Contents |
|---|---:|---|
| Dealer draws | 4 | Session normal/tie and Cribbage normal/tie |
| Deadline/rejoin | 19 | Setup and ante for seven games; gameplay for five timed games |
| Run It Back | 7 | Same game, unchanged parameters |
| Same game changed | 7 | Same game, changed parameters |
| Ordered cross-game | 42 | Every source-to-different-target pair |
| **Total** | **79** | Existing declared lifecycle inventory |

All 79 lifecycle rows now have executable drivers. The formerly blocked
`cribbage-dealer-draw-forced-tie-rejoin` row uses the exact-game, one-shot,
fake-money-only fixture installed by
`20260830193000_cribbage_dealer_draw_tie_harness.sql`. It has passed its full
rollback proof but has not yet earned browser coverage. The 79 lifecycle rows
do not replace the rule-branch rows above.

## Deterministic fault schedules

The executable manifest must use these named schedules. Existing long-haul,
offline/remount, and lost-response support may be reused; missing schedules
must be implemented and contract-tested before campaign execution.

| ID | Schedule |
|---|---|
| F00 | Healthy transport baseline |
| F01 | Deterministic cross-country HTTP and Realtime latency/jitter |
| F02 | Committed action response lost after server processing |
| F03 | Realtime delayed behind the authoritative full fetch |
| F04 | Authoritative full fetch delayed, then failed once, then recovered |
| F05A | Acting client offline immediately before submit |
| F05B | Acting client offline immediately after commit/before response |
| F05C | Acting client remounts after commit/before peer projection |
| F06A | Observing client offline across the action and rejoins |
| F06B | Observing client route-remounts with stale delayed frames in flight |
| F07 | Client backgrounds/loses visibility, then resumes |
| F08 | Duplicate submit, duplicate caller, and late replay |
| F09 | Submit at the authoritative deadline boundary |
| F10 | Both connected clients race the continuation/terminal caller |
| F11 | Dealer-game identity rotates while outgoing presentation is incomplete |

Every rule row runs F00. Every lifecycle boundary runs F01. Each fault-capable
boundary runs the applicable F02-F11 schedule for both actor and observer when
those roles are meaningfully different. Historically escaped Holm, Gin,
3-5-7, dealer-draw, and cross-game seams receive explicit combined schedules,
not random combinations.

## Continuous assertions

The observer and authoritative probe must enforce these on every row:

1. Both clients converge on the exact session/dealer-game/hand/round identity.
2. One canonical shell and one felt remain mounted; a loaded table cannot stay
   blank or render duplicate owners.
3. The entitled human has exactly the legal action surface. Timed actions have
   the matching authoritative timer; untimed Gin/Cribbage actions do not invent
   one.
4. No visible masked `??` face appears. Private cards remain redacted until the
   exact rule grants visibility.
5. Announcements, cards, reveals, overlays, transports, and celebration appear
   in their required order and complete before incompatible successor UI.
6. Dealer Setup, Sweep, Session Ended, and other canonical overlays beat the
   HUD/tab rail z-index.
7. No outgoing card, timer, control, announcement, overlay, celebration,
   transport, or game-specific state survives an identity boundary.
8. The database commits each action, continuation, and settlement at most once;
   duplicates and late replays are inert.
9. Terminal results, snapshots, balances, pot/leg reserves, and transfers
   reconcile exactly and conserve value.
10. Each client reports its own participation state correctly and observes the
    peer state consistently.
11. Click-to-RPC, click-to-actor-progress, and click-to-peer-progress meet the
    profile budget.
12. No page error, crash, overdue canonical timer, stranded authoritative
    phase, leaked fake-money session, or missing cleanup receipt remains.

## Latency and freeze budgets

These are test acceptance limits, not product-side timers:

- Healthy F00: action-to-peer progress must be at most 3 seconds.
- Cross-country F01: action-to-peer progress must be at most 6 seconds.
- After a two-second offline burst ends: the returning client must reach the
  correct stable surface within 10 seconds.
- A known presentation sequence must emit its documented next stage within 2
  seconds of the preceding animation-complete receipt, unless an existing
  configured presentation dwell is longer.
- Any committed scenario with no authoritative or presentational progress for
  15 seconds is a freeze failure, even if a broader Playwright timeout has not
  expired.

The report must include p50, p95, p99, and maximum actor/peer latency by game,
action, and fault profile. A percentile cannot excuse a single hard-budget
breach. If calibration proves a budget is invalid because a documented product
animation is intentionally longer, the manifest is revised before the main
campaign, never retroactively after a failure.

## Execution waves

### Wave 0 — manifest and fixture gate

1. Convert every requirement in this document into the single executable
   ledger and validate uniqueness/completeness.
2. Deduplicate the existing 15 branch-smoke, seven terminal, and 79 lifecycle
   entries by exact scenario identity, not by label.
3. Build account-scoped, one-shot fake-money fixtures for rare rule outcomes,
   beginning with the missing Cribbage forced tie.
4. Add contract tests for every new fault injector and fixture.
5. Configure enough distinct human identity slots for the maximum approved
   parallelism and for any three-/four-human topology row.
6. Establish the real-money semantic proof tier: exact production schema and
   RPCs, synthetic balances only, rollback-only financial proofs, and no
   committed real-money browser session.

No browser matrix starts while any Wave 0 row is missing or inconclusive.

Current Wave 0 evidence (2026-08-30): `e2e/fullSeam/manifest.ts` inventories
101 declared executable scenarios (15 branch, seven terminal, 79 lifecycle)
and locks all 79 rule requirements with explicit driver/disposition fields.
The Cribbage forced-tie fixture and its contract/rollback proofs are complete.
Missing rule drivers and remaining fault-schedule, topology, and real-money
proof rows remain visible in the ledger, so the browser hold remains active.

### Wave 1 — healthy rule baseline

Run every rule row once under F00. This proves the fixture and actor can drive
the required branch before transport disorder is introduced. A failure is
recorded and the matrix continues; it does not authorize diagnosis.

### Wave 2 — per-game chaos

Run one isolated worker per game when distinct identity slots are available.
Each worker receives only its game manifest, exact target build, identities,
namespace, fixture scope, and artifact directory. Within a game, preserve the
manifest order. The primary process only orchestrates and aggregates results.

### Wave 3 — shared draws, deadlines, and rejoins

Run session and Cribbage dealer draws, every setup and ante timeout, five timed
gameplay timeout families, and every phase-specific rejoin. Gin and Cribbage
human gameplay timeouts are justified N/A under the current contract.

### Wave 4 — dealer-game transitions

Run serially through the shared table lifecycle:

- seven Run It Back/unchanged rows;
- seven same-game/changed-parameter rows;
- all 42 ordered different-game transitions;
- ordinary postgame and LAST HAND variants for each transition family where
  the destination admission differs.

### Wave 5 — repetition and soak

- Every row must pass F00 and its assigned deterministic fault schedules.
- Every historically escaped seam must pass ten consecutive repetitions with
  the same seed set and no observer violation.
- Holm, Gin, 3-5-7, and shared transition families receive a seeded overnight
  soak that rotates games and parameters without bots.
- A clean soak supplements the deterministic ledger; it never substitutes for
  a missing row.

### Wave 6 — frozen results and diagnosis

Freeze the report before investigating. For each failure retain scenario ID,
build SHA, seed, client roles, trace, screenshot/video, observer JSON, network
timeline, authoritative snapshot, and cleanup receipt. Continue unrelated rows
unless an unsafe environment, identity collision, failed cleanup, or global
target outage makes their evidence invalid.

Only after the run is closed may root-cause analysis and product fixes begin.
Harness defects are labeled separately, repaired, and every result depending
on that harness behavior is invalidated.

### Wave 7 — correction and invalidation reruns

- Rerun the exact failed scenario first.
- Rerun the affected game's complete rule and chaos matrix.
- If shared shell, timer, synchronization, presentation, settlement, or
  lifecycle code changed, rerun all games that use that owner.
- Any shared lifecycle change invalidates all 56 transition rows.
- Any observer/fault-injector change invalidates every row whose pass depended
  on it.

### Wave 8 — exact-build canary and report

Run a bounded fake-money production canary against the exact published commit,
outside a live-game window. Verify guarded cleanup and the rollback-only real-
money semantic proofs. Publish the complete ledger, latency report, failures
and reruns, justified N/A rows, build/deployment identity, and residual risk.

## Parallel isolation contract

- Independent games may run concurrently only with distinct configured human
  identity slots, filesystem namespaces, report directories, and fake-money
  game IDs.
- A worker must fail closed if its identities are leased or its namespace is
  missing.
- Workers may operate the application/database only through approved harness
  paths. They may not edit product code, migrations, shared documentation, or
  another worker's fixtures.
- Cross-game transition rows are orchestrated serially after per-game work.
- The primary process does not duplicate scenario execution.

## Failure policy

A failed scenario is evidence, not permission to investigate or fix. The
campaign continues unless:

- the target is not the locked build;
- a test identity or namespace collision is detected;
- cleanup cannot prove it is scoped to the generated fake-money game;
- a fixture could affect another account or global default;
- the production service is experiencing an unrelated outage; or
- continuing could interfere with a scheduled real-money session.

Those conditions stop execution safely and mark affected rows `Blocked`; they
do not convert them to passes.

## Final gates

The campaign is complete only when:

- every ledger row is `Pass` or a reviewed, justified `N/A`;
- there are no missing fixtures, blocked rows, inconclusive rows, or unresolved
  observer violations;
- all 79 declared lifecycle rows are executable and pass;
- every rule/option/topology requirement in this document has an executable
  row and retained evidence;
- all 56 transition rows pass on the exact build;
- exact settlement, replay safety, and value conservation pass for every
  terminal family;
- the latency/freeze budgets pass with reported distributions;
- high-risk repetition and soak are clean;
- guarded fake-money cleanup is proven for every generated session;
- the production canary and rollback-only real-money semantic tier pass; and
- the report names any residual risk instead of hiding it behind “full smoke.”

Until then, the accurate status is **campaign incomplete**.
