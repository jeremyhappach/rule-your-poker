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

## Owner follow-up — record notation and panel height

Continues local checkpoint `330f25bbc5856731a69cfc2e65c73bf5fe62fb5c`.
Only course-record presentation and intermediary leaderboard sizing changed:
positive records use +, exactly zero uses E, and negative records keep their sign.
Empty (—), loading and unavailable states remain distinct. Stored scores,
leaderboard values, ordering, requests and gameplay are unchanged.

The board panel now aligns to its intrinsic content, capped by its existing grid
space. In the 390×844 fixture its content/panel heights are approximately 399/423
pixels, eliminating the previous stretch to the bottom of the screen. Short
portrait and landscape panels retain scrolling to every Top Ten row and the
existing 44px controls. All four previous viewport checks pass with no page errors
or external requests. Selection, all themes, and local gallery captures are refreshed.

Validation: 11 focused navigation/format tests pass, including positive/zero/
negative/missing records and loading/failure distinction; application TypeScript
and Vite production build pass. Existing build warnings remain. Evidence logs:
`record-followup-tests.log`, `record-followup-build.log`, and `browser-report.json`
in the existing local evidence directory. No upload, transfer or publication.

## Owner follow-up — discard copy and Coastal shoreline

Continues `ad69ef4e8274b76ae39e35303b191555f35114ac`. Configured counts now render
“1 discard per hole” or “0/3 discards per hole” on selection and intermediary screens.
No configuration values changed. Coastal Links retains its name and original
artwork; only its intermediary crop changes. The larger portrait crop places
rocky surf below the board; landscape retains a wider crop and reserves a small
shoreline strip below the board. Selection artwork and both other themes are unchanged.

Actual Chrome fixture captures were visually inspected in portrait and landscape.
Four-size checks verify the Canyon copy, visible Coastal space below the panel,
all ten rows reachable, 44px controls and no page errors/external requests.
14 focused tests, application TypeScript and Vite build pass. Existing build
warnings remain. Evidence: coastal-followup-tests.log, coastal-followup-build.log,
browser-report.json and refreshed screenshots/gallery in evidence.local.

Exact files for this follow-up:
- src/components/megaCardGolf/CourseSelection.tsx
- src/components/megaCardGolf/CourseClubhouse.tsx
- src/components/megaCardGolf/megaCardGolf.css
- src/components/megaCardGolf/Navigation.test.tsx
- dev/mega-card-golf/polish/browser.mjs
- dev/mega-card-golf/polish/gallery.mjs
- docs/codex/CURRENT_RELEASE.md
- docs/codex/MEGA_CARD_GOLF_POLISH.md

No asset files changed. No upload, file transfer, push, merge, deployment, production
write or admission change. Gameplay, stored scores and ordering remain intact.

## Publication approval and release validation

Jeremy subsequently approved publication of reviewed candidate
`687f46910768439c14626cce2f5390834d8810cb`, including integration, normal release
checks, push, deployment and exact live SHA/release-signal verification. This
supersedes the earlier local-only publication hold. Gameplay, migrations,
leaderboard resets and admission changes remain outside scope.

The full release check passed TypeScript and 2,812 tests, then stopped on the
card-face source inventory: the new current/archive leaderboard renderers expose
numeric `ScoreRow.rank` values. Review confirmed they render leaderboard positions
and no card faces. Both are now explicitly registered alongside the inventory's
existing reviewed exceptions. This correction changes only the test inventory;
the published application source remains identical to the reviewed candidate.
The full `npm run build` rerun passed application TypeScript, all 2,813 source
tests, all 241 harness tests and the Vite production build. Existing Browserslist
and bundle-size warnings remain. Evidence is retained in the ignored local
`evidence.local/release-build-final.log`. Owner gameplay smoke remains pending.
