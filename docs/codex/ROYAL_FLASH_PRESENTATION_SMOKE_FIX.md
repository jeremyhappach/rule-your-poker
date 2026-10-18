# Royal Flash production smoke correction — October 18, 2026

Jeremy's initial production smoke **failed**: court-card suits were absent,
the small row/column readout was unwanted, and results lacked a readable
line-by-line presentation. This correction awaits a new physical-iPhone smoke.

| Requirement | Implementation and evidence |
| --- | --- |
| Face-card suits | Royal-only cartoon layout reserves separate rank/suit space and shrinks court art. Other games retain their layouts. Browser checks all 12 J/Q/K combinations in the upcard and across all 25 grid cells, Arcade and multiplayer, at 390×844, 844×390 and 320×568. Rank and suit bounds are distinct; screenshots inspected. |
| Remove readout | Active gameplay no longer renders Rows/Columns numbers. Rules retain the approved scoring table. |
| Scoring breakdown | Immutable server result contains the actual ten ordered lines and final 25 slots. The shared view highlights rows 1–5, then columns 1–5, with actual points and hand names, including zero-point incomplete lines. Count-up derives from preceding authoritative contributions; speed bonus and round total follow separately. |
| Timing and authority | New results get a 15-second server deadline, replacing the original five-second presentation hold at Jeremy's explicit request for readable scoring. `private.royal_flash_rules()` is byte-for-byte unchanged: version, scoring, dealing, 20-second Ready and 150-second play timing remain frozen. Both modes use the same finish function. No animation/audio callback writes scores, settles or advances play. |
| Reconnect, pause, audio | Presentation seeks from the authoritative deadline; pause shifts that deadline and freezes the display clock. Historical results without presentation metadata show their authoritative total. Audio admits only observed live transitions and uses the shared audio owner, with silent initial mount/recovery/background reentry. No new AudioContext or progression timer. |
| Settlement and records | Complete candidate and installed production rollback proofs pass through canonical authority. Winner/tie settlement, authorization, replay, continuation, immutable records and other-game preservation remain covered. Independent local connections pass competing actions, settlement failure injection, duplicate settlement and duplicate Arcade commit. Fake-money multiplayer gating is unchanged. |

Migration: `20261018192837_royal_flash_scoring_presentation.sql`. Only the shared
board finish function changes. Existing rows, results, rules registrations,
leaderboard compatibility, financial functions and grants are untouched.
Original rules-function hash: `16a94dc736a9e090f9d5118dbb8cf560` (confirmed after
installation). Candidate and installed proof: original `proof.sql`,
`core-proof.sql`, `acceptance-proof.sql` plus `presentation-proof.sql`, all in a
rolled-back transaction. The new proof checks all finish reasons, exact cards
and line contributions, unchanged bonus arithmetic, and both modes retaining
the board until the deadline then advancing without callbacks.

The first row includes a one-second lead-in for ordinary timeout recovery
latency, then ten one-second line steps, two seconds for bonus and two for the
total. The count-up seeks from server time on reconnect instead of restarting.

Validation:

- 144 focused tests, including card-face privacy/highlights, Royal frame and
  audio admission, Arcade, shared audio, TriTowers presentation and canonical
  chip ledger; TypeScript application check and production Vite build. Existing
  Browserslist/bundle warnings remain unrelated.
- `dev/royal-flash/presentation.mjs`: 72 court-card layouts (12 upcards × two
  modes × three viewports, all grid positions checked) and 72 scoring layouts.
- `layout.mjs`: twelve 1/2/7-player layouts and four Ready/DOT clock states.
- `acceptance.mjs`: actual multiplayer wrapper with two humans and observer,
  visible 100/100 → 105/95 balances, chip flight, winner celebration and automatic
  handoff; fresh entry, both mode switches, mute, reload, simulated background,
  suspended audio and audio failure. These are desktop browser tests against
  disposable local SQL authority, not authenticated production-device evidence.
- `presentation-live.mjs`: actual SQL result labels/counts for Take Score,
  52-card exhaustion and partial-board timeout in each mode; complete retained
  board, ordered highlights, separate bonus, final total and automatic advance.

Physical iPhone / production smoke remains unverified:

1. Open Arcade and multiplayer directly in Safari; check J/Q/K of all four
   suits in the next card and each grid location, portrait and landscape.
2. Finish a full board with Take Score, use all 52 cards, and allow a partial
   board to time out. Watch five rows, five columns, bonus and total. Check
   readability, correct zero/incomplete labels and enough time before transition.
3. Background/reconnect during the breakdown; confirm it seeks without another
   award or replayed sounds. Verify the DOT clock and ordinary play audio.
4. Finish multiplayer: correct balances, chip movement, winner-only records,
   next dealer/Session Ended. Complete Arcade: exact total and leaderboard.

The earlier eight-item audit remains in `ROYAL_FLASH_ACCEPTANCE_AUDIT.md`;
its production setup/ante and full route smoke limitations still apply.
Checkpoint: `royal-flash-presentation-2026-10-18`. Deployment is not owner acceptance.
