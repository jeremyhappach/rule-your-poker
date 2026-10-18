# Royal Flash acceptance audit — October 18, 2026

This is the earlier acceptance audit. Jeremy's subsequent production smoke
failed court-suit readability and result presentation; see the scoped correction
and updated evidence in [presentation smoke fix](ROYAL_FLASH_PRESENTATION_SMOKE_FIX.md).

Scope: Jeremy's eight-item follow-up. The approved `royal-flash/1` rules,
dealing, scoring, timing, records, financial authority and fake-money admission
gates are unchanged. This release changes only Royal Flash presentation and
its qualification fixtures. Production acceptance and physical iPhone testing
remain Jeremy's tasks.

Confirmed defects corrected:

- The multiplayer score display used the previous completed-round total during
  play. It now displays the authoritative current board score, including a
  decrease after replacement, while retaining the existing result count-up.
- The player strip hid balances behind horizontal scrolling. It now wraps;
  wide, short containers put the roster beside the board.
- Short landscape layouts allowed card faces and score labels to crowd each
  other. Container-relative layout separates the board, current card and scores;
  card cells constrain their faces. Empty footer space is removed for this game.

| Requirement | Status and evidence |
| --- | --- |
| 1. DOT timer | **Implemented and verified** in browser and SQL: shared 24-dot component, 24/12/0 lit at 150/75/0 seconds, numeric 20-second Ready only. The accessible maximum also comes from the frozen rules. Core proof checks first-placement start, exact expiry, resets and pause shifting. |
| 2. Fullscreen layout | **Fixed and verified in desktop Chromium**: 320×568, 390×844, 844×390, 1440×900; 1/2/7 players; long names and six-digit scores; header allowance, centered score, all controls/25 faces in bounds, preserved proportions, no board/control overlap or horizontal balance scrolling. Screenshots inspected. **Physical iPhone unverified.** |
| 3. Setup and stake consent | **Implemented; server verified, complete production UI unverified.** Normal dealer setup loads the default and exposes the stake input. A new offer clears prior opponent consent; the caller's submission accepts that exact offer. Submitted offers are immutable; changed-payload replay is rejected. Gameplay waits for explicit acceptance from the other human. Production UI smoke must exercise the normal setup/Ante Up screens. |
| 4. Settlement and continuation | **Implemented and verified in SQL and the actual multiplayer wrapper.** Browser uses `RoyalFlashTable` under `PersistentTableShell`: visible canonical chip flight, 100/100 → 105/95 balances, winner confetti and automatic terminal handoff. Independent-connection proof checks 100/100 → 109/91, injected rollback and exactly one batch. Recovery completes without clients. The full production route's next-dealer/Session Ended transition remains owner smoke. |
| 5. Game Over achievements | **Implemented and verified.** Browser sees winner and winning score, excludes losing names even when their scores earn records. Shared tests cover top-10-only rank labels and personal-best eligibility. All-player historical facts remain in History; they are not Game Over announcements. |
| 6. Spectators/recovery/history/retries | **Implemented and verified in the tested paths.** Observer snapshot/history hide private stock; server rejects observer actions. Browser observer controls are disabled and History shows completed rounds. SQL covers round/bonus progression, duplicate/stale/late replay and no-client recovery; browser covers reload and simulated visibility recovery. History follows the existing 11 Up convention: round summaries plus persisted redacted frames, not a new cinematic replay player. Arcade isolation proof checks no multiplayer/session/financial writes. Full production reconnect/navigation admission remains owner smoke. |
| 7. Records and compatibility | **Implemented and verified.** Deployed rollback proof compares all other games' Arcade and multiplayer score records before/after unchanged; Royal results use `royal-flash/1`, exactly one record per human, final cumulative total equals sum of round contributions, record replay does not duplicate. Existing compatibility groups are untouched. Live-score display defect is corrected. |
| 8. Shared audio | **Implemented and verified on desktop; device behavior unverified.** Browser checks fresh multiplayer, fresh Arcade, both switch directions, replay/new game, ordinary start/play unlocking, suspended-context resume, silent reload, simulated background/resume, mute, navigation cleanup and Web Audio failure without blocked play. One shared context per document. 22 manager tests plus Royal admission tests cover duplicate/interrupted cues. No shared audio code change was necessary. Normal Ante Up gestures use the same global trusted-gesture listener; physical Safari acceptance is outstanding. |

Verification artifacts and limits:

- `dev/royal-flash/play.mjs` now runs `acceptance.mjs` with the **real multiplayer
  wrapper**, unlike the original qualification fixture. It uses a disposable
  local database, real SQL/RPC authority, loopback HTTP and database notifications
  adapted to the Supabase client. It does not claim a logged-in production route
  or physical-device test.
- `layout.mjs`: twelve layouts plus four clock states. It checks actual card
  faces and control overlap, not only grid-cell bounds.
- `acceptance-proof.mjs`: original financial proof, core proof and new consent,
  observer/history and record proof. The combined proof also passed against the
  deployed Supabase database inside one rolled-back transaction. No migration or
  production data repair is required for these display changes.
- `concurrency.mjs`: real separate connections, immutable request conflicts,
  competing revisions, settlement failure injection and duplicate Arcade commit.
- Existing TypeScript compiler passes; 148 focused Megatouch, Arcade, audio and
  canonical chip-ledger tests pass; production Vite build passes. Existing
  Browserslist/bundle warnings and TriTowers test `act` warnings remain unrelated.
- Ignored machine evidence: `qualification.local/royal-flash/acceptance.json`,
  `layout.json`, screenshots, `acceptance-proof.json`, `concurrency.json`.

Remaining production smoke:

1. On iPhone Safari, enter each mode directly; check portrait/landscape, large
   scores, all 25 cards, current card, controls and DOT clock. Include a populated
   multiplayer table and readable balances.
2. Change the default stake before offering; verify the opponent sees and must
   accept the new amount. Check normal caller setup and Ante Up gestures/audio.
3. Finish a win and tie; verify balances/chips, winner-only labels and the actual
   next dealer or Session Ended route. Watch as an observer and reconnect.
4. Complete Arcade and Play Again; confirm total, personal best and leaderboard.
   Switch both directions between modes, background/resume, reload and mute.

Release checkpoint: `royal-flash-acceptance-2026-10-18`. Deployed does not mean
owner-accepted; no stable-smoke checkpoint is recorded until Jeremy reports it.
