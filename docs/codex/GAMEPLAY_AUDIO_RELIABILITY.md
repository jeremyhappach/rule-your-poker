# Gameplay audio reliability and header controls — 2026-11-01

## Scope and confirmed causes

TriTowers' October 31 immediate-upcard change disconnected useTriCardFlight, the only individual-card sound caller. Celebrations and countups retained separate callers. The shared board now dispatches the existing swoosh for one confirmed removal or stock draw, independently of animation, reduced motion and geometry. The upcard remains immediate. Initial/recovered/batched/regressive snapshots and saved replay are silent; exact round/actor scope and progress receipts deduplicate live events.

AudioManager previously retained muted pending events and did not resume on preference enable. It now stops sources and consumes queued/timeline events on mute, background and interruption, resumes on enable, trusted gestures and foreground/pageshow, and handles Audio Session interruption recovery. Initial autoplay permission may still wait within a live cue's existing deadline; elapsed effects are not caught up. Context reuse, cue envelopes, score/announcement timing and simultaneous independent effects remain intact.

GameplaySoundButton and global Settings subscribe to the existing AudioManager. Both immediately update the existing profiles.play_sounds boolean through one save method; the UI rolls back a failed save. An in-flight save cannot race a second local save or unlock a subsequent account's save. Visual Preferences' general Save no longer rewrites an older Sounds draft. No new preference field or local sound preference was introduced. Session storage contains the existing event receipts only.

CanonicalTableHeader exposes the speaker only for gameplay in table presentation; FullscreenGameShell owns it for fullscreen multiplayer, Arcade and async gameplay. Loading shells, saved reviews, course/leaderboard pages, match homes and Session Ended have no speaker. NotificationBell renders only on the main lobby; its provider, unread updates and delivery are unchanged. Existing sizing, navigation, safe areas and geometry remain in place.

## Platform behavior and reference reuse

The House Recipes and Homestead sources inspected were their respective src/lib/assistant-audio-session.ts files. Reused their feature-detection, page-wide ownership and prior-category restoration pattern. Their silent looping media priming was deliberately not adopted. The existing one-sample, one-time Web Audio gesture unlock remains; there is no silent loop.

The shared manager requests navigator.audioSession.type = playback while enabled foreground gameplay owns the header, and restores the previous category on mute, background or the final gameplay owner leaving. Android/unsupported implementations use standard Web Audio without requiring this API. A physical silent-switch change has no portable browser event. Supported iOS playback mode removes that dependency; it cannot override media volume zero, audio routing, Do Not Disturb policies, OS interruptions, browser bugs or unsupported older iOS. First interaction may still be needed for autoplay permission.

Sources checked November 1, 2026:
- [WebKit's documented iOS 17 playback solution](https://bugs.webkit.org/show_bug.cgi?id=237322#c6).
- [W3C Audio Session ownership and interruption model](https://www.w3.org/TR/audio-session/).
- [Supabase filtered updates with returned rows](https://supabase.com/docs/reference/javascript/update).

## Bounded pathway audit

- One Web Audio context owner: platformAudio/AudioManager; all production source creation belongs to cues scheduled through it. Existing standalone HTML background music is a separate, currently unmounted UI path; no second gameplay effect engine was introduced.
- TriTowers: shared board covers multiplayer, Arcade and async turns; saved board replay is excluded. Existing tower trills, all-clear fanfare, intro bell and presented-score audio remain separate and unchanged.
- Run21: placement, failure, intro bell, countup and medals already use the manager. Royal Flash and 11 Up confirmed placements/groups, Take 2 and Trip Flip score/fanfare, Boxdrop, Quintzee, Race Poker, Battle31 and Mega Card Golf cues also use it.
- Canonical card transport (Golf/Battle31 sound intents), Canasta movements, Gin scratch, doorbell and knock use the same gate. Existing silent card paths were not assigned a new sound design. No animation, gameplay timer, rule, notification delivery, player or financial owner changed.
- Identity/receipt expiration, recovery baselines and cancellation stay in their existing owners. The fix never reinitializes a game or changes its authoritative state.

## Qualification

TypeScript and the production bundle pass. The full source run covered 477 files: 474 passed; three files failed only because their old audio mocks lacked the new methods. Those fixtures were corrected and all 78 tests in those files passed. Together with the final added lifecycle cases, 3,421 source tests are qualified. All 241 harness tests pass. The focused nine-file run passed 126 tests, with subsequent new account/session cases passing separately. Four compiled-App browser scenarios passed, and portrait/landscape screenshots were inspected. The preferred tsgo executable is not installed; the existing project TypeScript compiler was used without installing dependencies.

Production read-only schema inspection confirmed profiles.play_sounds is boolean NOT NULL DEFAULT true; existing SELECT and own-profile UPDATE policies support the unchanged persistence model. No schema migration, historical session mutation or hosted test data was used.

The reproducible browser proof is dev/audio-reliability/browser.mjs. It serves dist and intercepts all authority traffic with local fixtures; it records real Web Audio buffer/oscillator starts, verifies confirmed card events, mute/unmute, persisted profile reload, suspended-context focus recovery, one context per page, header bounds and navigation at 320×740, 390×844, 844×390 and 1440×900. Outputs are under qualification.local/audio-reliability. The local bundle uses the repository's retired default backend URL, but every backend request was intercepted; no hosted calls occurred. This local artifact is not published: the normal Vercel Git build uses its existing production configuration. This is programmatic desktop-browser evidence, not physical audio listening.

## Required owner production smoke

1. iPhone installed Home Screen PWA: set media volume above zero, silent switch ON, Sounds ON. Enter TriTowers and verify each card play/draw, tower trills, countup and celebration.
2. Toggle silent OFF/ON during the same round. Continue playing: subsequent sounds should work without a new round, reload or reentry.
3. Mute during a countup/celebration: audio must stop immediately. Make a muted move, then unmute: no old sound should replay; the next move should sound.
4. Change Sounds in global Settings; verify the gameplay speaker matches. Toggle the speaker, return to Settings, and reopen the app: verify the saved value. Other visual preferences keep their existing Save behavior.
5. Repeat in Arcade, a canonical multiplayer table, a fullscreen multiplayer game and an async turn. Include a card event close to a celebration; expect distinct cues without duplicates.
6. Background/foreground, lock/unlock, interrupt with another app/call, pause/resume, and navigate between game modes. Verify no old effects replay and subsequent effects work. If the OS still requires a gesture, tap once within the current game; no game reset should be necessary.
7. Android installed PWA: media volume enabled, Sounds ON, test normal and vibrate mode, then mute/unmute and background recovery. System volume/routing/DND restrictions remain in force.
8. Main lobby: bell only. Active game: speaker only. Loading, leaderboards, match homes, saved reviews and Session Ended: neither. Check compact portrait and landscape navigation/safe areas.

Physical iPhone/Android checks have NOT been performed. Owner runtime smoke remains acceptance truth.
