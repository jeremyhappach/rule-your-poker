# Run21 responsiveness and space scene — October 17, 2026

Jeremy approved the investigation proposal, including more stars in idle areas,
through implementation, validation, commit, push and deployment. His production
smoke remains acceptance. TriTowers fanfare interruption is a separate queued
report, not addressed or accepted by this release.

## Ownership and preservation

- `useRun21Action` holds one immutable request, shared by Arcade and multiplayer.
  A tentative known card is presentation only. The confirmed snapshot supplies
  totals, scores, clocks and outcomes. Unknown future cards are never predicted.
- `actionPresentation.ts` checks round, actor, revision and shared legal columns;
  `Run21Felt` renders the pending card with a dashed border and a confirming slot.
  Confirmation retains the same card element. Rejection restores confirmed state.
- Requests retain their ID/revision/round in versioned session storage. Uncertain
  outcomes keep input locked; reconnect retries the same request. Storage does
  not contain the deck or financial state. A new tab recovers confirmed server
  state; the original tab's request still has server-side idempotency/CAS guards.
- New intentions are rejected locally during introduction, unavailable turns,
  pending requests or offline state. No column intention is queued for an unseen
  next card. Multiplayer actions remain available during spectator-stream renewal
  when HTTP transport is usable.
- `api/arcade.ts` starts the Run21 display-name lookup alongside authority work,
  after fresh authentication. The name is awaited only for projection. Origin,
  size, credential, admission/access, ownership, revision, receipt and deadline
  checks remain in their existing owners. No profile field supplies authorization.
- `Run21SpaceScene` and `run21Space.css` style the existing fullscreen shell in
  both modes. Original vector planets, 175 scene stars and additional quiet stars
  in unused column wells remain static and ignore pointer input. Existing Cartoon
  faces, scores, actions and mode-specific shell controls remain in place.
- No SQL, schema, rule version, dealing, qualification, timing boundary,
  leaderboard/PB compatibility, settlement or audio-cue change.

## Measurements

Actual current hooks and board, synthetic transport, desktop Edge touch emulation
at 390 × 844. Eight samples per condition before and after; same scripted touch
hold and response delays. Medians below are milliseconds after the click handler.

| Mode / added response delay | Before card DOM | After card DOM | Before paint opportunity | After paint opportunity |
|---|---:|---:|---:|---:|
| Arcade / 0 ms | 31.9 | 3.1 | 47.0 | 29.6 |
| Arcade / 250 ms | 280.3 | 3.1 | 298.2 | 29.6 |
| Multiplayer / 0 ms | 2.8 | 3.1 | 30.9 | 30.8 |
| Multiplayer / 250 ms | 3.8 | 2.8 | 30.8 | 30.7 |

Touch-release-to-handler remained roughly 1–2 ms. The scripted contact lasted
about 100 ms in browser dispatch; press highlighting starts before release, but
committing an intention still requires the completed tap. Animation frames are
paint opportunities, not physical screen measurements. These samples do not
establish production auth/API/database or physical-iPhone latency. The display-
name overlap is verified structurally; its production time saving is unmeasured.

Local evidence: `.codex/evidence/run21-response-20261017/` includes scripts,
before/after timings and browser images; temporary evidence is not committed.

## Validation and owner smoke

Full validation passed: 2,377 source tests, 241 harness tests, typecheck and Vite
production build. Additional focused tests cover body timeouts, lost responses,
unchanged request payloads, remount recovery, blocked replacement intentions,
scope isolation, pending-card/confirmed-total separation and profile-I/O overlap.
Final edits receive focused checks, typecheck and the final asset build.

Browser checks exercise both hooks and production presentation at 320 × 640,
390 × 844, 844 × 390 and 1440 × 900: five usable columns, no horizontal overflow,
tentative card before delayed confirmation, confirmed totals, same-element
reconciliation, no duplicate cards, and reduced-motion behavior. These checks use
synthetic state/transport; they are not physical-device or financial acceptance.

Jeremy's smoke: play Arcade and multiplayer; compare tap feedback, confirm the
next card and totals once, try quick successive taps, interrupt/reconnect during
a pending play, rotate an actual phone, and inspect stars/card readability in
short and long columns. Existing bell, swoosh and 104/105 celebration behavior
should remain unchanged.

Opt-in diagnostics: open a game with `?run21Timing=1`; the session retains the
option across navigation. `window.__RUN21_TIMINGS__` holds bounded samples;
`window.downloadRun21Timing()` exports them from a browser/remote inspector.
Disable with `?run21Timing=0` (remove any manually set `run21-diagnostics` local
storage override as well). There is no permanent gameplay debug UI or upload.
