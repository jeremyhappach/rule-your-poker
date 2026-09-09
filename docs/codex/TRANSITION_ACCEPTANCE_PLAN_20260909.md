# Transition acceptance plan — September 9, 2026

Status: Approved by Jeremy September 9; resumed after the previous task's
platform interruption. The first healthy-scenario harness is locally verified.
Jeremy renewed the no-play window; the first live row stopped on the driver's
incorrect round-1 assumption after one ordinary leg passed on both browsers.
Cleanup is independently verified. Jeremy separately approved the harness-only
correction; it is implemented with seven passing progression regression checks.
See `TRANSITION_ACCEPTANCE_LIVE_20260909.md` for retained evidence and rerun status.
Purpose: close the coverage gap exposed by the September 8 3-5-7 P0/P1, then
apply the proven assertions to other games without launching the entire seam
campaign at once. This is a prioritized subset of `FULL_SEAM_GAUNTLET_PLAN.md`.

## Acceptance contract

Test the complete story on two independent human-account browsers: legal final
action -> authoritative result -> each client's visible reveal/award/transport
sequence -> correct continuation -> playable successor. Settlement, presentation
and destination are separate pass conditions; none substitutes for another.

Ordinary continuation, normal next-game setup, and requested End Session are
separate manifest rows. End Session must never be requested in a normal-setup
test. Freeze the published SHA for each batch and record both browser builds.

## Phase 1 — bounded test-harness correction

Reuse the existing two-client accounts, identity leases, action drivers, network
interception, evidence retention and guarded fake-money cleanup. Extend
`e2e/humanChaos/transitions.humanChaos.spec.ts` and its manifest for the outgoing
presentation assertions; retain the existing terminal/branch-smoke suites as
separate End Session checks. Do not build another automation framework.

Add a continuous per-client transition observer scoped to session, dealer game,
hand and round. Record visible stages and their start/completion boundaries,
signed helper text, displayed balances, outgoing artifact cleanup and setup
admission. Existing DOM markers plus visibility checks, traces and screenshots
are preferred; minimal passive DOM markers may be added where necessary.
Console messages or final screenshots alone are not proof of the sequence.

Bind observations to exact action/result/transfer identities and server reveal
timestamps. Do not accept unrelated activity or a later hand as proof. Compare
database balances/results read-only, including the 3-5-7 leg reserve; do not
mistake a leg purchase for a pot contribution.

Before live runs, prove the observer rejects negative controls: setup during
reveal (the incident's +456 ms ordering), missing final-leg/sweep/pot stages,
early helper/balance changes, duplicate award, stale identities and evidence
that ends before presentation completes. A correct eventual balance or setup
screen must not turn any of these failures green.

Scope is tests and, only if needed, nonvisual observation attributes. No gameplay
owner, timing rule, settlement, migration, infrastructure or billing change.
Timebox harness work to 35 minutes; report a concrete blocker rather than expand.

## Phase 2 — 3-5-7 first live qualification

| Case | Required proof |
|---|---|
| Normal deciding leg, player A wins | Three legs to win, $2 leg value; reach two legs each through legal Stay/Fold play; no End Session request; full DROP/hold -> final leg -> leg sweep/credit -> pot award -> setup |
| Same case, player B wins | Swap winner/loser and acting/observing roles; both clients satisfy their own presentation gate |
| Batch-first ordering | Delay the frame/action response while admitting the committed financial notification; no early balance/helper or setup |
| Frame-first ordering | Delay the financial notification while admitting the resolved frame; no missing or duplicated later charge/payout |
| Actual End Session | Explicitly request it in this separate row; finish applicable presentation -> Session Ended; fresh-ended mount goes to lobby |
| Rejoin at terminal boundary | Disconnect/rejoin one client; survivor finishes correctly, rejoining client follows authoritative recovery rules; no duplicate money or stale continuation |

The legal build-up to two legs each must also prove ordinary leg presentation,
the P1 helper gate and nonterminal continuation. Unrelated or unexpected outcomes
do not qualify the deciding-leg case. Do not retry random deals until green.
An instant 3-5-7 sweep is a separate branch: use an existing safely scoped fixture
if available; otherwise record it as Blocked, never claim a normal-leg run covers
it and never introduce a production fixture/migration silently.

Healthy cases run before fault cases. Use bounded deterministic delays targeted
to the final action on one client, not generic chaos across the entire game.
Keep ordinary-action latency separate from deliberate fault delay and configured
presentation time. Do not loosen the existing six-second ordinary progress limit.

On each continuously connected client, setup must remain invisible until that
client's required terminal presentation completes. A fast peer may commit the
shared handoff; it must not erase a slower peer's retained presentation. Check
client completion requests separately from the existing server recovery deadline.

Across the normal-ending rows, exercise Run Back unchanged, changed legal
parameters and a switch to a different game. Require one successor dealer-game
identity, correct configuration, no outgoing artifacts and a legal first action
on both clients. Allocation of an ID or a setup screen alone is not a pass.

## Phase 3 — apply the proven checks across games

Only after the 3-5-7 gate passes, inventory Holm, Cribbage, Gin, Horses, Ship
Captain Crew and Yahtzee against three distinct endpoints: ordinary continuation
where applicable, normal terminal -> next-game setup, and End Session. Record
each game's required reveal/scoring/award/transport sequence, not one generic
"terminal tested" label. Prioritize branches with distinct terminal owners
(for example instant sweep or a win during scoring), retaining explicit gaps.

Run small, separate batches with one browser pair at a time. Start with one
normal next-game transition per originating game; same-game changed settings,
cross-game changes and End Session have their own coverage entries. This does
not authorize or claim completion of every ordered pair in the larger campaign.

## Safety, execution budget and reporting

- Approval permits scoped harness work; live production-backed testing also
  requires a fresh confirmed no-play window. Older September 8 windows expired.
- Dedicated fake-money identities/sessions only. Never touch the real incident,
  historical balances or user sessions. No bot substitution or global fixture.
- First live batch: at most 30 minutes, one browser pair, no automatic retries.
  Stop at the first unexplained product or observer failure; preserve both
  clients' evidence before exact fake-session cleanup and verify cleanup.
- A missing stage, uncertain attribution, missed targeted outcome or incomplete
  run is Fail/Blocked/Not run as appropriate, never Pass. Keep original failures
  when a diagnosed harness correction warrants a separately recorded rerun.
- Report exact build, scenario, roles/settings, actual stage timeline on both
  clients, settlement/balance proof, timings and cleanup. Remaining gaps stay
  visible. Database and browser assertions must both pass.
- Run relevant harness tests/typecheck, review the scoped diff and publish
  approved changes through the repository's normal commit/main workflow.
- No fixes during the live matrix. A discovered defect returns to read-only RCA
  and a separately approved correction. Jeremy's normal production smoke remains
  acceptance truth; these checks add evidence, not a guarantee of zero defects.

## September 9 implementation checkpoint

- Reused the transition driver, identity leases, dedicated two-human sessions,
  continuous latency observer and guarded cleanup. Added two healthy entry rows:
  `3-5-7-presentation-host-wins` and `3-5-7-presentation-peer-wins`.
  They use three $2 legs, build two legs each legally, and continue through
  unchanged Run Back / changed leg count into legal successor decisions.
  Neither row requests End Session or injects unrelated setup/ante faults.
- Both browser observers bind visible reveal beats, awards, losing-leg flights,
  pot transfer UUIDs, helpers and both players' displayed balances to exact
  session/dealer-game/hand/round identities and the final action's reveal clock.
  Read-only frame/batch/result queries check the leg reserve separately from
  the pot, conservation, exact charge, winning result and pot destination.
- Product changes are passive DOM attributes only. No gameplay owner, financial
  mutation, timer, migration, network behavior, infrastructure or billing changed.
- The actual leg renderer removes its DOM on its existing configured timer,
  before CSS `animationend` is guaranteed. A local browser control exposed this
  observer gap. Full-lifetime removal is now accepted only against that exact
  passive deadline and continuous visibility immediately before exit. Early
  removal and shortened CSS animation remain failures. Native chip completion
  is likewise bounded by the renderer's existing deadline.
- Independent read-only review identified missing peer-balance checks and an
  early-CSS-completion loophole. Both were corrected by the primary agent.
- Qualification gaps remain explicit: the first healthy live row was blocked
  before terminal qualification; the peer-winner row has not run;
  targeted batch-first/frame-first, terminal rejoin, explicit End Session,
  instant sweep and cross-game expansion are not qualified by this checkpoint.
  The local controls do not replace Jeremy's production smoke.
- Validation: application typecheck, 1,529 application tests, production build,
  21 transition assertions and five actual-browser controls pass. The updated
  harness suite contains 88 tests; four focused session-helper checks also pass.
  The preferred `tsgo` binary is absent, so the existing TypeScript compiler was
  used without installing anything. A separate E2E typecheck exposes ten existing
  `abortSignal` typing errors in the inherited settlement/cleanup helpers;
  it reports no new transition-file errors. This is not a fully green E2E
  typecheck. Build/evidence logs are under `artifacts/transition-acceptance/`.
