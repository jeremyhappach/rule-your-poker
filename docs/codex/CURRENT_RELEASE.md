# Current release and cutover state

Date: 2026-08-03

## Phase 1 delivery cutover

- GitHub `main` is connected to the Vercel project `ptown-poker`; pushes create
  production deployments automatically.
- The canonical production frontend URL is <https://holm357.com>. The original
  <https://ptown-poker.vercel.app> address remains attached as a fallback.
- Vercel reports `holm357.com` as a valid Production domain, and the HTTPS root
  returned the P-Town Poker app with HTTP 200 on 2026-08-03.
- The Vercel Production and Preview environments now point to the owned
  Supabase project `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`). Production
  deployment `dpl_9DxrLEW3xwuZQCZv2USavnqr7uDC` reached `READY` on
  2026-08-03. The emitted bundle contains the owned project URL and identifier
  and contains no reference to the retired Lovable-backed project.
- `vercel.json` owns Vite SPA deep-link routing so `/auth`, `/game/:gameId`, and
  other client routes resolve through `index.html`.
- The owned Supabase project is the production database, Auth, Realtime,
  Storage, and Edge Function owner. The former Lovable-backed project remains
  write-locked as a rollback snapshot and is no longer referenced by the
  production frontend.
- The obsolete `https://ptown-poker.lovable.app` publication was unpublished
  on 2026-08-03. All three preserved jobs on its retired Cloud backend are
  inactive; the project and write-locked backend remain available only as the
  rollback snapshot.
- The approved workflow is now plain-English issue -> diagnosis -> one approval
  -> implementation, validation, required migration, Git push, automatic Vercel
  publication, then Jeremy's real-user smoke.

## Phase 2 owned-Supabase production cutover

The owned project `ptown-poker-prod` (`xvhmbuppghwmwpwrkzao`) now contains a
validated production copy of the core backend and is live behind
<https://holm357.com>.

- The final source and target locks were enabled only after proving there was
  no recent real-money activity. The final reconciliation removed six
  disposable target fake-money games, the single owned-preview real-money smoke
  game, its two transactions, and five target-only test bots.
- All 20 retained application datasets then matched source by row count and
  content hash. Final authority includes 179 real-money games, 527 dealer
  games, 420 rounds, 337 players, 2,653 real-money results, 2,630 retained
  snapshots, 331 financial transactions, and 4,846 profiles.
- All 11 Auth password fingerprints and metadata manifests match source. The
  per-profile financial ledger matches exactly.
- After the production bundle proved its owned backend identity, the target
  lock was disabled and a rollback-only write proof succeeded. The source lock
  remains enabled. Both maintenance-mode settings remain disabled.
- Jeremy reported the ordinary production sign-in and lobby clean on
  `holm357.com` on 2026-08-03. The migrated password worked without a reset,
  and the production lobby loaded against the owned backend.
- Jeremy then reported the combined production fake-money smoke clean: game
  creation and play worked, authenticated voice-to-text worked, the game
  completed, and it appeared under Completed Sessions.
- Production password recovery also passed on `holm357.com`: the recovery email
  arrived, its link returned to the production reset form, password update
  succeeded, and sign-out plus sign-in with the new password worked. All owned-
  Supabase cutover acceptance gates are complete.

- All 245 source migration records are represented by exact local versions and
  SQL; 19 deployed-but-missing migrations were recovered into
  `supabase/migrations/` and Lovable's filename/version drift was reconciled.
  Five target migrations add the bounded diagnostic purge, its explicit
  audit/session-history preservation boundary, and the source-equivalent Data
  API grants required by new Supabase projects, plus atomic Yahtzee terminal
  settlement and its late-replay correction, for 250 target records.
- Schema parity was proved before the target-only retention migration: 48
  public tables, 42 routines, 133 policies, 20 enabled application triggers,
  and 18 Realtime publication tables.
- Auth contains the same 11 users, identities, and password hashes. Sessions,
  refresh tokens, MFA claims, and one-time tokens were intentionally not
  copied, so users perform an ordinary sign-in after cutover but do not need a
  password reset.
- The target now retains all 179 real-money sessions and their financial/history
  rows. All fake-money sessions and fake/orphan Cribbage archives were removed;
  331 financial transactions, 4,846 profiles, and all 11 auth users remain.
  Persisted debug, incident, trace, voice, and operation telemetry was
  intentionally excluded.
- Historical chat-image attachments were declared disposable on 2026-08-03.
  The target's one retained source-project `image_url` was normalized to null
  without deleting its `chat_messages` row or changing any other row fields.
  The five previously copied objects (4,526,239 total bytes) remain in the
  public `chat-images` bucket but are not cutover authority. The current chat
  UI has no attachment entry point because voice-to-text replaced it. The
  bucket, policies, and upload code remain for future use; fresh upload/render
  smoke is deferred until the attachment capability is redeployed and does not
  block the backend cutover.
- The target's `voice-to-text` Edge Function now calls OpenAI directly with
  `gpt-transcribe`, requires a Supabase user JWT, and persists no voice
  diagnostics. `finalize-voice-operations` is retired. Trivia was removed from
  the app; the formerly deployed target function is an authenticated 410
  tombstone with no provider call.
- `OPENAI_API_KEY` is installed directly on the target. Authenticated voice
  transcription returned the spoken text to the unsent draft in owned-preview
  smoke on 2026-08-02. Custom Auth SMTP is now enabled on the target through a
  sending-only, domain-scoped Resend key and the verified
  `auth.holm357.com` sender domain. Native recovery email delivery, callback,
  password update, sign-out, and sign-in with the new password passed against
  the owned preview on 2026-08-03. The unused, unauthenticated
  `generate-music` Edge Function was removed from the repository and owned
  project on 2026-08-03; no ElevenLabs secret is required for cutover.
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
  target. Its lock remains enabled on the retired source and is disabled on the
  live owned target. It provides 47 public-table statement guards, Storage
  write guards, an explicit import bypass, and the verified fake-session purge
  used only on the target.

The detailed evidence and remaining cutover gates live in
`docs/codex/SUPABASE_CUTOVER.md`.

### Owned-Supabase preview runtime

- Vercel Preview branch `codex/supabase-preview` retains its branch-scoped
  owned-project variables. The general Production and Preview variables now
  also point to the owned project.
- The preview build for commit `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220`
  reached `READY` and serves the app at
  <https://ptown-poker-git-codex-supabase-preview-jeremy-8e2b.vercel.app>.
- Supabase Auth allows that exact preview hostname (all paths) and
  `https://holm357.com/**`. The owned project's Site URL is now
  `https://holm357.com` for production-cutover readiness.
- Vercel Authentication protects the preview. After restoring the target's
  explicit Data API grants, the signed-in browser loads the lobby, profile
  balance, history dependencies, and game list without the prior table
  permission errors. Jeremy reported the create-game/game-entry rerun and the
  authenticated voice-transcription path clean on 2026-08-02. A complete
  fake-money game and its Completed Sessions appearance passed against the
  owned preview on 2026-08-03. A two-human real-money Cribbage LAST HAND
  disconnect smoke also passed durable settlement on 2026-08-03: the target
  ended the session, wrote one terminal result, and wrote exactly one `-10`
  and one `+10` SessionResult transaction. The broader backend-cutover smoke
  checklist remains tracked in
  `docs/codex/SUPABASE_CUTOVER.md`.
- The first owned-preview Holm deadline smoke failed on 2026-08-03 in game
  `8bb30eac-cacc-43d4-a306-ecf2e0a4d71e`; the corrected build at commit
  `a7a52d1d1f4541cfae1c71521e1a3fa77a69c220` then passed the replacement
  smoke in fake-money game `25662485-03b6-434b-85f0-f96e983dfe7e`.
  The timer remained suppressed through the deal, expiry folded and scheduled
  the human to sit out, the all-fold pussy-tax branch progressed, subsequent
  hands auto-folded the player, rejoin worked, and the game completed normally.
  Resolution remains in `endHolmRound` behind its atomic
  `betting -> processing` claim; the churn-prone polling recovery remains
  removed for this edge. Two non-blocking timer presentation seams exposed by
  the pass—the recurring initial-fill animation and a new one-second timeout
  rebound/card-reactivation flicker—are queued separately in the backlog.

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
matching app build is deployed through Vercel. Source-production and owned-
preview smoke now cover disconnect during LAST HAND real-money closure with
one financial result per human; direct duplicate-caller acceptance remains.
Both runtimes deterministically reproduced the separate connected-client win-
presentation bypass tracked in the backlog. The 2026-08-03 source correction
adds a route-owned, exact-identity live-terminal latch so an already-connected
Cribbage client retains its mounted table through the child-owned terminal
sequence, while a fresh mount of an ended session still goes directly to the
lobby. The first production smoke proved that route hold but exposed a local-
hand blink: the ordinary stale-complete guard mistook the terminal His Heels
reveal for a completed hand awaiting its successor. The follow-up source
correction excludes `complete` states with authoritative `winnerPlayerId` from
that bootstrap guard while preserving non-winning stale-hand suppression.
Settlement and financial authority are unchanged. Published follow-up smoke
on commit `f9c7b1ebba91287049916e4caa09d281ace3df5a` passed on 2026-08-03,
including continuous visibility of the remaining connected client's hand
through the terminal cut-card reveal and win presentation. Cribbage is now the
accepted disconnect-safe settlement and connected-terminal-presentation model
for the remaining games.

## Yahtzee atomic settlement

Migration `20260803234111_atomic_yahtzee_terminal_settlement.sql` is installed
on the owned production database. `public.yahtzee_settle_game` now derives a
unique winner or tie from the persisted complete scorecards, reads the fixed
stake from the immutable dealer-game configuration, and keys every request to
the authoritative round row and `rounds.hand_number`. This corrects the former
post-tie identity bug where client writers continued to use JSON
`yahtzee_state.currentRound = 1` on later hands.

For a unique winner, one transaction owns the durable result claim, fixed-
stake zero-sum chip transfer, completed round, post-payout snapshot batch,
`game_over`/direct `session_ended` disposition, and real-money SessionResult
trigger output. A tie moves no money, writes no result, completes the exact
round, and atomically publishes the existing rollover flag. Replayed callers
perform no financial writes. The function has an empty fixed search path;
Public and anonymous execution are revoked; authenticated callers must be a
session participant or admin.

Follow-up migration
`20260804000259_fix_yahtzee_settlement_replay.sql` keeps an exact durable
settlement replay valid after ordinary lifecycle progression changes the
session's current game, type, stake, pot, or status. Those mutable current-game
fields remain mandatory for a first settlement but are no longer allowed to
invalidate a matching completed claim. A rollback-only production proof
settled one synthetic match, changed the session to a different live Holm
dealer game with different stake and pot, then replayed the old Yahtzee
identity as `already_settled/game_over` without changing its result, chips,
snapshots, or the newer lifecycle. Rollback left zero synthetic rows.

The matching client candidate removes the elected browser's direct payout,
result, snapshot, and lifecycle writes. Every mounted client may replay only
immutable settlement identity. The route's exact live-terminal hold is now
shared by Cribbage and Yahtzee: an already-connected LAST HAND client retains
the same table through the real winner/chip-animation completion callback,
while a fresh mount of an already-ended session still goes directly to the
lobby. Final human and bot category scoring now persists the score and
`gamePhase='complete'` together before the two-second local highlight, and the
terminal animation retains its round roster even when a settled participant
leaves. Production rollback proofs cover legacy replay plus synthetic tie,
later-hand identity, LAST HAND and ordinary-win settlement, duplicate callers,
fixed-stake zero-sum payout, snapshot overwrite, authorization, and one
SessionResult per human. All synthetic rows rolled back to zero. Published
two-human terminal-disconnect smoke passed on 2026-08-03: the remaining client
retained the table through terminal presentation, settlement completed once,
and the session ended correctly. The winner chip did not bounce during
celebration; that isolated presentation defect is queued separately and does
not reopen settlement acceptance.

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
