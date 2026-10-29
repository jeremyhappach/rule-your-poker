# Combined five-game async release — October 28, 2026

Approved scope: Words, Run21, TriTowers, Quintzee and Box Drop; 1–32 children,
repeats, organizer display order, independent play after acceptance, styled
invitations, active humans only and recoverable creator-only fake-money deletion
for both participants. Async remains fake-money only. Child results remain
provisional until one canonical parent settlement; no funding or reservations.
Synchronous accounting, negative balances, 36h/24h deadlines and child forfeits
are preserved. No customer deletion or financial correction is part of release.

Local qualification is in ASYNC_COMBINED_LOCAL.md. The controlled integrated run
passed 3,149 tests in 455 files; sequential typecheck, nine adapter tests, 241
harness tests, production bundle and bundled recovery worker also passed.

Hosted candidate and installed rollback proofs passed against actual accounting
triggers and deferred constraints. They cover five-game/32-child admission,
human-only discovery/direct admission, shared SQL rule cores/privacy/deadlines,
normal/forfeit provisional outcomes, negative chips, net-zero receipts, balanced
parent transfers, failure rollback/retry, deletion statuses and service grants.
The existing current-authority independent-connection race proofs cover
simultaneous last children and deletion versus settlement in both orders.
Proof recovery is restricted to synthetic children; no global sweep is invoked.

Migration 20261029002655_async_combined_five_games was installed once, closed.
The prepared CLI timestamp was reconciled to the migration service receipt;
the SQL was not reapplied. Recovery worker delayed-recovery version 1 is deployed,
bundle SHA-256 826ce4c3d84a519c818ff867c6672a433f30cdf7d3e6a024df23ea7f00642c7e.
Its own single-use dispatcher token and service-role RPC boundary authenticate
requests. Multi-game admission remains gated pending exact client publication.

The real minute scheduler (job 119) dispatched the deployed worker at
2026-10-29 00:28:00 UTC. Synthetic Quintzee child
895dc95f-6e74-4a5c-947d-443decc980a2 advanced revision 1→2, segment 1→2,
recorded one attempt and handed play to the opponent without a connected client.
The dispatch token cleared, last_success advanced and failure remained null.
There were no child outcomes, command receipts, canonical games, settlements or
financial transactions for the fixture. Parent/child, notices, update rows and
both synthetic Auth/profile identities were removed with guards in one
transaction. No immutable trigger was bypassed. A subsequent count found zero
worker/combined proof profiles and zero worker matches. Ordinary admission was
restored true and multi-game admission reset false before client publication.
Post-install normalized definition hashes match the preimage for
settle_gameplay_chip_transfers, record_session_results,
finalize_gameplay_transfer_batch and private.delayed_finalize.

Publication and activation receipts remain pending. Physical-device owner smoke
remains separate acceptance.

Rollback policy: close private.delayed_release.admission_enabled to stop new
matches; preserve recovery and compatible client code for accepted mixed matches.
Do not disable private.delayed_recovery_state.enabled with mixed matches active.
