# Sound Pass 2 smoke corrections — November 2, 2026

Jeremy initially requested implementation/audition with no production deployment.
He subsequently selected the 357 beeps, specified the independent Chucky heartbeat
ending before the final flip, and approved proceeding with “perfect. let's go.”
The selected sounds are now integrated for the scoped release; see final notes below.
Branch: `codex/sound-pass2-smoke-corrections`. Isolated worktree:
`C:/Users/jerem/.codex/worktrees/sound-pass2-smoke-corrections/rule-your-poker`.
Baseline: `6411bb674a592d49cc6ed87fc0ae49a56a2f5361`, verified against the
READY production deployment `dpl_Eq5DqMZ1e5mzCrm7M6Wzw4Kjspnw` at `holm357.com`.
The original Golf checkout and all its local changes are untouched.

## Findings and corrections

The waiting-table route excluded its speaker whenever `_isShellLobbyMode` was
true. Async list/match headers and the Arcade switchboard/leaderboard omitted it.
These surfaces now mount the existing `GameplaySoundButton`, preserving their
other controls. It subscribes to the same manager and persists the same
`profiles.play_sounds` preference. No new product setting or preference owner.
The Arcade leaderboard header wraps its existing controls when space is tight.

Run21 Arcade's real `soloProjection` emits only `lastPlacement/card_placed`.
Pass changes the authoritative board but does not emit `pass_used`. The previous
browser fixture fabricated that event, masking the missing adapter. A new test
uses `createSoloRun → applySolo → soloProjection` and proves this exact gap.
The client now admits a presentation receipt only for its freshly submitted Pass
and matching successful response: run, round, viewer, request, run/board revisions,
card index, one additional pass, and unchanged columns must agree. Reads, restored
requests, rejected/stale responses and interrupted requests cannot create it.
No rules, server state, projection, RPC or persistence format changed.

Async already produced the correct accepted Pass event. Two downstream guards
could still silence it: the shared card-group cooldown and a 25 ms audio-unlock
allowance. Native Edge evidence captured a first-gesture context becoming running
about 56 ms after the cue request, too late for that allowance. Pass retains the
exact approved flip recording, with its own unthrottled confirmation group and a
bounded 150 ms admission allowance. Expired actions never catch up. Existing
placement, scoring, bell and global manager policies are unchanged.

Chucky's laugh was attached to the accepted **face-down deal transport**, which
can overlap community cards 3/4. That trigger and the laugh's runtime import/loading
are removed. Archived audition/approved asset bytes remain intact. The replacement
hook starts only from the first real `HolmChuckyRevealCard` transform transition
and stops at the final card's existing completion callback. Its identity is the
canonical hand identity. Already-revealed mounts do not animate or start audio;
repeated transitions cannot restart the sequence. Mute, pagehide, offline,
identity changes and unmount cancel it. During an admitted signature, individual
card-flip sounds yield. The final selected heartbeat integration is described below.

## Four-option audition

Desktop: <http://localhost:4320/>. iPhone/Android on the same Wi-Fi:
<http://192.168.1.242:4320/>. The local preview server must remain running.

`dev/sound-smoke` contains exactly four original PCM16 WAVs, their generator and
hash manifest: slow Chucky heartbeat, 1.4-second Chucky sting, identical dry 357
beeps, and identical paired 357 heartbeats. The Chucky preview uses the actual
reveal card and sequence-audio hook. Countdown previews use the canonical 900 ms
beat interval and emit no sound at DROP. The old 51-candidate studio is preserved.
Selections saved on the review device are audition preferences, not deployment
authorization. The final chat selections are 357 beeps and the revised Chucky heartbeat.

## Qualification and release boundary

Evidence/scripts: `dev/sound-smoke/app-browser.mjs`, `studio-browser.mjs`, focused
unit tests, and ignored `qualification.local/sound-smoke/` plus qualification logs.
The App browser proof uses actual compiled routes, controls and native Web Audio
with intercepted synthetic HTTP authority; it performs no database writes.
It covers accepted/rejected Pass, Pass as the first gesture after reload, replay
silence, preference persistence, subsequent Async clients, existing turn bells,
and responsive headers. Existing placement's strict 25 ms policy requires an
explicitly running context in its separate preservation checks; it is not widened.
The browser-only diagnostic wrapper is injected by the fixture server, never
included in production source or committed build artifacts.

Physical iPhone/Android PWA speaker output and real-session owner smoke remain
unverified. The waiting-table change is source/unit-qualified; live waiting-table
phone smoke remains required. No financial, gameplay, timer, schema, historical
session or production infrastructure mutation is included. Final production
readiness is subject to the final qualification below and the owner's production/device smoke.

Final local results: all 3,623 application tests in 501 files and 241 harness
tests in 12 files pass. Application TypeScript and both production/app and
isolated studio builds pass. The final compiled App passes all eight native
browser flows, including fresh post-reload Pass in both modes, silent rejected
Pass, responsive 320/360/390/844/1440 px headers, and preference persistence.
Prior test fixture failures were corrected (missing Arcade duration, old Pass
policy object identity, and the finale fixture's omitted speaker mock). The
first-gesture admission test explicitly proves playback at 80 ms and silence
after 150 ms. Existing placement's separate 25 ms behavior remains tested.

The final studio browser check passes all four candidates at desktop and phone
widths, checks exact source counts (one Chucky sequence or three countdown beats),
and verifies mute with zero page errors. The test waits for the actual Play →
Stop → Play cycle; an earlier immediate Play lookup could finish before React
committed the preview and incorrectly report zero sources. Both audition links
are served on port 4320; physical-device listening remains Jeremy's next step.

## Studio audibility follow-up — 2026-11-02

Jeremy reported that only the 357 beeps were audible; both heartbeats and the
Chucky sting were silent to him. The first qualification only counted native
source starts and missed two issues:

- Preview counters restarted at zero after reload, while the shared manager's
  played receipts survived in session storage. A direct browser reproduction
  played all four on the first pass and started zero sources for every candidate
  when repeating the same order after reload. Each studio page now adds a random
  audition namespace, using `crypto.getRandomValues` for LAN HTTP compatibility.
  Production dedupe and identity semantics are untouched.
- The other three files concentrated their energy below 150 Hz. Their low
  fundamentals remain, with stronger damped upper partials so the pulse/sting
  also carries above the deep-bass range. This addresses the signal limitation;
  physical speaker listening is still needed to accept the sound and balance.

Only the local studio, three unapproved candidate WAVs, manifest/generator and
focused qualification changed. The dry beep file is byte-identical. The same
900 ms countdown beats, silent DROP and Chucky reveal timing remain in place.
The browser regression now repeats every preview after reload at desktop/phone
widths and checks useful signal after a 300 Hz high-pass proxy, headroom,
identical countdown beats and the preserved beep hash, in addition to mute and
source counts. This proxy is not a claim of physical-device listening success.
All 16 before/after-reload preview checks pass with zero page errors; the signal,
headroom, identical-beat, beep-preservation and mute checks pass. The focused
studio TypeScript check and Vite build pass. The repository's suggested `tsgo`
command was unavailable; validation used the already-installed TypeScript compiler.
No production push or final sound choice is authorized by this follow-up.

## Natural heartbeat revision — 2026-11-02

Jeremy rejected the revised heartbeat timbre as too artificial/arcade-like and
requested a real heartbeat. Both heartbeat candidates now use one actual
resting-heart lub-dub recorded by Andy Jack, published by JonasTisell under CC0:
https://freesound.org/people/JonasTisell/sounds/670465/.

The public high-quality preview supplies a 400 ms pair. A fixed mono PCM16
excerpt and source/license/hash provenance are committed under
`dev/sound-smoke/sources/`. Preparation applies an 80 Hz rumble filter, short
boundary fades and level adjustment. It adds no tones/harmonics, pitch shifts,
distortion or time stretching. The natural spacing inside the pair is retained;
the pair repeats at the existing Chucky/357 intervals. The other two candidates
are byte-identical, and no game audio assignment or timing changes are included.

The former 300 Hz signal proxy encouraged added upper harmonics and did not
establish natural timbre. Qualification now checks useful recorded-heart body
above 120 Hz, safe peaks, identical countdown pairs, source identity and
preservation of both other candidates. Browser playback and technical checks
cannot accept the sound aesthetically; Jeremy's listening remains the gate.
The studio labels now identify the real recording and credit its source.
All 16 desktop/phone-width previews pass before and after reload, with mute,
signal/headroom, identical countdown pairs and preservation checks passing.
Focused studio TypeScript and Vite build pass. Physical-device listening remains
unverified; this is a replacement audition, not an approved sound selection.
No final selection or production deployment is authorized.

## Final speaker mix, choices and integration — 2026-11-02

Jeremy reported the recorded heartbeats were inaudible again and confirmed he
was using computer speakers. Native browser graph taps showed nonzero playback;
the recording's energy above deep bass was roughly 20 dB below the audible beeps.
The permissive 120 Hz-only check had failed to qualify that listening situation.
The immutable recording now uses a 200 Hz rumble filter, broad 450 Hz presence
adjustment and peak 0.38, without synthetic tones, pitch shifts or distortion.
The 300 Hz speaker proxy is restored and strengthened to require energy within
2.5 dB of the beep. Each browser cue also must produce measured signal in the
actual audio graph. Asset URLs include the current manifest hash to avoid stale
audition mixes. Source/processing/license details remain in the source README.

Jeremy then chose **357 drag-race beeps** and specified an **independent Chucky
heartbeat**, slightly faster than card reveals, ending on the last complete
beat before the final flip. His subsequent “perfect. let's go” approves the
scoped release and supersedes the initial hold. The two selected files are
copied into the production assets and hash-matched by tests. All older approved
recordings remain intact. 357 uses three identical beeps and silence on DROP.

Chucky's first real own-card flip admits one sound sequence. Its heartbeat clock
uses 80% of the actual card cadence (at least 440 ms for a complete 400 ms pair).
The existing reveal scheduler supplies its configured timing and final deadline;
audio observes that schedule without advancing or changing cards. A complete
pair must fit with an 80 ms quiet gap before the final flip. Later cards do not
restart the rhythm. A final-flip cancellation guard, mute, offline/pagehide,
identity change, and unmount retire it. Replayed first edges cannot start later
beats, and missing/unloaded audio never catches up. The native audition uses
the same hook and card component: 760 ms heartbeats against 950 ms flips, with
the final pair ending before the last flip. Timing tests include the 500/800 ms
fallback, the audition cadence, slower cards, and a short 100 ms final delay.

The release is limited to the pre-game speakers, Run21 Pass correction, removal
of the misplaced laugh, and the two selected audio treatments. No migrations,
financial writes, game rules or gameplay timers change. Production/device smoke
after publication remains Jeremy's acceptance step.

Final qualification: `npm run build` passes all 3,632 application tests across
501 files and 241 harness tests across 12 files, then builds the production App.
The latest App and studio TypeScript checks and the studio build also pass.
All eight compiled-App native browser flows and all 16 studio before/after-reload
previews pass. Studio checks measure actual output graphs, independent heartbeat
cadence and the final source's end before the last card transition. One browser
fixture race was corrected: it now awaits the mute PATCH acknowledgement before
full-document navigation, instead of aborting an in-flight optimistic save.
The complete browser rerun passes. The test-generated Cribbage snapshot line-ending
rewrite was discarded only in this isolated worktree.

Release checkpoint: `release-sound-smoke-corrections-20261102`. Its matching
`-verified` tag records the published SHA, Vercel deployment and remote audio hashes
after production verification. The original Golf checkout remains untouched.

## Failed production heartbeat smoke and read-only RCA — 2026-11-02

Jeremy reports three rapid lub-dubs, stopping before the third card shows, and
reiterates that the heartbeat must be independent of the varying card timings.
The separate 357 Hand Strength bot report is Queued in BACKLOG.md; it was not
investigated as part of this audio scope. No exact smoke session/device identity
was supplied, so the reproduction below is a source-level timing proof, not a
captured trace of Jeremy's device.

Published owner: `MobileGameTable`'s single Chucky reveal stepper calls
`useChuckyRevealAudio.armReveal`; the first real `HolmChuckyRevealCard` CSS
transition starts audio. Identity remains the canonical `deal.handContextId`,
with one admission per hand and shared user/event playback receipts. Later
cards do not restart it; mute, interruption, unmount, identity change and final
flip stop it. The sole production caller is MobileGameTable; the other caller
is the local sound studio.

A read-only query of `xvhmbuppghwmwpwrkzao.public.game_defaults` for `holm`
returns 0.5 seconds for the ordinary steps and 0.8 seconds for the final pause.
The unchanged shipped hook therefore sets a 440 ms pair interval, not the
audition's 760 ms. Its whole-pair fit calculation is sensitive to the native
first-render offset. Executing that actual hook under a controlled clock with
the existing four-step sequence and a 20 ms render offset gives pair starts at
520, 960 and 1400 ms and sound ending at 1800 ms. Card three starts its 600 ms
turn at 1500 ms and completes at 2100 ms; card four starts at 2300 ms. With the
unrealistic zero-render-offset case, a fourth pair fits exactly at the 80 ms
margin. This explains the observed rapid three-pair pattern and early silence.
Ignored proof: `qualification.local/sound-smoke/heartbeat-rca.mjs`.

The hook also extrapolates unarmed delays from the current card delay, and a
timer callback over 50 ms late retires the entire sequence. These assumptions
are unsuitable for the requested independent heartbeat. The earlier tests
proved only that audio ended before the final flip; they did not require it to
remain audible through the third reveal under actual rendering offsets.

Recommended correction, awaiting approval: give the heartbeat its own steady
natural tempo; keep the audio sequence alive through intermediate reveals;
use the actual final-card deadline only to admit the last complete lub-dub;
skip a missed pulse without a catch-up burst or permanently retiring the live
sequence. Preserve the recorded timbre, global mute, per-hand dedupe, hidden/
offline/recovery silence, 357 beeps, all card reveal timing, authority and money.
Qualify against actual uneven four-card timing and first-frame/timer delays,
including measured last-pair ending before the final CSS flip. Jeremy's actual
production listening remains acceptance truth. Product code is unchanged.
