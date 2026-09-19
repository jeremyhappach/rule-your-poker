# Pre-Farkle baseline qualification

## September 19 observer root cause

The initial baseline at `530194483f338a83dc8d1d60a870f34c037a7566`
stopped with 19 browser passes, one SCC observation failure and Yahtzee terminal
unrun. All 20 fake-money fixtures were deleted. Regression and typecheck passed.
That run remains failed qualification and must not support the stable tag.

The SCC failure is a test attribution cutoff, not a demonstrated gameplay
failure. Saved action responses prove authoritative sequences 5, 6 and 7 for
the same player's Rolls 1, 2 and 3, with rolls remaining 2, 1 and 0. All were
accepted in the exact round, and settlement/reconnect assertions passed.

For failed action `host-1789844164596-3`, the Roll 1 response committed
`[5,1,1,3,5]`, roll key `1789844164862`. The driver waited for the database,
then clicked Roll 2 at +1,754 ms. The generic observer ends unbound attribution
at the next same-player click. The peer's first dice animation appeared at
+2,256 ms and displayed Roll 1's exact committed vector at +2,569 ms. The
renderer switches to its committed faces near the end of the fly-in; the
subsequent Roll 2 animation begins at +3,287 ms, and its different committed
vector `[5,1,5,3,4]` settles at +4,378 ms. Roll 3's exact final vector
`[4,1,2,6,4]` settles at +6,240 ms. The peer progressed; the proof had already
closed Roll 1's observation window. Random tumbling values alone do not prove
a committed outcome.

Identity: session `bbecebb0-5259-4d79-a17b-e5935587b3e9`, dealer game
`a0851e81-5a97-4982-a93a-5635c10ff1ec`, round
`8bd27abd-c93d-4104-9455-0078c385c0cf`.

The compact original RPC/DOM evidence and source-trace fingerprint are in
`checkpoints/pre-farkle-20260919/original-scc-attribution.json`. The captured
pre-change shared function definitions and security metadata are in
`checkpoints/pre-farkle-20260919/database-functions.json`; these are evidence,
not an applied migration or a claim that future forward recovery is validated.

## Harness-only correction

With the continuous observer enabled, the existing Horses/SCC terminal driver
binds each roll to its exact accepted RPC response (round, player, sequence,
roll key and dice). Before issuing another action it requires a new peer
animation followed by the exact five settled values and hold flags in the
same session/dealer-game/round. It retains intermediate captured frames and
attaches each receipt. This also distinguishes a legitimate identical reroll
from a cached pre-click outcome. Actor and other continuous-observer checks
remain in force. The original click-to-peer budget remains 15 seconds (or the
campaign's configured stricter budget), including time awaiting the RPC.

Only the proof driver and a read-only observer accessor change. No product
code, SCC rules, timers, database functions, scoring defaults or detector
exemptions change. Negative controls cover missing/stalled progress, cached or
animating values, wrong identity/outcome, rejected or unrelated commits,
late capture, and admission of the next roll before the peer proof.

The separately requested, previously missing Yahtzee terminal case passed on
September 19 against the original deployment, including the continuous
observer, authoritative settlement, ended reconnect and verified deletion of
fixture `10d2d875-7915-4091-a875-981d40855b85`. This individual pass does not
replace a coherent full baseline.

## Required final gate

### Final-turn proof correction

The second complete campaign at `69d541651` also remains failed (19/1/1),
with all 20 fixtures deleted. Its new failure is the proof's settled-frame
assumption: SCC sequence 7 in round `2c5f65c6-348c-4b7d-b85e-a9333bffd147`
committed cargo 5 and proceeded through the matching winner presentation to
Session Ended without a separate observed settled-dice frame. The normal
observer reported no progress, coverage or latency failures. No SCC product
defect is demonstrated; do not change gameplay timing to satisfy this proof.

The additional harness correction admits that existing path only for an SCC
final roll with every participant complete and a unique qualified winner.
It recomputes scores from the committed role/cargo dice, validates the exact
completed database round and roll key, requires one matching terminal result
with the expected winner UUID/score, and validates the terminal snapshots.
Within the original click-to-peer budget it also requires the peer's exact
winner caption in the same ended session/dealer-game/completed round. Names
are display checks after UUID identity validation; duplicate fixture names
are rejected. Generic Session Ended text, ties, unfinished turns, unrelated
identities, stale/changed dice, duplicate results and late evidence cannot
satisfy this path. Ordinary rolls keep the exact settled-dice requirement.
Existing terminal settlement/reconnect and continuous-observer assertions
still run after this barrier; no case or observer check is waived.

The database evidence is read-only and stays inside the original deadline.
Only qualification code and this documentation change. The frozen failed
campaigns and their raw local traces remain preserved.

### Qualification and permanent checkpoint

The third full campaign at `ec09d1615` remains failed (18/1/2), with all
19 fixtures deleted. Horses tied at rank 36 / "3 6s" and validly entered
the successor round without a separately sampled settled-dice frame. The
ordinary observer had no violations. This is another qualification assumption,
not evidence of a product defect. SCC and Yahtzee terminal were unrun.

The shared tie proof now recomputes Horses wild-dice scores or SCC role/cargo
scores from the accepted completed roll. It verifies the completed old round,
action sequence and roll key, tied leaders, unchanged participant order, exactly
one successor at hand/round +1, reset hands and the first player's turn. It
requires the persisted tie and re-ante records, no winner award or terminal
settlement, and an in-progress game pointing to that successor. UUID-bound
fixture identities establish the exact roll-result caption the peer must have
shown before displaying that same successor round. Every detected completed
tie uses this proof, even if settled dice were also visible. Database reads and
peer frames remain inside the existing 15-second click budget.

The frozen rank-36 dice vectors are a harness regression case. Negative controls
reject wrong scoring, changed dice/roll identity, unrelated or duplicate rounds,
wrong next actor/order, unreset hands, absent/duplicate tie results, incorrect
re-antes, awarded winners, ambiguous captions, and stale/late peer evidence.
SCC ties, including all-unqualified outcomes, use the same continuation proof.
The existing unique-winner SCC terminal proof and all terminal/reconnect and
continuous-observer gates remain mandatory. Product source and SQL are unchanged.

Commit the harness correction and qualify that exact commit from a clean
worktree against its matching deployed build. Run all 21 mandatory browser
cases in one fresh campaign (all seven games: entry/reconnect, pause/resume,
terminal settlement/ended reconnect), regression tests, harness negative
controls and typecheck. Every fixture must have verified cleanup. Reconfirm
the deployed commit, migration head and captured database/configuration
identity. Preserve the original failed evidence and the final campaign's
receipts, commands, results and hashes.

Only after all gates pass may `pre-farkle-stable-2026-09-19` be created at that
exact qualified SHA. Record the final campaign in the permanent tag annotation
and release/checkpoint documentation. Do not move or delete the tag. No Farkle
implementation, migration, default seed or enablement is part of this work.
