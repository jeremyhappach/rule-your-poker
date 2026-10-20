# Take 2 round-end presentation — 2026-10-19

Checkpoint: `take-two-round-end-2026-10-19`. Production phone/speaker smoke pending.

## Ownership and sequence

Both adapters use `TakeTwoView`, the accepted `TriScorePill`, and the existing
`useTriRoundPresentation` admission/audio owner. Its optional sequence policy is
used only by Take 2; TriTowers, 11 Up and Royal Flash retain their defaults.
Take 2's policy lives in `src/lib/takeTwo/roundPresentation.ts`.

The detailed result breakdown is replaced by a centered, animated total. Ordinary
endings use the accepted normal sequence: center in 200 ms, count from 1,200 to
4,000 ms, return by 4,300 ms. Full clear first shows ALL CLEAR and the exact
`result.clearBonus` for 3,000 ms, centers from 3,000–3,200 ms, counts from
3,200–5,200 ms, and returns by 5,500 ms. The frozen shared 6,000 ms server hold
already accommodates this, including a final 500 ms at home. No migration or
gameplay timing/configuration change was needed.

All offsets derive from `holdMs - (deadline - server-adjusted now)`, including
the pause timestamp and shifted resume deadline. No animation, audio callback,
timeout or local counter advances the game. The pill interpolates between the
authoritative `scoreBefore` and `score`; it never adds any bonus itself. Clear
qualification comes from the authoritative result reason, not empty DOM cards.

`src/lib/takeTwo/allClearCue.ts` supplies a distinct bright chip arpeggio and
resolving chime, instead of TriTowers' brass fanfare. It uses the existing platform
AudioManager, mute preference and one shared context. Count-up uses the existing
score sound owner. Event keys include Take 2, round scope and result identity;
rerenders do not restart sources. Late unlock skips elapsed attacks. Recovery,
backgrounding, connection loss, panel changes and pause retire old sounds while
the visual seeks the correct position. Reduced motion shows static artwork and
the final authoritative score without animated/count audio.

Preserved: shared `take-two/1` rules, legal pairs/exposure, all scoring and bonus
qualification, game clocks, request dedupe/stale protection, settlement, records,
server progression, round intros and prior responsiveness/layout fixes.

## Verification

- Full typecheck, 2,511 app tests, 241 harness tests and production build passed.
  The focused presentation suite subsequently passed all 11 tests, including two
  additional recovery cases. Existing TriTowers presentation tests remain green.
- Eleven focused cases cover both modes, actual bonus values, final total once,
  normal/all-clear ordering, sound expiry, reconnect during celebration/count,
  background resume, pause deadline shifting, reduced motion, mute and shared
  AudioManager reuse through Arcade → multiplayer → Arcade.
- Five browser runs use the real local SQL/RPC authority: Arcade/multiplayer
  clear, Arcade/multiplayer normal ending, and muted multiplayer clear. Only
  newly created isolated local fixtures are seeded near a clear; their final
  pair, award amounts and deadlines come from the actual authorized action.
- The full-clear visual changed to score at 3.026–3.034 s. Final authoritative
  totals appeared at 5.231–5.235 s, before the unchanged 6 s deadline. Normal
  totals appeared at 4.038–4.048 s. The fanfare and count-up windows never overlap.
  Audible cases scheduled Web Audio sources; the muted case scheduled zero.
- Full browser flow verifies pair, draw, reload, Arcade leaderboard, multiplayer
  active-player ownership, six turns, settlement and continuation.
  A concurrent-browser run stalled at an action; the isolated run with the actor
  foregrounded immediately before dispatch passed. The harness now records any
  failed action response and screenshot; production visibility guards are intact.
- 45 result layouts: 393×662, 393×587, 852×393, 852×300 and 1440×900; one/two/seven
  players; all-clear, post-clear count and normal count. All fit; the pill centers
  within 1 px and does not overlap the title. The existing 42 gameplay geometry,
  rank/readability and hit-target checks also pass.

Evidence is ignored under `qualification.local/take-two/round-end/`,
`layout-pass-round-end-gameplay/`, `round-end-build.log` and `browser.json`.
Scripts: `dev/take-two/round-end-browser.mjs`, `round-end-layout.mjs`,
`layout-pass.mjs round-end-gameplay` and `browser.mjs`. Browser audio evidence is
source scheduling, not a claim to have heard the physical iPhone speaker.

## Owner smoke

1. Both modes: Take Score and timeout show the centered count-up with count sound,
   no itemized breakdown; the next round follows only after completion.
2. Clear the tableau: ALL CLEAR and the awarded bonus appear with the distinct
   fanfare for about three seconds; counting starts afterward and includes that
   bonus once. Check the final round as well.
3. Mute/unmute, switch Arcade/multiplayer, background/resume and reconnect during
   the result. Old sounds/celebrations must not restart; the visual seeks forward.
4. Rotate the phone and show/hide browser chrome: title and score remain readable
   and separate. Finish Arcade to leaderboard and multiplayer through results.
