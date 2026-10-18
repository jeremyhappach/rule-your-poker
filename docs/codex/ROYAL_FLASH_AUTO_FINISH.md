# Royal Flash follow-up smoke correction — October 18, 2026

| Request | Implementation and verified evidence |
| --- | --- |
| Slower synchronized scoring | A single result plan starts each highlight, label, displayed count and scheduled chip sound together. Lines last 1.6 seconds: 1.1-second count and 0.5-second hold. Neutral lead-in precedes rows; columns, bonus and total follow. New immutable results carry presentation version 2 and a 21-second server deadline. Legacy 15-second results still render. |
| Automatic full grid | The shared authoritative reducer finishes immediately when a v2 placement occupies all 25 squares. Expiry is checked first; concurrent retries reuse one receipt/result. Further placements reject. Partial Take Score and deck exhaustion through replacements remain supported. Both modes use the same core. |
| Rules and records | New games freeze `royal-flash/2`; admitted v1 games retain their original legal actions. v1's rules-function hash remains `16a94dc736a9e090f9d5118dbb8cf560`. v2 inherits every point/bonus/Ready/play-clock value and adds automatic full-grid completion. v1/v2 share the existing leaderboard and PB comparison. No historical score or leaderboard reset. |
| Recovery and authority | Deadline-based visuals seek forward on reconnect/resume. One admitted audio schedule is canceled on background/recovery and past sounds do not replay. No visual/audio callback awards points, settles money or advances rounds. |
| Multiplayer and Arcade | Actual-wrapper browser checks show canonical 100/100 → 105/95 balances, chip flight, winner celebration and automatic continuation. Arcade totals equal authoritative stage contributions. Financial/authorization/zero-client/receipt proofs pass; Arcade remains nonfinancial and multiplayer fake-money gating remains intact. |

Migration: `20261018195633_royal_flash_auto_finish.sql`. Drift guards protect
the installed functions; v2 registration inherits the existing v1 enabled state.
Candidate and installed production rollback proofs cover winner/tie settlement,
duplicate and late replay, authorization, stake consent, continuation, terminal
states, full-grid/timeout ordering, unchanged partial Take Score, v1 preservation,
legacy-result/PB compatibility and other-game preservation. The installed proof
fixture was corrected for production's automatic profile trigger; its metadata
query uses the existing ruleset ID. No synthetic rows survive the rollback.

Validation:

- 159 focused tests across Royal presentation/audio, shared audio, Arcade,
  card-face rendering and TriTowers presentation; application TypeScript and
  production Vite build pass. Existing bundle/Browserslist warnings remain.
- `full-grid-proof.mjs`: complete local SQL proof; `concurrency.mjs`: independent
  connections competing on the 25th placement, duplicate finalization, timeout
  precedence, injected financial failure and canonical settlement.
- `presentation-live.mjs`: full grid, partial Take Score, exhaustion and timeout
  in both modes; all ten authoritative line labels/counts, retained board,
  separate bonus, exact final total and automatic advancement.
- `sync-recovery.mjs`: positive-line scheduled sound/highlight boundaries differ
  by 1.3–10 ms in desktop Chromium; simulated background and reload seek without
  new sound scheduling or changing the result. This measures browser scheduling,
  not physical speaker latency or iOS behavior.
- `presentation.mjs`: 72 court-card layouts and 72 scoring layouts, both modes
  at 390×844, 844×390 and 320×568; all 12 court ranks/suits and grid positions.
- `acceptance.mjs`: actual multiplayer wrapper, observer/history restrictions,
  winner-only achievements, finances/continuation, direct entry, both mode
  switches, reload/background, mute, suspension and blocked audio.

These are automated desktop/disposable-database checks plus deployed SQL proofs.
Physical iPhone and authenticated production-route smoke remain Jeremy's task:

1. Start a **new** game in each mode. Fill all 25 squares: timer stops and scoring
   begins without Take Score; extra taps cannot place another card.
2. In portrait and landscape, watch five rows then five columns. Each highlight,
   hand/points label, count and sound should start together and hold long enough
   to read; bonus and total follow separately.
3. Take Score on an incomplete board; also finish near timeout. Background or
   reconnect mid-breakdown: correct current step, no replayed sounds/awards.
4. Finish both modes: exact Arcade total/PB with existing records still visible;
   multiplayer balances, chip movement, winner and automatic continuation.

Checkpoint: `royal-flash-auto-finish-2026-10-18`. Deployment is not owner acceptance.
