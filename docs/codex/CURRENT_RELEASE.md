# Current release and cutover state

Date: 2026-08-02

## Phase 1 delivery cutover

- GitHub `main` is connected to the Vercel project `ptown-poker`; pushes create
  production deployments automatically.
- The production frontend URL is <https://ptown-poker.vercel.app>.
- The Vercel project contains the current Lovable Cloud backend values for all
  three `VITE_SUPABASE_*` build variables. The deployed bundle was verified to
  contain the expected public project configuration without exposing values in
  repository history.
- `vercel.json` owns Vite SPA deep-link routing so `/auth`, `/game/:gameId`, and
  other client routes resolve through `index.html`.
- Lovable Cloud remains the production database and authentication owner. The
  owned Supabase Phase 2 rehearsal described below has not changed Vercel's
  production environment variables.
- The approved workflow is now plain-English issue -> diagnosis -> one approval
  -> implementation, validation, required migration, Git push, automatic Vercel
  publication, then Jeremy's real-user smoke.

## Phase 2 owned-Supabase core rehearsal

The owned project `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`) now contains a
validated rehearsal copy of the core backend while production still uses the
Lovable-backed source project.

- All 245 source migration records are represented by exact local versions and
  SQL; 19 deployed-but-missing migrations were recovered into
  `supabase/migrations/` and Lovable's filename/version drift was reconciled.
  Three target migrations add the bounded diagnostic purge, its explicit
  audit/session-history preservation boundary, and the source-equivalent Data
  API grants required by new Supabase projects, for 248 target records.
- Schema parity was proved before the target-only retention migration: 48
  public tables, 42 routines, 133 policies, 20 enabled application triggers,
  and 18 Realtime publication tables.
- Auth contains the same 11 users, identities, and password hashes. Sessions,
  refresh tokens, MFA claims, and one-time tokens were intentionally not
  copied, so the later cutover requires an ordinary sign-in but no password
  reset.
- The target now retains all 179 real-money sessions and their financial/history
  rows. All 177 fake-money sessions and 155 fake/orphan Cribbage archives were
  removed; 331 financial transactions, 4,847 profiles, and all 11 auth users
  remain. Persisted debug, incident, trace, voice, and operation telemetry was
  intentionally excluded.
- The public `chat-images` bucket contains the same five objects, paths, MIME
  types, and 4,526,239 total bytes.
- The target's `voice-to-text` Edge Function now calls OpenAI directly with
  `gpt-transcribe`, requires a Supabase user JWT, and persists no voice
  diagnostics. `finalize-voice-operations` is retired. Trivia was removed from
  the app; the formerly deployed target function is an authenticated 410
  tombstone with no provider call.
- `OPENAI_API_KEY` is installed directly on the target. Authenticated voice
  transcription returned the spoken text to the unsent draft in owned-preview
  smoke on 2026-08-02. Production email/SMTP configuration and password-reset
  smoke remain outstanding; music provider configuration is a separate product
  gate.
- Gameplay cron is disabled on the target. The sole active job purges retained
  diagnostic rows older than seven days. High-volume dice snapshots and
  lifecycle persistence are also off by default in the frontend.
- The target database is 31 MB. Security/performance advisors report inherited
  source-schema warnings, not target drift; remediation is a separate scoped
  hardening task.
- Data API access now matches the source project: all 48 public tables retain
  RLS and authenticated/service roles have table DML; anonymous access is
  read-only for `games`. Future public tables must declare grants explicitly.
- Migration `20260802184800_cutover_readiness.sql` is installed on source and
  target with its write lock disabled. It provides 47 public-table statement
  guards, Storage write guards, an explicit import bypass, and the verified
  fake-session purge used only on the target.

The detailed evidence and remaining cutover gates live in
`docs/codex/SUPABASE_CUTOVER.md`.

### Owned-Supabase preview runtime

- Vercel Preview branch `codex/supabase-preview` is isolated to the owned
  project through branch-scoped `VITE_SUPABASE_*` variables. Production remains
  on the Lovable-backed source project.
- The preview build for commit `7e10cafd391330f387fb009e0ab96050ba84894f`
  reached `READY` and serves the app at
  <https://ptown-poker-git-codex-supabase-preview-jeremy-8e2b.vercel.app>.
- Supabase Auth allows that exact preview hostname (all paths). The owned
  project's Site URL remains local until the production cutover.
- Vercel Authentication protects the preview. After restoring the target's
  explicit Data API grants, the signed-in browser loads the lobby, profile
  balance, history dependencies, and game list without the prior table
  permission errors. Jeremy reported the create-game/game-entry rerun and the
  authenticated voice-transcription path clean on 2026-08-02. The broader
  backend-cutover smoke checklist remains tracked in
  `docs/codex/SUPABASE_CUTOVER.md`.

## Frozen Lovable cutover baseline

- Lovable development is finished. No additional Lovable publish or reclone is
  required for cutover.
- Commit `400eecc2625eaa2ffaa0c614c2b825985e4c7fbf` is permanently tagged
  `lovable-final-cutover-2026-08-01`.
- That tag is the frozen final Lovable baseline. It intentionally contains the
  known iOS Session Ended long-list scrolling defect.
- Commit `c094f6aef15578a2bbb92887c148e4893c2abc26` is the later
  documentation-handoff commit.
- A `lovable-final-stable-2026-08-01` tag was not created and is not required
  for cutover.
- `bunx tsgo --noEmit` was not run during ingestion: neither Bun nor
  `node_modules` is available, and dependencies were not installed.

## First Codex P0

The first Codex implementation task is the published iOS Session Ended Results
panel. Long participant lists render all rows but cannot be vertically
touch-scrolled. The source in
`src/components/canonicalShell/SessionEndedTablePhase.tsx` contains
`overflow-y-auto`, `touch-pan-y`, and WebKit momentum-scroll styling, but
the failed production runtime smoke outranks that plausible source fix.

Codex acceptance requires new published iOS smoke proving:

- one felt-contained vertical scroll owner;
- pinned title;
- every Hap + 10 bots row reachable;
- short lists compact;
- no page, HUD, or table-shell scroll.

## Cribbage atomic settlement

The current source candidate moves Cribbage terminal settlement into
`public.cribbage_settle_game`. One transaction now owns the durable result
claim, server-derived skunk payout, player chips, completed round, post-payout
snapshot batch, `game_over`/`session_ended` disposition, and real-money
`SessionResult` rows. Connected clients and reconnects submit only the
immutable game, round, dealer-game, and hand identity; presentation remains
local.

Migration `20260802001500_atomic_cribbage_terminal_settlement.sql` was applied
to the live Lovable Cloud database on 2026-08-02 as one transaction and recorded
in `supabase_migrations.schema_migrations`. Live verification proved both
unique indexes, the restricted result-insert policy, authenticated-only RPC
execution, and the deduped `record_session_results` trigger definition. The
matching app build is deployed through Vercel. Production acceptance still
must cover duplicate callers, disconnect after terminal-state persistence, and
LAST HAND real-money session closure with one financial result per human.

## Frozen Lovable cutover scope

### Holm bot scheduling

Two scheduler defects were identified:

1. A wake arriving while `botProcessingRef` was true could be discarded.
2. A realtime authority edge could be missed entirely; fetch/remount
   observation did not always stamp authority because stamping was nested under
   an unrelated deadline branch.

The checked-out source latches/replays dropped wakes, stamps Holm authority on
relevant fetches, compares a full round/turn/epoch authority key, adds
event-driven drains on reconnect/focus/visibility, retains database
exactly-once action guards, and does not add a steady-state repair poll.
Future changes to this behavior still require the bot-heavy smoke below.

### Add Bot

Recorded behavior:

- menu shows `Adding bot...`;
- duplicate taps are blocked;
- success is confirmed by the canonical yellow waiting seat, not a success
  toast;
- failure may show a destructive toast with the actual reason;
- waiting bots remain outside the current hand and join at the next canonical
  boundary.

### Bot aliases

- durable `games.bot_alias_seq`;
- backfill from `session_events` `bot_added` history;
- transactional `create_session_bot`;
- aliases persist in authoritative usernames;
- removed aliases are never reused;
- concurrent creation serializes.

A previously recorded bot-heavy smoke produced Bot 7-10 correctly after
removals.

### Four-color deck

The active-hand shell source no longer paints a white gradient over four-color
faces. Known debt: Holm still has a separate local-hand path besides shared
`ActiveHandFan`.

### Session snapshots/results

Source-backed snapshot identity:

```text
(game_id, dealer_game_id, hand_number, player_id)
```

The checked-out migration/source set includes dealer-game stamping, an ordinary
unique index compatible with SQL/PostgREST conflict inference, database-
idempotent writers, current-roster override, departed-participant snapshot
fallback, and no fabricated historical balances.

### Session Ended

Source and prior smoke evidence support:

- Holm player/community/Chucky cards retire together;
- pot, spotlights, active labels, gameplay cards, and transports retire;
- HUD/tab rail/chat/history remain;
- Back to Lobby is local-only;
- rostered and departed participants merge into Results;
- results are constrained to a felt-safe region.

Production evidence now narrows the remaining failure: participant inclusion is
correct, but vertical touch scrolling is not.

## Codex P0 and follow-up smoke

The frozen Lovable cutover tag already exists. These are Codex-era acceptance
checks, not prerequisites for cutover:

1. Published iOS long-list scrolling passes with Hap + 10 bots. **Failed in the
   current published build.**
2. A short Session Ended list remains compact.
3. A bot-heavy Holm hand completes without a parked bot.
4. Add Bot shows an immediate yellow waiting seat and monotonic alias.
5. Four-color and standard active hands remain legible.
6. Session Ended contains all expected current/departed participants once.
7. `bunx tsgo --noEmit` is clean.
8. Required migrations are deployed.

Items 2-8 were not re-run during the read-only/documentation-only ingestion.
The repository itself cannot prove deployed migration state or published
runtime acceptance.

## Tag policy

- Do not move or recreate `lovable-final-cutover-2026-08-01`; it permanently
  identifies the final Lovable product baseline, including the known scroll
  defect.
- Codex work proceeds from that frozen baseline plus the later documentation
  handoff. It does not wait for another Lovable publish, reclone, or stable tag.
- A future stable tag may be created after Codex fixes and production smoke
  pass. Such a tag is optional post-cutover release bookkeeping, not a cutover
  prerequisite.
