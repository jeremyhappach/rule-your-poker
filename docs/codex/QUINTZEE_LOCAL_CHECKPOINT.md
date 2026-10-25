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

### Owner preview follow-up (base ba220d245da940b2cfd2635b8550ec05ea1d1204)

The current source incorporates all subsequent local UI feedback: a single
QUINTZEE title in the canonical toolbar; no P-Town Originals label, category
completion count, base-score readout, speed number or visible countdown text.
The full-width graphical timer remains visible to every participant. Its numeric
remaining time is available through progressbar accessibility attributes, with
no timer live region. The round clock and SQL scoring rules are unchanged.
The completion bonus is labeled exactly ALL FILLED; its +35 value is unchanged.
The redundant scoring helper and opponent's-dice helper are removed.

Dice now have larger bordered touch targets, explicit hold/release accessibility
labels, pressed state, a checkmark and bright border for held dice. The prominent
reroll control shows remaining rerolls and Roll 1/2/3 of 3. The first roll stays
automatic after Get Ready; after the third roll, reroll is disabled and the
control directs the active player to choose a category. Earlier category banking
remains legal. Inactive participants see a noninteractive named-turn message in
place of that button, plus the active player's timer, dice and scorecard. UUIDs
still authorize actions; display names never identify actors. Names come from
snapshot participant metadata with numbered fallback. New local fixtures use
synthetic Alex/Jordan/Casey/Morgan names, not production account identities.

Solo Abandon reuses the existing Arcade AlertDialog components and wording from
`src/pages/Arcade.tsx`: Abandon game? / Its score will not enter the leaderboard. /
Keep Playing / Abandon Game. The LOCAL adapter records abandonment separately
from completion, preserves state, rejects later scoring, excludes abandoned runs
from recovery, and rejects multiplayer abandonment. This is not the real Arcade
abandon adapter, departure, financial cancellation or leaderboard integration.
The local terminal surface links back to local setup; production must use the
canonical game's leaderboard destination. No fixture score enters a leaderboard.

Reproduction before changes: both themes had working hold buttons and rerolls,
but small low-contrast HOLD labels. Get Ready covered controls and incorrectly
displayed "3 rerolls left" before the automatic roll. Earlier preview links had
expired to Match Complete with disabled controls. No missing-control bug was
reproduced during an active round at 390x680; the 740-high earlier dev frame could
clip in a 720-high browser capture. The current fixture preserves its frame on start.

Browser evidence before the final text/timer/opponent-message edits: both themes
held the first two dice across both rerolls, disabled a further reroll, committed
Any (Classic 23 / Modern 14), reset to the next category's initial roll, and kept
the round clock decreasing. Hold then release worked. Banking Three Alike early
(Classic 18 / Modern 23) notified the inactive browser. Inactive dice/category/
reroll controls were disabled and Abandon was absent. These observations do NOT
verify the later change from disabled reroll to a named-turn message.

The solo confirmation and Keep Playing path were observed. The attempted confirm
was NOT verified: the browser stalled, and a read of that local fixture found
`abandoned_at` still null. Server-side abandonment proofs pass, but the complete
UI abandon path remains unqualified. Existing-tab reload timed out; reacquiring
it timed out on `Emulation.setFocusEmulationEnabled`; one fresh tab timed out on
`Page.navigate`. The HTTP preview returned 200. No approval was rejected and no
browser tooling was installed. Further repeated attempts were stopped.

Final graphical-only timer, ALL FILLED label, removed opponent helper, named-turn
replacement, latest small/landscape layout, and both-browser complete-round
handoff/reconnect/expiration checks therefore still need browser verification.
Saved controls screenshots are INTERMEDIATE evidence and retain the numeric
timer or earlier helper labels; they are not final screenshots. The earlier
checkpoint's screenshots below are also historical. Use the current local route
for the latest source, not those captures.

Focused validation: the unchanged SQL core again passed 93,312 category comparisons
and 13 proof groups. The expanded protocol proof passes 10 groups, including
solo abandonment and both-theme server snapshots through expiration, whole-round
handoff, reconnect, participant names and new-active-player authorization.
These are server proofs, not the blocked browser handoff test. All 26 focused
Quintzee/Yahtzee tests and final-source TypeScript check pass.
No new production build is claimed for this unrouted preview pass.
All six production integration/qualification gaps listed below remain open.
See `dev/quintzee/evidence/controls/observations.json` for exact dice observations.

### Frozen gameplay rules

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
- `dev/quintzee/evidence/controls/observations.json`
- `dev/quintzee/evidence/controls/classic-before.png`
- `dev/quintzee/evidence/controls/modern-before.png`
- `dev/quintzee/evidence/controls/classic-held.png`
- `dev/quintzee/evidence/controls/modern-held.png`
- `dev/quintzee/evidence/controls/classic-final-roll.png`
- `dev/quintzee/evidence/controls/modern-final-roll.png`
- `dev/quintzee/evidence/controls/classic-inactive.png`
- `dev/quintzee/evidence/controls/modern-inactive.png`
- `dev/quintzee/evidence/controls/classic-updated.png`
- `dev/quintzee/evidence/controls/modern-updated.png`
- `dev/quintzee/evidence/controls/solo-abandon-confirm.png`
- `docs/codex/QUINTZEE_LOCAL_CHECKPOINT.md`
- `docs/codex/CURRENT_RELEASE.md`
