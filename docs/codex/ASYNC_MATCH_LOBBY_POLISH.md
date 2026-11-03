# Individual Async Match Lobby — 2026-11-03

Jeremy explicitly requested implementation and delivery of this focused polish.
Baseline: `25ea8d1f16bb7b3607f7c095b1ed86d1a77e8058` (current main and verified
production at investigation). Isolated branch: `codex/async-match-lobby-polish`.
The original Golf checkout and all its unrelated changes remain untouched.

## Scope and ownership

- `MatchInfo.tsx` groups title, existing Current Net, the existing 36h/24h line
  and existing PushPreferences in one slate-blue card. The accessible Radix
  dialog contains dynamic money mode/status/progress/exposure and existing rules.
- `lobbyPresentation.ts` sorts a copy by actionable turn, terminal/unreviewed,
  waiting, then terminal/reviewed. Each group keeps configured ordinal order.
  Match/child UUIDs, authoritative lineup and invitation configuration are intact.
- `Delayed.tsx` owns one transient expanded child UUID. Match/viewer/history
  identity and route remount reset it. Reviewed rows use the existing branded
  header and actual viewer-projected result delta; ties retain neutral T/$0.
  Expanded rows retain the existing score details and forfeit explanation.
- `isReviewedGame` requires terminal, explicit `viewed === true`, and no pending
  opponent review according to the existing `needsChildReview` guard.
  No lobby interaction writes an ACK. Existing result presentation, timing,
  acknowledgment RPC, finale and Run It Back are unchanged.

Read-only deployed inspection on `xvhmbuppghwmwpwrkzao` confirmed `delayed_home`
projects review state using `auth.uid()`, masks unreviewed results, and counts
pending opponent attempts. `delayed_review_ack` retains participant authorization,
the parent lock and insert keyed by `(event_id, viewer)`; the actual unique index
was verified. No SQL, schema, gameplay, financial, notification or production-data
changes are included. No new dependencies, timers, polling or persistent state.

## Qualification

- App typecheck passes (`tsc -p tsconfig.app.json --noEmit`; installed tsgo unavailable).
- Full application run: 3,658 passed, one obsolete standalone-W UI assertion
  failed. Updated that assertion to the new collapsed outcome button; the focused
  25-test run covering it, MatchLobby and the actual FinaleReviewGate passes.
  This qualifies all 3,659 application cases across the full run and focused rerun.
- All 241 harness tests pass. `vite build` passes. Existing bundle-size and
  Browserslist age warnings remain; no dependency changes were made.
- Focused Async regression run: existing review, turn progression, notification,
  history, Run It Back and financial-consent tests passed. New cases cover stable
  ordering without lineup mutation, held/expired actionability, explicit review
  admission, pending-attempt protection, per-viewer projections, real/fake amounts,
  W/L/tie colors, one-open accordion, remount collapse and reconnect refresh.
- Existing timed final-review test now also verifies that only the just-reviewed
  child becomes collapsed after its saved attempt and completion presentation.
  No duration, animation or acknowledgment owner changed.
- `node dev/async-combined/match-lobby-browser.mjs` passes against isolated
  synthetic loopback transport using real components in installed desktop Edge.
  Widths 320/360/390/430/1024 have no horizontal overflow and all tested buttons
  are at least 44px. Includes long names, both money modes, dialog Escape/Done,
  persisted notification checkbox, independent expansion, reload collapse and
  no acknowledgment/gameplay calls from the lobby.
- Identical 390px baseline/new fixtures: metadata through game-list boundary
  shrinks 381.64px → 225.27px (41%). Match Info itself is 213.27px; completed
  buttons are 52px high. Before/after phone and dialog screenshots were inspected.
  Visual review caught and corrected a dialog utility-style override.
- Local evidence: `qualification.local/async-lobby/` and `async-lobby-*.log`.
  Baseline evidence is in the existing main integration checkout's same folder.
  The browser harness supplies empty Presence state; it does not claim hosted
  Realtime, physical iPhone/Android, push-delivery or financial SQL smoke.

## Publication and owner acceptance

Release checkpoint: `release-async-match-lobby-polish-20261103`.
The matching `-verified` tag records exact-SHA production verification after the
normal main push. Physical-device and production gameplay acceptance remain pending.

Owner smoke: open an existing mixed-progress match on each player's device;
check compact Match Info/dialog and notification settings; finish a game and
verify View Results stays prominent until that viewer's full reveal finishes;
confirm only that viewer sees the compact row after refresh/reentry; expand
different completed games and verify actual W/L/tie amounts, scores and collapse.
Check a fake-money match and long names, then the unchanged match finale/Run It Back.
