# TriTowers round presentation — October 17, 2026

Approved correction following Jeremy's smoke of `70f5fec124b75f22db73702e8f756d742a629d0c`.
Both modes use `TriTowersBoard`, `TriTowersPresentation` and `roundTimeline`.
This is client presentation only: no SQL, configuration, ruleset, deadlines,
scoring, dealing, qualification, settlement or leaderboard changes. Legacy
versions retain their existing presentation timing; the corrections select v3.

## Introduction and Ready

Ready has text only. Dots appear with the accepted playing snapshot; the existing
SQL core still validates removals/draws before admitting the full 120 seconds.
The 2.5-second authoritative introduction is unchanged. Tableau cards land in
index/row order from 300 to 1,580 ms (40 ms stagger, 200 ms landing), stock appears
at 1,600–1,800 ms, and the public initial upcard flips at 1,800–2,200 ms. The board
is settled before Ready. Rendering derives its position from the persisted
deadline, never a mount timer. Covered cards remain backs. Late mounts seek into
the sequence; Ready/playing mounts immediately show the completed deal.

The prior bell guard required a mount within 350 ms, permanently suppressing
ordinary late delivery. The new shared admission hook accepts explicit Arcade
Start provenance or a multiplayer transition witnessed by the persistent route,
then continuously observed subsequent/bonus rounds. A reload has no Start ticket
or witnessed transition. Recovery epochs, hidden/offline events, pause and leaving
Cards retire effects. The existing Run21 `boxingBellCue` runs through the shared
audio manager's cancellable timeline API; it must fit before intro expiry.
Run21's cue, hook, manager and behavior are unchanged. Recovery tagging applies
both when interruption begins and when an advanced recovery response arrives,
so an old mounted playing frame cannot admit a recovered completion as live.
The additional Arcade presentation metadata is explicitly opted into by TriTowers.

## Recording, original artwork and audio

Temporary reference: `temp videos/IMG_4156.MOV`. Windows MediaTranscoder extracted
44.1 kHz stereo PCM locally; MediaComposition extracted frames. These files,
extraction helper and analysis outputs are excluded from the commit.

Frames confirm three swords converging, then a red/gold shield with castle emblem,
with the crest retained during bonus tallying. The new SVG is original artwork
following that composition, fitted between participant scores and tower badges
in portrait, beside the centered score in landscape. It does not replace towers,
remaining cards or persistent clear-order badges.

No auditory comparison is claimed. Spectral analysis of the extracted recording
established overlapping sustained bands (approximately 334, 398, 447 and 506 Hz),
but did not reliably isolate the lead melody, exact rhythm or instrumentation.
Jeremy expressly approved a fallback without another approval gate. The shipped
cue is therefore an original 1.1-second C5–E5–G5–C6 brass/chime-like synthesis,
not a transcription or claimed melody match. Late live delivery skips elapsed
notes and continues only the remaining phrase. Reference audio is not shipped.

## One result timeline

All offsets derive from the existing authoritative result hold:

- 0–1.2 seconds: center the pill, show actual bonus amounts, assemble the crest
  and play the all-clear fanfare only for an authoritative `cleared` result.
- 1.2–4.0 seconds: score count, count audio and timer drain share the same progress.
  Drain starts from the previous authoritative playing deadline evaluated at the
  result's completion time; it never refills to represent the five-second hold.
- 4.0–4.3 seconds: score/drain are finished, crest retires and pill returns home.
- 4.3–5.0 seconds: settled display. No callback owns or delays progression.

Late connected updates seek into the remaining window. Fresh result mounts and
recovery show the authoritative total silently, with spent dots and no replay.
Unchanged/reduced totals do not synthesize counting or count sounds. Reduced motion
settles score and dots immediately and keeps the pill home; celebration is static
and its sound is suppressed. Audio always respects the existing mute preference.

## Validation and remaining acceptance

Full application regression (2,318 tests), harness regression (241 tests), TypeScript
and production build passed before final visual refinements. Final focused tests
cover both mode shapes, Ready/deal sequencing, masked cards, first/subsequent bell
admission, recovery/visibility, authoritative completion, count/drain alignment,
unchanged/lower scores and reduced motion. Additional actual audio-manager tests
cover bell replay/mute/cancellation and late fanfare expiry. The final focused
54-test run also proves delayed recovery-response tagging in both adapters and
that Run21 does not opt into it. TypeScript and the
production bundle are rechecked after refinements. `bunx tsgo --noEmit` was
unavailable (registry 404); the installed TypeScript compiler was used instead.

Offline browser fixture: `dev/tri-towers/round-motion.html`, selecting Arcade or
seven-player multiplayer. Portrait/landscape checks verify crest, all score pills,
badges, remaining cards, Ready text and synchronized timer/pill boundaries.
This is presentation evidence, not a live database or iPhone audio acceptance claim.

Jeremy's production smoke remains acceptance: both modes, first/subsequent/bonus
bells, mute, Ready→valid action, deal/late refresh, all-clear melody/crest/bonuses,
Take Score and timeout, synchronized finish/home return, reconnect suppression,
and actual phone rotation. Existing v2/v3 leaderboard/PB compatibility and all
financial authority remain untouched.
