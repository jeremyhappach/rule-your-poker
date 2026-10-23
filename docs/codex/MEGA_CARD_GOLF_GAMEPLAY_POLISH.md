# Mega Card Golf gameplay polish — local review checkpoint

## Local follow-up — card geometry, sequential opening and automatic stock (October 23)

This checkpoint continues `bceae120b697b4a6faba3f0d22b7641556783129` in the same
isolated worktree. It is not evidence for a new production release. Published
`067b7b9e2` remains separate; no integration, push or deployment occurred.

### Card correction

The distortion came from shared production CSS: tableau buttons filled grid cells
with independently calculated width/height, while the stock used different width
and height formulas. Compact hit-target minimums could change only one dimension.
The card-back SVG also used `preserveAspectRatio="none"`. Both the production
`MegaArcadePage → MegaArcade → MegaCardGolfGame` path and local preview use these
same components/styles; this was not a fixture-only problem.

All physical card roots and inner layers now fit their available slots at 5:7.
Stock, tableau, revealed faces, concealed backs and transport use that same shape.
Transport scales uniformly between actual felt-relative stock/tableau anchors.
The compact landscape hand reserves room for the status label without covering
the cards or scorecard. Only Sunny Meadows' emblem changes to a tree. Coastal
and Devil's Canyon emblem paths/colors and the approved audio source are unchanged.
The shared back SVG preserves its artwork ratio.

### Item 17 — implemented locally

The controller submits the existing authoritative `draw` action automatically
when playing with no pending card, remaining stock, and no active presentation.
It uses the same serialization lock, UUID request receipt, hole/revision and
server deadline as manual actions. Draw/scoring rules, course settings, SQL and recovery worker are unchanged.
The separately approved sequential-opening extension below changes the versioned
engine and service initialization only for v2.

For an accepted hidden replacement: the old board card flips up, remains visible
in the 1.5-second reveal stage, dissolves for 350ms, then the played stock card
travels to its destination face up for 350ms. An already exposed destination
goes directly to that arrival. The next stock remains concealed throughout.
Only after arrival settles does the controller request the next draw; its accepted
card flips face up. Network latency may extend the concealed interval. A completed
hole never requests that extra draw. Immediate discards use the same authoritative
allowance and advance once. Tap In confirmation is unchanged.

A failed draw stops at that revision rather than looping. Routine realtime
refresh preserves the error. Explicit reconnect or a successful foreground/online
recovery permits one fresh attempt. A lost accepted response restores its existing
pending card and consumes no additional draw. Silent reconnect resumes current
truth without replaying an interrupted animation.

### Item 16 — approved sequential server choices, implemented locally

Jeremy explicitly approved the authority change after the first investigation:
seeing the first selected card before choosing the second requires individual
server commitments. New local v2 runs use `mega-card-golf/2`. Each opening tap
submits one index through the existing revision/UUID-receipt action path. Only
an accepted response reveals that face, with a 350ms flip. There is no selection
confirmation for v2. Input locks through acceptance/flip; exposed choices cannot
be selected again. The configured count (0–5), original deadline, private unseen
cards and frozen course configuration remain authoritative. The first stock is
automatically requested only after the final opening flip settles.

Existing v1 runs retain their two-choice contract and confirmation. No saved run
is upgraded, reconfigured, rescored or rewritten. The production service accepts
both versions and initializes an empty state using the admitted row's version.
The legacy creation default remains v1; only explicitly admitted v2 records use
sequential choices. This protects active and historical v1 runs.

Local PostgreSQL proof: `sequential-opening-proof.mjs` cloned the existing local
qualification database into `mega_golf_seq_1792787156082` on `127.0.0.1:55439`.
The first proof used a full rollback; independent connections then tested competing
choices and concurrent same-request retries through the actual service and SQL
row-lock/CAS/receipt boundary. It also proved projection privacy, ownership,
reconnect, stale/duplicate/late input, configured limits, version/config rejection,
subsequent-hole persistence and unchanged historical result hashes. The initial
fixture attempt encountered a copied profile without an auth user; selecting
existing allowed identities present in both tables corrected the fixture.

Release limitation: v2 qualification rows are explicitly seeded in the disposable
clone with the new ruleset disabled. No production admission/default/ruleset flag
or SQL definition changed. Production registration/start selection and any board
retention/archive decision require a future release package; this local checkpoint
must not be published as though v2 is already activated. No new scores were mixed
into historical boards. Timer bonuses remain deferred. The relayed Library
screenshot was not accessed or uploaded.

### Fresh validation and preview

132 focused tests pass, including actual controller + local authority coverage
for v1/v2 compatibility, sequential opening counts/privacy, automatic opening-to-draw,
duplicate refresh/rapid input, concealed and exposed
replacement, discard, final stock/final hole, lost/rejected responses, foreground
recovery, background expiry and abandon. Existing Tap In, canonical face, scoring,
audio and engine tests remain in the suite. Application TypeScript and Vite build
pass; the existing Browserslist and bundle warnings remain.

`stock-geometry-browser.mjs` checks three themes at four sizes (390×844, 844×390,
320×568, 568×320), root/inner 5:7 geometry, 44px targets, status/scorecard separation,
artwork aspect preservation, uniform transport scaling, hidden/exposed replacement,
reduced motion, landscape scoring separation and the real `MegaArcade` sequential
opening plus automatic draw/discard sequence. It passed
with no page errors or external requests. Screenshots were inspected locally.

Local gallery: `http://127.0.0.1:5187/dev/mega-card-golf/polish/evidence.local/index.html#gameplay`.
Actual controller demo: `http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html?controller`.
That demo uses an in-memory authority and Reset local demo starts fresh. Timeline demos include
`?gameplay=replacement`, `?gameplay=face-up` and `?gameplay=cards`.
Ignored evidence: `stock-geometry-tests.log`, `stock-geometry-build.log`,
`stock-geometry-browser-report.json`, `sequential-opening-database.json`, refreshed theme/card screenshots and
`stock-*.png`. This is local evidence, not hosted authority or physical iOS smoke.

Files changed in this follow-up:
- `src/components/megaCardGolf/{CourseCardBack.tsx,MegaArcade.tsx,MegaCardGolfGame.tsx,megaCardGolf.css,AutomaticStock.test.tsx}`
- `src/lib/megaCardGolf/{config.ts,engine.ts,authority.ts,presentation.ts,presentation.test.ts,sequentialOpening.test.ts}`
- `server/megaCardGolf/service.ts` and `src/components/rules/MegaCardGolfRules.tsx`
- `dev/mega-card-golf/polish/{ControllerPreview.tsx,GameplayPreview.tsx,main.tsx,stock-geometry-browser.mjs,sequential-opening-proof.mjs,gameplay-browser.mjs,gameplay-gallery.mjs}`
- `docs/codex/{CURRENT_RELEASE.md,MEGA_CARD_GOLF_GAMEPLAY_POLISH.md}`

The sections below describe the preceding 15-item checkpoint and its earlier
evidence; the fresh follow-up results above supersede its stock interaction and
Sunny emblem descriptions.

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
