# Pass 1 sound integration — production authorized / device smoke pending

Jeremy approved the complete Pass 1 palette, including the new Cribbage
scoring-highlight cue, on 2026-11-01. No sound-design approval remains.
The final candidate is prepared in `codex/sound-effects-pass1-release`.
Jeremy subsequently provided explicit production **GO**, authorizing the main
fast-forward and publication through the unchanged push helper. Release tag
`release-pass1-sounds-20261101` identifies the cutover; its matching `-verified`
annotated tag records the deployment, exact published SHA and public checks. No migration, production data mutation,
dependency installation or change to rules/timers/financial ownership is included.

## Final reconciliation and cutover preparation

The refreshed remote and clean local main both resolve to
`dbc57dbe85f75265d4d5d60d5f67ce5e7fb24659` (2026-11-02 UTC / November 1 Central).
That commit is already an ancestor of Pass 1. The approved runtime remains
`d39f0140e68d6f914fcf242098ebb54ca9f8b9eb`; no source merge or conflict resolution
was needed. Both speaker-control and native-recovery source files match their
existing owner branches, and main contains `d140a89f9` and `5765ff215`.
Their additional branch-tip documentation is not missing runtime functionality.

The release branch uses a separate worktree and local Sound Lab port 4327.
Sound Lab's dependency cache is now worktree-local; regression caching is disabled.
Pass 2's branch, assets, files and development server are not edited or merged.
No `dev/sound-studio-v2` or `SOUND_STUDIO_V2.md` is included in this candidate.
Pass 2 must retain its own future approval and release scope. Its independent
work advanced to `da8f6b8d3` during qualification; that commit is not an ancestor
of this release candidate, and none of its changes were imported.

The refreshed typecheck, 3,555 source tests / 489 files, 241 harness tests / 12
files, production build and all 11 palette-native checks pass. The compiled-app
speaker/recovery check passes all four viewport flows (320×740, 390×844,
844×390 and 1440×900), with no page errors or external requests. Build verification finds exactly seven
WAV assets, each byte-identical to its approved audition asset; no unselected
candidate recordings are emitted. Production source is unchanged from `d39f0140e`.

The native recovery fixture now paces audible test actions by the decoded sample
duration. The previous rapid second action was intentionally grouped; waiting
for a retired source's `ended` event was also invalid after native context close.
The corrected fixture forwards native buffer start arguments and never waits
on retired nodes. This is test-fixture adaptation, not a runtime audio change.
Rapid-event suppression remains independently covered by the palette proof.

 No engineering blocker remains. Checkpoint:
`local-sound-effects-pass1-ready-20261101`. Production GO is now granted;
physical-device and real-session acceptance follows the authorized cutover.
Raw logs live in
`qualification.local/pass1-release/`; palette-native browser evidence is in
`qualification.local/sound-effects/`, and the compiled-App speaker/recovery proof
is in `qualification.local/audio-reliability/`. That proof uses synthetic HTTP
authority, real routes, real preference UI and native Web Audio across four
viewports; it never sends production gameplay or preference writes.

Authorized production cutover workflow:

1. Fetch main again and compare it with the exact reconciled baseline above. If
   it moved, reconcile and requalify the affected boundary before publication;
   stop on a material conflict or divergence.
2. Use the clean main worktree at
   `C:/Users/jerem/Documents/Codex/2026-10-27/task/incident-release-main` for
   conflict-free fast-forward integration of `codex/sound-effects-pass1-release`.
   Preserve every unrelated worktree, including Pass 2 and the dirty Golf checkout.
3. Publish only through the existing unmodified `.codex\scripts\push-origin-main.cmd`,
   with no arguments. Its sole Git operation is the installed Windows Git's
   exact `git push origin main`. No migrations, admission changes or production
   data repair belong to this release.
4. Verify Vercel's deployment for the exact main SHA is READY, then perform the
   phone/two-client smoke below. Record the published SHA and owner acceptance
   separately. A local qualification tag is not a production smoke checkpoint.

The pre-cutover app baseline is `dbc57dbe8`. If smoke exposes a release regression,
restore that app behavior through the normal reviewed revert/publication flow;
never force-push or change historical gameplay/financial records.

## Palette and event ownership

The seven committed WAVs total 205,748 bytes. Their hashes match the exact
auditioned assets; the previously normalized levels and complete waveforms are
preserved. Provenance is in `src/assets/audio/NOTICE.txt` and the audition catalog.

| Approved sound | Actual presentation boundary / coverage |
| --- | --- |
| Paper Slide B | Native canonical card-flight start: HOLM, 3-5-7, Cribbage, Gin, Canasta, Six-Card Golf and Battle 31; Mega Card Golf native replacement flight; live TriTowers opening deal, confirmed Run21/TriTowers plays, Royal Flash placements and Trip Flip board moves |
| Soft Card Clip | HOLM community/Chucky CSS flips, a live Cribbage cut reveal, Golf discard/scoring flips; Mega Card Golf opening/stock/replacement reveal; confirmed Run21 pass, TriTowers opening upcard/draw, Take 2 card changes and Race Poker card selection |
| Dice Landing A/B | Horses, Ship-Captain-Crew and Yahtzee shared landing frame; Farkle live roll reveal; Quintzee's existing roll-completion boundary. Unique actual animated/unheld dice select B for one, A for multiple |
| Wooden Peg A | Cribbage peg's actual CSS `left` transition completion, after a new displayed score in the same hand scope |
| Recorded Glass | Committed HOLM `game_results.id`, exact game/dealer-game/hand, loss event kind and negative chip delta for the local player UUID; then the existing completed Chucky reveal gate and visible cracked overlay |
| Winner A | Existing settled canonical winner celebrations for Run21, Canasta, Golf, Battle 31, Boxdrop, Royal Flash, 11 Up, Take 2, Trip Flip, Race Poker, P-Town Words and Quintzee; TriTowers verified terminal receipt; legacy Cribbage/Yahtzee/HOLM/357/Horses/SCC/Farkle terminal financial presentation boundaries; Gin after its awaited settlement and match-win announcement |
| Approved Cribbage highlight | One 190 ms fixed mallet dyad per newly raised scoring combination. Uses the discrete highlight identity/timing approach of Golf scoring. No pitch/trigger derives from the accumulating score. Recovered active combos are silent |

Visible card backs in actual shared flights may sound; private opponent state
changes without visible presentation do not. First/historical snapshots establish
baselines. Dense deals group to roughly one quiet slide per 160 ms instead of
stacking a source for every card. Interruption and same-identity receipts prevent
replay. The Cribbage cut stays acoustically silent when first mounted already cut.

Mega Card Golf cup/hole/tee/course-final cues, intermediate all-clear, scoring,
bell, knock, scratch, doorbell and other
unselected existing live cues remain. Saved async reviews retain their visual
score/medal/finale sequences but suppress historical score/fanfare/sample audio. Race Poker's old pre-settlement victory cue is
replaced by the settled shared winner cue. No 357 leg chimes, dice-rattle,
chip/pot candidates or unselected winner variants are integrated.

## Audio manager and concurrent controls

`AudioManager.present` consumes a discrete visual event immediately, including
muted, hidden, unloaded or locked events. It never creates a playback backlog.
The existing `request`/`follow` APIs still support their established timelines.
Routine samples have cooldowns and a three-voice ceiling; stronger effects retire
weaker ones. Existing meaningful cues suppress new routine sounds while active.

All sound uses the existing singleton and `profiles.play_sounds`. Mute still
retires the complete native graph; unmute uses the existing trusted-gesture
unlock/replacement path. Decoded sample data is loaded once, with one reusable
buffer per asset per native context. Vite fingerprints assets for browser cache.

The base already includes speaker/mute recovery commit `5765ff215`. The audio
controls chat was notified of the manager touch points. No speaker, Settings,
preference persistence, playback-session, route-exit or native-recovery contract
is replaced. Integration occurs only in the isolated sound worktree; the dirty
Golf/main checkout is untouched. Reconcile any newer main changes at cutover.

## Qualification and smoke

Native Edge/Web Audio qualification uses production components in the local
`dev/sound-lab/integration.html` fixture, without gameplay or financial writes.
`node dev/sound-lab/verify-integration.mjs` checks real dice landings, Holm CSS
flip, Mega Card Golf native flip/slide, peg movement, two actual Cribbage scoring highlights, glass overlay,
Winner A, mid-playback mute, grouping and hidden-surface silence. The browser
report and screenshot are in `qualification.local/sound-effects/`.

Initial implementation qualification (`sound-effects-lab` worktree):

| Gate | Result / local evidence |
| --- | --- |
| TypeScript | PASS: `bun run typecheck`; `sound-effects-typecheck.log` |
| Full source regressions | PASS: 3,555 tests / 489 files, `bunx vitest run src`; `sound-effects-unit-final.log` |
| Existing harness regressions | PASS: 241 tests / 12 files, `bun run test:harness:unit`; `sound-effects-harness.log` |
| Last Mega Card Golf addition | PASS: all 105 affected tests / 12 files; `sound-effects-mega.log` |
| Native browser synchronization/lifecycle | PASS: 11 checks, zero page errors; `sound-effects/browser-report.json` |
| Final production bundle | PASS: `bunx vite build`; `sound-effects-build.log`. Existing large-chunk/Browserslist notices only |
| Scope/diff review | Exact seven asset hashes verified; no dependencies, migrations, financial/rule code or gameplay timer changes; diff whitespace check passes |

These initial logs live under `qualification.local/` in the original
`sound-effects-lab` worktree and are intentionally untracked. Fresh release
evidence lives in the locations recorded in the reconciliation section above.
The native browser harness and focused regression tests are committed. The
browser fixture proves real Web Audio source scheduling against actual DOM/CSS
and WAAPI events; it does not prove acoustic quality on physical speakers.
The suite includes preference/recovery, muted/unloaded receipt consumption,
rapid replacement rolls, actual dice counts, hidden surfaces, portal targets,
structured HOLM result admission, final-victory gates, Cribbage highlights/pegs,
async history silence and existing financial/gameplay invariant regressions.

Decision: ready for explicitly authorized cutover and physical-device smoke.
No push, main integration or deployment occurred. The local qualification
checkpoint is `local-sound-effects-qualified-20261101`; it is not a production
smoke checkpoint. Reconcile newer main/controls changes before that cutover.

Database inspection was read-only: deployed HOLM settlement writes the typed
event and chip deltas atomically; its terminal uniqueness index and result read
access were verified. No schema or financial code changes need a new migration.

Before accepting production, smoke two authenticated clients and an observer:

1. Listen on desktop, installed iOS PWA and installed Android PWA. Include a
   dense opening deal, a single visible flip, one-die reroll and multiple dice.
2. In Cribbage, move a peg, score two separate highlighted pairs, and pause or
   change tabs. Confirm one cue per highlight; its sound design is approved.
3. Lose to Chucky in a solo matchup and a tied matchup; verify only the losing
   player hears glass. Verify final Winner A after confirmed payout; ordinary
   rounds and HOLM's continuing showdown award must not trigger it.
4. Mute/unmute during a roll, deal and winner cue. Background, interrupt with
   another app, lock/unlock, reconnect, refresh and resume. Future events should
   work; old events and saved async result reviews should remain silent.
5. Check pause/resume, active-player/opponent views, chip balances, terminal hold
   and Session Ended with Jeremy's normal production smoke. Runtime acceptance
   remains pending; browser automation cannot establish physical speaker quality.
