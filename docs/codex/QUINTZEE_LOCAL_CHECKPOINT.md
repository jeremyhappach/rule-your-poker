# Quintzee /1 local prototype — 2026-10-25

This checkpoint is local implementation, not a qualified production integration.
Owner authorized local code, tests, previews and commits only. No main integration,
push, production migration, deployment, admission or Library upload is authorized.

Base: `5af9e86ff204e35d9deb573e0c6ab8c39a2abfa4`, verified against origin/main before
creating branch `codex/quintzee-v1` in the dedicated managed worktree. The original
Golf checkout and every other worktree remain untouched.

Worktree: `C:\Users\jerem\.codex\worktrees\quintzee-v1\rule-your-poker`.
Use `git rev-parse HEAD` here for the checkpoint commit; the delivery response
records its full SHA. No main integration or push is included.

## Approved specification

- Solo Arcade and networked 2–4-player session play; rotate after full scorecards.
- Two regular rounds per player. Cumulative >=80,000 after round two earns at most
  one bonus round. Bonus points add to total; no recursive qualification.
- Five dice; initial roll and up to two rerolls. Hold any subset. Bank only a
  positive matching unfilled category; no scratch-zero or early-bank action.
- Twelve categories: Ones–Sixes, Three/Four Alike (sum all dice, at least 3/4),
  Five Alike 50, exact 3+2 Full House 25, five-value Straight 40, Any sum. No joker,
  repeat-Quintzee bonus, or Small Straight. Upper subtotal >=63 earns +35.
- All twelve categories earn another +35 raw points, configurable for future
  admissions. Both bonuses enter the subtotal BEFORE multiplication.
- 180-second default per card, configurable for future admissions. After canonical
  Get Ready the clock runs continuously, including rolls/animation/category banking.
  Speed = 100 + floor(200 * remaining / configured duration), clamped 100–300.
- End on all twelve scored, deadline expiry, or exhausted rerolls with no legal
  available category. Timeout preserves committed categories at x100. Late actions
  cannot roll or score. Intentional expiry is not a punitive disconnect penalty.
- Classic Green and Modern MAXX/Force-inspired styling share every gameplay rule.
  Admin chooses default theme; caller may select match-wide theme. Never split
  leaderboards by theme. Ranked callers cannot override competitive settings.

## Implemented ownership

`supabase/quintzee/rules.sql` is the mode-independent PostgreSQL core: CSPRNG dice,
positive-match legality, holding/rerolls, scoring, clock, round results and common
round scheduling. It calls the existing Yahtzee pure SQL scorer with an empty
scorecard to exclude joker behavior. Existing Yahtzee sources remain unchanged.
`src/lib/quintzee/model.ts` reuses the matching pure TypeScript scorer for previews
only. No client score or elapsed time is submitted as authority.

The scheduler follows Boxdrop's full-round ordering, but accepts one UUID for
solo or 2–4 UUIDs for networked play. It tracks committed results by player/round
and evaluates individual eligibility only after both regular rounds.

`QuintzeeView` renders inside `FullscreenGameShell` and its existing canonical
interaction layer. Both themes use the same component, geometry and controls.
The transport hook persists request UUID/payload through reconnect, filters
regressive/equal-conflicting snapshots and refreshes through notifications,
reconnect and exact deadline wakeups. Its animation clock is presentation-only.

`dev/quintzee/authority.sql` is explicitly a LOCAL QUALIFICATION ADAPTER, not the
production Arcade or session adapter. It exercises row locks, revision/scope CAS,
actor identity, immutable admitted configuration checks and atomic request receipts.
It rejects a changed Yahtzee scorer dependency hash instead of silently rescoring
an active run. It stores no wagers and does not implement settlement.

Local preview binds only 127.0.0.1:5197, uses separate synthetic player UUID/token
links and sends only invalidation notifications. Server recovery advances due
rounds without connected clients. No production auth, API or database is used.
The disposable database template lacked the Yahtzee cutover scorer; setup loads
only that unchanged pure function from the checked-out migration into the clone.

## Qualification at this checkpoint

PASS: 93,312 exhaustive category comparisons (7,776 dice combinations x12) between
SQL and reused TypeScript scorer; no joker substitution; server dice and hold
preservation; two rerolls; category banking without clock reset; exactly-63 bonus;
separate all-category award; owner example 224x200=44,800; timeout/late-action
priority; no-match ending; configured-duration scaling; four-player whole-round
rotation; >=80,000 boundary and one bonus only; zero-client core catch-up.

PASS in local adapter: duplicate/replayed commands, independent-connection races,
stale revision/scope rejection, request-payload tampering, inactive/unrelated actor
rejection, and deadline crossing while waiting on a row lock. Canonical session,
financial and Arcade-result row counts stayed unchanged during protocol proofs;
that count check alone does not audit updates to existing rows. Source inspection
finds no canonical writes in this local adapter.
These are NOT canonical financial settlement proofs.

PASS: focused Quintzee + existing Yahtzee tests (26), installed TypeScript compiler,
and application production bundle. `bunx --no-install tsgo --noEmit` could not run
because tsgo is absent; no tool/dependency was installed. Used the installed tsc.
The production build does not admit or route Quintzee; its view is exercised by
the separate local preview. Build retains existing chunk-size/Browserslist warnings.

Browser evidence: actual local SQL dice/score flow, held dice, banking, reload with
unchanged banked points/deadline, independent participant receiving the same score
via notification with controls disabled, and both themes in phone containers.
Local worker visibly expired the first solo round, banked 18x100=1,800 and entered
round two. Small portrait and landscape layouts were inspected; landscape uses
container geometry, not device/viewport patches. Physical touchscreen smoke remains.

Reconciliation refreshed both phone captures in a 390x680 dev container so the
entire surface fits the browser capture. A fresh four-player fixture showed Player 1
bank Full House for 25; Player 2 received the same banked value and new dice through
notifications, with all gameplay controls disabled. These are separate local
browser identities on one machine, not production accounts or a cross-device test.
The earlier small portrait (320x568) and landscape (740x390) captures are retained.
See `dev/quintzee/evidence/checkpoint.json` and `modern-observer.png`.

The prior final response incorrectly reverted to a rules proposal and implied this
thread had made no file changes. Local implementation and tests had already occurred
under the preserved owner approval. This checkpoint corrects that handoff; approved
rules are unchanged. No production action occurred.

## Remaining qualification and integration — release gate MISSING

1. Wire this core into real `private.arcade_runs` / immutable results and receipts,
   and canonical session/dealer/round admission. The current local token fixture
   is not production authentication, an actual P-Town session, or a leaderboard.
2. Reuse Boxdrop's canonical settlement owner pattern: exact dealer/round keys,
   row locks, `settle_gameplay_chip_transfers`, `game_results`, actual player chips,
   balanced transfer batches and session snapshots in one transaction. Prove winner,
   tie, injected rollback, ordinary/late/concurrent replay, stale continuation,
   zero-client completion and both money-mode gates. No alternate wallet is allowed.
3. Wire canonical authorized session pause/resume and inactivity policy. Shift clock
   origin/deadline together; never treat disconnect as a fresh clock or invent a
   score penalty. Local adapter has a paused field but no qualified pause owner.
4. Add admin-only Game Defaults editing and immutable admission snapshots, including
   duration/clear-award competitive identity, caller theme selection, catalog gates,
   compatible leaderboards attributed to each authenticated user's own performance,
   server/API dispatch and durable recovery dispatch. No player-custom ranked rules.
5. Integrate canonical multiplayer seat/HUD/financial/announcement owners and
   terminal hold/Session Ended/continuation; solo completion returns to its leaderboard.
   Current preview demonstrates the game surface, not the complete session shell.
6. Freeze or version the shared scoring dependency for production. Current local
   hash guard fails closed on changes; it is not a full historical version registry.

There are no new product-rule decisions requested. These are unfinished engineering
and qualification tasks. Do not infer production readiness from this prototype.

## Reproduce locally

Use existing installed dependencies only. `dev/quintzee/database.mjs` reads the
repository's existing local financial-template context and pg installation, creates
its own uniquely named localhost database, and records it under ignored
`qualification.local/quintzee/`. It never accepts a remote database address.

```
node dev/quintzee/setup.mjs
bun dev/quintzee/proof.ts
node dev/quintzee/protocol-proof.mjs
bunx --no-install vitest run src/lib/quintzee/model.test.ts src/lib/yahtzeeScoring.test.ts
bunx --no-install tsc -p tsconfig.app.json --noEmit
node dev/quintzee/serve.mjs
```

Open `http://127.0.0.1:5197/dev/quintzee/live.html`. Choose a theme and player count.
Participant links open independent browser identities. `frame=phone`, `small` and
`landscape` select fixed dev test containers only. Never share local actor tokens.

## Exact changed paths

- `supabase/quintzee/rules.sql`
- `src/lib/quintzee/model.ts`
- `src/lib/quintzee/model.test.ts`
- `src/hooks/useQuintzee.ts`
- `src/components/quintzee/QuintzeeView.tsx`
- `src/components/quintzee/quintzee.css`
- `dev/quintzee/database.mjs`
- `dev/quintzee/setup.mjs`
- `dev/quintzee/authority.sql`
- `dev/quintzee/proof.ts`
- `dev/quintzee/protocol-proof.mjs`
- `dev/quintzee/serve.mjs`
- `dev/quintzee/live.html`
- `dev/quintzee/live.tsx`
- `dev/quintzee/preview.css`
- `dev/quintzee/evidence/setup.json`
- `dev/quintzee/evidence/rules.json`
- `dev/quintzee/evidence/protocol.json`
- `dev/quintzee/evidence/classic-phone.png`
- `dev/quintzee/evidence/classic-small.png`
- `dev/quintzee/evidence/modern-phone.png`
- `dev/quintzee/evidence/modern-landscape.png`
- `dev/quintzee/evidence/modern-observer.png`
- `dev/quintzee/evidence/checkpoint.json`
- `docs/codex/QUINTZEE_LOCAL_CHECKPOINT.md`
- `docs/codex/CURRENT_RELEASE.md`
