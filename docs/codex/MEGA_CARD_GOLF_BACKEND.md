# Mega Card Golf — local backend checkpoint, October 22

This supersedes the prototype-only implementation limits in
`MEGA_CARD_GOLF_LOCAL.md`. Work remains on `codex/mega-card-golf-v1`, continuing
prototype commit `54d97ae8e9ede2baff819791b71f87e54bf62600` over base
`df48d4b73892e6965aafadb9768011af0e1906a3`. The lobby/catalog branch is already
ancestral to that base. No production query/mutation, branch push, main integration,
deployment or production admission was performed. Other worktrees are unchanged.

## Delivered ownership

The existing `/api/arcade` verifies the bearer with Supabase Auth and passes its
verified user into the Mega adapter. Only typed actions reach the shared reducer;
the browser cannot submit a final score, shuffled deck or proposed state.
Server randomness uses Node cryptographic random integers. Private decks and
concealed tableau faces are removed from projections. The existing Arcade
recovery dispatcher routes Mega through that same reducer with its claimed token.

Prepared SQL reuses `private.arcade_runs`, immutable results, request receipts,
public revisions, unfinished-run uniqueness and recovery claims. Commit locks the
run, checks the deadline and revision under that lock, validates frozen identity
and configuration, preserves historical hole prefixes, recomputes each hole using
`private.golf_score`, and writes result/receipt/state atomically. Negative scores
are admitted only for Mega; other games retain the nonnegative score constraint.
Its public RPCs are callable only by the service role; private course tables have
RLS and no browser grants. Course editing also requires an active superuser.

Every settings revision is immutable. A meaningful settings change requires
explicit retain/archive choice. Archive changes only that course's board identity;
prior results remain queryable and in-progress runs keep their original config and
board. Boards rank lowest scores first, share ranks for ties and return 30-day or
all-time top scores, the player's rank and permanent personal best for that board.
Abandoned/incomplete runs never enter results.

The existing Arcade catalog and Game Defaults now embed Mega. Multiplayer picker
filtering and eligibility both exclude this solo identity. No stake/session fixture
or generic multiplayer defaults save is offered for Mega. Production UI uses the
platform audio preference; local preview controls remain preview-only. The help
renderer is frozen to `/1`. The canonical fullscreen shell remains the presentation
owner; no multiplayer financial/session owner is mounted.

Opening is now player-selected: choose the configured number of concealed cards
(default two), then reveal. The five-minute default begins at deal and continues
through opening. Final stock draw resolves before stock exhaustion closes the hole.
Untouched/expired holes score their actual cards, with no speed bonus or penalty.
Sunny Meadows art and unchanged Coastal/Canyon atlas remain as previously reviewed.

## Executed evidence

The disposable database `mega_golf_1792719651984` was cloned from the existing
local Golf snapshot `golf_installed_1792622077466`. This is not a current hosted
schema fingerprint. Source databases were not modified. No dependencies were
installed. Local database context and opaque fixture tokens are ignored files.

`dev/mega-card-golf/backend-proof.mjs` first ran the complete candidate in a
transaction and rolled it back, verified its new tables were absent, then installed
it only in the disposable clone and repeated the proof. Evidence is
`dev/mega-card-golf/evidence/backend-proof.json`:

- Closed admission; denied anonymous/authenticated direct RPC and private access;
  wrong owner and unauthorized admin rejection.
- Actual canonical scores, winner ordering and ties; incomplete/abandoned exclusion;
  immutable result and config; invalid-score rejection.
- Duplicate/replay/late replay, terminal/continuation and one result per run;
  injected result-insert failure rolls back state/receipt/result together.
- Explicit archive/retain, course isolation, old active-run configuration retained.
- Two independent PostgreSQL connections racing the same revision produce one
  successful commit and one conflict.
- Existing Arcade recovery dispatch completes nine untouched holes with zero clients.
- Write-denying triggers across 143 non-Arcade public/private tables remain active
  during proof, including multiplayer and financial tables; no guarded write occurs.

`dev/mega-card-golf/backend-browser.mjs` uses a loopback Vite service connected to
that PostgreSQL database and the same production adapter. Fixture authentication
uses opaque local tokens; it does not claim a live Supabase Auth browser test.
The browser completes nine holes, chooses opening cards, reloads authenticated
state, refuses another owner's read, edits settings with retain then archive, and
verifies archived history. External requests are blocked and none occurred.
JSON and opening/completion/archive screenshots are under the same evidence folder.

Focused reducer/scoring, Arcade API, catalog/defaults/rules and existing Arcade
regression tests pass after the catalog fixture was updated to distinguish this
locally integrated game from the historical deployed fixture. TypeScript and the
application build pass. Build warnings concern existing chunk size, mixed imports
and stale Browserslist data; no packages were updated.

## Remaining qualification and publication sequence

This is a local checkpoint, not production acceptance. SQL is prepared at
`supabase/mega-card-golf/candidate.sql`, deliberately not applied hosted. Supabase
CLI was unavailable; formal migration registration remains pending rather than
inventing a migration timestamp. The candidate requires the canonical Golf scorer
and existing Arcade indexes and must be reviewed against actual hosted definitions.

Before publication, reconcile the final stable multiplayer Golf/main baseline,
inspect current deployed definitions/indexes and run the complete rollback proof
there. Expand contention qualification to terminal-submit versus recovery and
admin-edit versus admission, then exercise actual Supabase bearer auth, browser
realtime/reconnect and the deployed zero-client worker (including worker restart).
The local independent-connection test proves revision CAS, not every race schedule.
Hosted worker packaging and credentials have not been exercised here.

With separate owner publication authorization: register/apply the guarded migration
with Mega disabled, rerun installed proofs, publish the compatible client/API/worker,
verify the exact deployment and recovery health, perform owner production smoke,
then authorize opening admission. Do not enable the game merely because the catalog
descriptor exists. The local fixture server temporarily opens only its disposable
database for browser qualification; no production admission is implied.

Run local proof with `node dev/mega-card-golf/backend-proof.mjs`, then start the
loopback backend using `node node_modules/vite/bin/vite.js --config
dev/mega-card-golf/backend.config.ts`; run the browser script in a separate process.
The runner currently requires the existing local PostgreSQL service/library paths
recorded in `dev/mega-card-golf/database.mjs`. It never accepts a remote database URL.
