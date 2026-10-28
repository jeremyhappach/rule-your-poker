# Mega Card Golf / 1 — local prototype checkpoint, October 22, 2026

## Scope and provenance

Dedicated worktree: `C:/Users/jerem/.codex/worktrees/74ec/rule-your-poker`.
Branch: `codex/mega-card-golf-v1`. Base: `df48d4b73892e6965aafadb9768011af0e1906a3`
(`Qualify and register Golf v2 stock final-turn release`), matching local main and
origin/main when inspected. The branch already existed at that same base when
this worktree was attached. Other worktrees were inspected only as an inventory.

`codex/lobby-catalog-redesign` is at `44dbd5a7d4de4635b258f731558fe346473d82b9`
and **is an ancestor of this base**. Its typed catalog contract was inspected
read-only with `git show`; no cherry-pick or modification of its checkout is needed.
Final multiplayer Golf production stability and Jeremy's separate integration
approval remain release dependencies. Current source/release records are evidence
for this prototype, not a claim that final production smoke has passed.

No push, merge, deployment, production read/write, migration, admission activation,
dependency installation, or modification to another worktree occurred. Existing
installed dependencies are linked read-only in practice; this preview has its own
Vite cache under `dev/mega-card-golf/cache.local`.

## Implemented versus fixture versus proposed

**Implemented locally:** one versioned deterministic server reducer, three courses,
private shuffled decks, six-card scoring, finite stock, immediate discards,
replacement, exact expiry boundaries, sequential reveal/score presentation,
automatic holes and final leaderboard, frozen config/board IDs, request receipts,
revision checks, course Defaults editor with explicit retain/archive choice,
local persisted state, local zero-client deadline scheduling, restart catch-up,
responsive course selection and canonical FullscreenGameShell gameplay.

**Fixture-only:** loopback single-process Node authority and atomic JSON-file store;
opaque local cookie owner instead of real Supabase authentication; local admin
Defaults endpoint available to preview users; sample top-five names/scores when
there are no local results (explicitly labeled); local sound preference adapter.
This is a functional local prototype, not a qualified production backend. Unit
tests of serialized requests are not independent PostgreSQL-connection race proof.

**Proposed/unimplemented:** production SQL storage/locks/RLS and immutable triggers,
API authentication/profile validation/admin authorization, actual existing Arcade
recovery worker/realtime integration, production catalog registration and Defaults
persistence, rolling-window/personal-best production board conventions, final
audio/motion polish, production rollback proofs and admission. No SQL candidate
was applied or invented as deployed evidence.

## Accepted owner choices

- Finish replacement or permitted immediate discard of the **last drawn card**,
  then score stock exhaustion. The last draw is useful and counted exactly once.
- Fixed **300-second (5-minute) per-hole completion failsafe**, configurable for
  future runs. It starts with the deal, does not reset on actions/reconnect, is
  not a competitive countdown, and never changes the actual score.
- Revised Sunny Meadows: no water and fewer hills. Coastal and Canyon are preserved.

The task explicitly establishes a separate Arcade-only game identity. Therefore
`mega-card-golf/1` has its own action/timing rules; it is not a multiplayer Golf
mode or an exception silently applied to `six-card-golf/1` or `/2`.

## Rules and differences from multiplayer Golf

`supabase/six-card-golf/rules.sql` defines `private.golf_points` and
`private.golf_score`: A=1, 2=-2, 3–10 face value, J/Q=10, K=0. Equal ranks
cancel vertically at indices (0,3), (1,4), (2,5). The existing public scoring
functions were moved without changing their logic into `src/lib/golf/scoring.ts`;
both multiplayer presentation and Mega import that one implementation. Parity
tests cover every rank/suit, column cancellation, hidden partners and 300 boards
against the repository SQL specification. Hosted SQL parity remains unverified.

Multiplayer `reject` throws away a drawn stock card; `discard` instead takes the
visible pile card and replaces a tableau card. Mega uses unambiguous `draw`,
`replace(index)`, and `discard` (immediate rejection) intents. **No discard-pile
pickup** is implemented: it was not specified for this separately approved game.
If desired later, its consumption/limits require an explicit rule decision.
Multiplayer stock recycling, final-turn queue, 30-second turn timer, bots,
participants, settlement, and `/2` threshold behavior are deliberately absent.

Initial exposure is deterministic at positions 0 and 5; admins can choose 0–5
exposed cards using the fixed order [0,5,1,4,2]. This is a prototype choice, not
multiplayer's player-selected opening pair. Confirm this presentation preference
before production integration. Six exposed at admission is rejected because it
would immediately terminate every hole. No direct tap-to-reveal action exists.

At expiry, pending stock is discarded without replacing any tableau card.
Every still-concealed tableau card reveals and scores normally. A completely
untouched hole can score positive, negative or zero by its actual cards. Recovery
uses saved boundary timestamps for all subsequent holes, even with no clients.
Explicit abandon ends unranked; disconnect does not abandon or reset the clock.

## Data model and configuration

All courses use the same `mega-card-golf/1` reducer. Course IDs are stable keys,
never derived from display names. Default settings:

| Course ID | Name | Difficulty | Holes | Stock | Immediate discards | Exposed | Failsafe |
|---|---|---|---:|---:|---:|---:|---:|
| sunny-meadows | Sunny Meadows | Easy | 9 | 16 | 5 | 2 | 300 s |
| coastal-links | Coastal Links | Medium | 9 | 12 | 3 | 2 | 300 s |
| devils-canyon | Devil's Canyon | Hard | 9 | 8 | 1 | 2 | 300 s |

`CourseConfig`: stable course ID, enabled, name, difficulty, holes, stock allowance,
discard allowance, initial exposed count, completion seconds, immutable config ID,
monotonic admin revision, board epoch ID. No per-hole overrides, player-custom mode,
stake, money, bot or opponent settings. The enabled flag only gates new admission.

`MegaRun`: UUID, owner UUID, ruleset, full frozen CourseConfig, revision, status,
hole, private shuffled decks, tableau/exposure, draws/discards used, pending card,
discard top, persisted deadline, immutable completed-hole snapshots and total.
Projection allowlists remove owner/private decks and null every concealed face.

`BoardResult`: unique run UUID, owner UUID/name projection, course ID, board epoch,
config ID, authoritative cumulative score, server completion time. No score field
is accepted in player commands. Completion is independent of browser animation.

## Integration contract

Reuse the actual `GameDescriptor` system. `MEGA_CATALOG_IDENTITY` is already checked
against its identity/mode fields; it is not added to `GAME_CATALOG` or ARCADE_GAMES.
The existing descriptor type assumes `players.selection='active-roster'` and a
capability/Defaults editor union. Production integration must extend this same
contract with a solo selection and `mega-card-golf` capability/editor, gate the
canonical stake controls by `modes.includes('multiplayer')`, and render the supplied
`MegaDefaultsEditor` inside the existing GameDefaultsConfig flow. Do not invent
a second catalog/config registry or force an Arcade-only game through roster setup.

The production Defaults adapter should save all course-wide edits through the
existing authenticated admin flow using a dedicated typed course payload; general
player reads should expose only the active config/board identity. A transaction
locks course revision, saves a new immutable config, handles explicit board choice,
and switches the active pointer. The local editor previews this exact shape.

The existing Arcade entry/API/service (`src/pages/Arcade.tsx`,
`server/arcade/service.ts`) owns authentication, start/state/action routing and
recovery dispatch. Add a Mega adapter there after qualification. The full-screen
layout uses `FullscreenGameShell`; no PersistentTableShell, session provider,
financial owner, seat ring or wallet dependency is mounted. All felt controls
are inside the canonical interaction-layer marker. Shared shell code is unchanged.

Production persistence should reuse the Arcade run/ruleset/receipt/result owners
with course/epoch dimensions, not create competing completion ownership. Lock the
run and evaluate the persisted deadline before revision/admission checks. Apply
the same reducer to player commands and recovery. A service-only commit must CAS
the prior revision and frozen rules/config identity, atomically commit the result
and receipt, and enforce one result/run and one active run/user/game. Never permit
client-proposed final state/score. Validate exact existing indexes before DDL.
The scheduler must keep progressing with zero clients; the browser fetches at a
known boundary and on focus/online/realtime, not periodic polling.

Supabase authorization must pair grants and row policies and keep private decks
off exposed schemas. See [official RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
Actual deployed definitions and grants must be inspected before production DDL.

## Leaderboard and archive policy

Lowest cumulative completed score wins. Equal scores use competition ranks
(1,1,3); stable ordering is score ascending, completion time ascending, run UUID.
Selection displays five; full production board should retain the existing ten-row,
30-day and self-row convention with **ascending** scoring and permanent minimum
personal best. The prototype full board displays all local results, with config ID.

Meaningful play changes require an explicit choice: **retain** or **archive**.
There is no default radio selection, automatic archival, deletion or score rewrite.
Metadata-only changes retain the board. Retain deliberately preserves a board
across changed course settings; every row still records its original config and
the UI explains that the settings may differ. This owner-requested retention policy
is distinct from silently mixing different rule engines. Future incompatible
engine changes must receive a separate compatibility policy before publication.

Archive closes the old epoch to new admissions, creates a fresh epoch for this
course only, and keeps its configurations/history readable. Active old-epoch runs
finish into that old board, even after archive; archive is an admission boundary,
not a destructive freeze of legitimate pending completions. Old runs never switch
boards. A production archive confirmation should identify course, old epoch and
count of active runs that may still finish there. Concurrent admin saves use CAS.

## Visual/audio decisions and assets

Course selection uses normal vertical scrolling on portrait phones and a responsive
three-column grid where space permits. Landscape can scroll; no cramped carousel,
hidden leaderboard or nested swipe requirement. Gameplay responds to canonical
container aspect ratio, keeping cards/counters/touch actions in its one play area.
Reduced motion skips flips/deals. The server timeline drives sequential concealed
reveals; reconnect seeks to that point and does not replay old cues.

Original synthesized mallet notes use the existing AudioManager contract and
respect unlock/mute/background cancellation. Local preview preference defaults
off; production must inject platformAudio and the real saved profile preference.
TriTowers informed score/result/audio separation, RoyalFlash container geometry,
Run21/11Up touch and counters. No borrowed game artwork or watermark is used.

Generated with the built-in imagegen tool, not an app screenshot:

- `public/mega-card-golf/courses-v1.png`: original three-panel atlas.
  SHA-256 `BDBDEBB1B9346FF21144AF8CDBF93F74DAC211835CB26FF412890FE7831685C1`.
- `public/mega-card-golf/sunny-meadows-v2.png`: independent Sunny replacement.
  SHA-256 `701EBCBF7BF09624EFCFE8688D08D9F6B64269540B18505E89F4B66D1310F311`.

The atlas hash exactly matches the original generated file. Coastal/Canyon still
use the same atlas, `300% auto` size and positions `50% center` / `100% center`.
Only Sunny uses the new image. No resampling or regeneration of the preserved
panels occurred. Prompts are recorded in `dev/mega-card-golf/art-prompts.json`.

## Qualification and remaining gates

Run: `node node_modules/vite/bin/vite.js --config dev/mega-card-golf/vite.config.ts`.
Preview: `http://127.0.0.1:5187/dev/mega-card-golf/index.html`.
The dedicated server rejects non-loopback/nonmatching-host requests, loads no
production environment, and replaces the production Supabase import with a throwing
fixture. Local state and private decks stay in ignored `state.local/store.json`.
Do not expose this server or treat its local admin cookie as production auth.

Tests: 28 initial Mega reducer/authority checks plus 33 canonical Golf/catalog
regressions (61 total), including scoring parity, privacy, stock/discard limits,
zero-draw and pending-draw expiry, boundary races, all-nine-hole recovery,
abandonment, duplicate/late/mismatched receipts, owner rejection, stale revisions,
atomic persistence failure rollback, board ties/isolation and retain/archive/CAS.
Final checks: all **61 tests pass**. Both the application TypeScript check and
`dev/mega-card-golf/tsconfig.json` (including the local server/UI) pass. Actual Chrome
captures pass at 1440×1000, 390×844 and 844×390 for selection/gameplay: no horizontal
overflow, six tableau cards, successful draw/replace/reload retaining 15 stock
draws and three concealed cards, and reduced-motion `animation: none`. Browser
evidence contains zero page errors and zero external requests. Screenshots were
recaptured after explicit artwork decode; they are actual app captures, not
generated mockups. See `dev/mega-card-golf/evidence/`.

The first browser attempt needed an installed Chrome fallback; sandboxed loopback
access then required execution permission for browser and server. Permission waits
pushed wall time past the 35-minute budget. This checkpoint stops further work.
No preview/production bundle build was run; full nine-hole browser completion,
live server-process restart, audio audition, keyboard/rules-panel verification and
admin archive browser flow remain the next bounded local validation pass. Reducer
tests cover those authority cases but do not substitute for the remaining browser
or database evidence. No production release checks were attempted.

Production blockers are intentional: hosted schema/index inspection, authenticated
ownership/admin tests, real independent-connection concurrency, transaction-failure
proof, recovery-worker restart/zero-client proof, zero-write guards on all existing
multiplayer/financial tables, and Jeremy's review/smoke. Source tests and the local
JSON store cannot waive them. No release is claimed.
