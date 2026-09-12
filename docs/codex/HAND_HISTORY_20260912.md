# Canonical Hand History — September 12, 2026

Jeremy approved implementation after the read-only diagnosis. Scope is history
capture, historical card access and all history readers/renderers. Gameplay,
settlement, balances, shell ownership and terminal presentation are preserved.

## Evidence and correction

The former client reconstructed history from results, mutable card rows and
browser-written Cribbage events. It inferred opponent exposure from showdown,
and Session Results selected the first human as the viewer. The retained session
`8b683d7c-fd57-4a28-a339-710860b35b0f` proved the distinction: Cribbage hand 7
logged 22 pegging points from a score delta containing 21 counting points; the
renderer then truncated the match before its real hand 9 finish. Authoritative
final scores are mcru81 123 / Hap 110. Gin finished mcru81 111 / Hap 63. Holm's
winner payout and the other viewer's negative change were separate facts.

Migration `20260912192636_canonical_hand_history` creates private hand snapshots
and ordered events, captured within authoritative transactions. Results, actions,
round scores, admitted card exposures and financial transfer batches supply the
projection; history never performs settlement. Source keys deduplicate events.
Same-transaction result normalization remains visible before commit. Financial
batches require one unambiguous hand opening/action/result identity; ambiguous
batches are not guessed from timestamps. Later balances never rewrite history.

`get_hand_history` authenticates current or historical membership (or admin),
returns an index and selected dealer-game details, and filters event audiences.
Private tables/writers have no browser grants. Raw card SELECT policies now
require ownership or an explicit exposure even after completion/game switching.
Triggers ignore direct authenticated-client writes. Client Cribbage logging is
retired; retained old event rows are neither changed nor treated as score truth.

The shared UI provides collapsed games/hands, nested rounds/financial sections,
ordered actions, exposed cards, signed result deltas, Gin meld/deadwood/layoff
details, authoritative match scores and separately collapsed Cribbage pegging
totals. All existing entry points mount that same reader and view. Dice games
retain result details through the same contract. Stale requests are retired on
session identity change; realtime and focus catch-up refresh the projection.

## Legacy boundary

The initial ended-session backfill projects 3,470 retained hands across all seven
games. It copies evidence without modifying source history or replaying money.
Retained score states repair the saved Cribbage/Gin presentation. Explicit card
flags and rule-owned public exposures are admitted; unrevealed final hands are
not inferred. Historical stacks without an exact retained terminal snapshot,
unproved financial records, and missing events remain unavailable. Existing
unfinished legacy sessions are not retrospectively reconstructed.

## Validation and acceptance

- Full `npm run build` passes: application typecheck, app tests, harness tests,
  production bundle. A final narrow TypeScript check passes after UI cleanup.
- Seven focused tests cover viewer identity/sign, hidden exposure, collapsed
  hierarchy, Cribbage/Gin scoring, unknown legacy snapshots and split pots.
- SQL rollback proof passes both with the migration before application and
  independently after application: opening/closing stacks, decision charges,
  duplicate projection, ties, replay, later-game isolation, viewer audiences,
  outsider/client-write rejection, count-only Holm reveals and saved final score.
- One read-only independent review identified the omitted Holm reveal-count
  trigger columns; corrected and proved before migration.
- Installed Edge through Playwright renders the shared component at 390 and
  1280 pixels without overflow, page errors or console errors; hand/pegging
  sections start collapsed and final 123–110 is visible. This is a component
  browser check, not a multiplayer gameplay smoke.

After Vercel publishes the commit, Jeremy should reopen the September 11 session
from the lobby, verify Cribbage ends 123–110 and Gin ends 111–63, and inspect Holm
winner/delta identities and card visibility. In fresh Holm/357 hands, check
starting/ending stacks, action order and legal reveals, then refresh/reconnect
and return after a later game. Gin/Cribbage should retain per-hand running scores
and collapsed pegging. Production smoke remains acceptance truth.
