# Approved Arcade leaderboard themes — November 8, 2026

Jeremy approved revision 3 of the isolated 14-game preview set for production.
The shared GameBoard now carries each game's identity into its leaderboard.
Mega Card Golf remains the unchanged visual reference and uses its existing clubhouse.

## Presentation and assets

| Game | Theme / source |
| --- | --- |
| 357 Drop | Gameplay Peoria bridge photograph, raised crop, translucent arched 3♠ 5♥ 7♣ |
| Chucky Showdown | Green felt and warm portrait lighting; approved four-card Chucky PNG in public/arcade/leaderboards; compact single-line title |
| Crib Lab | Green felt, decorative peg track, translucent arched 6♣ 7♥ 7♠ 8♦ |
| Horses Blitz | Existing approved trackside gameplay art, raised to expose rail and track |
| Ship Cap Voyage | Existing approved deck gameplay art; teal and gold |
| Mega Card Golf | Existing CourseClubhouse and MegaLeaderboard, unchanged |
| Run21 | Existing Run21SpaceScene; navy and gold |
| TriTowers | Existing cartoon tower and grass assets; sky, green and purple |
| 11 Up | Green pool felt and CSS billiard-ball accents |
| Boxdrop | Gameplay factory palette and CSS rails/numbered blocks |
| Trip Flip | Blue field, gold card backs |
| Take 2 | Purple field and paired purple/gold card backs |
| Royal Flash | Teal field and decorative 5×3 card grid |
| Quintzee | Existing lobby dice motif and blue/amber palette |

No additional art is needed for this release. The approved Chucky portrait is a
separate leaderboard asset; gameplay art stays with its existing owners.

## Preserved behavior

GameBoard retains its leaderboard request/effect, request-id/start guard, frozen
ruleset selection, navigation, Resume/Play Again, results, personal best, rank,
period tabs and keyboard behavior. Rules & info exposes the existing dialog.
Classic Mode and Chucky history retain their existing owners. The visible
“Top 10 verified scores” heading is removed; explanatory rules remain in the dialog.

Names wrap, scores remain aligned and achieved dates/times use two lines.
AchievementTime's optional splitLines presentation leaves other callers unchanged.
Every new CSS rule is scoped to the themed board. There are no API, SQL, ranking,
scoring, lifecycle, financial, authentication or notification-policy changes.

## Verification

- Catalog inventory: all 14 current ARCADE_GAMES, five Originals and nine Other Games.
- Installed Edge touch browser: 98 checks across 320×568, 375×812 and 430×932.
  Both periods fit long names, 123,456,789 scores and viewer-local timestamps.
  Chucky stays on one title line. Local API fixtures exercise Rules, tab keyboard
  navigation, all 13 Start actions, Resume, Play Again/result, Classic Mode,
  history, outside-top-ten rank, empty/error states and legacy selection.
- No page errors or external requests in this browser qualification.
- The existing timestamp browser runner passes 77 checks, including missing and
  invalid dates, calendar-year boundaries, archived Golf boards, timezone changes,
  and 320/390/844/1280-pixel layouts. Golf's original row-height check remains intact;
  themed rows allow the approved wrapped names and two-line timestamps.
- 98 focused unit tests pass. The already-queued ArcadeSwitchboard fixture failure
  still expects 13 games and omits Ship Cap Voyage; it is unrelated to this change.
- Installed TypeScript check and production Vite build pass. tsgo is not installed,
  so the existing TypeScript compiler was used without installing tools.
- Screenshots and request/layout evidence: qualification.local/arcade-leaderboards.
  Run local fixture with node node_modules/vite/bin/vite.js --config
  dev/arcade-leaderboards/vite.config.ts, then node dev/arcade-leaderboards/browser.mjs.

Only account/API fixtures are synthetic; production receives no sample scores.
Physical iPhone owner smoke remains pending: open each leaderboard, inspect the
requested artwork, change period, open Rules and start/resume a game normally.
Release checkpoint: arcade-leaderboard-themes-2026-11-08. Its verified tag records
the exact production deployment and public build-manifest SHA.
