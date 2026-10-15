# Run21 production authority qualification — October 15, 2026

Status: qualification complete; production database and recovery activated.
No synthetic production financial transactions were performed. Source release
checkpoint: `run21-production-authority-2026-10-15`, prepared on
`codex/run21-production-release` from `6877efa595af3aa2986d9fe721d3e3800ee76b75`.
Owner gameplay smoke remains pending; it is the final acceptance truth.

## Accepted inactivity policy

Jeremy specified a configurable first-placement deadline, default 30 seconds
for every human turn. The existing Run21 game-default timer field configures
5–60 seconds and is frozen into each newly admitted match. Placement starts
the unchanged scoring/speed clock. Historical version-one matches retain their
original timing behavior.

Fake-money timeout sets the Horses-style canonical `auto_fold` and
`sit_out_next_hand` flags and lets the existing Run21 bot policy complete turns.
The projection publishes automatic-player UUIDs; a robot icon identifies them.
The shared automatic-play action can return control to the human.

Real-money timeout marks `sitting_out` and invokes canonical `set_game_paused`.
A scoped player trigger also pauses when any admitted real-money competitor
becomes sitting out. No bot plays their real-money turn. Resume requires all
competitors to return. The existing `set_session_player_intent(rejoin)` action
returns the paused competitor to this unfinished match instead of waiting for
the next hand. Pause/resume shifts the private first-placement, scoring,
presentation and bot deadlines without changing scores.

## Implementation owners

- `supabase/run21/financial-authority.candidate.sql`: explicit financial version
  two; atomic canonical chip transfer, actual immutable transfer-batch identity,
  one game result, final balance snapshots and private receipt. Version one is
  not backfilled. Existing continuation/close behavior remains authoritative.
- `supabase/run21/recovery.candidate.sql`: single-use dispatch lease, bounded
  claims, service-only worker RPCs, failure acknowledgement and admission health.
  Calls the existing shared real-money liveness evaluator and additionally
  requires a healthy Run21 worker. The versioned migration installs its job.
- `server/run21/recovery.ts` and `supabase/functions/run21-recovery/index.ts`:
  fresh worker using the existing TypeScript authority/reducer, with retained
  timers disabled. The Edge entry must be bundled before deployment.
- `supabase/run21/pause.candidate.sql`: scoped bridges to existing pause,
  rejoin and automatic-play owners. Other game families return before new locks
  or state changes. No shared authority function definition is replaced here.
- `supabase/run21/admission.candidate.sql`: qualified new-match setup, existing
  dealer/configuration identity and dedupe, exact two-player admission,
  human-only real money, production capabilities for active non-admin accounts.
  New setup remains closed by default. Compatibility RPC names delegate to the
  new owner. Service RPC privileges and actor/membership checks remain intact;
  the obsolete local-test gate cannot interrupt existing matches.
- `src/hooks/useRun21Access.ts`, `src/lib/run21/access.ts`, `creationAccess.ts`:
  version-two capability discovery, auth/session identity invalidation and
  recheck at submission. Selection and Run Back share these guards.
- Existing Run21 components render the placement timer, pause/return controls
  and automatic-play icon in canonical table/fullscreen slots. Scoring, shuffle,
  five columns and normal/sudden-death winner rules are unchanged.

## Qualification evidence

`supabase/tests/run21/financial-authority.proof.mjs` creates a disposable local
Postgres database from the existing metadata clone on loopback port 55439.
It restores captured deployed functions and actual shared/financial triggers.
Distinct local connections commit fixtures only to exercise real concurrency;
the entire disposable database is dropped in `finally`. No production financial
test writes occur. Capture files/results are under ignored
`qualification.local/run21-production/`.

Passing scenarios include:

- Non-admin setup; wrong dealer, outsider, revoked user, invalid stake, stale
  identity, one/three players, paused/pending-end sessions and outstanding pot.
- Fake-money human/bot setup; real-money bot rejection; missing/disabled/stale/
  failed scheduler or worker admission rejection without financial effects.
- Concurrent setup produces one dealer-game and a deduplicated replay.
- Three-round 5-chip winner yields canonical +5/−5, net zero, exactly one
  balanced transfer batch, one result and matching post-settlement snapshots.
  Private receipt references the actual canonical batch UUID.
- Injected snapshot failure rolls back every financial artifact; concurrent
  terminal commits produce one committed revision and one conflict. Replays,
  reconnect, duplicate close and late close after Run Back do not pay twice.
- Ties create sudden death without settlement; decisive fourth round settles.
  Pending session termination reaches `session_ended` after settlement.
- Competing recovery claims, forged token/browser-role rejection, recorded
  worker failure, replayed acknowledgement rejection, historical version-one
  exclusion, and a fresh durable worker calling actual SQL RPCs with no browser.
- Real-money first-placement expiry pauses with unchanged scores/chips; shared
  rejoin then canonical resume grants a fresh placement clock. Fake-money expiry
  starts bot logic; canonical automatic-play cancellation restores control.
- Timeout/action race on the same persisted revision commits exactly one
  transition and creates no additional chip transfer.
- Two separate Chromium contexts play all three rounds through actual
  fullscreen controls against the shared local SQL authority, in fake and
  isolated real-money modes. Reloads preserve state. This uses a loopback test
  transport; it does **not** certify deployed Supabase Realtime or Edge HTTP.

Validation: 177 focused Run21/hook tests, all 14 local-authority tests, four
capability-hook tests and 130 representative regression tests across Holm,
3-5-7, Cribbage, Gin, Farkle, Horses/SCC, Yahtzee, TriTowers and waiting-room rules
pass. An earlier local-authority timeout was rerun successfully as the full
14-test file with one worker. TypeScript and Vite production build pass;
existing large-bundle/mixed-import/Browserslist warnings remain. The Edge source
bundles successfully with existing esbuild (`--platform=node --format=esm`).

## Completed release qualification and deployment

- The exact packaged migration passes the isolated terminal, sudden-death,
  two-browser and disconnected-finalization proofs. All clients are disposed
  before final scoring completes; a fresh worker claims persisted state and
  produces one transfer/result/snapshot set. The next wake processes no match.
- Actual SQL RPCs recover a started gameplay deadline and automatic bot action.
  Reconnect preserves the first-placement deadline. Take-back increments the
  persisted revision and rejects stale automation. Pausing before initialization
  produces a controlled paused response; no board appears until resume.
- Historical version-one completion, reconnect, duplicate close and late close
  retain private bookkeeping without creating canonical transfers or snapshots.
- Current validation: 325 tests across 44 files pass, plus the new HTTP empty
  acknowledgement regression and its eight worker tests. TypeScript and Vite
  production build pass. The latest two-browser proof uses the exact migration.
- Production pg_cron 1.6.4 accepts five-second schedules in a rollback proof.
  pg_net 0.20.4 is installed. The existing shared and TriTowers jobs are healthy.
- Applied `20261015133432_run21_production_authority`: expected-definition hash
  checks, immediate shared-table lock failure under contention, bounded DDL,
  version-one historical preservation, and one five-second `run21-recovery` job
  (job 38). New admission stayed closed while HTTP integration was checked.
- Deployed Edge `run21-recovery`, version 2, with database-issued single-use
  token authentication. Its first deployment revealed successful void RPCs have
  empty bodies; the corrected handler accepts those bodies. Three consecutive
  live scheduled requests returned HTTP 200 with no network errors; database
  completion was 4.6 seconds old and failure was null at 13:36:28 UTC.
- Applied `20261015133715_activate_run21_production` after worker/shared health
  checks. A read-only transaction verified an active non-admin receives enabled
  version-two capability for both money modes. No privileged Run21 server or
  recovery function grants execution to anon/authenticated. Default timer is 30.
- Hash comparisons before/after installation preserve all 21 historical matches
  and every private settlement receipt. Shared pause/player-intent/financial/
  recovery definitions and all pre-existing cron jobs remain unchanged.

Local captures and deployment checks are in ignored
`qualification.local/run21-production/`; production publication uses the normal
Git integration and approved main push helper. Compare the checkpoint SHA to
Vercel READY and `https://holm357.com/build-manifest.json` after publication.

## Forward recovery and owner smoke

If a release defect appears, close `private.run21_production_release.qualified`
to stop new setup while preserving existing matches. Do not remove the worker,
drop the schema, downgrade version-two matches or reverse historical transfers.
Repair the specific owner and preserve canonical receipts. The release gate
does not disable reads, player returns or recovery for existing matches.

Refresh two eligible non-admin accounts. Select Run21 in both selection paths;
check fake-money timeout, robot indicator and Take Back Control. In real money,
let first placement expire, confirm both clients pause, return the player and
resume as host. Complete a normal 5-chip match, confirm +5/−5 and history, then
Run Back. Verify the accepted fullscreen layout and normal session-end flow.

Preserve unrelated preexisting changes to `AGENTS.md`, both push workflow files,
the Cribbage artifact snapshot, `.codex/evidence/`, and
`supabase/tests/run21/two_human_candidate.sql`. Do not include them in this commit.

The completion continuation began at 13:23:44 UTC and retained the prior
implementation instead of repeating architecture discovery.
