# Async TriTowers input, Quintzee holds and iPhone audio trace — 2026-11-05

Jeremy approved these bounded corrections and diagnostic release. The iPhone PWA
missing starting bell and final fanfare remains OPEN until a device trace identifies
the failure. His three-swords celebration was visible; card movement and the first
two tower sounds worked. Desktop evidence does not establish the iPhone cause.

## Confirmed boundaries and changes

- Async TriTowers previously disabled the board while each request returned. The
  existing Arcade/live ordered buffer already provided pending feedback. The new
  `useAsyncTriInput` adapter uses that same buffer, sends one frozen command at a
  time and advances only from accepted server projections. Rejections refresh the
  board and clear unsent successors. Uncertain responses retain the exact receipt
  for Resolve play, including remount; late responses cannot update a closed turn.
- Shared `QuintzeeView` emits quiet 85 ms rising/falling sine tones only in the
  user's hold/release handler. Resets, replay and rerenders are silent. The existing
  AudioManager owns preference, interruption and immediate mute in every mode.
- Opt-in `audioTrace` records TriTowers presentation admission, remaining cue
  windows, context creation/state/resume, mute/visibility, scheduling, cancellation
  and owner release. It retains at most 1,200 entries for 20 minutes, batches local
  storage off the input path and survives navigation/reload. No microphone audio,
  cards, credentials or request/response bodies are captured or automatically sent.
- Existing intro bell, first/second tower trills and third-tower all-clear fanfare
  keep their playback timing, readiness, preference and dedupe behavior. No second
  third-tower sound was added. Rules, clocks, animations, scoring and settlement
  are unchanged. No database or service migration.

## Validation

App TypeScript and production build pass. Focused suite: 519 tests in 51 files;
an additional late-rejection/unmount regression passes in the six-test adapter
suite (520 covered tests total). Coverage includes input order, rejection,
uncertain receipt recovery, identity/terminal boundaries, all three Quintzee
modes, silent replay/reset, mute, bounded tracing and existing shared audio.

Actual Edge Web Audio and React components were exercised at a 390 × 844 viewport
against an isolated synthetic authority with a fixed 180 ms response delay. No
production sessions were created or mutated. Each mode/preference case used 13
card taps; frame p95 stayed about 17 ms before and after.

| Mode / Sounds | Before pending feedback | After pending feedback | Confirmed removal before → after |
| --- | --- | --- | --- |
| Async / on | none | 10.2 ms | 199.9 → 210.0 ms |
| Async / off | none | 9.9 ms | 209.0 → 200.3 ms |
| Arcade / on | 11.1 ms | 7.0 ms | 208.4 → 203.6 ms |
| Arcade / off | 8.7 ms | 9.3 ms | 209.2 → 202.0 ms |

Values are medians, not physical-device or production-network benchmarks. They
confirm the Async feedback gap and no measured shared rendering/audio slowdown;
the historical subjective regression on iPhone remains unmeasured.

Fresh entry through final tower and retained celebration passed with Sounds on
and off in Async and Arcade. Native source counts confirm one bell, one first
trill, one second trill and one final fanfare, without duplicate playback; muted
runs schedule no audible sources. Card-movement dispatches and samples remain
present. Shared Quintzee browser checks confirm both frequencies, reset silence,
mute cutoff and unmute without replay. Unit checks cover live multiplayer too.
The diagnostic dialog passes reload persistence, native-share payload, download,
clipboard fallback and phone-sized layout checks. The native share API is mocked;
no physical iPhone/Android audio, touch or native share-sheet test is claimed.

Reproduction: `node dev/async-input-audio/browser.mjs` (installed Edge/Playwright).
Artifacts are ignored under `qualification.local/async-input-audio/`; baseline
evidence remains in `qualification.local/audio-investigation/`. The initial
desktop delay stress could expire bell/fanfare windows, but it is not proof of
the reported iPhone failure and did not authorize a playback change.

## iPhone acceptance and trace retrieval

1. Update/reopen the PWA on this release. In the main lobby open the menu → Help
   → Audio diagnostics → Start trace, then close the panel.
2. With Sounds on, enter a fresh Async TriTowers turn and complete all three
   towers. Check one bell, normal card sounds, first/second trills and one final
   fanfare accompanying the three swords. Note any missing sound and whether
   backgrounding, silent mode, mute or reconnect preceded it.
3. Return to Help → Audio diagnostics → Stop trace → Share trace. Save to Files
   or use Save trace; attach the JSON in this chat. Copy trace is a fallback.
4. Repeat Sounds off to confirm silence. Check rapid valid card taps and rejection
   recovery; check Quintzee hold/release and immediate mute across available modes.

Trace starts only by request and is local until shared. If the capture expires or
fills, it stops and remains available for export. Start a new trace for another
attempt. Keep the iPhone audio issue open until the trace establishes admission,
readiness, remaining window or cancellation as the actual failure boundary.

Release checkpoint: `release-async-input-audio-trace-20261105`. The matching
`-verified` annotated tag records the exact published SHA and deployment.
