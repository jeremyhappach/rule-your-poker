# Shared gameplay rules — standing architecture contract

Every game available in Arcade and multiplayer has one versioned rule base for
legal actions, scoring, bonuses, randomness/dealing and gameplay timing. A rule
version identifies gameplay independently of mode. No mode-specific formulas,
copies of action logic, or independently tuned gameplay settings are allowed.
This applies now to Run21 and to future TriTowers, Yahtzee and other adapters.
It does not authorize implementing those other adapters.

Arcade orchestrates one player through the standard game automatically, without
opponents, pauses or finances. Multiplayer orchestrates participant order,
authorized pause/resume, competitive tie resolution, canonical settlement and
session continuation. Presentation can display authority but cannot pause or
alter gameplay clocks. Multiplayer's authorized pause shifts the existing clock
origin and deadline equally, preserving the same completed-tick calculation.

## Run21 ownership and versions

`src/lib/run21/rulesets.ts` defines `run21/2`; `board.ts`, `rules.ts` and
`shuffle.server.ts` are the common action, scoring/timing and randomness owners.
Both adapters draw independently from the same standard 52-card CSPRNG shuffle.
Multiplayer deck commitments and participant identity are orchestration/security
metadata; they do not change the deck distribution or legal sequence.

The source definition generates the immutable private SQL gameplay registry.
New multiplayer admissions freeze its identity/configuration; new Arcade runs
freeze the same gameplay fields with Arcade progression metadata. The database
rejects changes to either the registry or an admitted multiplayer configuration.
The default is staged until the compatible API and both recovery workers publish.
`activate-shared-rules.sql` changes only new admission defaults and Arcade board
selection; multiplayer eligibility/release admission remains unchanged.

Speed starts at 280 when the 2.5-second intro ends. Completed ticks subtract 2
every 420 ms to 200 at 16.8 seconds, then every 900 ms to zero at 106.8 seconds.
There is no first-placement allowance. Both database commit paths give deadline
expiry precedence over a crossing action. Expiry awards zero. Existing multiplier
awards, pass count, columns, card totals and standard three rounds are unchanged.
The exact intervals are accepted P-Town approximations.

Existing rows keep their frozen configuration, dealing/lifecycle versions,
private cards and financial history. In particular, the separately paused legacy
real-money match is not resumed or modified. Earlier Arcade board versions remain
selectable; the new default board uses `run21/2`. No score history is rewritten.

## Qualification and release

TriTowers now defines `tri-towers/2` in `src/lib/triTowers/rules-v2.json`, generated
into its immutable admitted match configuration. The board functions in
`supabase/tri-towers/v2.sql` are the sole mode-independent dealing, action, scoring
and clock authority. Multiplayer wraps that core for seat order, round scheduling,
bonus eligibility and canonical settlement. Future Arcade must reuse these exact
functions/configuration; no Solo implementation is part of this correction.
V1 bodies and historical interpretation remain separately dispatched.
See [TriTowers qualification](TRITOWERS_V2.md).

`sharedRules.test.ts` compares both adapters through 50 identical deals, legal
actions, every tick transition, untouched timeouts and per-participant intro starts.
The complete `financial-authority.proof.mjs --migration --independent-decks
--continuation --shared-rules` matrix covers ordinary winner, real money with cold
recovery, sudden death, Session Ended and legacy modes. Add `--shared-installed`
to compare installed function hashes. It exercises actual canonical transfer
triggers, exact balances, immutable batch/result/snapshots, failure rollback,
replay, concurrency, authorization, pause/resume and successor isolation.

Arcade regression uses `dev/arcade/proof.mjs --installed --scoring --shared-rules`
and `dev/arcade/browser.mjs --shared-rules`. Synthetic financial proof runs stay
inside disposable local databases. Jeremy's authenticated production smoke is
the final acceptance truth. Presentation/artwork remains outside this release.

Recovery bundles are built from each `supabase/functions/*-recovery/index.ts`
entrypoint with installed esbuild, `bundle: true`, `platform: 'node'`,
`format: 'esm'`, `target: 'node22'`, and `alias: {crypto: 'node:crypto'}`.
The explicit Node target preserves Deno-compatible `node:` builtin imports.
Deploy both compatible bundles before activating the shared defaults.
