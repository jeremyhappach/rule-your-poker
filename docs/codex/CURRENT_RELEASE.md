# Current release and cutover state

Date: 2026-08-10

## 3-5-7 normal terminal presentation correction

- The approved source candidate gates the normal final-leg award on a
  synchronized concrete dealer-game scope, then carries one immutable terminal
  generation through award, leg sweep, pot flight, and completion. A late
  boundary observation no longer cancels and re-arms the same award.
- Generic player-leg delta detection is suppressed for descriptor-owned normal
  terminals, and late award/leg/pot callbacks are rejected once their
  generation has advanced or completed. Database settlement and the canonical
  transfer ledger are unchanged. Production smoke remains the acceptance gate.

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

## Authoritative post-game abandonment reconciliation

- Migration
  `20260807233000_authoritative_session_presence_reconciliation.sql` is
  installed on the owned production database. The existing four-second tab
  heartbeat now has a database-stamped `updated_at` lease on both insert and
  update; client-supplied time is not lifecycle authority.
- Sessions are watched only after a post-deployment safe-boundary or
  player-state signal. The migration deliberately does not enroll or mutate
  the historical open-session backlog. The frozen `Aug 7 - Joakim Noah` repro
  remains `waiting`, unarmed, and without SessionResult rows.
- Migration
  `20260809173000_postgame_waiting_session_resolution.sql` narrows the
  presence lease to settled post-game `waiting` / `waiting_for_players` only,
  with no active dealer-game identity. It never applies during an initial
  waiting room, live gameplay, terminal presentation, dealer setup, or ante
  decision. A heartbeat from before that boundary does not keep a departed
  player active.
- Migration
  `20260809190000_fast_postgame_presence_confirmation.sql` arms one
  result-bearing post-game watch at that boundary and preserves its original
  arm time across later game/player writes. A Waiting-table entry emits one
  ordinary immediate heartbeat; the server then counts complete five-second
  windows from database-stamped post-boundary heartbeats. Three consecutive
  missed windows (fifteen seconds) mark a human Sitting Out. The five-second
  scheduler reads only due watches, so it is an indexed no-op while no
  post-game watch exists; it never evaluates gameplay, setup, ante, or an
  initial waiting room.
- Migration
  `20260809200000_extend_fake_money_postgame_presence.sql` applies that same
  narrowly armed watch to fake-money sessions. At zero active humans, the
  real-money branch remains the existing replay-safe financial finalizer;
  fake-money instead moves to `session_ended` without snapshots, balances,
  `SessionResult` rows, or financial transactions.
- One active human returns to the post-game waiting table. Once an absent
  player is authoritatively marked Sitting Out, zero active humans closes a
  result-bearing real-money session immediately through the database and
  records exactly-once SessionResult financials. The five-second watch sweep
  is the no-client fallback; it never advances an active dealer game.
- A continuously mounted route now remains on the canonical Session Ended
  table after this later server-side closure and renders final seated players,
  including Sitting Out adornments. Fresh mounts and reconnects of an already
  ended session remain direct-to-lobby.
- Shared waiting-table and shell seat projection now treat `sitting_out` as a
  participation state, never a seat release. A sitting-out player remains in
  their relative position with the Sitting Out status; only explicit Stand Up
  or Leave changes `status` to `left`. Start eligibility remains a separate
  opt-in count, and a seated player returns through Return to Play rather than
  choosing a new `+` seat. The smoke passed on 2026-08-09.
- Sessions with settled `game_results` close only when every current human has
  a matching final snapshot; the existing deduplicated terminal trigger then
  mints SessionResult rows in the same transaction. Incomplete settlement
  evidence is preserved for recovery. A genuinely pristine real-money room is
  deleted only after fifteen minutes with zero active humans. Generic cleanup
  never advances an `in_progress` game.
- The complete rollback proof passed before and after installation, covering
  first/second/third missed windows, a post-boundary heartbeat reset,
  exactly-once zero-sum financials, winner/tie, duplicate and late replay,
  authorization, continuation, and initial-waiting/live-game exclusion.
- The fake-money extension passed rollback proofs before and after installation:
  winner, tie/continuation, trigger arming, duplicate and late replay,
  initial-waiting/live-game exclusion, seat retention, non-financial terminal
  disposition, and unchanged real-money finalizer behavior. Production smoke
  passed on 2026-08-09.

## 3-5-7 decision-timer continuity

- The frozen `Aug 7 - Hector Rondon` repro proved two overlapping presentation
  defects: 3-5-7 reused a round-number timer identity instead of the exact
  deadline, and visual-bug pause/resume granted a fresh maximum decision
  window rather than continuing the frozen window.
- 3-5-7 now uses the proven deal-settled presentation latch and exact deadline
  identity: the timer remains absent during card transport, its first visible
  frame is full, and it can only descend within that deadline epoch.
- Pause now records the active deadline window, writes the resumed deadline
  while clients remain paused, and resumes from the saved remaining seconds.
  This preserves authoritative expiry and simultaneous decisions while
  preventing visual-bug cancellation or ordinary host resume from refilling
  the timer.

## 3-5-7 completed-round terminal correction

- Production disconnect smoke on 2026-08-07 exposed an admission mismatch in
  normal final-leg settlement: `endRound` correctly claimed resolution by
  marking the round `completed`, while `three_five_seven_settle_game` rejected
  that same completed round. The connected client therefore saw the leg
  animation from the committed player state, but no terminal result, payout,
  or game-over disposition followed.
- Migration
  `20260807143000_allow_completed_three_five_seven_terminal_round.sql` is
  installed on the owned production database. It admits only the existing
  `betting` instant-sweep state and the `completed` normal-final-leg state;
  immutable identity, authorization, single-winner, durable-claim, and
  lifecycle guards remain authoritative.
- The client candidate adds one exact-state replay through the same idempotent
  RPC when a connected or reconnecting client observes `in_progress` plus a
  completed current round and exactly one terminal winner. It adds no timer,
  polling loop, financial writer, or presentation owner.
- Complete rollback proofs passed before and after migration for winner, tie,
  duplicate, replay, late replay, authorization, continuation, LAST HAND
  terminal disposition, payout, snapshots, and zero-sum balances. Production
  disconnect smoke remains the acceptance gate; the frozen repro was not
  manually repaired.

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
  removed for this edge. The recurring initial-fill animation was corrected at
  commit `d7149e0d4ab3a3409ee6fbbc3aa15cf7f1c810e2` and passed production smoke
  on 2026-08-06: the first visible frame was full and the timer then descended
  monotonically. The separate one-second timeout rebound/card-reactivation
  flicker remains queued.

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

## Gin Rummy atomic settlement

Migration `20260804010000_atomic_gin_terminal_settlement.sql` is installed on
the owned production database. `public.gin_rummy_settle_game` is now the
replay-safe owner of the final hand-history record, terminal result claim,
match payout, post-payout snapshots, and `game_over`/`session_ended`
disposition. It accepts only immutable game, round, dealer-game, and hand
identity; clients retain presentation only.

The matching client submits settlement before the terminal announcement and
chip sequence. Gin now uses the same route-owned exact-identity terminal hold
as Cribbage and Yahtzee, so a connected LAST HAND client retains the table
until Gin emits its completion token; a fresh ended-session mount still goes
directly to the lobby. Production rollback proof passed winner, tie, duplicate,
replay, late-replay, authorization, continuation, and terminal-state cases;
published two-human runtime smoke remains the acceptance evidence.

The 2026-08-05 `Aug 4 - Grandview Drive` production evidence also proved a
separate ordinary-hand rollover defect: pairs of authoritative Gin hands were
created 100--440 ms apart. Every connected client processed the same completed
hand, but `startNextGinRummyHand` derived its successor from the mutable
database maximum. The first caller inserted H+1; the next caller observed that
row and incorrectly inserted H+2, so presentation legitimately launched a new
deal and upcard for each skipped identity.

The current source candidate makes Gin creation predecessor-keyed. The opening
entry point always targets H1/R1, and ordinary rollover always targets the
completed predecessor's H+1/R1. The deployed unique
`(dealer_game_id, hand_number, round_number)` index now arbitrates concurrent
callers because all of them attempt the same row; losing and stale callers load
and reuse that exact authoritative round. Shared card transport, deal timing,
rules, and settlement are unchanged. Published two-client multi-hand smoke
remains required.

## Holm atomic initial-hand startup

The 2026-08-05 `Aug 5 - Pioneer Parkway` production repro proved that Holm's
former browser-owned startup could create two authoritative hands 1.066 seconds
apart. The first caller consumed `games.is_first_hand` and published the ante
pot before inserting its round; a second client then interpreted that visible
partial state as recovery, derived `max(hand_number) + 1`, and created hand 2.

Migration `20260805175524_atomic_holm_initial_hand.sql` is installed on the
owned production database. `public.start_holm_initial_hand` now locks the game
row and owns the first-hand identity, exactly-once ante movement and audit,
deck/deal, round and player-card inserts, and game-pointer publication in one
transaction. Duplicate and delayed callers receive the same hand-1 round.
Anonymous execution is revoked; an authenticated caller must be a seated
participant or superuser. The client candidate removes the partial-state
recovery branch and submits only the game identity.

The rollback proof passed authorization, first start, card uniqueness,
exactly-once ante, duplicate, replay, winner/tie late replay, continuation,
terminal-state, and legacy-recovery rejection cases with zero persisted test
rows. Jeremy reported the fresh two-client production smoke clean on
2026-08-05: one opening deal was shown and refresh retained the same
authoritative hand. The frozen Pioneer Parkway session is evidence only and is
not repaired or replayed.

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

## Canonical chip-transfer presentation ledger

Migrations `20260809170000_canonical_chip_transfer_ledger.sql` and
`20260809210000_stage_chip_transfer_cursors.sql` are installed on the owned
production database. Every player-chip or table-pot mutation is journalled in
its financial transaction and commits an immutable, game-scoped transfer batch
with database-captured opening and closing endpoint balances. The balance row
stages the next cursor before it is published, so an early realtime balance
can never render ahead of its batch.

`ChipPresentationLedger` inside the shell transport provider is now the sole
presentation owner of touched player/pot endpoints. It composes ordered deltas
for overlapping batches, releases only after a fresh authoritative fetch
confirms the batch cursor, and abandons/reconciles directly on endpoint loss or
reconnect without replaying settled money. A game may register a
presentation-only admission prerequisite for a committed batch; the ledger
retains the authoritative opening balances and blocks later overlapping batches
until that prerequisite opens. Legacy game animations remain only as phase
callbacks; the canonical runtime renders the financial flight.

The rollback-only proof `supabase/tests/canonical_chip_transfer_ledger_proof.sql`
passed after deployment. It covers authorization, multi-sender antes,
player-to-player composition, pot payout, opening/closing values, cursors, and
empty pending-journal cleanup. Production smoke passed on 2026-08-09 at commit
`79cfdcc75efd31c479f69cf7c72aa6a2398fba20`: a Holm solo-vs-Chucky payout
waited for the community and Chucky reveal stages before the pot departed, with
no balance bounce or duplicate financial movement. Destination-chip bounce is
separate presentation debt in Backlog item 8.

Production smoke at commit `cd88b3d1d5965593236c68324743e3f32d6a5eee`
confirmed the 3-5-7 normal final-leg ordering: leg award, leg sweep, then the
canonical pot flight together with the winner announcement and confetti. The
destination-chip bounce remains separate presentation debt in Backlog item 8.
The same smoke exposed winner cards without an explicit Show Cards action;
that consent defect is isolated in Backlog item 3H and is not accepted.
