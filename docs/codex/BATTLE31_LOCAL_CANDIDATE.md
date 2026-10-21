# Battle 31 / 1 — local candidate, 2026-10-20

Recovery and migration packaging were subsequently qualified locally on October 21.
See [the superseding recovery checkpoint](BATTLE31_RECOVERY_QUALIFICATION.md) for
that scope, exact evidence and remaining release gates. Earlier evidence below
remains historical; approved rules are unchanged.

Approved local rules: exactly two multiplayer seats, human/human or human/bot.
No Arcade, leaderboard, historical-fidelity release gate, or Full Hand Replay UI.
Implementation is isolated on `codex/battle31-v1`, based on main
`44dbd5a7d4de4635b258f731558fe346473d82b9`. No merge, push, deployment,
production migration or production admission activation is authorized or performed.

## Frozen rules

One private server owner: `private.battle31_rules/reduce`, version `battle-31/1`.
One 32-card deck: 7–A in four suits, no duplicates or Jokers. Unbiased cryptographic
Fisher–Yates shuffle each round. Deal three to each seat and three face-up center
cards. The other 23 cards are unused. No refresh, draw or recycling in the round.

Best same-suit total wins: A=11, courts=10, numerals face value. Ordinary triples
are 30.5, AAA=32. Ordinary 31/AAA resolves immediately after an atomic exchange.
Both opening hands are evaluated together after the 1.2-second deal presentation;
AAA beats 31, equal opening 31s draw. Equal ordinary hands also draw, with no
secondary rank/suit tie break or failed-close multiplier.

Swap one own card for one center card, identified by immutable card IDs, or
TAKE POT to exchange all three atomically. Exactly two is illegal. PASS during
normal play grants the opponent one final decision. After six normal decisions,
announce one final turn each (7 and 8). STAND at 7 preserves 8; no response after 8.
PASS at 6 resolves after response 7; PASS at 5 resolves after response 6.
Timeout uses PASS/stand. A 31/AAA on any decision resolves immediately.
Eight all-three exchanges cannot loop beyond the cutoff.

The lower hand incurs one loss. Three lives then Last chance; the fourth loss
eliminates. Maximum 12 rounds, including drawn rounds; fewer losses wins, equal
losses draws. Initial first actor is random and alternates each round, including
draws. This marker is independent of the canonical caller.

Each decision has a persisted 15-second deadline. The next turn opens at commit,
without animation gating. Round-result hold is four seconds; terminal hold is
three. Canonical pause shifts the remaining deadline on resume. Disconnecting is
not resignation. Server recovery advances deadlines with no clients; an explicit
resignation loses the match. An integrity abort is private administration only.
Unpaused rules permit at most 96 decisions, about 25 minutes at every deadline
plus scheduler latency; this is a bound, not expected playing time.

Configured stake S is the total match liability: one canonical loser-to-winner
transfer S, never a per-round charge or pot purchase. Draw/valid abort transfers
zero. Caller setup and explicit non-caller Ante Up precede dealing. Settlement,
results, chip snapshots and ledger are atomic and replay-safe. Continuation uses
the canonical caller/participation owner and fresh consent.

## Ownership and presentation

`supabase/battle31/rules.sql` is the only gameplay implementation. Humans, bots
and timeout recovery share `battle31_commit` locking, revision and receipt guards.
The bot receives only its own hand, public center and public acquired-card memory;
it evaluates all legal choices against 16 possible opponent hands and their next
response. It has no authoritative opponent-hand or future-deck access.

`multiplayer.sql`, `commands.sql`, `recovery.sql`, `registration.sql` and
`grants.sql` adapt the accepted Boxdrop canonical consent/financial/continuation
pattern. Recovery is a dedicated due-work owner, with one transition per pass.
`deployment.sql` describes later realtime/cron/default registration; it has NOT
been applied. Production release gates default false; there is no activation SQL.

Private immutable request receipts, minimal revision history, completed-round
hands/results, final financial snapshots and ledger linkage provide operational
audit evidence. There is no replay UI or separate Full Hand Replay integration.
This is not a claim of a complete historical action replay archive.

The client uses FullscreenGameShell and the canonical interaction layer, two-seat
orientation, shared audio/announcements/financial presentation, and terminal
retention. Selection is tied to revision and card ID; a new snapshot invalidates
it. Animations follow commits and cannot block a new legal turn. Unknown/opponent
faces stay backed. No arcade awards or count-up points are manufactured.
Portrait stacks hands/center; landscape keeps the local hand bottom/center and
places center cards left and controls right. Cards/buttons have 44px minimum tap
width. All tested layouts retain full cards inside the available shell.

## Executed local qualification

Evidence and runnable harnesses are under `dev/battle31/`; retained evidence is
in `dev/battle31/evidence/`. All database work used a disposable PostgreSQL clone
bound to 127.0.0.1:55439, never production.

- Candidate and installed financial rollback proofs in both money modes: caller
  authorization, non-caller consent, invalid stake, private projection/access,
  wrong-turn/stale-card refusal, wins/draws/aborts, actual 105/95 or 100/100 chips,
  balanced canonical ledger, two matching final snapshots, immutable result,
  failure after financial writes, duplicate/late replay, continuation and end.
- Independent-connection duplicate, competing action and expired action versus
  recovery races; pause, zero-client match completion/postgame, resignation.
- Opening specials, PASS 5–8, timeout at 8, 31 at 8, tied cap, card conservation
  and repeated all-three exchanges through the eight-decision cutoff.
- Actual human/bot admission and autonomous server bot actions to settlement.
- Browser: two private human views plus observer masking, real RPC exchange,
  reload, eight portrait/landscape sizes (320x568 through 1280x720), actual
  resignation chip loss and Session Ended removal of gameplay cards.
- TypeScript `tsc -p tsconfig.app.json --noEmit`; production Vite build;
  2,556 application tests plus three new Battle 31 tests; 241 harness tests.
  The configured `bunx tsgo` command was unavailable (registry 404); the already
  installed TypeScript compiler was used. No dependency was installed.

The simulation runs the actual SQL reducer, with paired identical deals and
swapped policy seats. Evidence includes mean rounds/actions, policy wins, seat
wins, draws, forced showdowns and twelve-round caps. Greedy immediately maximizes
hand value; PASS always closes; strategic is the implemented bounded bot. Random
deals mean reruns vary. Small samples and these policies do not establish optimal
play or production balance. Decision counts are measured; human thinking time is
not. Do not treat earlier 3–7-minute claims as measured expectations.

## Remaining limits and coordinated release work

This is a local candidate, not a production-qualified release. The main-route
journey now passes against actual candidate SQL with a token-bound loopback
transport (details below). Hosted GoTrue/PostgREST/Realtime, production permission
parity, hosted scheduling, physical iPhone Safari/audio and wider adversarial bot
balance remain explicit qualification limits.

Before any separately approved release, reconcile the shared registration
functions and Game.tsx against coordinated main (other games are in development),
verify deployed authority hashes, assemble a guarded migration, prove installed
production authority with admission closed, and qualify actual scheduler/realtime
and full client lifecycle. Do not concatenate stale shared-function copies and
overwrite another game's registration. Admission activation remains separate.

Physical iPhone portrait/landscape, interrupted network, mute/reduced motion,
run-back with fresh consent, and fresh entry to an ended session now have local
route evidence but still require physical/production smoke. Source reuse and unit
tests are not substitutes for those environments.

Final retained SQL simulation: 200 greedy/greedy matches averaged 6.49 rounds and
23.53 decisions (seat wins 94/106; 2 forced showdowns); 200 greedy/PASS matches
averaged 4.585 rounds and 10.79 decisions (policy wins 199/1); 50 strategic/greedy
matches averaged 6.58 rounds and 24.82 decisions (policy wins 31/19, seat wins
20/30; 3 forced showdowns). No draws or match caps occurred in these samples.
Earlier intermediate samples differed. At an assumed 3–5 seconds per decision,
24.82 decisions plus deal/result holds implies roughly 1.8–2.6 minutes; this is
an assumption-based estimate, not measured human duration.

## Main-route continuation and report reconciliation

The initial implementation checkpoint is
`a21d16c40366fddcceeb676d1223f512beb442f0`. A later response incorrectly reverted to
research, requested already-granted rules approval, and stated no repository or
database changes had occurred. That response is superseded by this record.
At reconciliation the checkpoint was still HEAD, with nine untracked route-harness
files. The disposable clone had received fixture read grants, read_session_frame,
notification triggers and local gate/fullscreen-default changes. No production
changes occurred. The interrupted route check had not passed consent.

The corrected continuation retained seven useful harness files, removed two
one-off probes, added runner documentation, and corrected two product defects:

- Battle31View no longer renders a second Session Ended/winner surface underneath
  the canonical terminal banner and Results panel. Canonical ownership is intact.
- useBattle31 displays the reconnect ellipsis correctly rather than mojibake.

Harness corrections were separate: UPDATE notifications must not reach DELETE
subscriptions; auto_ante and auto_ante_runback cannot both be enabled; an absent
local session must have the SDK's ordinary null-session/no-error shape. Exact
repository request_session_end definitions were installed into the local clone,
where that canonical function was missing. No production migration is implied.

### Executed journey, both money modes

`dev/battle31/main-route.mjs` mounts actual Game.tsx and its auth guard. Public
RPCs and reads execute as PostgreSQL authenticated identities bound to distinct
opaque loopback tokens. Tests block non-loopback browser requests.

Both real-money-mode and fake-money-mode synthetic sessions passed:

1. Caller chooses Battle 31, changes stake to 9, and configures the match.
2. No private match exists until the non-caller explicitly accepts Ante Up.
3. Two private human projections mount; an actual UI exchange commits.
4. The first audible exchange schedules two cue oscillators; muted exchange adds
   zero. Each document uses exactly one shared AudioContext.
5. A committed exchange response is deliberately dropped. Reload clears the same
   saved command through retry; its immutable request UUID has exactly one receipt.
6. Offline controls disable; authenticated reload restores the current match.
7. UI resignation settles 100/100 to 91/109 once, then canonical caller rotation
   reaches setup/Run Back without ejecting the live route.
8. Run Back retains stake 9 but creates a new dealer-game identity. Despite saved
   auto-runback preferences, fresh consent is required and no match exists before
   it. Consent itself does not debit chips.
9. Successor reload preserves three masked opponent cards. Persisted mute remains
   silent after reload; unmute restores two-note exchange cues with one context.
10. A host-authorized canonical end request followed by UI resignation settles
    the second match to 82/118. Live clients reach one canonical Session Ended
    banner, Results and Back to Lobby; all Battle 31 cards are retired.
11. A fresh authenticated mount of the ended session goes directly to the lobby.
    A tokenless mount redirects to auth; a tokenless RPC receives HTTP 401.

Both journeys recorded zero browser page errors. Retained evidence:
[real mode](../../dev/battle31/evidence/main-route-real.json),
[fake mode](../../dev/battle31/evidence/main-route-fake.json),
[real terminal](../../dev/battle31/evidence/main-route-terminal-real.png), and
[fake terminal](../../dev/battle31/evidence/main-route-terminal-fake.png).
The synthetic fixtures start with 100 chips; canonical Results shows final
balances 82/118, not just the two match deltas. Screenshots may include the trailing
canonical +9 transfer cue; no game-owned cards or duplicate terminal title remain.

Final checks: application TypeScript; 34 focused tests (Battle 31 model 3,
shared audio 22, timer authority 4, route retention 3, canonical terminal 2);
actual-Game route bundle; production Vite build. Existing Browserslist/chunk-size
and terminal-test act-environment warnings remain. The previous checkpoint's
full application/harness suites are prior evidence, not rerun claims for this pass.

### Remaining limits

This is local authenticated-role route qualification, not hosted sign-in or JWT
validation. The loopback adapter substitutes Supabase HTTP/realtime transport;
local SSE is fed by PostgreSQL notifications. Its optional presence/storage and
unused query operations are stubs. Lobby creation and the auth page are destination
placeholders; the actual Game route, setup, consent and continuation are exercised.
Mute tests use persisted profile state and the actual shared audio preference API;
Settings-screen navigation and physical speakers were not tested. A host end
request is sent through its canonical authenticated RPC; its menu gesture is not
part of this journey. See [runner scope](../../dev/battle31/README.md).

Production permission/schema parity, hosted zero-client scheduling and realtime,
physical iPhone portrait/landscape/interruption/audio, and coordinated-main
integration remain pending. No merge, push, deployment, production migration or
production admission activation occurred. Rules and local implementation approval
are already granted; no repeat product approval is requested here.
