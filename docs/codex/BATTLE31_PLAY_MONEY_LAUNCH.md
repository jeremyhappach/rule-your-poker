# Battle31 all-user play-money launch — 2026-10-25

Jeremy approved opening Battle31 to all active users in play money, without an
access expiry. Real money remains closed. This supersedes the unpublished
two-account/24-hour candidate 409749e27d86587557973fcd98f966b3c84a7794.
Release base is verified main/production 5566a9535ca687a7ebb37bd9feb36d5231cd6160.
The old smoke branch is preserved; its grants and admissions tables are not installed.

The core migration 20261021202045 is already installed and is not reapplied.
The forward migration adds two database constraints: real_qualified cannot be
true, and a Battle31 session cannot be real money. Existing capability, configure
and begin gates continue to reject real money; the session constraint also rejects
money-mode switching. No account list, expiry, access clock or gameplay rule changes
are introduced. Exactly-two human/human and human/bot modes remain unchanged.

Active play-money matches continue when all humans become automatic. Two narrow
guards extend the installed Golf pattern in private.pause_all_humans_auto_fold;
the complete installed preimage MD5 is 347ab39eadb7ae710292d01be7985161. Both
deliberate-pause checks precede the new guards. Golf, Eleven Up Ready, HOLM/357
thresholds, locking, service identity and all other branches remain verbatim.
Canonical reclaim clears auto_fold and sit_out_next_hand; postgame still owns
eligibility. No reducer, bot, scoring, timing, ledger or settlement owner changes.

## Qualification

dev/battle31/launch-proof.mjs prepares rollback-contained candidate and installed
proofs. The proof runs against synthetic UUIDs and verifies existing games,
players, results, ledger batches and unrelated function definitions/ACLs before
rollback. Recovery is transactionally scoped to the generated fixture only.
No actual user games or financial records are deleted or altered for testing.

Coverage: fresh unrestricted active identities; real capability/configure refusal;
real qualification and money switching refusal; one/three-seat refusal; exact-two
HH/Hbot consent/start; hidden projections and raw-state denial; wrong actor and
nonmember refusal; winner +5/-5, tie 0/0 and abort 0/0; failure after canonical chip
movement rolls back; one result, final snapshots, balanced transfer; duplicate and
late replay; admission closure preserves admitted play; timeout, reclaim and stale
reclaim; deliberate pause; all-away autonomous match settlement and postgame.
Local clocks are advanced only in synthetic fixture state to exercise recovery;
this is not elapsed-time UX acceptance. No rule clock is changed in production.

launch-concurrency.mjs reuses the existing race suite in a disposable local
database with the exact forward migration. Duplicate requests, competing actions,
timeout race, pause, autonomous settlement/postgame and resignation pass.
The autonomous race fixture completed in 69 recovery steps, round 11.

Candidate and installed hosted proofs pass with three financial cases, two
autonomous topologies and zero residual users. Hosted migration 20261025191852
is installed (source 20261025192500); both constraints are validated and the
final shared pause fingerprint is de9cd5aff13b4a04b9ad1a9ec69683e9. All four
admission flags remain false through qualification. TypeScript, 2,908 source tests,
241 harness tests and the production build pass; existing bundle warnings remain.
Exact-SHA publication verification and activation follow the release commit.
Qualification evidence is in dev/battle31/evidence/launch-release.json.
Existing core hosted transport,
independent scheduler and terminal concurrency evidence remains historical evidence;
this launch does not claim a new two-browser hosted smoke or physical iPhone smoke.

## Activation and smoke

Only after exact remote main, READY production, public build manifest and persisted
release signal agree, set enabled/admission_enabled/fake_qualified true and leave
real_qualified false. No expiry is attached. Other release flags are untouched.

Refresh both clients. Create a play-money session with exactly two seats, choose
Battle31, configure a stake and have the noncaller Ante Up. Exercise HH and Hbot,
timeout and uncheck Auto-play to reclaim, reload/rejoin, match settlement and
continuation. Verify Battle31 is unavailable in a real-money session. Confirm
terminal results/Session Ended and lobby return. Owner smoke is pending.
