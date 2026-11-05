# Take 2 Async qualification — 2026-11-04

**Production enabled:** guarded activation passed at 01:40:26 UTC November 5.
Publisher retry `41947439166-2` succeeded for `cb04c67cb9d1d6efd6bd80d70d570b0414edba26`.
All 16 authority fingerprints and release/recovery checks passed. A separate
authenticated capability read confirms Take 2 is available with canonical /2
rules, 100 seconds, three rounds and all bonuses. Owner device smoke is pending.
Activation checkpoint: `release-async-take-two-activated-20261104`.

Approved scope: two authenticated humans, three corresponding identical-deck
rounds, alternating A1/B1/A2/B2/A3/B3. Jeremy explicitly retained the canonical
100-second clock and all speed/time bonuses. Equal totals produce a draw.
Existing Async invitation, money, 36-hour availability, review, notification,
archive and continuation owners remain authoritative.

## Ownership and preservation

- Admission freezes `take-two/2`; acceptance stores three private immutable
  52-card permutations keyed by child and round. Both players consume the same
  permutation through shared Take 2 dealing, reduction and projection.
- `private.take_two_board_from_deck` extracts the existing deal body;
  live/Arcade `take_two_board_deal` still supplies a random shuffle. Reducer,
  scoring, layouts, clock, ace pairing, draw cost, meter and clear/stock/time
  bonuses are unchanged. Historical v1/v2 remain supported.
- Existing `server/delayed` revision/request/segment guards own commands and
  recovery. Private decks/cursors never enter browser projections or reviews.
  Opponent boards are embargoed until the viewer completes the corresponding
  round, or the child is terminal. Begin/ack enforce the same boundary.
- Unchanged `private.delayed_finalize` owns settlement, canonical player chips,
  balanced ledger/account entries and immutable terminal receipts.
- `TakeTwoView` is reused for play and silent read-only saved reviews. Its footer
  grid row fits the allotted container when Async's header reduces height;
  Arcade/multiplayer callers retain the same geometry and defaults.

## Evidence

- Hosted candidate proof passed before migration; installed proof passed after.
  Both rolled back synthetic writes and checked baseline counts unchanged.
  Migration: `20261105011042_async_take_two_identical_deals`.
- 624 original/extracted deal comparisons: v1/v2, three stages, 52 rotated decks,
  two starting totals. Core proof covers identical deals, immutable deck ACL,
  timer/meter boundaries, pair/draw/bank/timeout and direct review embargo.
- 61 financial groups cover existing games plus Take 2 in both money modes:
  winner, tie, forfeit, duplicate/replay/late replay, authorization/stakes,
  continuation, terminal receipts and failure rollback through actual chip,
  ledger, account and snapshot constraints/triggers.
- Real service/SQL proof: both money modes, six rounds, concurrent start/bank/
  final-bank dedupe, stale/conflicting replay rejection, identical boards,
  hidden decks and exact winner chips. Separate proof covers zero-client
  gameplay timeout/availability expiry, archived configuration, last-viewer
  Run It Back, independent invitation and unchanged prior settlement.
- Browser: React → loopback HTTP → actual service → disposable SQL clone; six
  rounds, pair/draw, reload, review gate and selector; five viewports (320×568,
  390×844, 412×915, 844×390, 1440×900); no page errors. Realtime transport is
  stubbed in this fixture; route/action/SQL paths are real.
- App TypeScript, production Vite bundle, 297 focused tests and 241 harness tests
  pass. Full suite: 3793 pass, ten existing Mega/Golf defaults failures. Those
  exact failures reproduce on unchanged `origin/main`. Installed TypeScript was
  used because `tsgo` was unavailable; no dependencies were installed.
- One scoped read-only final review found no concrete defects.

Runners and compact receipts: `dev/async-take-two/`. Local database, browser
logs/screenshots and generated worker: ignored `qualification.local/async-take-two/`.
No synthetic production records remain.

## Release and acceptance

The earlier publication blocker below was resolved by rerunning the existing
failed job through the signed-in owner browser. The connector's rerun returned
HTTP 403 `Resource not accessible by integration`; no permissions or credentials
were changed. Attempt 2 passed both manifest verification and publication, after
which the prepared activation transaction committed. Recovery and real-money
liveness are healthy. See `dev/async-take-two/evidence/production.json`.

Runtime commit `cb04c67cb9d1d6efd6bd80d70d570b0414edba26` and checkpoint tag are
pushed. Vercel production `dpl_F9Hyk5BrKRiV1DsYdhGG9p95zQrd` is READY and
`https://holm357.com/build-manifest.json` serves the matching build ID.
At 01:23 UTC November 5, publisher run `41947439166` / job `126983028421`
remains in the manifest-wait step. Stored publication is still `5407fd0fc`;
guarded activation rejected `take_two:publication_not_verified`. Take 2 remains
disabled, with no gate bypass or manual publication write. The existing
publisher backlog entry contains this release's additional evidence.

Final check at 01:27:24 UTC: publisher still in progress at the manifest wait;
`private.delayed_take_two_release.enabled=false`, stored SHA unchanged. Stopped
at the repository's 35-minute execution boundary. Remaining work is the existing
publisher gate, then the already-approved guarded activation and owner smoke.

Migration installs admission closed; recovery worker v3 uses the existing
single-use dispatcher authentication. Activate only after matching READY
production commit, public manifest, publisher receipt, installed authority
fingerprints and healthy recovery. Checkpoint: `release-async-take-two-20261104`.

Physical iPhone/Android owner smoke remains acceptance: invite another human in
each money mode; verify corresponding boards, clock/bonuses/draw behavior,
reconnect, embargoed reviews, final win/tie settlement, archive and Run It Back.
