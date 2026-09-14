# Replay contract implementation checkpoint — September 13, 2026

## September 14 phase three — latest checkpoint

The current bounded phase started at 17:40 UTC; its hard stop is 18:15 UTC.
The absolute latency budgets supersede the percentage-based failure conclusion
below: added p95 <=10 ms for ordinary/compound/reveal actions and <=50 ms for
scoring/settlement/terminal actions. Percentages are diagnostic only. Outliers,
contention, query amplification and session-length growth still need assessment.

Gin now has transactional capture adapters for 17 shared authoritative owners,
frozen participation facts, ordered discard/layoff/scoring/transfer/closing
substeps, dealer draw rounds, and historical dealer-card projection. Forty actual
database exports pass offline reconstruction, exact score/financial reconciliation,
historical privacy, and removal of mutable gameplay rows. Qualified newly opened
hands can issue `gin-replay/1` complete **hand** seals. Older contexts remain
partial; parent sessions remain `hand_boundary`, never `session_genesis`.

The final closing optimization removes redundant replay-context updates at close.
The durable closing row remains the atomic checkpoint; shared events retrieve it
using one reverse primary-key lookup and the round primary key. There is no
asynchronous correctness path or live replay subscription. The 40 proofs pass
after this change. See `GIN_REPLAY_QUALIFICATION_20260914.md` for the final latency
result and any remaining qualification limits. No other game or replay UI was built.

An unrelated existing forced dealer-tie harness fails because it unions a double
precision ordinal with the bytea returned by `secure_shuffle_key()`. The normal
authoritative dealer draw was exercised successfully; no harness fix is included.

All SQL is still qualification material under `supabase/tests/replay`; no
production migration, enrollment or application publication is authorized by a
passing individual hand proof. The cross-game rollout remains deferred.

Status: incomplete local draft; updated September 14 after the database/Gin
qualification phase. Jeremy approved the additive cross-game replay extension,
including an isolated benchmark branch at $0.01344/hour. Draft migrations were
applied only to disposable databases. No production migration, application
release, commit, push, or production-data change occurred. Approval of the
feature remains recorded; this document is not a completion or release claim.

## September 14 Gin-only phase two — success condition NOT met

Jeremy requested one bounded Gin-only phase, with complete capture, historical
export, committed latency measurement, and no migration of another game.
Phase started 15:38 UTC; the 35-minute boundary is 16:13 UTC. Production remains
unchanged. No replay migration was placed in the production migrations folder,
and nothing was committed or pushed. The reusable pattern is **not qualified**.

### Implemented and proved in this phase

- Moved card-face expansion out of gameplay transactions. The private journal
  retains actual raw Gin state, a random per-hand identity catalog, and explicit
  historical visibility grants. Export converts these to opaque card occurrences
  with only historically permitted faces. No hidden information is discarded.
- Added versioned Gin state/export helpers in `gin-completion-v1.draft.sql` and
  `gin-export-v1.draft.sql`. Active play remains one append with lossless deltas;
  closing adds a necessary full ending checkpoint to that same row.
- Added exact terminal transfer capture at the legacy financial owner and
  balance reconciliation against actual players at close. Nested settlement
  contributes to its enclosing action's row. Unrecorded financial changes abort
  capture/gameplay atomically instead of producing a misleading closing state.
- Generated instrumentation for six existing Gin owners: initial start, action
  core, legacy settlement, settlement wrapper, continuation, and postgame.
- Authenticated export authorizes against the opening's recorded roster, never
  current membership. The SQL export reads only replay rows; it has no game,
  round, player, profile, current-rules, or RNG lookup.
- Twelve exported packages (void, scored, and terminal; public and both recorded
  participants) reconstruct offline, reconcile scores and the exact 73-chip
  terminal transfer, and expose no private catalog or ungranted faces. Opening
  hand/stock faces stay hidden despite later reveals.
- The SQL proof temporarily deletes the synthetic game's live game, round, and
  player rows. Export remains identical. The proof rolls the deletion back.
  Outsider export rejection, duplicate settlement, continuation opening, and
  duplicate continuation pass. Thirteen focused tests and TypeScript pass.
- Defined the replay game envelope to exclude live transport fields:
  `authority_revision`, `chip_transfer_cursor`, `pot_transfer_cursor`, plus the
  enrollment marker. Inspection proved deferred settlement changes only the
  first two after the closing checkpoint. These route live snapshots/transfers;
  replay uses its own sequence and exact financial edges. All game/financial
  values remain in the comparison. Round and remaining game fields compare to
  their authoritative committed values in the tested cases.

### Complete-transaction benchmark

Used the installed PostgreSQL client against the disposable PostgreSQL 17.6
database. A top-level procedure alternates enabled/disabled order by sample,
prepares each fixture outside timing, invokes the authenticated public Gin RPC,
executes a real COMMIT, then stops the timer. COMMIT includes deferred financial
ledger work; `synchronous_commit=on` and `fsync=on` were verified. This measures
the server RPC plus commit, not HTTP transport or client rendering. Both arms
use identical instrumented owners with enrollment disabled/enabled, as requested.

Three runs were retained. The final run uses the final measured capture/writer
definitions: 30 samples per arm/category, first three discarded for warm-up,
27 retained. Percentiles interpolate the ordered samples. Scoring/game rules
were not optimized or refactored. The observed final results are:

| Action | Disabled p50/p95 ms | Enabled p50/p95 ms | p50 increase | p95 increase |
| --- | ---: | ---: | ---: | ---: |
| Ordinary | 5.698 / 7.334 | 7.124 / 9.347 | +1.426 ms (+25.0%) | +2.013 ms (+27.4%) |
| Compound | 6.507 / 8.064 | 9.307 / 13.616 | +2.800 ms (+43.0%) | +5.552 ms (+68.9%) |
| Reveal/void | 6.245 / 8.160 | 9.589 / 12.230 | +3.344 ms (+53.5%) | +4.069 ms (+49.9%) |
| Scoring | 132.843 / 167.340 | 144.432 / 172.013 | +11.589 ms (+8.7%) | +4.673 ms (+2.8%) |
| Settlement/terminal | 138.779 / 179.926 | 146.050 / 222.712 | +7.271 ms (+5.2%) | +42.786 ms (+23.8%) |

There is visible between-run variation, especially in scoring/terminal tails;
the sample size does not justify attributing every tail difference to capture.
Ordinary, compound, and void increases persist across runs. The no-material-
regression gate fails. Moving face expansion out reduced the earlier void cost,
but did not qualify the implementation. Do not describe these results as a
performance pass, and do not change unrelated scoring logic to improve them.

### Remaining Gin blockers

1. Mid-hand shared session mutations (pause/resume, end requests, participant
   intent/departure/seat changes, independent financial actions) do not yet have
   complete Gin-scoped journal coverage. Closing snapshots cannot substitute
   for the missing ordered source events. This work would touch shared owners
   with Gin-only recording admission; it is not migration of another game.
2. Compound knock/layoff/scoring/settlement needs the remaining explicit ordered
   semantic substeps. Final state and exact finance reconstruct in tested cases,
   but that does not prove every intermediate transition requested by Jeremy.
3. Positive standalone settlement, bot/deadline/recovery attribution and the
   newly added postgame writer need direct qualification. The present proof
   verifies nested terminal settlement and duplicate settlement, not all of
   those additional paths. Continuation opening/dedupe is proved; the full
   continuation/dealer/session lifecycle is not.
4. All closing records remain `partial`, and the append helper still refuses
   complete seals. The database reported **zero complete seals**. Do not enable
   seals until writer coverage and failure/late-replay proofs are complete.
5. Further measured capture optimization is required. The remaining overhead
   is in delta/envelope construction, transactional recording and close work;
   a detailed attribution has not yet isolated their individual contributions.
   No shared-game rollout or production deployment is justified.

The previous Gin pilot is therefore insufficient as a reference migration:
it covers actions but not all lifecycle writers, and its hot-path overhead has
not met the hard requirement. The next bounded unit should isolate and reduce
the measured recording overhead before expanding the unfinished writer set.
Existing approval remains in force; no new approval is needed for that scope.

Evidence: `artifacts/replay-baseline/gin-phase-two-commit-benchmark.json`,
`gin-phase-two-final-export-proof.json`, and the versioned SQL/proof files in
`supabase/tests/replay/`. `verify-gin-export.mjs` consumes the saved export with
no network or database dependency. Earlier samples are retained separately.

The phase-two temporary branch `replay-gin-complete-qualification`, project
`ojhnvveahsplepidkvan`, branch ID `f0521521-9d4d-48d9-8914-9e047ba08721`, was
deleted successfully, including its committed synthetic benchmark sessions and
temporary database login. The local connection credential file was deleted.
Scheduled jobs stayed disabled and replay tables were absent from Realtime.
Do not reuse the deleted project or the old connection guard in `run-psql.mjs`.

## September 14 database/Gin qualification

Implemented locally and exercised against a restored disposable database:

- `supabase/tests/replay/journal-v1.draft.sql`: two private, append-only tables;
  one global bigint sequence with CACHE 1; private append/diff helpers; explicit
  enrollment marker on games; Gin's private round context with frozen config,
  roster/user identities, opening balances and random per-hand card identities.
- `gin-writers-v1.draft.sql`: instrumented initial opening and Gin action core.
  Existing authorization, source identity and stale-count guards remain ahead
  of recording. The existing private-state read also loads replay context;
  ordinary capture does not query historical rows or aggregate live tables.
- Opening snapshots include full private Gin state. Active play stores compact
  lossless deltas; card occurrences carry historical audience grants. Card IDs
  and replay metadata never enter gameplay card values. No client recording
  calls, live journal subscriptions, or visual replay UI were added.
- The second opening pass and automatic stock draw are separate ordered
  substeps in one appended row. The intermediate pass state is an explicit
  semantic checkpoint inside that compound action, not another database commit.
- SQL proof captures a stock-exhaustion void hand and a normal knock/scored
  hand. Both use authenticated public RPCs and synthetic users only. It checks
  duplicate opening, stale retry, unauthorized actor, one append per action,
  compound ordering, append-only enforcement, rollback of a preceding chip
  mutation after a duplicate journal source, and refusal of a complete seal.
- `verify-gin-capture.mjs` reconstructs the actual captured prefixes completely
  offline and compares their exact represented ending states. Public and both
  participant projections also reconstruct exactly. Hidden stock and opening
  hands remain hidden despite later public hand grants.
- Ten SQL-generated delta cases apply identically in the TypeScript applier.
  Thirteen focused TypeScript tests and the application TypeScript check pass.

This is still **pilot_partial**, not complete Gin hand/session coverage. The
append helper deliberately refuses complete seals. The represented state keeps
the session/round envelope frozen at opening: later envelope mutations,
settlement balances, next hands, and session lifecycle events are not captured
yet. The exact-state proof covers private Gin game state, represented opening
balances and score changes; it is not proof of full authoritative ending state.
Bot/deadline origin attribution and all compound knock/layoff/scoring semantic
substeps still need instrumentation. No public/authenticated export RPC exists;
`visibilityV1.ts` is a pure projection primitive, not an authorization boundary.

### Diagnostic performance — not the deployment benchmark

Twenty samples per category, same temporary database. Baseline used the original
Gin writer definitions, before writer instrumentation; the extra unused schema
was already present. Measurements time the RPC body inside a rollback proof.
They exclude COMMIT/deferred settlement and transport and do not establish
production p50/p95. Baseline and candidate runs were sequential, not interleaved;
these results do not support claims that scoring or p95 became faster.

| Gin action | Baseline p50/p95 ms | Final pilot p50/p95 ms |
| --- | ---: | ---: |
| Ordinary opening pass | 4.446 / 7.747 | 5.568 / 6.600 |
| Second pass + automatic draw | 5.973 / 7.735 | 8.711 / 10.999 |
| Stock-exhaustion discard + public reveal | 5.955 / 8.403 | 14.179 / 15.663 |
| Finish layoff + scoring | 219.891 / 320.255 | 216.498 / 231.439 |

The initial prototype converted the entire card state before/after each action
and measured 17.765 ms median for the ordinary action. The current implementation
first diffs already-loaded raw authority and converts only changed operands.
It also excludes unchanged object keys from recursion. This reduced ordinary
recording cost substantially, but ordinary/compound/reveal regressions remain.
**Performance is not qualified; do not deploy or extend this pattern unchanged.**
Investigate representation/visibility conversion costs before wider rollout.
The full committed benchmarks for all required categories, including simultaneous
decision resolution and financial terminal settlement, remain outstanding.

Evidence is retained locally under `artifacts/replay-baseline/`: captured proof,
SQL delta proof, original/final timing samples, and owner-definition hashes.
The temporary branch `replay-gin-qualification`, project `nrvegvzzymbvvbrnimcx`,
branch ID `dcde38f6-ea12-440f-8b19-565c18a28ef9`, was deleted successfully.
Before deletion, verification showed zero remaining gameplay rows, journal rows,
synthetic auth users or active scheduled jobs. Anon/authenticated/service_role
had no direct journal read/write/append permission, and no replay table belonged
to Realtime. Its restored baseline matched both original Gin owner hashes.

Next bounded phase: resolve the measured capture overhead and complete Gin's
closing/settlement/continuation/lifecycle coverage before adopting the pattern
in another game. Preserve all legacy/parent-session partial markers.

## September 13 starting draft

- Worktree: `C:/Users/jerem/Desktop/poker/rule-your-poker-replay`.
- Branch: `codex/replay-contract`, based on `d80add201`.
- `src/lib/replay/contractV1.ts`: draft versioned data types, deterministic
  set/remove/splice application with preconditions, bigint sequence handling,
  transfer/score reconciliation, checkpoint and ending-state verification.
- `src/lib/replay/contractV1.test.ts`: nine passing synthetic contract tests.
- Application TypeScript check passes.
- `supabase/tests/replay/export-baseline.sql`: read-only current-schema export
  for restoring a disposable qualification database. Not a production migration.
- `artifacts/replay-baseline/functions.json`: inspected authoritative owner
  definitions, retained locally as investigation material, not a new authority.

At that checkpoint, the applier had no database writers or exporter. The
September 14 section above supersedes that state. Full runtime input validation,
game-scoped counter lifecycle, complete privacy/auth export, and cross-game
proofs remain. The synthetic tests alone do not establish replay readiness.

## September 13 benchmark environment work

The temporary branch `replay-contract-benchmark`, project
`unsqyzatnknbvmpxmcrn`, branch ID
`d34dfd7e-975f-453b-977c-46b5fd513b4d`, failed automatic migration replay at
`20260706213441`: historical SQL refers to production-specific cron job IDs.
Its scheduled jobs were disabled before any gameplay fixtures were created.

A current-schema restoration was subsequently applied only to that branch.
After correcting export dependency handling (function terminators, constraint
triggers, standalone unique indexes before foreign keys), comparison showed:

- 77 public/private tables on both databases.
- 226 indexes and 260 constraints on both databases.
- Identical ordered function-definition hash:
  `a6658a5755a49a0d77f5d654c41e6da7`.

These checks are not a complete environment qualification: schema ACL and
configuration/fixture checks, publication membership, and actual authenticated
RPC runs still need qualification. No p50/p95 latency measurements were taken.

The temporary branch was deleted successfully when this run stopped. Do not
reuse its project ID or claim the database remains available. No production
rows were copied and no benchmark gameplay fixtures were created.

## Outstanding approved work

1. Finish the frozen replay-state, visibility, source identity, and closing
   contract. Preserve existing human-readable history and legacy partial flags.
2. Implement private stream/step tables and compact transactional append helpers.
   Establish ordering under existing session locks; avoid an extra call to the
   table-aggregating `private.session_authority_revision`.
3. Instrument authoritative opening/action/automatic/continuation/terminal
   writers in all seven games and shared session/roster/configuration owners.
   Capture operands and actual outcomes before private-state redaction.
4. Record economic edges at `settle_gameplay_chip_transfers` and individually
   instrument owners that write balances directly: Holm start/settlement,
   Gin/Cribbage/Yahtzee settlement, Horses payout/rollover, and 357 leg/sweep
   settlement. Do not reinterpret net ledger pairing as original transfers.
5. Capture meaningful intermediate compound substeps, including Cribbage scoring
   and automatic turn/phase changes, rather than just the final published state.
6. Build the privacy-safe historical exporter and prove offline reconstruction
   from actual newly played fixtures with live/database lookups disabled.
7. Benchmark unchanged authoritative RPCs versus the extension in a matched
   disposable environment, including transaction commit and deferred ledger
   work: ordinary action, simultaneous resolution, scoring, and settlement.
   Report p50/p95 and contention effects; optimize sustained material regression
   before deployment. A disabled recorder on instrumented functions is not an
   unchanged baseline.
8. Only after complete cross-game and performance qualification: final review,
   production migration, integration/commit/push, publication verification.
   No visual replay UI is in scope.

New-hand capture in older sessions must keep the parent session partial.
Post-settlement reveals are legal in 357, including an ended session: later
legal changes require an appended closing revision, not a rewritten prior seal.

Suggested next bounded phase: finish and database-prove the recording contract
with one authoritative game path before extending the remaining writers. Keep
production recording disabled until the entire approved acceptance gate passes.
