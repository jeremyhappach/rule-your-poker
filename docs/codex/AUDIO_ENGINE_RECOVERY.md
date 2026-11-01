# Shared audio-engine recovery — November 1, 2026

Jeremy twice reported all gameplay audio stopping across async and Arcade.
Phone silent/vibrate changes did not recover it. On recurrence, the gameplay
mute toggle also failed; closing and reopening the installed app restored sound.
He recalls entering Arcade and starting a game while the app was already open.
The exact failed native state was not captured. Jeremy approved the correction
in the audio-controls chat rather than waiting for another failure.

## Owner and failure boundary

`AudioManager` retained a single native context until page teardown or a reported
`closed` state. Background and mute stopped sources, but unmute/foreground reused
that context and trusted `state === 'running'`. A silent or stalled native graph
could therefore survive both controls and game navigation. WebKit reports
[291892](https://bugs.webkit.org/show_bug.cgi?id=291892) and
[263627](https://bugs.webkit.org/show_bug.cgi?id=263627) describe similar states;
they support the recovery design, not a claim that this device was diagnosed.

Production `2af7ca58a` (notification titles) became READY at 19:12:11 UTC near the
second report. The intervening Arcade/async artwork and title releases changed
none of AudioManager, playbackSession, the speaker, card cues or release gate.
The gate retains an already-admitted game during later publications. Deployment
timing is recorded as correlation only; a push is not an established cause.

## Correction and preservation

The one shared manager now retires the complete native context on mute,
background/pagehide, context/session interruption and final gameplay-header exit.
Unmute creates/primes a fresh context synchronously within the existing gesture
and clears a stale interruption latch if the native recovery event was missed.
Foreground, pageshow and app-resume can create the replacement; repeated focus
signals reuse it. Muted/hidden/interrupted input cannot reopen the old engine.
Gameplay cleanup and playback-session release wait one microtask so synchronous
header handoffs and React effect rehearsal do not close or recategorize a
still-owned context. Normal rounds and overlapping
effects retain one context while gameplay stays active.

Retirement stops/disconnects the old graph, consumes pending requests/timelines,
detaches state listeners and invalidates the old resume/primer references. Late
old promises/events cannot affect the replacement. Receipts and the user's
existing Sounds preference survive. There are no new recovery timers, polling,
silent loops, diagnostics UI, dependencies, schema or financial mutations.

All callers stay on the shared owner: Run21/TriTowers and their Arcade/async
adapters; Royal Flash, 11 Up, Take 2/Trip Flip, Quintzee, Boxdrop, Race Poker,
Battle31, canonical transport/Canasta/Golf, Gin and waiting-table join/knock.
The approved card cue pair, silent async notices, push delivery, rules, scoring,
geometry and gameplay timing are unchanged.

## Qualification and acceptance

The full source run passed 481 files / 3,441 tests; all 241 harness tests passed.
Final refinements for a missing session-recovery event and category stability
during header handoff then passed all 68 focused audio/control/game-cue tests,
including nine recovery cases. Application TypeScript and the production bundle
pass. The final compiled-App proof covers 320×740, 390×844, 844×390 and 1440×900.

`audioRecovery.test.ts` uses distinct native-context stand-ins with a running but
silent failure mode. It covers fresh unmute, mute/receipt preservation, background
and pagehide, real gameplay exit versus header handoff, interruption, a hanging
old resume, stale native events and rejected close. Existing audio suites retain
initial gesture admission and presentation-deadline coverage.

`dev/audio-reliability/browser.mjs` exercises the compiled app with native browser
audio and synthetic authority only. Its local fault injector blocks output from
one running context; real gameplay mute/unmute must close that context and route
the next card through a new connected output without page reload. It also checks
pagehide/pageshow replacement, saved preferences, no muted backlog, final exit,
navigation and mobile/desktop controls. Its already-playing fixture waits for
native activation after navigation rather than skipping the normal intro and
racing the intentionally short card-cue admission window. Evidence is under
`qualification.local/audio-reliability`; full test output is
`qualification.local/audio-recovery-unit.log` in this worktree.

Physical iPhone acceptance remains necessary: reopen on the published revision,
play in Arcade and async, leave/re-enter gameplay, background/return and follow a
push notification. Card/scoring sounds should continue; mute/unmute should recover
without reopening, and interrupted/old sounds must never catch up.
