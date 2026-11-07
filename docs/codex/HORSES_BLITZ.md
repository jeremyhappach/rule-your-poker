# First smoke correction — v2, November 7, 2026

Jeremy requested manual opening rolls, Quintzee's roll treatment and sound,
and a bell at the start of all three rounds. The observed production run was
active at its round-one timeout summary, with four banked hands and six
forfeits. No historical run was changed. The source already required round
three for finalization; full progression remains an explicit acceptance check.

V2 initializes every hand at roll zero with empty dice/holds. Roll (1) creates
all five dice; later rolls preserve held indices. The clock continues through
manual openings, rolls and banks. Existing v1 behavior remains dispatched by
the frozen config, and v2 scores have their own leaderboard version.

`useHorsesBlitzRoll` owns only local presentation and its synchronous input lock.
It starts Quintzee's rolling sound/motion together, uses independent transitional
faces, and keeps only unheld dice moving. A received third-roll bank remains
visible for its bank beat after settling even when recovery has already moved
the authoritative hand forward. Interrupted presentation is retired, not replayed.
Global Sounds remains owned by the existing audio manager. Live round identity
admits the canonical boxing bell; reloading a summary does not replay it.
The Horses-only bell policy shares the rolling priority, so an immediate Roll
(1) can sound alongside the bell instead of being suppressed by it. Other games'
audio policies are unchanged. The browser asserts one actual rolling cue per
animated roll, cancellation at settling, and silence while globally muted.

Migration `20261107211109_horses_blitz_manual_roll_v2` passes the complete local
and hosted candidate/installed v1 and v2 rollback matrices. Both versions retain
replay, authorization, continuation, tie, terminal atomicity and financial-write
isolation. Independent connections cover starts, banks, rerolls, timeouts and
Next Round races. Installed authority digest: `934d3e53938ff51453ea984ae607e601`.
The existing recovery dispatcher supports both versions without redeployment.

Browser smoke uses real pointer taps to unlock browser audio after reloads,
counts actual scheduled bells, and checks 30 non-forfeited hands, empty opening
areas, reroll masks, rapid taps, retained summaries, mute, lost acknowledgements,
leaderboard and six layouts. Its fixtures isolate authentication/realtime on
loopback while using the real Arcade API and installed SQL. Evidence is in
`qualification.local/horses-blitz/polish-browser/`.
The complete smoke passes, as do 61 focused tests, application TypeScript and
the production build. No tools or dependencies were installed.
Physical iPhone acceptance remains Jeremy's smoke. Checkpoint: `horses-blitz-manual-rolls-2026-11-07`;
the annotated `-verified` tag records client publication and activation.

# Horses Blitz / 1 — November 7, 2026

Jeremy approved a solo P-Town Original using the supplied three PNG references.
The lobby uses the original 1466 × 564 PNG without cropping or re-encoding, with
the canonical independent gold Rules control. The portrait reference governs
the charcoal/amber board, one dice row, three roll markers and bottom actions.
Existing sound and Abandon controls retain their platform behavior.

## Frozen rules

Three rounds of ten hands. Every hand begins with five new cryptographic dice.
On rolls one and two, select holds and Bank or reroll. Every 1 is wild. Only the
largest matching set scores; ties between matching faces do not change points.

| Set | Roll 1 | Roll 2 | Roll 3 |
|---|---:|---:|---:|
| Three | 390 | 225 | 90 |
| Four | 600 | 400 | 250 |
| Five | 1,400 | 1,000 | 650 |

Roll three banks automatically, including zero. Bank is unavailable without a
scoring set. A persisted 450 ms bank beat precedes the next fresh hand. The
100-second round clock continues during hands and bank beats. The tenth bank
freezes the scoring instant before its presentation beat.

Jeremy selected Take 2's timer policy: 50 points per complete second remaining,
awarded only on completing all ten hands. It is separate from the early-roll
awards. Timeout preserves banked points, forfeits unfinished hands and awards
zero timer bonus. Round total = base + timer bonus; game total sums three rounds.
Rounds one and two retain a durable summary until Next Round. No clock runs in
that summary. This explicitly requested continuation differs from the automatic
between-round behavior of older Arcade games. Round three finalizes atomically,
then uses standard Arcade completion/leaderboard presentation. Fresh completed
mounts go directly to the leaderboard. Abandon remains unranked.

## Authority and preservation

`supabase/horses-blitz/rules.sql` is the sole immutable v1 rule core. Future
incompatible rules require retained v1 dispatch and a new leaderboard version.
`arcade.sql` registers the game with existing start, lock/CAS, receipt, commit,
result and artwork owners. Identities are run UUID, `run:round`, `run:round:hand`,
revision and request UUID. The service-only step validates actor and recovery
token, catches up persisted deadlines first, then admits exact commands.
Unbiased secure dice are generated only on the server. No future rolls exist
in the client projection. Held indices are command intent; accepted rolls save
them, and every fresh hand clears them. The hook retains uncertain commands
for exact replay and rejects regressive or changed equal-revision snapshots.

Existing Horses, 357 Drop, all other Arcade games and historical scores remain
unchanged. No multiplayer/session/financial owner is mounted or written.
The optional native PNG source on the shared tile preserves its existing WebP
path for every other caller; all current Arcade catalog tiles use that owner.

## Qualification and release

- Local and hosted candidate/installed rollback matrices cover the supplied
  390/225/90 triple, every set tier, all/mixed wilds, no-set bank rejection,
  zero roll-three, holds, timer boundaries, timeout, owner/service gates,
  duplicate/stale/changed replay, rapid banks, three-round progression, retained
  summaries, duplicate Next Round, injected terminal failure, successor/late
  replay, unranked abandon, zero-client timeout, equal-score ranking and both
  leaderboard windows. Transaction-local counters prove no writes to other
  public/private application tables. Hosted proofs left zero Horses Blitz runs.
- Independent connections prove duplicate starts/banks, competing rolls,
  worker/action deadline races and competing Next Round commands.
- The exact recovery bundle proves token claim, Horses dispatch, timeout to a
  retained summary, completion of the worker batch and token replay rejection.
- The real Arcade route/API/SQL browser flow completes all three rounds at
  320 × 568, including sample holds, persisted accepted holds, lost bank
  acknowledgements, reloads, burst Next Round, total/leaderboard, mute controls
  and abandon cancel/confirm. Authentication and realtime subscriptions are
  loopback fixtures. Layouts also cover 375×667, 390×844, 667×375, 844×390 and
  1280×720. Screenshots: `qualification.local/horses-blitz/browser/`.
- 61 focused API, catalog, tile, switchboard and command-validation tests pass.
  Application TypeScript and production Vite build pass. Existing `tsc` is used
  because `tsgo` is unavailable; no tools or dependencies were installed.

Hosted migration `20261107202340_horses_blitz_arcade_v1` is installed on
`xvhmbuppghwmwpwrkzao`. The migration identifier was generated by the MCP
migration tool (the CLI is unavailable), then recorded locally. Installed
authority digest: `54e624009958e444207081cd80f97daf`. Worker v21 preserves the
downloaded v20 bundle and adds only Horses Blitz dispatch; exact source and
healthy heartbeat were verified. Admission remains closed until exact client
publication. `activate.sql` checks publication SHA, authority and worker health.
Checkpoint: `horses-blitz-v1-2026-11-07`; its `-verified` tag records publication.

Reproduce with the isolated loopback connector: `setup.mjs <template_database>`
creates a disposable clone of a current installed Arcade schema. Run
`proof.mjs --install`, `proof.mjs --installed`, `races.mjs`, `worker.mjs` and
`browser.mjs`. The worker test requires the verified release bundle at its
documented qualification path; it is prepared from downloaded deployed source.

## Owner smoke

On iPhone PWA: open Arcade and inspect the full badge, banner and Rules overlay.
Play three rounds in narrow portrait. Confirm gold wild 1s versus held outlines,
Bank's exact score, later-roll reductions, automatic roll-three banks and fresh
holds. Leave each round summary open, reload once, then tap Next Round rapidly.
Check timeout preserves banked hands and adds no bonus. Compare the final sum
with the leaderboard. Check sound/mute and abandon cancel/confirm. Physical
device acceptance remains Jeremy's smoke; automated qualification does not claim it.
