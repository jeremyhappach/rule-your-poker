# Race Poker qualification — production authority passed, admission closed

Approved `race-poker/1` is implemented on `codex/race-poker-v1`, based on
`a150cd6aecc746143f246186a8b46421d0534355`. The initial qualification below was local; the chronological release evidence at
the end records later authorization and installed production proofs. This does
not claim physical-phone acceptance or authorize money-mode activation.
Unrelated primary-checkout work and the Battle31 local server were preserved.

## Authority and financial evidence

The following commands passed against isolated local PostgreSQL database
`race_poker_1792534094806`, using actual canonical functions and chip triggers
from the existing local qualification schema. The production schema still needs
its own guarded rollback proof before installation.

- `node dev/race-poker/proof.mjs --financial`: rollback-contained scoring categories,
  high-card ranks, Wheel/Broadway and invalid wraps, duplicates, fresh unique packs,
  persistent choices, fifth-card no-refill, exact deadlines, zero expiry, paired
  turns, alternating starters, either actor crossing, equal final hands, overshoot,
  exact ties, cap and legal public-information-only bot policy. Both money modes
  prove offer/consent, canonical winner/draw balances, balanced ledger, results
  and final snapshots, original receipt replay including after continuation,
  authorization, frozen stake/roster/rules/money mode, pause and continuation.
  Final run: 2026-10-20, after the freeze assertions were added.
- `node dev/race-poker/concurrency.mjs`: independent authenticated connections in
  both money modes; duplicate/stale requests, conflicting identity, unauthorized
  actor, click/timeout races, immutable late receipts, concurrent settlement once,
  and rollback after injected failure following canonical chip writes.
- `node dev/race-poker/recovery.mjs`: durable strategic bot, competing recovery
  workers, pause/resume, policy evaluation crossing the deadline under lock, and
  zero-client progression through 32 hands, settlement and continuation.
  Final recovery run: 2026-10-20 22:08 UTC.

Bot strategy `race-poker-bot/1` receives only hand and exposed choices. Its 48
hypothetical continuations per choice never receive actual hidden order. The
command executor is the single authority for humans, bots and recovery.

## Browser and presentation evidence

`node dev/race-poker/browser.mjs` passed four browser-to-local-database boundary
scenarios at 2026-10-20 22:12 UTC: two-human fake-money winner, human/bot real-money
winner, and draws in both modes. These seed near-finish boundaries, then use
public authenticated actions, actual RacePokerTable, canonical chip transport,
balances and terminal handling. They do not represent four full browser races.

Checks verify lost-response retry with the same request identity, reload recovery
without duplicate cards or old audio, equal final hand/no early settlement,
no hidden deck/fifth-card refill, intermediate score count-up, exactly one chip
flight per winner and none for draws, canonical 105/95 winner balances versus
unchanged 100/100 draws, and completed terminal callback. Victory cues occur only
for winners. Cue routing was inspected, not physical speaker sound. The harness
uses a loopback-only allowlisted adapter and synthetic users; production transport
and actual phone audio remain production smoke checks.

`node dev/race-poker/layout.mjs` passed 40 scenes across 320×568, 390×844,
430×932, 844×390 and 390×664: play, pending, reconnect, pause, final hand,
result, terminal and rules. Short landscape uses the canonical board container's
aspect ratio to place choices and hand alongside each other. At 844×390 cards
are about 60 px tall and the track about 69 px, with two visible horses.
Screenshots were visually inspected. Toolbar-height and orientation resizing
were also exercised. Physical Safari readability and touch ergonomics remain smoke.

Client tests cover model validation, uncertain command retry, stale/conflicting
snapshots, recovery epochs, exact deadlines, cue admission, five/two-second
warnings, reduced motion, draw silence and editable setup stakes.
Final `npm run build` passed TypeScript, all 2,546 application tests (366 files),
all 241 harness tests (12 files), and the Vite production bundle on 2026-10-20.
React review confirmed stable component ownership, effect cleanup, canonical
container geometry and button-based legal actions; no broad refactor was made.

## Current-main catalog integration — local branch only

The isolated candidate now incorporates origin/main
`44dbd5a7d4de4635b258f731558fe346473d82b9` through a local merge, preserving
both histories and the lobby release documentation. The gameplay parent remains
`e0366f7b9a7e9ef874f5dd4f208ecad27827d27a`. Nothing was merged into main.

Race Poker has one typed catalog descriptor: multiplayer only, exactly two seats,
at least one human, bots supported, editable stake and existing Race capability.
Setup uses the catalog's discovered/eligible checks for selection, submission and
Run Back. The deleted legacy GameSelection component stays deleted. Main's
realMoney setup props and existing game entries remain intact.

The same RacePokerRules article serves gameplay and catalog Info. The descriptor
pins its frozen help version to race-poker/1; the shared help loader skips Arcade
requests for that explicit frozen contract and rejects unknown versions. All
other games retain their existing current/legacy version resolution.

Focused integration: 115 tests passed across seven files, including capability
closure, exact roster, one human plus bot in both money modes, defaults/stake
edits, explicit Ante Up despite saved auto-ante, exact Run Back, and existing
catalog/default/rule regressions. The broader suite result is recorded below.

`node dev/race-poker/catalog-browser.mjs` passed 34 checks: actual setup,
Ante Up, Defaults and Rules/Info at 320×568, 390×844, 430×932, 844×390,
390×664 and 1280×800; closed/invalid selection, exact Run Back with either
roster, and live orientation/toolbar-height resizing. Screenshots were inspected
at narrow portrait, large portrait and short landscape. This uses isolated mock
transport and explicitly seeded candidate defaults, not production state or a
financial proof. The existing live-SQL financial evidence above remains separate.

Local Supabase debug-event stubs were added to the browser fixture after its first
run stopped following an otherwise valid setup response. No product change was
needed for that fixture limitation. Rules and SQL authority/migration bytes were
preserved apart from extracting the unchanged help article into its shared file.

## Prepared migration and remaining production gates

`20261020190908_race_poker_v1.sql` is prepared but NOT applied to production.
It concatenates canonical-guard, rules, multiplayer, commands, registration and
deployment sources under supabase/race-poker. Admission and money qualification
flags start false. Recovery runs every second; realtime publishes only public
revision rows. Hash guards refuse stale canonical owner replacement; never bypass
a mismatch. Earlier read-only index inspection confirmed canonical settlement-key
and final-snapshot identity uniqueness.

After separate coordinated release authorization: verify then-current main compatibility; inspect
actual deployed owners/indexes; run complete rollback financial proofs against
that authority; install with admission closed; repeat installed proofs; publish
and verify the exact deployment; then activate only qualified money modes for the
approved-account cohort. No production gate is satisfied by the local clone.
There is no Race Poker production deployment URL at this checkpoint.

Jeremy's pending smoke: small/large iPhone orientation/toolbars, cards and Rules;
mute/unmute, card/hoof/count-up/five-and-two-second/victory cues; two humans and
human/bot; editable stake consent; equal final hand; reconnect; winner/draw balances,
Session Ended, fresh-ended reconnect and run-back.

Raw evidence/screenshots live in ignored qualification.local/race-poker. Reproducible
scripts are under dev/race-poker; the existing driver resolves from the Git common
checkout or RACE_POKER_PG_MODULE. No dependencies were installed. Local fixture
servers use separate Vite caches and ports 5226/5227.

Prepared migration SHA-256: `d0defb62498f619884a40d70f759c0fa4beff1ed5f498e26349b4f20188928c3`.

Detailed production sequence: [RACE_POKER_RELEASE_PLAN.md](RACE_POKER_RELEASE_PLAN.md).

## Integrated validation result — 2026-10-20

TypeScript passed on the integrated tree. The full application run passed 2,582
of 2,583 tests across 369 files; the existing Run21 three-round simulation hit
its 60-second timeout under the full run. The unchanged localAuthority.test.ts
then passed all 18 tests in isolation, including both three-round cases (about
25 seconds each). No Run21 source or test timeout was changed. This is recorded
as a full-run timeout resolved by isolated regression, not a clean first build.
All 241 harness tests passed and the Vite production bundle passed separately.
The focused catalog run passed all 115 tests; it used a 15-second test ceiling
for the loaded machine after initial lazy-module/defaults waits timed out.
Production code changes were not needed for those timing failures.

The 34 catalog browser checks passed at 22:36 UTC. This catalog integration
makes no SQL, migration, bot-policy or command-transport change from e0366f7b9.
Financial/authority proofs therefore remain the prior local evidence, and their
production gate remains MISSING until the coordinated release plan is executed.

The post-integration gameplay layout rerun also passed all 40 viewport/scene
checks on 2026-10-20. Both catalog and gameplay layout evidence therefore cover
the integrated source, including the shared Rules extraction.

## Closed-admission release attempt — 2026-10-20 23:12–23:20 UTC

Jeremy separately approved changing only the push helper directory line to
`cd /d "%~dp0..\.." || exit /b 1`; its installed-Git `git push origin main`
operation is unchanged. The correction is local and has not been pushed.

Candidate 3d676398598182ff37922afd19053f8ded7f1108 still contains main
44dbd5a7d4de4635b258f731558fe346473d82b9. Vercel production remained READY at
that main SHA (deployment dpl_4LKHDL3kx68J1wJvFFiC4nk2ZzBt, holm357.com).
No competing deployment was observed; other active game work was local qualification.
All five canonical guard hashes matched. Production migration head remained
20261020161756 (boxdrop_v1); Race Poker was absent.

A dedicated production-proof builder generates a repeatable-read BEGIN/ROLLBACK
payload using four synthetic user UUIDs, an existing-player balance snapshot,
the guarded candidate, core/financial proofs, and a scoped after-chip-write
failure injection. The installed-form wrapper and failure injection first passed
against the isolated local database. Concurrency/load tests stayed isolated.

The production candidate attempt FAILED with SQLSTATE 40001 at:
`UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'`.
That local-fixture heartbeat seed conflicts with the live recovery worker under
repeatable read. It must not manufacture production scheduler health. Execution
stopped at this statement, before synthetic users/games or financial writes.
No retry or migration application was attempted, following the stop-on-failed-gate
instruction. The pre-install financial gate remains FAIL, not qualified.

A separate read-only verification confirmed zero manifest users, profiles, players
and snapshots; zero Race Poker games/results; no Race release/match tables; no
failure-injection trigger; all five canonical hashes unchanged; migration head
unchanged. The live heartbeat was 0.440468 seconds old. Existing player balances
were not touched: the failure preceded every fixture/player/settlement statement.

Required correction before resuming: omit the heartbeat-seeding UPDATE from the
production wrapper and rely on the actual healthy production scheduler, retaining
all real-money liveness checks, short lock timeout, synthetic-only data and the
rollback envelope. Keep the heartbeat seed available to isolated local proofs.
Do not lower isolation, disable the worker, fabricate health, or weaken a gate.
This correction/retry is proposed, not executed. The raw failed payload and its
UUID manifest remain under ignored qualification.local/race-poker/.

No main merge, push, production migration, deployment, admission or money-mode
activation occurred. The four persistent release flags were never created.
Activation remains a separate decision only after the closed release and all
production gates pass, limited to qualified modes and the existing approved cohort.


## Authorized heartbeat correction and production retry — 2026-10-21 UTC

Jeremy authorized omission of the isolated-test heartbeat seed, local validation,
and a retry of the closed release, stopping on any failure and keeping all four
persistent flags false. The production builder removes exactly one known seed
and fails if its expected shape changes or any heartbeat DML remains. The local
financial fixture keeps its seed. No production scheduler-health check changed.

The corrected installed wrapper passed locally at 00:23:47 UTC in both money
modes; the heartbeat row was byte-for-byte unchanged across the proof. The local
database retained seven pre-existing qualification results; exact new synthetic
users/profiles/players/snapshots were zero after rollback.

Before production writes, all five canonical guard hashes matched; live recovery
was healthy. Main and the latest READY production deployment remained
44dbd5a7d4de4635b258f731558fe346473d82b9. The only other active game chat was
read-only release planning. The candidate production proof then passed: winner
105/95, draw 100/100, injected failure rollback 100/100, existing balance assertion
passed, no residual synthetic users/profiles/players/snapshots, no Race games or
results and no injection trigger.

The unchanged prepared migration SHA-256 remains
`d0defb62498f619884a40d70f759c0fa4beff1ed5f498e26349b4f20188928c3`.
Supabase installed it as version `20261021002421`, name `race_poker_v1` (the local
source filename retains `20261020190908_race_poker_v1.sql`). All 28 production
Race/canonical function hashes match the isolated qualification authority. The
local-only notification helper is not a production function. Private Race tables
have RLS and deny anon/authenticated SELECT; public revisions permit authenticated
SELECT only through participant-membership RLS. Realtime publication is present.
Cron job 49 runs every second with a three-second statement timeout; observed
runs succeeded.

The full installed-authority rollback proof passed again in both money modes,
with the same balances, failure containment and zero residuals. A subsequent
transaction under the authenticated role verified configure returns
race_poker:release_closed. All matches, receipts, history, revisions, Race games
and results are zero. Persistent enabled, admission_enabled, fake_qualified and
real_qualified are all false. No cohort/profile access was expanded.

Client publication and final closed-admission browser checks are the next stage.
No activation or physical-phone acceptance is claimed.
