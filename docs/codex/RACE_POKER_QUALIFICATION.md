# Race Poker qualification — local candidate, coordinated release hold

Approved `race-poker/1` is implemented on `codex/race-poker-v1`, based on
`a150cd6aecc746143f246186a8b46421d0534355`. This is local qualification, not
production acceptance. No merge, push, production migration, deployment or
admission activation is authorized by the current coordinated release hold.
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

## Current-main compatibility — integration still required

Read-only comparison used origin/main
`44dbd5a7d4de4635b258f731558fe346473d82b9` (lobby catalog redesign).
This candidate was qualified on its isolated base, not a merged current-main tree.

The meaningful overlap is `src/components/DealerGameSetup.tsx`: main replaced
legacy option lists with GAME_CATALOG / DealerGamePicker. During coordinated
integration, add Race Poker to `src/lib/gameCatalog/types.ts` and `index.ts` plus
a descriptor: multiplayer only, exactly two participants, at least one human,
bots supported, Megatouch family, Other category, editable stake, race-poker
availability, owner smoke pending, lazy RacePokerRules. Add useRacePokerAccess to
setup's catalog availability map; retain catalog roster/money eligibility.
Do not restore obsolete setup lists.

Main deleted unused GameSelection.tsx; this candidate leaves it unchanged and
must not resurrect it. Main's two realMoney setup props in src/pages/Game.tsx
are separate from Race retention and must be preserved. Combine CURRENT_RELEASE,
DECISION_LOG and REPO_MAP additions without overwriting lobby release records.
Rerun integrated catalog/setup tests and build afterward. No merge/rebase occurred.

## Prepared migration and remaining production gates

`20261020190908_race_poker_v1.sql` is prepared but NOT applied to production.
It concatenates canonical-guard, rules, multiplayer, commands, registration and
deployment sources under supabase/race-poker. Admission and money qualification
flags start false. Recovery runs every second; realtime publishes only public
revision rows. Hash guards refuse stale canonical owner replacement; never bypass
a mismatch. Earlier read-only index inspection confirmed canonical settlement-key
and final-snapshot identity uniqueness.

After separate coordinated release authorization: integrate the catalog; inspect
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
