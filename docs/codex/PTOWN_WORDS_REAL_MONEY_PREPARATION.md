# Live Words real-money preparation — local qualification only — 2026-10-28

Jeremy confirmed live Words smoke passed and authorized opening live human Words
for real money, as relayed by the Words routing task. The coordinator requires
incident SCC/Horses/Tri-Towers, then 11 Up, then live Words. Incident is published
at `99249d8bd70dea766d21bc33c626e11354a2f0b4`; 11 Up is the sole production writer.
Words must receive explicit coordinator clearance before main integration,
hosted DDL, production-triggering pushes or activation. No such clearance has
been received. This preparation is unpublished on `codex/ptown-words-real-money`.

## Narrow change and preservation

The existing live authority shares rules, frozen stakes, canonical chip transfers,
results, snapshots and account posting across modes. Its admission guards still
reject real money unconditionally. The candidate adds a private `real_qualified`
flag, default false, and changes only Words' configure/start/capability guards.
No settlement, liveness, recovery, scoring, timing, bank or pause owner changes.
The catalog permits human real-money eligibility only through session-bound
server capability. The client understands existing v3 fake-only and v4 real-open
capabilities, with matching actor/session and enabled checks.

Fake admission and bot flags are preserved. Bots remain fake-only. Async Words
/3 remains fake-only and retains its separate admission, rules and parent
settlement; neither its mode nor its RPCs are changed. Live /1 and /2 rules are
preserved. Migration `20261027214928` must never be repeated.

## Local evidence

`dev/ptown-words/real-money-preimage.json` captures the read-only hosted function,
index and financial trigger inspection. The disposable PostgreSQL clone was
aligned to these Words definitions. Canonical transfer, finalization, account
posting, four-argument pause and liveness definitions matched their hosted hashes.
Two unused legacy helpers absent from the clone were not copied or exercised.

- Candidate installation and rollback pass; the new flag starts closed.
- Twelve fake/real, 2/3/4-player winner/tie cases pass. Real fixtures start with
  signed chips zero; winners receive the frozen stakes, losers pay them, and
  canonical transfers conserve chips. Terminal real account posts equal final
  canonical chips, once per human, with total zero. Fake and ongoing real sessions
  do not post terminal accounts early.
- Injected failure after canonical transfers, before snapshots, rolls back
  results, chips, transfer batches, snapshots and account posts in both modes.
- Duplicate/conflicting/stale/late commands, postgame continuation and terminal
  lifecycle pass. Browser projections exclude the bag and other private racks.
- Real /2 banks, host pause/resume, guest request/cancel, ownership, snapshot
  recovery, legacy preservation and timeout checks pass.
- Closed real configure/start, active membership, invalid/frozen stakes,
  real-bot rejection, async real-offer rejection and stale-scheduler detection pass.
- Zero-client real timeout completes and settles once, with rollback containment.
- Two independent connections genuinely contend on final-command locks. Retry
  returns the same receipt; one result, one balanced transfer batch, two final
  snapshots and two balanced account posts remain. Late recovery/settle is a no-op.
- Forty focused client tests and application TypeScript pass. The production
  bundle result is recorded with the local evidence.

No customer session, balance or hosted flag was mutated. Local scheduler heartbeat
was refreshed only in the disposable clone, which has no dispatcher. Hosted
qualification must use actual scheduler health without refreshing it artificially.
Race fixtures are committed synthetic rows only in the disposable database;
contained fixtures are verified absent after rollback. Local admission is closed
again after the guard/race harness completes.

## Reproduction and release gates

With the existing local PostgreSQL runtime and installed `pg` package, run
`node dev/ptown-words/real-money-local.mjs --setup`, then `prepare-real-money.mjs`,
`real-money-proof.mjs`, and `real-money-guards.mjs` from that directory prefix.
The installation proof requires a fresh clone; do not rerun its DDL on an already
installed clone. Logs/context/results are under
`qualification.local/ptown-words/real-money`; compact evidence is retained in
`dev/ptown-words/evidence/real-money-local.json`.

After explicit coordinator clearance:

1. Reconcile with completed 11 Up main, preserving all releases and unrelated
   work. Reinspect the shared `megatouch_begin` preimage and relevant deployed
   authorities; do not overwrite them with this older snapshot.
2. Refresh exact preimage hashes and prepare one new forward migration using
   the narrow guarded replacement. Run actual hosted rollback qualification for
   both modes, financial/account authority, permission boundaries, concurrent
   retries, timeout/recovery and real /2 controls. Include untouched async/fake
   eligibility. Use only synthetic fixtures and actual production health.
3. Install closed once, repeat installed proof, then run required full source,
   harness, typecheck and build gates on reconciled source. No real wagers or
   customer-balance mutation are permitted as verification.
4. Review/tag/commit/integrate via canonical release workflow. Verify exact-SHA
   Vercel READY, production manifest, publisher and persisted release signal.
5. Activate only live human real-money admission after those gates; preserve
   fake availability, fake-only bots and fake-only async. Verify capabilities
   and production behavior, then obtain owner runtime acceptance.

Local passes do not qualify production activation. No migration is registered,
no production push is made, and real-money admission is not opened by this work.
