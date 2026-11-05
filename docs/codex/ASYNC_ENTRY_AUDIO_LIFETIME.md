# Async entry audio lifetime — November 5, 2026

Status: confirmed startup ownership defect corrected; physical iPhone acceptance
pending. Final-clear fanfare remains a separate OPEN investigation.

## Device evidence and failure boundary

Jeremy supplied the full opt-in trace from installed iPhone PWA, iOS 18.7 /
Safari 18.7.5, build `76f3c7917a8d2baeb877d722585de99105b5c63c`.
Original attachment SHA-256:
`933970536040f87505daae856055fdce57a198f0b038d52ea5dba53b9de6eab3`.
The original remains unchanged in the chat attachment; private gameplay identities
are not copied into the repository.

| Event | Trace wall time (ms) | Observation |
|---|---:|---|
| Context 6 retired | 1793909676696 | `gameplay-exit`, running, zero owners |
| Context 7 created | 1793909691949 | Suspended; initial resume outside a trusted gesture |
| Intro bell requested | 1793909691972 | 2297 ms left; sound enabled, foreground |
| Bell expired | 1793909694270 | Never scheduled; context still suspended, audio clock zero |
| Later tap resumes context 7 | 1793909696586 | Running; subsequent card/tower cues schedule |

The running engine was retired 15.253 seconds before its replacement was created.
The existing global capture listeners unlock/prime synchronously during native
entry gestures, before the route-changing handler. However, the Async match
header's `GameplaySoundButton` was the last owner and disappeared on Take turn.
Release checking, child/home loading, opponent review, the automatic Your turn
handoff and start RPC had no audio owner. The next gameplay header created a new
engine in an effect, after the entry gesture. The trace does not log an unlock
that needs no resume on an already-running context; the gesture ordering is
established by the source and the trusted-event browser regression.

The bell was correctly admitted and expired under its existing window. This is
not evidence of mute, interruption, duplicate suppression or a missing cue event.
The supplied turn ends with `take_score`; it contains no final-clear cue request
and cannot establish the reported final fanfare's cause.

## Correction and preservation

`AsyncAudioScope` retains the existing shared manager's gameplay lease across the
three `/delayed` routes. The common router layout sits above the release guard,
lazy-loading fallback and opponent review, so the entry gesture's engine survives
until the playable turn mounts. Its effect does not wait for audio or network and
adds no input/animation lock, clock change, timer or retry. It uses the existing
owner API rather than a second audio context or playback owner.

Leaving Async releases the lease. Immediate mute, background/pagehide,
interruption, auth/preference handling and disposal continue to retire contexts
through the unchanged manager. Existing headers and global Sounds controls remain
intact. Cue admission, receipt identities, cancellation, expiry, clocks, animations,
input ordering, rules, scores, settlement and backend state are unchanged. No
expired bell is replayed and no extra tap is required.

## Qualification

- App TypeScript and production Vite build pass using installed tools.
- 167 focused checks pass across audio, TriTowers presentation and Async review,
  including five new transition regressions using the real manager, ReviewGate,
  TriTowers intro and React StrictMode. They cover the former failure, one bell,
  late-tap silence, mute during review, background retirement and early route exit.
- `node dev/async-entry-audio/browser.mjs` uses actual ReviewGate, saved TriTowers
  replay, DelayedTurn auto-start, shared board and Web Audio in desktop Edge at
  390×844. Backend replies and release-check latency are isolated fixtures. A
  per-context gesture restriction deliberately models mobile autoplay; it is not
  a WebKit emulator or proof of physical sound output.

| Browser case | Contexts before later tap | Bell admissions scheduled | Bell oscillators |
|---|---:|---:|---:|
| Former header-only ownership | 2 | 0 | 0 |
| Retained Async ownership, Sounds on | 1 | 1 | 8 (one two-strike bell) |
| Retained Async ownership, Sounds off | 0 | 0 | 0 |

Each browser case submits exactly one start action. Review remains silent; no
additional tap precedes the own-turn intro. An expired bell stays silent on a
later trusted tap. Muting closes the retained engine and leaving Async closes
every remaining engine. Browser errors: zero. Local evidence is under ignored
`qualification.local/async-entry-audio/`.

## Physical acceptance still required

On the published build, enable Sounds and start Help → Audio diagnostics before
entering an Async TriTowers turn with an opponent result waiting. Tap Take turn
once, let the review and Your turn handoff finish, and do not touch the board
until the bell window ends. Confirm one starting bell, then card/tower sounds.
Stop and share/save the trace through Help. Expected: the entry engine remains
available, no `gameplay-exit` retirement inside that transition, and one scheduled
`run21-bell:tri:` cue before expiry. Also check Sounds off and leaving Async.

No physical iPhone/Android playback is claimed by these desktop checks. Keep the
startup issue pending Jeremy's device acceptance. Capture a separate trace of an
actual all-three-towers clear for the still-open fanfare report.

Release checkpoint: `release-async-entry-audio-20261105`; its `-verified` annotated
tag records the exact published SHA/deployment and any publication limitations.
