# Secure 3-5-7 disclosure and DROP qualification — 2026-09-24

Base: `d2c25f83f122cdb607269a143a42521c622bd95d`.
Branch: `codex/357-private-reveal`. Local qualification only; no push or deployment.
Final release qualification completed locally; no push or deployment.

## Implemented boundary

Migration `20260924164708_three_five_seven_private_disclosure.sql` captures an
immutable decision map and pre-settlement projection in
`private.three_five_seven_decision_snapshots`, keyed by exact game, dealer-game,
round, hand and round number. Settlement still happens in its original
transaction with unchanged rule, winner, leg, payout and chip calculations.
The snapshot survives clearing live decisions during winning-leg settlement.

The server gates disclosure against the existing authoritative, pause-adjusted
DROP timestamp. The caller supplies identity, never disclosure time. Before
DROP, safe frame/receipt readers redact opponent decisions and retain the
pre-settlement result and financial projection. Direct result, action, history,
transfer, diagnostic and account surfaces use the same visibility boundary.
Private storage and internal implementation functions are not available to
ordinary authenticated users. A separate private disclosure latch prevents
pause/resume from hiding information that was already authorized.

`public.three_five_seven_frame_notices` carries only game/round identity and a
version for Realtime refresh. `three_five_seven_read_reveal` requires membership
and exact round identity. The renderer receives an immutable authorized map;
it does not reconstruct another player's choice from cleared live fields.
Existing countdown durations, DROP animation and settlement ownership remain.

## Authority and concealment qualification

- Updated authority SQL proof passed with `DO / ROLLBACK`. Its temporary helper
  tests actual authenticated access before DROP, private snapshot denial,
  rejected early continuation and exact-round disclosure after waiting for the
  real server deadline. Existing winner, tie, all-fold, charges, conservation,
  duplicate/replay, late replay, outsider, continuation and terminal assertions
  remain. Resolution comparisons reject null rather than silently skipping.
- The existing LAST HAND/session-end SQL proof passed in the preceding pass.
- The real local HTTP/Realtime security harness passed six scenarios: normal
  and winning legs with one/multiple folders, plus normal/winning last-actor
  folds. Checks cover current/shared frames, submit/replay receipts, authenticated
  player/result/transfer/action reads, hand history, private-schema denial,
  outsider/forged identity, observer, reconnect, Realtime and outcome inference.
- Winning cases prove live decisions are cleared while the authorized immutable
  map retains the exact choices. Private table/function privileges and snapshot
  update rejection passed. Normal HTTP cases also verify next-round identity
  change, empty live decisions and no old reveal snapshot.
- The six-case adversarial fan-out holds the existing host pause while issuing
  reads, then resumes. An earlier ordinary unpaused network probe also passed;
  this is not a claim of exhaustive timing-race coverage.

Two SQL failures are confirmed unchanged baseline failures and were not
reinvestigated or fixed:

| Proof | Baseline failure |
| --- | --- |
| `three_five_seven_rollover_proof.sql` | `three_five_seven_player_authority_mutation:rpc_required` |
| `session_abandonment_reconciliation_proof.sql` | `session_abandonment_proof:authorization-shape` |

## Controlled browser A/B

The same normal-leg fixture ran once on unchanged base source and the preserved
pre-migration local database, and once on candidate source/database. Both used
the same installed dependencies, Chrome viewport, ordinary authenticated
accounts, one browser player, an RPC-driven folding player, and an inactive
observer. Product source was not instrumented or changed. Existing logs and
read-only Chrome debugger probes captured effect and callback execution.
The 30 relevant baseline 3-5-7 function definitions match the saved baseline;
this is not a claim of complete local/production schema equivalence.

| Observation after result | Base | Candidate |
| --- | --- | --- |
| Round completed / awaiting next round | Yes | Yes |
| Continuation deadline passed | Yes, observed another 11 seconds | Yes, observed another 11 seconds |
| Local player is dealer and host | Yes | Yes |
| Exact round identity matches | Yes | Yes |
| Reveal still blocks result | No | No |
| Continuation effect executions | 15 | 16 |
| Leg-award completion callback executions | 0 | 0 |
| Advance-round requests | 0 | 0 |

**Candidate-caused: NO.** Both follow the unchanged ordinary-leg branch that
waits for the exact leg-award presentation acknowledgement. Per the approved
Case A boundary, investigation stopped here. No continuation change was made.
Automatic normal-leg browser continuation remains a documented fixture
limitation, not a passing browser assertion. Reset qualification uses the
existing SQL/HTTP continuation proofs, focused identity/reset tests, and the
successful winning-game browser reset below.

## Candidate browser results

The full app ran against the isolated local Supabase API. Non-loopback browser
HTTP requests were blocked. These are automated local Chrome results, not
physical-device production acceptance.

| Case | Result |
| --- | --- |
| Normal leg, one folder | Concealed before DROP; correct authorized map; folding stack visibly dissolves; staying stack stays opaque; leg result appears. Continuation limitation described above. |
| Winning leg, one folder | Live decisions cleared; authorized exact-round snapshot drives dissolve; result completes; app reaches `game_selection`. |
| Winning leg, multiple folders | Both folding stacks dissolve; staying stack remains correct; winning result completes; app reaches `game_selection`. |
| Winning result/reset | Reveal overlay and old cards disappear; current round and reveal snapshot are null at dealer setup. |
| Concealment | Browser frames contain no opponent choice before server DROP; correct map arrives only afterward. |

Screenshots were visually inspected during DROP, after DROP and at completed
dealer setup. Folded ordinary backs did not repaint in the captured result
states. No uncaught page exception occurred. Existing router, initial
stale-render diagnostic and render-time state-update warnings were retained;
they were not investigated as part of this release.

## Regression and scope review

Focused secure-357 suite: **214 tests / 23 files passed**. The targeted Run21
retry passed **9 tests / 1 file**, including both tests that timed out once in
the full repository run. The prior release log also records those exact tests
passing before this candidate. Their full-run timeouts are therefore
non-reproducing suite-load timing, not candidate-caused failures; no baseline
comparison or product change was needed.

The final typecheck passed. The harness suite passed **241 tests / 12 files**,
and the production Vite build passed. The full source run reached **1,910 / 1,912**
tests with only those two Run21 timeouts; the focused retry and preserved prior
release evidence classify them as non-candidate timing failures.

The resolver diff adds snapshot capture and routes terminal settlement through
the private copy of the existing settlement owner. Financial calculations are
unchanged. Shared frame/history/entry-point changes are limited to the 3-5-7
concealed interval. No auth/session client, unrelated game, dependency, lockfile,
Start Game, countdown-duration or continuation-owner change is included.
Exact identity checks, stale-map reset and migration transaction/order are
included in the focused review. The generated CLI cache remains untouched.

## Candidate files

- `supabase/migrations/20260924164708_three_five_seven_private_disclosure.sql`
- `supabase/tests/three_five_seven_authority_rollback_proof.sql`
- `.codex/scripts/three-five-seven-disclosure-local.mjs`
- `src/components/ThreeFiveSevenDecisionReveal.tsx`
- `src/lib/threeFiveSeven/decisionReveal.ts`
- `src/lib/threeFiveSeven/decisionReveal.test.ts`
- `src/lib/gameLogic.ts`
- `src/pages/Game.tsx`
- `docs/codex/CURRENT_RELEASE.md`
- `docs/codex/DECISION_LOG.md`
- `docs/codex/REPO_MAP.md`
- This qualification report.

## Future deployment order and rollback

No production operation is authorized by this qualification pass. For a later
approved release, coordinate a window with no in-flight 3-5-7 rounds, apply the
single transactional migration after existing base migrations, publish the
matching frontend, verify its manifest SHA, and refresh clients before new
3-5-7 play. Old clients depend on direct rows now hidden during disclosure;
old in-flight rounds cannot be retroactively given a truthful immutable map.

An error during migration rolls the transaction back. After application, do
not blindly revert readers/grants or remove snapshots: that reopens the known
early-disclosure paths and loses reveal evidence. A frontend rollback must be
paired with stopping 3-5-7 play or a compatible forward correction while
retaining the server boundary and private data. No rollback was performed.

## Local evidence

Ignored artifacts remain under `test-results/secure-357/`: `ab-classification.json`,
`ab-baseline.private.json`, `ab-candidate.private.json`, `browser-final-summary.json`,
`browser-ab.mjs`, screenshots, `authority-qualification.sql/.log`,
`security-cases-summary.json`, private network payloads, prior baseline SQL logs,
`migration-focused-review.diff`, and final regression logs. Earlier cold-start
and expired-fixture failures remain separately labeled; neither is used as the
controlled gameplay comparison.
