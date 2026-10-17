# 11 Up — local first playable, 2026-10-17

Jeremy approved the discovery rules, omitted wild items, requested an all-clear
fanfare, and preserved the starting bell/timing. This is a local candidate on
`codex/11-up-discovery`, based on `6fc74478154d12dd317e74e3f3e5f8d58fc559fe`.
No production migration, activation, deployment, push or main integration occurred.
Run21 and TriTowers runtime implementations remain unchanged.

## Rules and the pass correction

The frozen identity is `eleven-up/1`, independent of mode. The initial board has
22 balls: two nine-ball diamonds and one four-ball center diamond. It uses 52
items (sixteen 1s, four each of 2–10). Numbers are visible; only uncovered balls
and the current draw ball may join a distinct-item group totaling exactly 11.
Groups can contain more than two balls. All members must be exposed before the
atomic command. Future stock stays private.

Rows score 600/500/400/300/200/100 from back to front. The draw ball scores its
prospective pass destination, or zero when none exists. A placed pass deducts
that row's value, with cumulative score floored at zero. Destinations scan back
to front, left to right, using empty uncovered positions.

**Owner correction during implementation:** do not reshuffle blocked openings;
the player must be able to pass. The initial proposal incorrectly required an
empty slot for every pass. Sampling found 362/1,000 initial boards had no eleven
and no empty slot. Investigation of the related browser game's public code
showed that Pass still advances on a full rack: its old draw item is discarded
without a placement penalty. This behavior is now implemented. When space
exists, the passed ball occupies it and incurs the row penalty. A final current
ball can be placed into an available slot; without a next stock item or a slot,
Pass is unavailable. Stock exhaustion alone does not end playable groups.

Each completed eleven contributes 1,000 once at round end. Clearing adds 10,000
and 1,000 per unused stock item, including an unconsumed current ball. Speed is
`max(0, 5000 - 100 * floor(elapsedPlayingMs / 2400))` on clear, Take Score or
blocked completion; timeout earns none. These numerical rules are approved
Ptown defaults, **not verified legacy Megatouch arithmetic**.

Two standard rounds; cumulative score at least 80,000 earns exactly one bonus
round. No Easy Mode, free replay or wild item. Multiplayer alternates players
clockwise across each full round before advancing to the next round.

The introduction is 2,500 ms with the existing round bell; Ready allows 30,000 ms.
The first valid group or pass starts the full 120,000 ms playing clock. Invalid
actions do not start it. Results hold 5,000 ms; all-clear prepends the existing
3,000 ms fanfare. Pause shifts both the playing deadline and speed origin.
Recovery advances against persisted deadlines, including with zero clients.

Evidence: [manufacturer description](https://www.meritgames.com/Support_Center/GAMEDESCRIPTIONS.PDF),
[Megatouch programmer](https://www.mattbrenner.com/11ball-and-11up),
[legacy gameplay](https://www.youtube.com/watch?v=zpBNYhBlync),
[related browser instructions](https://www.lalena.com/Games/ElevenOut/Instructions),
and its [public game script](https://www.lalena.com/bundles/elevenOut?v=BHoKTUiB7T7MoSwa6lMY3alF4MyvRlh2AV8RMyHbWpQ1).
The script establishes the full-rack pass behavior for that browser game only.

## Implementation boundary

- `supabase/eleven-up/rules.sql`: one server-owned shuffle, exposure graph,
  legal-group check, pass policy, scoring, timing and qualification core.
- `multiplayer.sql`: accepted TriTowers ownership pattern in a new namespace:
  authenticated configure/action/snapshot/history/close RPCs, frozen seats,
  revision and UUID receipts, private history, pause and due recovery. Canonical
  settlement uses `settle_gameplay_chip_transfers`, `game_results`, actual player
  chips and final session snapshots. Highest scores share losing stakes; all
  ties move no chips. Bots are explicitly rejected in this milestone.
- `arcade.sql` and `arcade-registration.sql`: the same board core through the
  existing Arcade run/receipt/result/leaderboard owners. Only new-game admission
  and completion-validation branches are added to existing SQL owners.
- `server/arcade/service.ts`: additive new-game dispatch to the SQL adapter,
  including recovery. No Run21 or TriTowers branch is altered.
- `src/components/elevenUp`, `src/hooks/useElevenUp.ts`, `src/lib/elevenUp`:
  shared ball view, canonical fullscreen layout, immutable pending commands,
  identity/revision checks, recovery, and the existing bell/fanfare/count-up
  presentation hook. Solo mounts no multiplayer shell or financial providers.
  Interactive balls and controls use the canonical felt interaction layer.

Production admission defaults to false. The sources are not installed as a
production migration and no production game selector or route is enabled.

## Local validation

The disposable PostgreSQL clone is recorded in
`qualification.local/eleven-up/context.json`; the accepted reference database
was not modified. Existing installed dependencies were reused through junctions.
No packages were installed.

`dev/eleven-up/proof.mjs` exercises candidate SQL inside a rollback, installs only
into the disposable local clone when explicitly passed `--install-local`, then
repeats the rollback proof. It checks distribution, exposure, groups of three,
current participation, full-rack and placement passes, scoring/deadlines,
redaction, replay/conflicts/stale/outsider rejection, zero-client progression,
actual winner/mixed-tie/all-tie chips and journal, final snapshots, close replay,
Arcade immutable completion and no multiplayer/financial writes during solo.
The proof explicitly flushes deferred constraints before inspecting the canonical
transfer batch; inspecting it before that boundary produces a false absence.

`contracts.mjs` uses separate actual connections for duplicate and competing
commands in both modes, verifies exact qualification and pause behavior, and
forces a failure after chip movement to prove atomic rollback. It also checks
pending Session Ended and shared-core parity. Synthetic rows exist only in the
disposable local database.

Focused tests include the new transport boundary plus existing Run21/TriTowers
Arcade dispatch and HTTP authentication (31 tests). TypeScript compilation uses
the installed `tsc`; `tsgo` is not installed. The standalone preview has a Vite
production build. Browser checks cover actual solo group/current/pass commands,
a three-ball group, two human seats, spectator restrictions, all-clear display,
server progression and portrait/landscape layouts. The all-clear browser check
uses an explicitly synthetic three-ball fixture, not an earned full-board clear.
Physical-device audio and production smoke remain owner acceptance.

## Review locally

With the existing local database running:

```text
node dev/eleven-up/serve.mjs
```

Open `http://127.0.0.1:5186/dev/eleven-up/live.html`. It offers solo Arcade and a
two-human table; the table provides a second-seat link. The loopback transport
uses real SQL authority and commit notifications with synthetic authenticated
actors. Its background worker owns progression; the browser clock only renders.
The local launcher has no account login and is not a production endpoint.

The next bounded phase is production integration/qualification: main game
registry and authenticated transports, canonical financial presentation cursor
and Session Ended handoff, realtime publication and recovery scheduler wiring,
deployable migration against inspected current definitions, and owner smoke.
Bots and broader multiplayer-size qualification remain outside this first
playable. Passing local proofs does not authorize production activation.
