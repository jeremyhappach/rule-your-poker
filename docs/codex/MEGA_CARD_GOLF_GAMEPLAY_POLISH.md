# Mega Card Golf gameplay polish — local review checkpoint

## Scope and baseline

Jeremy's collected pass was approved through local implementation, validation,
commits and previews only. Baseline: published
`067b7b9e2985718d5d4ee42186a90fe52f462a22`. The release-signal rerun was completed
by the owner before this pass; no publication action is part of this work.
Work remains isolated on `codex/mega-card-golf-polish`.

## Delivered behavior

- Removed the lower-is-better helper/flag, visible-card indicator, redundant draw
  button, stock-consumption helper and course-name header. Stock remains tappable.
  Discard exists only while a draw is pending; existing allowance enforcement remains.
- Bottom scorecard places the larger cumulative Total after the holes. Hole and
  total values use + / E / minus, while missing holes remain a dash. A numbered
  golf flag identifies the current hole.
- Each course uses its original artwork with a restrained overlay. Course-branded
  souvenir backs use a shared canonical-back artwork slot and original vector
  branding: sun/meadow, wave/sail and canyon. Source course images are unchanged.
- Mega explicitly selects the shared PlayingCard MegaTouch Large face. Small,
  Medium and Large variants are reusable; existing canonical/cartoon callers,
  density configuration, card visibility guards and preference-based backs stay
  on their prior defaults. Existing cartoon consumers include Run21, TriTowers,
  Take Two, Trip Flip, Royal Flash and Race Poker. Canonical back consumers include
  Holm, Gin, Cribbage, 3-5-7, transport, opponent seats and hand history.
- A voluntary replacement of the last concealed card opens “Tap In?”. Cancel
  sends nothing. Revision/deadline changes invalidate confirmation. Server timeout,
  all-exposed and stock-exhaustion completion rules are unchanged.
- Abandon uses the existing Arcade confirmation and authoritative abandon intent.
  It navigates only after acceptance. Completed runs cannot be abandoned, and
  existing authority excludes abandoned runs from leaderboards.
- Exact accepted hidden replacements show the OLD value for 1.5 seconds, dissolve
  for 350ms, then bring in the replacement for 350ms. There is no discard pile or
  post-reveal cancellation. The old value comes only from the accepted response's
  `discardTop`; revision gaps/reconnect never infer an old value from a later snapshot.
- Committed hole results reveal remaining cards, then highlight individual
  unpaired cards or a paired column together. A distinct original cup-impact/bounce
  cue accompanies each step. The top-center hole tally animates through canonical
  values: +5 followed by −2 becomes +3. Pairs contribute zero once. A readable
  final hold precedes the next deal; hole nine finishes before results.

## Ownership and preservation

`engine.ts`, `authority.ts`, course configuration, service/API, worker, SQL and
migrations are unchanged. Numeric scoring, ordering, frozen configurations,
discard/stock consumption, admission, results and persistence remain server-owned.
The presentation queue never delays completion or leaderboard writes.

The controller accepts the existing versioned snapshots, queues each newly
committed result once, holds the corresponding hole identity and hides future
course totals. Newer server deals may arrive during a count; input stays locked
until the queue finishes. Explicit reconnect restores current truth silently
without replaying historical sounds. The due-boundary refresh uses the existing
queued request owner so an in-flight request cannot swallow recovery.
Animation frames run only while presenting/scoring, rather than throughout play.

Audio stays behind AudioManager preferences, visibility, event identity and
cancellation. Late animation frames do not catch up expired cues. Reduced motion
keeps readable steps without movement, blur or animated numeric interpolation.

## Local evidence

The focused suite covers canonical score parity across 2,197 combinations,
ordinary/pair/negative/zero results, exact hidden-value admission, duplicate and
regressive revisions, newer deals during counting, final-hole hold, reconnect
overlapping completion, rapid actions, confirmation/cancel/timeout, abandonment,
shared card visibility/highlights/default consumers and audio preferences/dedupe.
115 focused tests pass. Application TypeScript and the Vite production build pass;
existing Browserslist/chunk warnings remain.

The existing loopback gallery contains real component captures for all three
themes at 390×844, 844×390, 320×568 and 568×320; themed backs and shared face tiers;
and accepted replacement, Tap In/cancel, positive/pair/negative/zero scoring,
reduced motion and final-hole evidence. The fixture toolbar provides Replay,
sound, theme selection and a timeline scrubber. Scrubbing pauses ONLY local
fixture time for inspection; production authority is never paused.

Files under ignored `dev/mega-card-golf/polish/evidence.local/` include
`gameplay-tests.log`, `gameplay-flow-tests.log`, `gameplay-typecheck.log`,
`gameplay-build.log`, `gameplay-browser-report.json`, stage/theme PNGs and
`gameplay-cup-cue.wav` rendered from the actual cue with OfflineAudioContext.
Browser video capture is unavailable because installed Playwright lacks FFmpeg;
no packages were installed. Interactive replays and timed captures are provided.

These are labeled local fixtures, not production smoke or physical iOS evidence.
No Library upload, transfer, main integration, push, deployment or production
write occurred. Local visual/audio review is the next gate.

## Changed files

- Gameplay: `src/components/megaCardGolf/MegaArcade.tsx`,
  `MegaCardGolfGame.tsx`, `CourseCardBack.tsx`, `megaCardGolf.css`;
  `src/lib/megaCardGolf/presentation.ts` and `audio.ts`.
- Shared opt-ins: `src/components/PlayingCard.tsx`,
  `src/components/canonicalShell/CanonicalCardBack.tsx`,
  `src/components/canonicalShell/MegatouchCardFace.tsx`.
- Tests: `src/lib/megaCardGolf/presentation.test.ts`,
  `src/components/megaCardGolf/Gameplay.test.tsx`, `PresentationFlow.test.tsx`,
  `src/components/PlayingCard.megatouch.test.tsx`.
- Preview: `dev/mega-card-golf/polish/GameplayPreview.tsx`, `main.tsx`,
  `preview.css`, `gameplay-browser.mjs`, `gameplay-gallery.mjs`.
- Records: this document, `docs/codex/CURRENT_RELEASE.md` and `REPO_MAP.md`.
