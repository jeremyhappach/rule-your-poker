# Take 2 — approved rules and release qualification

Jeremy approved implementation and release in Arcade and multiplayer on 2026-10-19.
The later Ace decision explicitly enables King–Ace as well as Ace–2. This is a
P-Town interpretation where original machine evidence is incomplete.

## Frozen rules: take-two/1

One shuffled 52-card deck per round; three normal rounds for every player.
Round one has 28 tableau cards (6/5/6/5/6), one current card and 23 stock cards.
Rounds two and three have 33 tableau cards (6/5/6/5/6/5), one current and 18 stock.
Only uncovered cards can be paired. Same rank or adjacent ranks qualify, with
Ace adjacent to both 2 and King. Suits do not affect legality or points.

Each round starts its 100-second clock at the end of the 2.5-second Get Ready.
Same-rank pairs earn 1,200; consecutive pairs earn 400. The pair meter adds 500,
holds for one second after round start/a successful pair, then loses 150 per
second in five-point steps, reaching its 50-point floor after four seconds.
Invalid selections and draws do not reset it. Multiplayer pause shifts both
server anchors equally. Result presentation takes six seconds outside play time.

Manual draw costs 100, flooring the cumulative score at zero. The outgoing
current card fills the first uncovered empty slot in top-to-bottom, left-to-right
order, or is discarded if none exists. Matching current refills it for free.
No draw adds a time penalty. Drawing is unavailable once stock is exhausted.

An empty tableau ends the round immediately: 10,000 clear bonus, 1,000 for each
undrawn stock card, and 50 per whole second remaining (maximum 5,000). Current is
excluded from stock. Clear detection precedes refill, preserving the last stock
reward. Take Score banks earned points; only an exhausted stock with no legal
pair also earns the time bonus. Early voluntary banks receive no clear/stock
bonus. Timeout earns no time bonus. There is no earned fourth/bonus round or Wild.

## Historical evidence and limits

- [Games Warehouse original screen](https://games-warehouse.com/games/take-2/)
  establishes the staggered board, category counters, timer dots and 500 meter.
- [Merit game descriptions](https://www.meritgames.com/service%20center/GameDescriptions.pdf)
  describe same/consecutive exposed pairs, current-card use, and drawing cards
  onto the playfield with a score deduction.
- [2014-software gameplay](https://www.youtube.com/watch?v=lSoJPyqjpCk): manual
  draws at 1:22–1:23 and 3:11–3:13 deduct exactly 100; partial-board ends show
  time bonuses; the third round occurs below 80,000.
- [Earlier CRT gameplay](https://www.youtube.com/watch?v=sQs0hR6HfiA): visible
  draws leave the score unchanged, establishing a release difference. Pair
  increments of 1,250 and 450 support the base scores plus a 50-point meter.
- [Pick2 clone instructions](https://www.lalena.com/Games/Pick2/Instructions)
  describe 10,000 clear and 1,000 stock bonuses; these are not original Merit
  proof. Original full-clear footage/help screens were not recovered. The exact
  100-second clock, meter decay, bonus conditions, Ace wrap, and vacancy priority
  above are explicitly P-Town choices, not claims of recovered original code.

## Ownership and qualification

`supabase/take-two/rules.sql` is the only gameplay reducer/deal/scoring/timing
owner. Frozen config is identical in Arcade and multiplayer. Future stock stays
private. Projections include server-computed exposed slots/legal pairs and a
personal best frozen at admission/deal; client clocks only display server anchors.

Multiplayer uses Royal Flash's deployed normal-stake pattern: canonical consent,
UUID/revision receipts, financial transfers, final snapshots, pause, terminal hold,
Session Ended and continuation. Bots use only the public projection. Arcade uses
its existing authenticated solo receipts/results and recovery worker, with no
multiplayer or financial owner mounted. One proportional 4:3 board uses canonical
cards and the existing fullscreen shell in both modes.

Migration `20261019230217_take_two_shared_v1.sql` was installed with admission
disabled after a successful production candidate rollback proof. Installed
rollback proofs also passed; no synthetic production sessions/results remain.
The migration version comes from Supabase's migration history. The existing MCP
migration path was used; no CLI or other dependencies were installed.

Security advisor findings for Take 2 are intentional: private tables have RLS
with no client policies, and the six authenticated security-definer RPCs enforce
membership, ownership, active-profile and exact-action checks. No private helper
is executable by PUBLIC, anon or authenticated. See the
[Supabase function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

Evidence:

- `proof.sql`: winner, partial/all tie, actual chip changes, balanced canonical
  journal, matching final snapshots, duplicate/conflicting/stale/late requests,
  ownership, continuation, terminal hold, Session Ended, and zero-client recovery;
  financial cases run in both money modes. Arcade proves three rounds, one
  immutable result, owner rejection, and zero financial/session writes.
- `core-proof.sql`: unique decks/layouts, private stock, exact timer/meter edges,
  score floor, covered-card rejection, full clear before refill, stock/time bonus
  arithmetic, Ace wrap, voluntary bank, exact-deadline timeout, mode parity,
  and a third round at zero score without a fourth.
- `bot-pause-proof.sql`: canonical bot consent, autonomous legal action, pause
  preserving both clocks, and no duplicate bot advancement.
- `dev/take-two/concurrency.mjs`: independent-connection duplicate and competing
  draws/final pairs, conflicting replay, injected failure after real chip writes,
  concurrent settlement, and Arcade duplicate/timeout races.
- `dev/take-two/browser.mjs`: real UI pair/draw, reload recovery, all Arcade
  rounds and leaderboard, multiplayer active-player ownership, all six turns,
  and terminal continuation through the actual SQL/service adapters.
- `dev/take-two/layout.mjs`: 320×568, 390×844, 844×390 and 1440×900 with one,
  two and seven players; 33 card faces, timer and controls fit without scrolling
  or distorting card/board proportions.
- Application typecheck passes. The 2,489-test application run passed 2,486;
  its three setup failures were the new access hook missing from the test mock.
  The corrected setup test passes all four cases, including Take 2 (2,490 total
  application cases). All 241 harness tests and the production Vite build pass.

Local screenshots and machine-readable evidence are in ignored
`qualification.local/take-two/`. Its local PostgreSQL harness uses the existing
isolated money-qualification template; no new tools are required.

## Publication and owner smoke

Publish the recovery worker and matching `main` client, verify the deployment,
then execute the reviewed `activate.sql`. Owner production acceptance is pending.

Jeremy should play one Arcade run and a two-human table: confirm Ace–King pairing,
the draw deduction and hole priority, clear/stock/time breakdown, three rounds,
visible stake settlement, Run Back consent and the Session Ended table. Check
portrait and landscape on iPhone Safari. Local browser evidence is Chromium;
physical Safari smoke is still required.
