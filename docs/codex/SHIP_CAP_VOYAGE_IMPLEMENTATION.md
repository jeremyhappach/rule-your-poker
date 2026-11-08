# Ship Cap Voyage / 1 — approved release, November 7, 2026

Implemented on `codex/ship-cap-voyage`, based on `origin/main` at `e4b930712`.
The separate worktree preserves the original checkout's unfinished Golf work.
Jeremy approved production publication after the local preview. Migration
`20261108000024_ship_cap_voyage_arcade_v1.sql` is installed with admission closed
until matching client publication. Candidate and installed production rollback
proofs pass, including financial isolation. Recovery worker v22 preserves the
exact deployed v21 code plus one Ship Cap Voyage dispatch line. Its packaged
entrypoint passes dispatch, authentication, no-action and rejected-replay checks.
No multiplayer or financial gameplay changes are included.

## Rules and ownership

The ZIP's README, GAME_RULES and QA_ACCEPTANCE were read before implementation.
The approved 1920×1080 lobby PNG is used unchanged. The functional reference
contact sheet guides the gameplay; no cinematic or older concept images ship.
See [frozen rules](SHIP_CAP_VOYAGE_RULES.md) and the
[supplied acceptance checklist](SHIP_CAP_VOYAGE_ACCEPTANCE.md).

`supabase/ship-cap-voyage/rules.sql` is the versioned server rules owner. Five
unbiased cryptographic dice qualify 6 → 5 → 4 sequentially, preserving the physical
locked indices. Cargo always rerolls both remaining dice. No randomness is drawn
on admission, a refresh, Continue, Bank, or recovery. Every round allows 12 rolls.
The same private quote function supplies bank arithmetic and the client display.
Three banks are mandatory; incomplete rounds forfeit all provisional points.

`arcade.sql` adds a service-only RPC through the existing Arcade start, row lock,
revision CAS, fingerprinted command receipt, immutable result and leaderboard
owners. No new persistence tables, sessions, stakes or balances are introduced.
Deployed Horses Blitz's RPC and the actual registration anchors and unique
indexes were inspected read-only. Registration stages `ship-cap-voyage/1` disabled.

Identities are run UUID, `run:round`, revision and request UUID. Equal-revision
snapshots must be semantically identical. The hook retains uncertain requests for
exact replay, suppresses recovered presentation and never generates an action
from a lifecycle callback. Manual waiting states have no gameplay clock or due
deadline. Zero-client recovery initializes an empty first round; it cannot roll
or skip a round. The third bank/final zero atomically persists completion before
any client presentation.

The client reuses Quintzee dice/pips/motion timing, approved cup/landing audio,
the platform audio manager, boxing bell and round artwork, TriTowers' score pill
and tally timeline, standard score-count audio, Abandon confirmation, and Arcade
leaderboards. Local motion only holds presentation and input. Interrupted audio
and haptics retire. A new roll cancels the preceding landing sound so audio
priority cannot suppress the new cup shake. Navigator vibration honors the saved
`use_haptic` preference on supported browsers.

All rounds start manually. Continue retains the round result until chosen.
After the third tally, a persistent three-round scoreboard counts the grand total
and waits for Play Again or Back to Arcade (the game's existing leaderboard).
Reload restores that scoreboard without submitting or replaying sounds.

The shared tile owner receives optional dimensions and embedded-info geometry.
Its defaults preserve every existing catalog tile. Ship Cap Voyage's baked-in
gold icon receives a minimum 44px accessible target; the separate drawn icon is
hidden for that artwork only. Subsequent admin artwork replacements retain the
ordinary shared info button.

## Validation evidence

| Boundary | Result |
|---|---|
| SQL rules | Candidate rollback and installed-local rollback pass. Sequential/no-double-use locks, all base values, snake eyes, 12-roll cap, partial locks, late/no qualification, third bank on roll 12, all-or-nothing, exact 1,405 example. |
| Authority | Owner and service-only access, disabled admission, one active run, duplicate/stale/conflicting requests, late replay after successor, unranked abandonment, final reload and zero-client initialization pass. |
| Atomic completion | Injected result-write failure rolls back result and command receipt; successful completion produces exactly one immutable result. |
| Financial isolation | Transaction statistics assert zero writes outside the existing Arcade tables. |
| Concurrency | Independent connections prove start deduplication, one winning roll revision, same-request replay and one winning bank. |
| Client/service tests | 66 focused tests pass, including manual mount/reconnect, synchronous tap serialization, exact uncertain-command replay, input validation, existing HTTP auth and catalog/layout regressions. |
| Browser → service → SQL → UI | Three complete rounds, 9 manual rolls, 3 bells, 9 cup shakes, 9 landings, rapid taps, mute, completed reload, Play Again and Abandon pass. Zero browser errors. |
| Responsive | Gameplay and final screen checked at 320×568, 390×844, 412×915, 844×390 and 1280×720. Row collision, viewport overflow, controls and supplied 16:9 tile/info target checked; screenshots visually inspected. |
| Compilation | Application TypeScript and Vite production build pass. Existing bundle-size/Browserslist warnings remain. |

Browser evidence uses local substitute authentication/realtime and deterministic
dice for repeatability, with the real service, SQL rule core, receipts and result
tables. The interactive preview uses normal cryptographic dice. It is not a
hosted-authentication or physical-device test. Screenshots and evidence are in
`dev/ship-cap-voyage/evidence/`; raw local runs remain under
`qualification.local/ship-cap-voyage/`.

## Reproduce and preview

Dependencies and the existing loopback PostgreSQL on port 55439 are reused;
nothing was installed. `dev/quintzee/database.mjs` enforces loopback access.

1. `node dev/ship-cap-voyage/setup.mjs <qualified-local-Arcade-template>`
2. `node dev/ship-cap-voyage/proof.mjs` — rollback proof, local installation, proof again.
3. `node dev/ship-cap-voyage/races.mjs`
4. `node dev/ship-cap-voyage/browser.mjs`
5. `node dev/ship-cap-voyage/browser.mjs --preview`

The preview is `http://127.0.0.1:15380/arcade/ship-cap-voyage` and uses a synthetic
local account. The server rolls that account's transaction back when stopped.

## Publication and owner smoke

The migration was installed through Supabase's migration API; its server-issued
version is recorded in the repository. All proof fixtures rolled back. The
worker packaging script rejects any change to the qualified v21 baseline.
Checkpoint `ship-cap-voyage-v1-2026-11-07` records the release commit; the subsequent
verified tag records exact production publication, release signal and admission
activation. `dev/ship-cap-voyage/hosted-smoke.mjs <sha>` checks both production
aliases, real authenticated leaderboard access, the mobile tile/Rules control
and Play surface without starting a production game. Its screenshots and receipt
are stored under `qualification.local/ship-cap-voyage/production/`.
Disable only `ship-cap-voyage/1` in `private.arcade_rulesets` to close new admission
without affecting other games or interrupting pinned active runs.

Physical iPhone PWA and Android checks are still required: actual speaker/cup
sound quality, supported vibration, saved Haptics off, Sounds off/on, screen
lock/resume, backgrounding during roll/tally, and safe-area/touch comfort. Desktop
emulation does not establish those results. Vibration is capability-dependent;
there is no new native iOS haptics bridge or gamepad actuator integration.

Owner smoke: open Rules through the gold tile icon, play all three rounds, wait
before every first roll and after a bank, verify the bell at each opening, inspect
the round tally, then leave and reload the final scoreboard. Use Play Again or
Back to Arcade explicitly. This physical-device review remains owner acceptance.
