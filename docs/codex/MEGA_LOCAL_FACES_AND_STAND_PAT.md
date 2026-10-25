# Mega faces and anytime Stand Pat — local review, 2026-10-24

Owner-approved local scope, based on f4b4f38a2bafb6ed115044269a80e2ea957094cf.
Branch: `codex/mega-rank-spacing`. No main integration, push, publication,
production checks, migrations, activation or leaderboard changes in this task.

## Card faces

The existing Georgia rank baseline left especially large top whitespace on 10.
Mega's suited large face now uses a hanging baseline at y=8 in its existing
100×140 SVG. In the Windows Chrome raster check, the 10's ink top moves from
53.6 to 21.2 SVG units. Font size, horizontal spacing, suit art and all card
containers are unchanged. All 52 faces retain safe ink padding and rank/suit
separation. Shared small/medium/large faces outside Mega and four-color rank-only
faces retain their previous layout.

Actual board/stock rectangles match before/after at 390×844, 844×390, 320×568 and
568×320. The actual MegaCard arrival animation retains 5:7 at source, midpoint
and landing. Screenshots were inspected; physical iPhone Safari remains owner review.

## Stand Pat /4

`mega-card-golf/4` enables Stand Pat throughout the playable hole, regardless of
stock/discard allowance or a pending draw. Confirming the established Tap In?
dialog preserves all six board cards and calls the existing closeHole owner:
reveal concealed cards, canonical score, ordinary hole/final presentation and
completion. It records reason `stand-pat`; it never grants a free discard or
continues the same hole. Cancel submits no action. Stand Pat and Discard occupy
separate existing control rows with 44px minimum targets.

Jeremy confirmed on 2026-10-24: require the two opening reveals first, then allow
Stand Pat anytime during the playable hole with Tap In? confirmation. This
matches the implemented and tested opening guard in product commit
`9faaf67f81e1f9e9b0aa3de2cbc4a36a185bede4`; no product change or repeated checks
were needed to record the decision. Busy/animation/terminal gates remain; a
revision change or expiry invalidates confirmation. The authoritative locked
commit deadline still wins an expiry race. /1–/3 behavior and frozen snapshots
are unchanged. New /4 starts require separate future activation.

## Local qualification

- Application TypeScript, 124 focused tests (Mega engine/UI, legacy contracts,
  catalog and card-face inventory), and production bundle build pass. The final
  confirmation adjustment was rechecked with all 8 gameplay component tests.
- 48 reducer combinations cover remaining/exhausted stock, allowance, pending
  and exposed counts. Tests also cover continuation, terminal rejection,
  confirmation/cancel, old versions, replay, reconnect and timeout boundaries.
- Disposable PostgreSQL at 127.0.0.1:55439: 24 actual service/SQL cases, rollback
  preservation of /1–/3 active runs/receipts/history, independent-connection
  duplicate/competing-action/expiry races, and shared recovery initialization plus
  zero-client completion pass. No hosted database was accessed.
- 12 phone browser cases pass confirmed/cancelled Stand Pat with pending/no pending,
  final/remaining stock and zero/nonzero discards. Opening guard and canonical
  hole/final presentation pass. No page errors or external requests.
- Existing Browserslist/chunking build warnings remain. No dependencies installed.

The first local migration proof caught CRLF function fingerprints in the Windows
fixture. Normalizing the replayed baseline SQL to its qualified LF source fixed
the fixture; fingerprint guards remain unchanged. Browser checks caught and
corrected overlapping action rows, then a closing-dialog copy flash.

## Prepared forward SQL and worker

`supabase/mega-card-golf/stand-pat-v4-register.sql` registers /4 DISABLED and
extends only the guarded start/catalog version selection. Commit/scoring/receipt
SQL is unchanged. `stand-pat-v4-activate.sql` is separately guarded and LOCAL ONLY.
The installed CLI was absent from PATH and its repository-recorded cache path;
no installation was attempted. These reviewed SQL candidates are deliberately
outside auto-applied migrations; timestamp registration and hosted qualification
belong to a separately approved release. No migration history was fabricated.

The locally bundled shared recovery worker includes /4 compatibility. Its hash,
database name, proof results and bundle are in the ignored
`dev/mega-card-golf/stand-pat-anytime/evidence.local/` directory. Existing local
baseline evidence was reused; no production source or credentials were fetched.

## Inspect and reproduce

Local server: http://127.0.0.1:5194/dev/mega-card-golf/rank-spacing/review.html

The review page links before/after faces, board/stock, an interactive /4 Stand Pat
fixture, no-pending-stock and opening-selection cases. Fixtures are local memory
only. Screenshots and browser reports are retained in each fixture's evidence.local.

Commands from this worktree:

```text
node node_modules/vite/bin/vite.js --config dev/mega-card-golf/polish/vite.config.ts --port 5194
node dev/mega-card-golf/rank-spacing/browser.mjs
node dev/mega-card-golf/stand-pat-anytime/browser.mjs
node dev/mega-card-golf/stand-pat-anytime/proof.mjs
```

Changed product owners: `src/components/megaCardGolf/megaCardGolf.css`,
`MegaCardGolfGame.tsx`, `src/lib/megaCardGolf/config.ts`, `engine.ts`,
`server/megaCardGolf/service.ts`, `src/components/rules/MegaCardGolfRules.tsx`,
`src/lib/gameCatalog/games/mega-card-golf.ts`.
Additional files: scoped engine/UI tests; the two forward SQL candidates;
rank-spacing and stand-pat-anytime local fixtures/proofs; this report and the
CURRENT_RELEASE local checkpoint. Other games and worktrees are untouched.
