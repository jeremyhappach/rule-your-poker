# TriTowers scene and introduction — October 17, 2026

Approved second polish pass in both modes. Owner smoke remains pending, including
actual phone rotation. No application orientation lock was found in source,
HTML, Vite or Capacitor configuration; browser viewport checks do not prove
physical-device rotation.

## Shared presentation

`TriTowersBoard` owns the sky/painted grass/castle composition, top Take Score /
purple score pills / HI-RUN row, dotted strip and teal controls. Bottom order is
CURRENT RUN, upcard, stock; the count follows the stock card's upper-left corner.
All 2–7 multiplayer participants retain labeled scores and canonical chip anchors.
Portrait uses two pill columns; landscape uses up to four. Solo has one centered
pill. The canonical multiplayer announcement rail and financial owners remain.

Only tableau cards select `cartoonLayout="tableau"`: prominent centered ranks,
main suit, smaller illustrated courts. Upcard, Run21 and ordinary poker fronts
retain their existing treatment. The new grass is original imagegen artwork;
asset provenance is in `src/assets/cartoon/README.md`.

Live completion moves only the completing pill, counts its authoritative score
over 2.8 seconds, and returns by 3.1 seconds of the existing five-second hold.
Remaining cards and tower badges stay mounted. Fresh result mounts, reconnect,
offline and hidden-document interruption suppress replay. Reduced motion keeps
the pill at home. Shared `platformAudio` owns count-up/bell audio and preferences.
No animation callback advances authority or extends a deadline.

## Versioned introduction and compatibility

`tri-towers/3` adds only `roundIntroMs: 2500` to v2 configuration. The shared SQL
wrapper delegates dealing and gameplay to the unchanged v2 core, admits no action
during intro, then anchors the full 30-second Ready interval to intro expiry.
First valid play still starts the full 120-second playing clock. Every participant
round and earned bonus round gets its own intro. Existing pause/resume shifts the
stored deadline. Existing recovery advances without a client; late work does not
restart intro or extend Ready. Existing v1/v2 states retain their behavior.

`private.arcade_score_group` explicitly maps only TriTowers v2/v3 together.
Leaderboard eligibility, personal-best lookup and result rank use that group.
Immutable results retain their frozen version. Configuration equality excluding
version/intro, scoring parity and mixed-version matched/broken/lower personal
bests were proven. Run21 score grouping remains version-specific.

Migration `tri_towers_scene_intro` installs disabled v3 admission. The compatible
client uses `tri_towers_present_scene`; old multiplayer presentation clients get
a refresh message for v3. Arcade checks presentation capability in its API.
`activate-scene.sql` enables v3 only after the matching production client is Ready.
No historical state is rewritten. Real-money admission remains prohibited.

## Evidence and smoke

Exact deployed changed-function definitions were captured before the isolated
candidate. Legacy and v3 proofs exercise scoring, auth/replay, all 2–7 participant
orders, bonus boundaries, actual canonical financial transfers/results, injected
failure rollback, continuation, late replay, terminal state and competing workers.
Production candidate and installed rollback proofs pass for Arcade isolation,
intro boundaries and compatible leaderboard/PB results. New admission stayed off
through those proofs. Existing scoring/dealing/settlement functions are unchanged.

Full application/harness validation passed (2,308 + 241 tests); the additional
completion test and card regressions passed in a focused 22-test run. TypeScript
and production build passed. SQL/SSE browser evidence under
`qualification.local/tri-towers/scene-ui` covers both modes, 2/4/7 participants,
320/390 portrait, 844 landscape, desktop, remaining-card preservation, pill return
within hold, reconnect suppression and unchanged Run21 front presentation.
These checks do not constitute Jeremy's production smoke acceptance.

Jeremy should check physical rotation, seven-player score readability, a tower
clear followed by completion, count-up/bell preferences, refresh during intro and
result hold, the 30-second Ready/full playing clock, bonus intro/reset, combined
v2/v3 personal bests, and normal settlement/continuation/Session Ended.
