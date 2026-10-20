# Trip Flip qualification — 2026-10-19

Approved complete Arcade and head-to-head release. Rule identity: **trip-flip/1**.
Checkpoint: **trip-flip-v1-2026-10-19**. Physical iPhone production acceptance is
pending Jeremy's smoke; automated qualification does not substitute for it.

## Scope and authority

[Frozen rules](TRIP_FLIP_RULES.md) record the exact movement, Joker interpretation,
Special target, dot rounding and completion decisions. The SQL reducer in
supabase/trip-flip/rules.sql is shared by both adapters. React displays server
legal moves and timestamps; it does not decide scoring, stock order or settlement.
Multiplayer is exactly two players, independent boards, P1R1/P2R1/P1R2/P2R2.
Canonical ante consent, actual player chips, ledger transfers, snapshots and
postgame continuation remain the existing owners. Arcade never mounts them.

The candidate was qualified before migration with admission closed. Production
migration 20261020010634_trip_flip_shared_v1 then installed the same candidate,
guarding five shared function hashes against concurrent changes. A second full
rollback proof passed against the installed functions and confirmed no synthetic
Trip Flip matches/runs remained. Activation is a separate explicit release step
in supabase/trip-flip/activate.sql after client and recovery-worker publication.
Recovery worker arcade-recovery version 9 is ACTIVE, with its existing body-token
authentication. Take 2 main commit c4e050d152baf62f97a4ccf2c30bb5326b58355a was
incorporated conflict-free before final qualification; its presentation changes
and authoritative branches were preserved. Catalog migration 20261020011345 adds
only the Trip Flip artwork row/path while retaining active-admin upload checks,
existing rows and RLS; installed metadata/guards were read back successfully.

## Executed evidence

- Core SQL: every legal source/destination class, source identity/order, buried
  extraction, same-column moves, capacity, occupied cells, fan replenishment,
  all natural ranks/suits, one/two Jokers, Ace low, exact Special order/once-only,
  suited stacking, exhaustion versus empty stock, and 62 dot boundary fixtures.
- Financial SQL: winners and ties in fake/real modes; real canonical player-chip
  changes (105/95 or 100/100), balanced ledger, one settlement batch, two final
  snapshots, immutable result, duplicate/conflicting/stale/unauthorized actions,
  late replay after continuation, private-function denial and terminal recovery.
- Independent PostgreSQL connections: competing revisions, duplicate moves,
  simultaneous final clear/settlement, exactly one result/ledger batch, and an
  injected failure after actual chip writes rolling back all settlement effects.
  Executed in both fake and real modes with 9-chip stakes (91/109 balances).
  Canonical settlement/consent function hashes matched deployed definitions.
- Arcade: duplicate commands and timeout races, two-round zero-client completion,
  one immutable result, durable receipt/reload, and no multiplayer/financial writes.
- Bots/pause: explicit ante consent, deadline shift without extra active time,
  no duplicate bot advance, 20 random autonomous rounds and cross-mode parity.
- Actual Chromium/Edge browser with local SQL authority: fan → column → Flip cell,
  immediate selection, reload, both Arcade rounds and leaderboard, two human
  multiplayer clients plus observer, four complete turns and terminal continuation.
- Audio: trusted clicks through Arcade → multiplayer → Arcade; each mode scheduled
  63 oscillators and retained one running shared AudioContext. This is desktop
  Chromium evidence, not physical iOS audio proof.
- Layout: 77 cases covering eleven scenes (ready, partial, cells, full, Special,
  round end, Game Over, active multiplayer, observer, two-player pills, Rules).
  Viewports: 320×568, 390×844, 430×932, 844×390, 390×664, 120% text at 390×844,
  and simulated 47/34px safe-area insets. Assertions cover whole-viewport score
  centering, scoreboard overlap, card aspect ratio, board bounds and page overflow.
  Screenshots reviewed for both portrait widths and compact landscape. Rules
  screenshots wait for the shared drawer animation before capture.
- Full npm run build after latest Take 2 integration: typecheck, **361 app files / 2,524 tests**, **12 harness files /
  241 tests**, and Vite production build passed. Existing large-bundle warning
  remains. No dependencies installed.

## Reproduction

Existing local PostgreSQL qualification tools are prerequisites, not installed by
these scripts. Run from the repository root; PTOWN_QUALIFICATION_ROOT optionally
points to the primary checkout containing the existing template/pg dependency.
The database helper otherwise derives that checkout from Git's common directory.
All synthetic fixtures are confined to the isolated local qualification database;
production proof bodies execute inside BEGIN/ROLLBACK.

    node dev/trip-flip/core.mjs
    node dev/trip-flip/proof.mjs
    node dev/trip-flip/preview-setup.mjs
    node dev/trip-flip/concurrency.mjs
    node dev/trip-flip/concurrency.mjs --real
    node dev/trip-flip/serve.mjs
    node dev/trip-flip/browser.mjs
    node dev/trip-flip/layout.mjs
    node dev/trip-flip/audio.mjs
    node dev/trip-flip/release.mjs
    node dev/trip-flip/verify-release.mjs FULL_COMMIT_SHA

Ignored local artifacts: qualification.local/trip-flip/{build.log,browser.json,
layout.json,audio.json,concurrency.json,concurrency-real.json,layout/*.png}.
The server binds only 127.0.0.1 and uses isolated synthetic actors.

## Limits and production acceptance

No installed WebKit runtime was available. Actual iOS Safari safe-area behavior,
dynamic browser chrome, speaker/mute behavior and network latency require Jeremy's
device smoke. Insets and reduced height were simulated; automated touch viewports
are not physical-device validation. The catalog uses its existing artwork fallback.
Security advisors retain unrelated pre-existing findings; private Trip Flip tables
are intentionally inaccessible to clients and guarded RPCs own mutations.

On iPhone: play/rearrange/cell/bank both Arcade rounds, reload mid-round, inspect
Rules and final leaderboard/PB; rotate and try larger text; switch Arcade →
multiplayer → Arcade and check intro/clear/count-up sounds. In multiplayer, accept
stakes, observe the opponent/bot, pause/resume, finish, inspect chip changes, then
Run Back or end the session. Reconnect to an already-ended session and confirm
lobby admission. Report any visible/audio issue before marking the checkpoint stable.
