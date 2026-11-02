# Async sound regression correction — November 2, 2026

Local implementation and qualification authorized; production remains held for
Jeremy's explicit **GO**. The isolated `codex/async-sound-regressions` branch is
based on current main `fb6a0ef6a`. No main integration, push or deployment is part
of this checkpoint. The original Golf checkout and both Sound Studio worktrees
are preserved. Main already contains published V2 audio; its assets and owners
are unchanged.

## Report and failure boundary

Owner gameplay smoke found missing starting bells in Run21/TriTowers Async and
missing Run21 Async placement sounds, while Arcade placement and other Async
sounds worked. Jeremy corrected the original HOLM reference to Run21.

`DelayedTurn` omitted Run21's `useRun21Bell` and
`useRun21PlacementAudio` calls. Arcade and live wrappers already invoke them.
Async returns a board projection without the live/Arcade feedback event stream,
so adding the hook alone would still provide no placement evidence.

TriTowers Async mounted `TriTowersBoard` with its default `liveEntry=false`.
The shared presentation hook correctly treats that first mount as recovery and
suppresses its bell. Boxdrop Async has the identical missing entry signal. The
five-game audit found different existing event paths for Words and Quintzee;
neither needs a new bell or game-specific sound patch. These are adapter gaps
before the audio manager, not evidence of a failed native audio engine.

## Correction and preservation

The shared Async turn owner retains a memory-only association between a newly
submitted request ID and the snapshot from which it was issued. It admits audio
only after accepting the matching response. `localTurnPresentation` checks child,
match, actor, segment and server revision. Run21 placement additionally requires
the exact card/column or pass change and board revision. A terminal placement
uses the exact just-finished own-round board. This is presentation metadata;
it neither reconstructs a gameplay journal nor computes or advances game state.

A confirmed new Start grants the existing intro admission for Run21, TriTowers
and Boxdrop. The existing intro deadline bounds playback. Simply opening a match,
accepting an invitation, mounting an existing intro, refreshing, receiving another
client's update or replaying a stored request cannot grant this admission.

Confirmed Run21 card changes feed the existing approved slide/flip hook at the
render of the accepted board. Hidden/offline/pagehide, an error or leaving the
cards tab retires pending audio provenance. Recovery establishes silence without
discarding the next freshly submitted action. Existing audio-manager identities,
preferences, expiry, grouping and interruption cleanup still apply. Duplicate
responses, remounts and history do not replay sounds.

Rules, gameplay clocks, RPCs, database/schema, finances, settlement, notification
audio, assets, global speaker controls and the V2 Sound Studio are unchanged.
No dependency installation or customer-data mutation occurred.

## Qualification

- Application TypeScript (`tsc -p tsconfig.app.json --noEmit`) passes using the
  existing installation; native-preview/tsgo is unavailable in this dependency set.
- Production Vite bundle passes. Existing Browserslist/chunk warnings remain.
- 275 focused tests in 20 files pass: Async route/review flows, 17 new admission
  and action tests, existing bells/card hooks, palette, mute and engine recovery.
- 64 additional existing Arcade/live tests in 12 files pass.
- `dev/async-audio/browser.mjs` exercises the compiled App with native Edge audio
  and synthetic HTTP authority, including separate browser clients. Its native
  source probe checks that placement audio starts with the card already in the
  rendered column. Evidence is under ignored `qualification.local/async-audio/`.
- All eight native browser flows pass: Run21/TriTowers/Boxdrop Async at 390 and
  1440 px, plus Run21/TriTowers Arcade at 390 px. Fresh invitation acceptance is
  silent; each newly started intro schedules exactly one eight-part bell. Run21
  checks placement/pass, second-client reentry and action, reload, first fresh
  action, mute/unmute, page lifecycle recovery and the other player's next turn.
  There are zero page errors or escaped external requests.

The candidate is locally qualified and committed for review; publication and
physical/hosted gameplay acceptance remain separate, unopened gates.

The native fixture uses acknowledged synthetic Realtime channels. Closing its
socket intentionally causes Arcade's existing recovery owner to suppress intro
audio; this was corrected in the fixture, without changing product recovery.

Browser qualification does not prove physical iPhone/Android speaker output or
hosted two-player acceptance. Owner real-session smoke remains pending after a
separately authorized release: fresh invitation/acceptance, both players' later
turns, exit/resume, refresh during intro and play, first placement after return,
mute/unmute during sound, duplicate/recovery delivery and silent opponent reviews.
Confirm one bell only for a fresh playable turn, each eligible new placement at
its visible change, and unchanged scores, balances and continuation.
