# Mega Card Golf course navigation polish — local review

Date: 2026-10-23. Branch: `codex/mega-card-golf-polish`.
Base: `adc76249827204d15242f066be2c9c3e7dc726af`, independently matched by
GitHub main and holm357.com/build-manifest.json before implementation.
Local only: no push, main merge, deployment, database migration/write, admission
change, dependency installation, or Docker restart.

## Result and ownership

- Mega branding stays above “Select a Course”; selection has one Back to Arcade
  button and three artwork tiles. Selecting a tile does not start a run.
- Tiles show name, difficulty, one all-time record, holes/discards/draws. There is
  no fabricated record fallback. Empty boards show —; request failures show
  Unavailable. Artwork files are unchanged.
- CourseClubhouse owns the intermediary artwork/Start Game/Return to Clubhouse
  screen. MegaLeaderboard uses the existing leaderboard operation with exact
  course and board IDs, Last 30 Days / All Time, server order, and shared ranks.
  Archived boards remain readable. The catalog's default 30-day list is not
  misrepresented as an all-time record.
- MegaArcade retains its gameplay/restore/completion owners. Start Game is the
  sole new-run trigger; existing runs can be resumed or abandoned from the
  intermediary screen. Selection contains no play controls.
- The existing admin-only GameLobby → Defaults → Cards → Mega Card Golf entry
  remains the only production Defaults entry. MegaDefaultsConnected and its
  revision/settings/retain-or-archive save contract are unchanged. Scoped CSS
  lets that longer form scroll in the existing dialog on short screens.

## Validation and preview limits

40 focused tests pass: reducer/scoring, catalog, navigation/start separation,
active-run resume, admission disabled, all-time zero/empty records, stale-board
response rejection, server ordering/ties, admin denial, and exact archive-save
contract. Application TypeScript and Vite production build pass. Build warnings
are the existing outdated Browserslist data and bundle chunking warnings.

Installed Chrome through Playwright rendered actual application components in an
isolated local Vite fixture. The fixture aliases auth/lobby reads and Arcade
transport away from production; all non-localhost browser requests are blocked.
The scores and admin identity in screenshots are labeled sample fixtures.
These are rendered implementation screenshots, not mockups or production smoke.

Four sizes: 390×844, 844×390, 320×568, 568×320. All three selection tiles fit with
no vertical scroll. Browser interactions cover each course, both periods,
return navigation, exactly one local Start Game request, ten leaderboard rows
including scrolling to the last row, and lobby Defaults entry. Important course
buttons have at least 44px height. No page errors or external requests occurred.
Short intermediary screens scroll the board; Defaults scrolls its existing dialog.
No physical iPhone/Safari or hosted database behavior was newly qualified.

## Local review artifacts

Screenshots, browser request log, tests/build logs and gallery:
`dev/mega-card-golf/polish/evidence.local/` (intentionally local, not committed).
Gallery: `index.html`. Portrait and landscape screenshots cover selection,
Sunny Meadows, Coastal Links, Devil’s Canyon, lobby entry and Defaults;
compact and lower-leaderboard captures supplement them.

Start preview: `node node_modules/vite/bin/vite.js --config dev/mega-card-golf/polish/vite.config.ts`
Open: `http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html`
Capture: `node dev/mega-card-golf/polish/browser.mjs`.
The fixture uses only local memory/file state. Fresh manual previews have real
local empty boards; the browser capture injects labeled sample leaderboard rows.

## Changed files

Product: CourseSelection.tsx, CourseClubhouse.tsx (new), MegaArcade.tsx,
MegaLeaderboard.tsx and megaCardGolf.css under src/components/megaCardGolf.
Tests: Navigation.test.tsx and Defaults.test.tsx in that directory.
Local tooling: dev/mega-card-golf/vite.config.ts and dev/mega-card-golf/polish/.
Documentation: this report, CURRENT_RELEASE.md and REPO_MAP.md.
