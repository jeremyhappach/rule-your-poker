# Golf hosted qualification — October 21, 2026

The unchanged Golf migration is installed with general admission closed as
hosted version **20261021230433**. Candidate and installed-authority matrices
both pass **22/22 units**, with four actual strategic-bot final settlements in
each matrix. Live transport/race/service and publication status are recorded
below as they complete; SQL rollback proofs alone do not establish those gates.

## Proof protocol and corrected diagnosis

The deployed canonical recovery procedure deliberately runs 32 one-second ticks,
committing after each tick. A roughly 32-second cron call is expected and is not
evidence of a stall. The previous batch-duration interpretation is superseded.
Historical tick freshness at the earlier failure is not established. PostgreSQL
repeatable read retains the initial committed heartbeat; a later healthy tick
does not become visible inside that transaction.

Deferring full history hashing removed avoidable work before Run Back, but the
unsplit hosted mixed-real-3 still failed its genuine 10-second liveness guard at
10.149097 seconds of visible heartbeat age. That failed attempt was not retried
for a favorable outcome. No health timestamp, timeout, isolation level, rule or
presentation hold was changed.

The final matrix has the original core/financial/recovery/qualification cases,
six human full matches, six strategic mixed full matches, and six independent
continuation fixtures. Every unit is independently rollback-contained.
Full mixed matches retain human RPCs, strategic bots, all nine holes, exact
successors, immutable results, actual chip deltas and balanced journals.
Continuation fixtures establish all nine holes through legal authoritative
reducer transitions, integrity/publication triggers and financial owners, retain
an actual human request receipt, wait both real terminal/dealer-draw holds when
applicable, then prove fresh Run Back consent and old-request isolation.
Late replay now also compares the entire new match state, revision and round.
Continuation setup deliberately uses bounded legal reveal choices; it is not
claimed as strategic bot coverage, which remains in the full-match units.

Full existing-record fingerprints are captured after the rehearsal but before
its intentional rollback, excluding only the collision-checked fixture namespace.
A PL/pgSQL value retains those fingerprints across rollback. They are compared in
both directions against the restored records in the same repeatable-read
snapshot, outside the enclosing rehearsal statement. An altered/deleted existing
row or unscoped insert therefore still fails the request; no partial evidence
can be accepted. Hashes remain inside the database. All original statement,
lock and idle limits remain 15s/100ms/20s.

Local tests passed exact generated history capture, fixture exclusion, changed
row/deletion/unscoped-insert rejection, same backend/snapshot, rollback and
cleanup. A 6.1-second action hold plus deferred 3.1-second history workload passed
in 9,398 ms. Full local three/four-seat combined cases took 6,551/7,969 ms;
independent continuation cases took 6,327/6,935 ms, each exercising an actual
dealer draw. These local timings do not replace the hosted results.
The connector timing test passed in 16,230 ms under the unchanged per-statement
15-second limit. Six package tests pass; all five direct-runner tests pass
across the initial run and the focused correction rerun. The local service-gate
and bidirectional containment proof also passes.

## Exact authority and evidence

Baseline: main **55a896b1f84fcd31d32a1a135622af99fca1a3c9**, released 11 Up
hosted migration **20261021221415**. Other games and the unrelated Cribbage
snapshot are preserved.

Source: `supabase/migrations/20261021011905_six_card_golf_v1.sql`.
SHA-256: `95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.
The exact source text was passed to the scoped migration tool; no pending
migration batch, history repair or credential creation was used.

- [Candidate receipts](../../dev/six-card-golf/evidence/hosted-split-candidate-20261021.json)
- [Installed receipts](../../dev/six-card-golf/evidence/hosted-installed-20261021.json)

The candidate connector payloads included the CRLF terminator appended by
PowerShell Get-Content. Before installation, the executed manifest and receipt
hashes were corrected to include that exact suffix; original artifact hashes
are retained separately. All 22 executed hashes validated. Installed payloads
were read through JSON without transport alteration and hashed before execution.
No query or assertion was changed by this transport terminator.

Installed recovery job 110 is active every second with
`SET statement_timeout='3s'; SELECT private.golf_recover()`.
Revision publication is present. Both general release flags were false and
there were zero matches/grants at installation. Every installed unit verified
the reviewed function/catalog fingerprints and rolled its fixtures back.

## Live qualification status

The exact two-human fake-money test session is
`b07a5c86-91b0-4474-84cd-97b62a3a93f2`, limited to Hap and Happach Gmail.
The initial qualification grants expire **2026-10-22 23:10:22.678695 UTC**.
General admission and other-account/real-money admission remain closed.
The application has not yet been published in this checkpoint.
Live qualification is in progress; no owner or physical-iPhone acceptance is
claimed. Do not treat these provisional session grants as a completed release.

## Completed live checks and publication checkpoint

Live qualification completed on October 21. Authenticated actor/peer snapshots
preserve concealed own cards and actor-private draws; anonymous/private-schema
requests reject. Native Realtime delivered 181/178 revisions to the two peers
during the full human journey, with revision metadata only. Duplicate opening,
competing opening, altered replay and lost draw-response retry checks passed.
Deliberate pause retained the unresolved private draw for 31 seconds; reclaim
cleared autoplay without resuming the table. The first-hole prolonged-play
warning/queue and all nine holes were exercised.

The first full-match final-race coordination deadline expired before requests
were sent. Its failure is retained in `hosted-live.json`. After both clients
closed, actual recovery completed that earned final turn and settled once at
105/95. A separately paused legal nine-hole fixture then proved one accepted and
one rejected final action, duplicate result replay, actual scheduled terminal
continuation, fresh Run Back consent and unchanged successor state after an old
request. The newly admitted match was deliberately paused and retained.

Earlier lock-coordination probes did not establish overlap and are not passing
evidence. The corrected synchronized probe observed PostgREST PIDs **2420965**
and **2420964** waiting behind holder **2425739**; both returned the same immutable
old receipt after **6,231 ms**. See `hosted-independent-connections.json` and
`hosted-held-replay-2.json`. Hosted concurrent final-action responses, actual
pool overlap and the earlier both-money local race matrix are distinct evidence;
not every race case was re-run as a held-lock hosted case.

A separate fixture reached the ninth-hole bot final queue through legal
authoritative transitions and committed after all interactive clients closed.
No recovery function was invoked after commit. Actual job 110 completed the
strategic bot action, one result, one balanced five-chip transfer, two final
snapshots and Session Ended. Balances are human 95/bot 5 from initial 100/0.
The real cron receipts and canonical financial rows are retained in
`hosted-authority-20261021.json`.

The genuine 30-second fake-money timeout also rejected the expired human action,
performed exactly one opening through actual recovery, set canonical autoplay
and deferred sit-out, and allowed reclaim to clear both. Its exact test session
explicitly enables the canonical auto-fold timeout policy; no deadline or
heartbeat was shortened/refreshed. The resulting match remains deliberately
paused. Authenticated Gmail access to the separate Hap/bot fixture was denied,
including an empty revision-RLS result.

All qualification grants were revoked after testing. Three exact synthetic
sessions are retained, including one deliberately paused admitted successor:
`b07a5c86-91b0-4474-84cd-97b62a3a93f2`,
`c119cc62-5263-4550-88d4-381548466310`,
`f3b006a6-ee17-4495-ab50-e16a0df8a42e`.
The deployed admin cleanup function selects every fake-money session and has no
exact-session argument, so it was not invoked. Existing accounts, balances and
historical sessions were not reset or deleted.

The application code is unchanged from the previously passing 2,629 app tests,
241 harness tests, TypeScript and production build. This checkpoint qualifies
that matching client for publication with admission closed. The final deployment,
public build-manifest match, production rendering checks and exact new smoke
grant timestamps are recorded in the delivery receipt under
`qualification.local/six-card-golf/` and the final delivery message. Physical
iPhone/owner acceptance remains pending.
