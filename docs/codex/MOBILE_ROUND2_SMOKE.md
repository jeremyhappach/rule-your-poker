# Mobile Round 2 smoke corrections — 2026-11-04

Jeremy approved the coordinated six-item correction and clarified that Mega Card
Golf belongs under **Other**. No game engine, notification delivery, account
permission, financial writer, database schema or production session is changed.

## Corrections

- Both installation sequences now use seven three-second steps (21 seconds per
  loop), with a short fade. Pause, inactive-slide/background suspension and static
  reduced-motion presentation remain. The duration/helper caption is removed.
- The tutorial has no X and prevents Escape/outside interaction dismissal. Its
  explicit snooze/dismiss/complete callbacks still use the existing account RPC;
  manual Help replay preserves saved preferences. The existing Settings handoff
  continues to snooze automatic presentation without requesting device permission.
- Only GameLobby's redundant banner rules button/dialog is removed. The Index
  Help owner and contextual Arcade/game help remain.
- Mega's shared catalog category is Other. Help's game selector exposes the whole
  catalog grouped by category, retaining one entry per game. Supported modes can
  be selected within that entry; server admission remains independent.
- Mode copy covers solo leaderboards, live competition and the existing Async
  scheduling/settlement terms. Mega no longer describes every mode as solo.
  Async Words uses its /3 36-hour forfeit policy, not live /2 banks and three-minute
  turns. Async Run21 documents paired tiebreak rounds; Tri removes live caller
  order from Async help. Quintzee's live-only money restriction is scoped to live.
- Golf Help now selects the deployed /2 stock-count ending, retaining /1 help for
  historical callers. The traditional articles correct verified omissions/errors:
  Horses wild ones and matching-group ranking; Holm partial ties versus all-stayer
  ties; 3-5-7 purchased legs/optional tax/rollover; Cribbage Go, crib flush and
  Super Quick skunk; Gin first offer/discard restrictions and per-point payout;
  Yahtzee fixed stakes and tied-hand continuation.

## Rules completeness and authority

Read-only deployed evidence on November 4: **22 game-default IDs**, **nine distinct
enabled Arcade games** (14 retained ruleset versions) and **six supported Async
games** in `delayed_capabilities`/the adapters. All map to existing catalog rules;
no unique game was absent. Mega had been under Cards, explaining the reported
discovery failure. The nine Arcade and six Async games are subsets of the 22.

`dev/lobby-catalog/rules-audit-20261104.json` records the deployed IDs/configurations.
`RulesCompleteness.test.tsx` checks independent deployed-registry parity, Async's
adapter union, explicit Arcade dispatches, and renders all **37 game/mode
combinations**. The exhaustive Async help map is also checked by TypeScript.
Each future catalog entry must have nonempty accessible rules; each supported
Async type must have mode coverage. A future database-only activation still needs
the normal release-time registry comparison.

| Game(s) | Existing canonical reference used by the audit |
|---|---|
| Holm | deployed `resolve_holm_showdown`; `holmDatabaseResolutionOwnership.test.ts` |
| 3-5-7 | authority cutover/leg-reserve migrations; `GAME_RULES.md` source map |
| Cribbage | `cribbageTypes.ts`, `cribbageGameLogic.ts`, authority cutover and scoring contract |
| Gin Rummy | `ginRummyGameLogic.ts`, authority cutover; deployed settlement wrapper/legacy payout formula |
| Horses, Ship Captain Crew | `horsesGameLogic.ts`, `sccGameLogic.ts`, deployed immutable `horses_scc_player_result` |
| Yahtzee | `yahtzeeScoring.ts`, authority/settlement contract |
| Farkle | existing frozen-config `FarkleInstructions` and scoring table |
| Canasta | existing Classic two-player article and Beginner/Expert contract |
| Six-Card Golf | deployed `golf_admission_rules()` /2; `golf/model.ts`, historical /1 article |
| Battle 31, Race Poker | existing versioned articles and current published rule contracts |
| Run21 | deployed `run21/3`, shared scoring reference, `server/delayed/adapter.ts` |
| Tri Towers, 11 Up, Boxdrop, Trip Flip, Take Two, Royal Flash | deployed frozen Arcade rulesets; existing shared versioned renderers |
| Quintzee | deployed `quintzee_default_rules()`, live configuration restriction, shared Async adapter |
| Ptown Words | deployed live /2 and Async /3 rules; existing shared article |
| Mega Card Golf | shared `megaCardGolf/config.ts`, `engine.ts`, `competition.ts`, Async adapter |

No missing source material was found. This work changes explanations and discovery,
not the accepted rules, scoring, admission, settlement or historical state.

## Splash boundary and correction

### iPhone playback hotfix after failed owner smoke — 2026-11-04

Jeremy's physical smoke of `5407fd0fc` reports that the initial flash is gone,
but the splash remains on the bridge without animation/branding. His hotfix
request continues the approved splash correction. The previous release is not
accepted as a working physical-iPhone splash.

The new preparation phase required `loadeddata` / `readyState >= 2` before
calling `play()`. iOS can defer media data until playback is requested, creating
a circular dependency. The focused regression fails on the released source;
the compiled-App test also reproduces the bridge stall when real MP4 delivery
is gated solely by an explicit `play()` request. This is controlled browser
reproduction of the failure boundary, not remote inspection of Jeremy's phone.

Playback now starts muted during preparation, behind the decoded opening image.
One playback effect spans preparation and showing, so `loadeddata` neither
pauses, reloads nor restarts the clip. The existing first-frame visibility guard,
approved MP4/images, native startup images, complete three-second sequence,
fallback bounds and fresh-launch/recovery/resume admission remain unchanged.
No auth, database, gameplay or other onboarding behavior changes.

App TypeScript, production build and 45 focused splash tests pass, including
cold-data playback, rejected/stalled play requests and late rejection after
resume cancellation. All 28 compiled-App launch cases pass, including real-video
playback after deferred data, no initial flash, full duration, actual asset-cache
hits and recovery/resume exclusions. Qualification and publication are recorded
with `release-splash-playback-hotfix-20261104-verified`. Owner acceptance still
requires a fresh iPhone Home Screen launch with the full animation and no flash.

### Earlier Round 2 first-frame correction

Jeremy sees one blank frame immediately after tapping the installed icon. The
published MP4 and opening PNG matched the approved source bytes. Before correction,
the compiled App showed generic boot/account/lobby loading before mounting the
opening artwork; the video then overlaid that artwork with `readyState=0`.
The prior browser test validated a poster while video bytes were withheld, but
did not guard the native video handoff. Desktop Chromium did not reproduce the
exact physical iPhone blank; that acceptance boundary remains explicit.

The early eligible-Home-Screen cover now prepares the opening PNG and carries it
through initialization. Authentication/access errors and excluded routes release
it; a five-second failure bound prevents a stuck cover. FreshLaunchSplash retains
authenticated admission and the existing per-document, route, recovery, resume,
notification and interaction exclusions. Both images are decoded before its
surface appears. A preparation phase waits for video data, then plays the full
clip from zero. Opening art stays above the native video until its first frame
callback (or decoded playing/paint fallback). Failure/reduced-motion/final PNG
and cleanup remain bounded.

The document also supplies static iPhone startup images using Apple's launch-image
link API. `dev/launch-splash/startup-images.mjs` generates lossless, contain-fit
portrait/landscape exports from the unchanged opening frame for 12 display profiles.
These platform-required dimensions do not change felt or application geometry.
The 24 files total about 50 MiB; iOS selects a matching asset rather than loading
the whole set. MP4, original PNG, artwork sequence and three-second duration are
unchanged. Native iOS startup-image cache/update behavior requires physical smoke.

## Qualification and release

- App TypeScript and production Vite build pass.
- 250 focused tests and 241 shared harness tests pass, including all 37 rule-mode renders, persisted decisions,
  access guards, opening-image decode, delayed media, frozen versions and unchanged
  approved asset hashes/native dimensions.
- 34 actual-component onboarding/lobby browser scenarios pass with production CSS:
  both platforms, compact/landscape, text enlargement, touch/keyboard, explicit
  decisions, Help, all games selectable, Mega Other/modes and Settings handoff.
- All 27 compiled-App splash scenarios pass, including cold and actually cache-served launches,
  opening-image pixel comparison, first-frame preparation, full three-second
  playback, delayed JavaScript/data, failure/reduced motion, resume, deep links,
  recovery and ordinary-browser exclusion. Backend/device fixtures are synthetic;
  no production records are written.
- The earlier unrelated DealerGameSetup Mega mock failures remain outside scope;
  the outdated Mega catalog test was corrected to current live availability.

Publication is recorded by `release-mobile-round2-20261104` and its `-verified`
checkpoint, with exact SHA/deployment evidence in the delivery receipt. Jeremy's
physical-device acceptance is pending: fresh installed iPhone launch twice (warm
and cold assets), no blank/settled flash/restart; resume, notification and active
recovery remain splash-free. Check the three-second iPhone/Android instructions,
explicit decisions, Help → Other → Mega Card Golf and the contextual rules links.
