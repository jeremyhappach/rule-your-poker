# Completed Async match records — November 17, 2026

Jeremy approved the read-only history redesign and explicitly required Quintzee
results by round. This release changes entry from archived/completed history;
active-match play, opponent review, final celebration and settlement stay owned
by their existing paths.

## Implementation

- History See Results enters `?history=1`; individual games use `&game=<child UUID>`.
  This branch is selected before play, review and finale dispatch. Back and reload
  remain in history.
- `CompletedMatchRecord.tsx` reuses the match game headers and score-card layout.
  Every game shows both final scores and its authoritative outcome. It mounts no
  gameplay hooks, playback timers, audio, celebration, review ACK or action owner.
- Chess reuses the static final-position renderer. Five Alive uses its existing
  versioned rule primitives and frozen configuration for word, tier, guesses,
  base, multiplier and award. Unsupported historical rules show unavailable
  breakdowns; unfinished words are explicitly unplayed/unfinished.
- Run21, TriTowers and **Quintzee** show both players' scores by round. Quintzee
  also shows categories, upper/clear bonuses, base subtotal and multiplier.
  Words retains its board, word/turn points and rack adjustments. Boxdrop,
  Take 2, Mega Card Golf, Crib Lab and Chucky Showdown expose their corresponding
  completed rounds/holes, cards, categories, scoring and terminal state.
- Missing old board details retain recorded scores and explain the missing
  detail. No historical match is reconstructed or mutated.

## Database boundary

`public.delayed_match_record(uuid,uuid)` is an additive STABLE reader. It checks
authenticated participant UUID, settled parent plus existing settlement receipt,
and requested child membership/completion before disclosing details. It uses
current corrected outcomes and the existing privacy projections for saved
boards; random decks, evidence, salts, bags and racks are not exported.
Unfinished matches cannot use this reader to bypass sealed results.

It reads retained authoritative attempts rather than the optional playback
cache. It does not change the existing home/review/finale RPC contracts.
The only schema change is this function, its comment and execute grants.
Financial, gameplay, lifecycle, recovery and existing reader definitions are
unchanged. No data migration, settings change or new gameplay activation occurs.

Migration `20261118023945_async_completed_match_records.sql` is installed in
`xvhmbuppghwmwpwrkzao`. The Supabase connector assigned that version; the local
file retains the exact applied SQL (SHA-256
`50e62207b15eb1828b967d0bbfd0726a91c044548cdb28248f79f85d7ed26baa`;
installed definition MD5 `4287e71e2002c15bcaf0c42c28667063`).
The CLI was unavailable and no tool was
installed.

## Validation

- Candidate SQL proof passed inside BEGIN/ROLLBACK. Installed proof passed
  inside REPEATABLE READ READ ONLY: both participants, all seven game types
  currently represented in settled production records, duplicate reads,
  final Chess position, complete Five Alive word state, private randomness
  exclusion, outsider/foreign-child/unfinished-parent denial, execute grants,
  and unchanged matches, attempts, settlement receipts and review/ACK rows.
- Proof: `supabase/delayed/match-record-proof.sql`. The proof performs no
  synthetic match/financial writes and changes no historical session.
- 47 focused tests pass, including 26 new history tests, all 11 supported games,
  named scoring breakdowns, identity/unfinished-record denial, missing old
  details, history entry/back/reload, and no live owner, action or celebration.
  Existing active lobby and finale review tests retain their behavior; the one
  archive assertion intentionally now expects passive history.
- Native Edge browser fixture passed all 11 game details and reload/back at
  390px; Quintzee additionally passed 320px portrait, 844px landscape and
  1280px desktop layouts. No horizontal
  overflow, ending animations, action/ACK requests, page errors or external
  requests. Screenshots were inspected. The fixture intercepts only transport;
  real record components are rendered. Database authority is independently
  tested above, and actual app route dispatch is covered by integration tests.
- Browser command: `node dev/async-records/server.mjs`, then
  `node dev/async-records/browser-proof.mjs`. Evidence is ignored under
  `qualification.local/async-records/`.
- **Final release qualification: PASS.** TypeScript; all 4,342 application
  tests (589 files); 241 harness tests; 46 release-tooling tests; Vite production
  build; unchanged 90 MB cap. Static output: **89,704,498 bytes**, leaving
  **295,502 bytes** of headroom. Exact final command:
  `node qualification.local/async-records/qualify.mjs`; it runs the standard
  qualification/build/size commands with `VITE_ASYNC_PUSH_ENABLED=true` and
  `vitest run src --maxWorkers=2 --minWorkers=1`.
- The first full application run
  passed 4,341 tests and timed out in the unchanged multiplayer Chess header
  test. Its original output is retained as `first-build.log`; targeted rerun
  passed (35 tests including the new history suite). The second full run passed
  4,340 tests but timed out in two unchanged Run21 local-authority cases; its
  output is retained as `second-build.log`. The final run uses the same production
  flag, assertions, timeouts and 90 MB limit with two application-test workers
  to avoid local resource contention. Both previously failing suites pass in
  that complete run. Final browser replay and all 26 history tests also pass
  after covering Chucky's canonical suit glyphs.

## Publication and acceptance

Implementation is on `codex/async-completed-records`, based on main
`39c7dc5565178093c370ea13e25a4969981ab396`. Final qualification and scope review
pass. The release commit is identified by tag
`async-completed-records-20261117`; production publication follows the approved
main push helper. The delivery report records deployment verification.

Jeremy's production smoke: open Completed Sessions → See Results; verify the
match's final game cards immediately appear with no boxer/recap; inspect Chess,
Five Alive, Run21, TriTowers and Quintzee (including every round); navigate back
and reload; then complete an ordinary active match and confirm its existing
review/finale flow. Physical-device acceptance remains pending.
