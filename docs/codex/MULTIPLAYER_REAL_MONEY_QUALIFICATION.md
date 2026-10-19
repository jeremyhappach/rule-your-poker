# TriTowers, 11 Up and Royal Flash — multiplayer money qualification

2026-10-19. Jeremy authorized normal multiplayer and real-money admission after
independent qualification. Owner production acceptance remains pending.

## Admission and ownership

All three capability contracts advance to version 2, `fake_money_only=false`.
The migration removes the fake-money predicates from each game's capability,
configure, action, settlement and recovery owners. Existing active-account,
session membership, caller, participation, authorization and liveness checks stay.
The deployed actor checks already used ordinary active accounts; no account
allowlist needed removal. The migration temporarily closes new admission until
the matching client is published and the installed proof passes; it does not
disable an existing competition or Arcade.

Caller setup loads the default stake before exposing the editable form. A late
initial/default request cannot overwrite an edit or another selected game.
The caller publishes one immutable offer. Participants explicitly accept its
dealer-game UUID even with saved auto-ante enabled. Changing a published offer
is rejected; it cannot retain acceptance at another price. No match exists until
required consent resolves. The server freezes stake, roster and shared rules.

Settlement retains the existing match lock, terminal result identity and canonical
`settle_gameplay_chip_transfers` path. Result, player chips, immutable settlement,
final snapshots and deferred transfer journal commit in one transaction.
`game_results_terminal_settlement_key` uniquely identifies the dealer game,
hand and terminal settlement; transfer batches are unique by session and cursor.
Split remainders use the existing clockwise whole-chip allocation. All-player
ties transfer zero. Existing signed session-chip accounting is unchanged.

No scoring, randomization, timing, audio, records, history, leaderboard, Arcade
or financial formula changed. Preserved new-game rule versions are TriTowers/5,
11 Up/3 and Royal Flash/3, including support for already admitted older versions.

## Evidence and limits

`supabase/multiplayer-money/qualification.json` records concrete before/after
balances, result IDs, transfer batches, independent connection races and browser
runs. Production proof IDs identify rollback-contained evidence, not retained
production transactions. Every production fixture and temporary definition was
rolled back. Existing accounts, balances and historical transactions were not
rewritten. Browser/concurrency fixtures live only in a disposable local database.

Each game passed a 36-case financial matrix: 2–7 players, single winner, split
winner and all-tie outcomes, each in both money modes with a 17-chip stake.
For each game, seven additional lifecycle configurations cover actual public-RPC
play, zero-client recovery, decline, leave, consent timeout, active abandonment,
and bot support (11 Up correctly rejects bots; TriTowers/Royal Flash execute bot
actions through the real recovery owner).

- Two players: 100/100 → 117/83; one 17-chip counterpart transfer, no unmatched deltas.
- Three-player split: 100/100/100 → 109/108/83 (winner ordering follows seats).
- Seven players: seven balances of 100 → 202 and six balances of 83; total 700.
- All-player tie: balances unchanged; no monetary transfer batch.
- Injected failure after actual chip writes, before final snapshot: result,
  balances, snapshots and settlement all roll back; retry settles once.
- Separate database connections race stake replacement against acceptance,
  duplicate final acceptance/start, recovery, settlement and close. The accepted
  offer remains nine; 100/100 → 109/91 with one result and one balanced batch.
- No-consent, abandonment, terminal close, reconnect snapshot, late settlement
  and continuation assertions prevent a second competition or financial effect.

The financial matrix seeds authoritative terminal score vectors to cover exact
ties/remainders. Separate public-RPC and browser runs derive scores from actual
legal gameplay. Local browser tests use the real setup, Ante Up, game, financial
presentation and canonical shell components, with a local SQL transport adapter.
They verify default 5 → edited 9, explicit consent, actual gameplay, visible
109/91 balances, chip movement, winner display, continuation and reload without
another transfer. Each game's actual Run Back button also produces a new offer
at nine, requires fresh non-caller consent and starts exactly one new match without
an extra financial transfer. Migration `20261019203757` passed the complete installed
rollback proof after installation. This is not a production browser smoke or a physical-device
audio assessment. Session Ended is covered by actual SQL terminal paths and
existing canonical/game component regression tests; Jeremy validates the complete
production route and device presentation below.

`npm run build` passed typecheck, 2,489 application tests, 241 harness tests and
the production Vite build. Focused regressions cover stale/closed capabilities,
stake-default response races and existing Run Back behavior. Existing browser-data
age and bundle-size warnings are unchanged.

## Reproduction

`node dev/multiplayer-money/prepare.mjs` constructs a rollback-contained candidate
proof from the reviewed admission SQL and matrix/flow sources. Emit it with
`node dev/multiplayer-money/emit-production-proof.mjs`; the candidate includes
deployed-owner drift guards. After applying the migration, run both commands with
`--installed`. That variant exercises installed configure/action/settlement
definitions and opens admission only inside the rollback transaction. Recovery
is temporarily scoped to newly inserted fixture IDs in either proof.

Local browser/race tools use the existing PostgreSQL qualification runtime and
`.codex/evidence/multiplayer-money/context.json` naming its disposable database.
Run `serve.mjs`, then `browser.mjs`, `run-back.mjs` and `concurrency.mjs` from
`dev/multiplayer-money/`. No dependency installation is required.

## Production acceptance

For each game, use normal accounts in a real-money session:

1. Caller sees the default, changes the stake, then publishes it. Other players
   see that exact amount and must press Ante Up before play.
2. Complete a game; compare all balances, chip movement, winner and history.
3. Reconnect near completion; verify one payout and the same committed result.
4. Continue and Run Back; the new offer requires fresh consent at its exact stake.
5. End a session; results remain on the felt with working HUD tabs and local Back
   to Lobby. Reopening the ended session goes to the lobby. Check audio on devices.

Passing automated qualification and opening admission do not replace Jeremy's
final production acceptance.
