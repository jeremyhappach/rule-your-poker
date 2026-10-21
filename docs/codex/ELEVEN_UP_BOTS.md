# 11 Up bots — local candidate, no release authorization

Base: `44dbd5a7d4de4635b258f731558fe346473d82b9`.
Branch: `codex/eleven-up-bots` in an isolated Temp worktree.

## Diagnosis and scope

The Lobby label was accurate. The deployed `eleven_up_configure` and
`private.megatouch_begin` explicitly rejected bots; the 11 Up recovery owner
only advanced expired deadlines. Dealer setup independently rejected bot rosters.

`supabase/eleven-up/bots.sql` adds a private policy that finds a sum of eleven
using only exposed balls and the current ball, otherwise passes or takes score.
It never reads the hidden stock. Every choice enters the existing versioned
`eleven_up_reduce`; scoring, legal moves, bonuses and gameplay clocks are unchanged.
The file removes only the explicit bot exclusions from current setup/consent
definitions, with a fail-closed definition marker check.

`bot-recovery.sql` follows the accepted Take 2 scheduler: persisted 750 ms bot
due times, pause clearing/resume scheduling, round/game/match locks, exact
revision/phase/stage/actor checks, deadline precedence and one move per due wake.
It reuses the existing recovery job and settlement owner. No browser bot driver,
new polling owner, financial formula or second settlement owner is introduced.

The catalog and two existing dealer-setup guards permit the unchanged 2–7
participant range with at least one human. Normal bot seats and canonical ante
consent are used. Arcade is unchanged.

**Bots remain fake-money-only.** Final lifecycle inspection established that
canonical `create_session_bot` rejects real-money sessions. The catalog and
11 Up setup/consent retain that restriction. Expanding canonical bot creation
to real money requires a separate proposal and approval; this candidate does
not do so. Both-money financial testing is regression evidence, not permission
for real-money bot admission. Initial synthetic real-money bot runs passed but
did not exercise supported seat creation and are not claimed as a product flow.

## Preservation and release constraints

- Existing rules versions, score/history/leaderboard functions, financial
  functions and other game functions remain byte-for-byte unchanged in the SQL
  proof, except the narrowly modified shared consent adapter.
- Existing leaderboard policy continues to exclude bot matches entirely.
- No production mutations, migration, admission activation, merge, push or
  deployment are authorized or performed by this workstream.
- These two SQL files are a candidate package, not an applied production
  migration. A separately approved release must package them transactionally,
  verify current owner definitions and installed-authority proofs, and publish
  the matching client. Do not publish the catalog change by itself.
- The local database is a synthetic clone, not proof that deployment has the
  same complete schema. Production verification remains a release gate.

## Local qualification

Dedicated database: `eleven_up_bots_1792536250433`, localhost port 55439,
cloned from the existing local Boxdrop qualification template. No source
database was mutated. Tool escalation requests were reviewed individually.
That template omitted `create_session_bot` and its alias allocator. The local
bootstrap restores only their exact checked-in definitions from migrations
`20260914214838` and `20260801001032`, plus their existing grants, without
backfills or substitute implementations. This schema difference must be
rechecked against deployment during a separately approved release.

`node dev/eleven-up/bots-proof.mjs` applies candidate SQL inside a transaction,
runs real reducers/authorization/triggers/settlement, and rolls everything back:

- Visible-only three-ball choice, covered-ball/hidden-stock independence and
  deadline precedence; 30 randomized complete legal rounds.
- Bot-account impersonation rejection; pause/resume schedule; zero-client
  timeout completion.
- Complete fake-money human-versus-bot matches on the real bot cadence;
  duplicate human requests, reconnect snapshots, late replay and continuation.
- Canonical Add Bot, UUID replay, waiting-seat exclusion and real-money refusal.
- 36 financial cases: 2–7 seats in both money modes (fake-money bots, real-money
  humans), winner/split/all-tie,
  exact balances, balanced ledger, snapshots and injected post-chip-write rollback.
- All unrelated public/private function definitions remain unchanged.

`node dev/eleven-up/bots-race.mjs` requires that successful proof, installs only
into the dedicated local DB, then races independent connections for fake-money
bot moves and settlement in both money modes. Fake-money fixtures are deleted by exact
IDs. Canonical history retention rejects deleting real-money sessions; synthetic
real-money fixtures remain only in this dedicated local database. No retention
guard is disabled or bypassed.

Evidence is retained under `qualification.local/eleven-up-bots/` (ignored):
`baseline.json`, `proof.json`, `race.json`, browser results and screenshots.
The preview wrapper reuses the existing actual-SQL browser transport, changes
only its local database/port and bot seat, and never ships in the product bundle.

Focused catalog/defaults/11 Up tests: 56 passed. Installed `tsc -p
tsconfig.app.json --noEmit` and `vite build` passed. `tsgo` is not installed;
no dependencies were installed. The actual-SQL browser run passed bot play,
reload during a bot turn, disabled opponent controls, human actions and terminal
settlement, with no page errors and six unclipped layouts from 320 px portrait
through desktop and landscape. These are desktop Chromium checks, not physical
iPhone or production acceptance. Intro/result clocks were advanced only in
synthetic fixtures; bot moves honored their real schedule.

The local candidate gate is recorded in `supabase/eleven-up/bots-qualification.json`.
Production qualification/publication remains **MISSING / not authorized**.

## Proposed release smoke

After separate release approval and matching database/client publication:

1. In fake money, add a normal bot seat; verify 11 Up eligibility and the existing stake default.
2. Start a human-versus-bot game, verify explicit stake consent and legal bot play.
3. Reload during a bot turn, then pause/resume; ensure one continuing turn and no
   human controls enabled for the bot.
4. Complete both rounds and any earned bonus. Verify visible canonical chip
   transfers, one result, original leaderboard policy and retained history.
5. Run Back with fresh consent, remove/add a bot at the supported boundary,
   then end the session. Confirm normal Session Ended and fresh-mount lobby flow.
6. Verify real money still refuses bot creation/admission and permits normal
   human-only 11 Up. Repeat fake-money bot play on physical iPhone
   portrait/landscape; check Arcade still starts independently and returns to
   its leaderboard.
