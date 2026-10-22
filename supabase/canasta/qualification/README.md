# October 22 follow-up qualification

The original isolated Ante fixture predates Golf dispatch. Its fingerprint is
`7b6ca8feaa35c1fcce8b00491783e9d4`; registration correctly requires
`71a82570740f60593bdb09e504aa744c`. Read-only production capture and Git history
confirm the only intervening dispatcher changes are Golf and Canasta branches.
The installed capture hashes to `ed70e8608f4a04b72cab66d55dcd9970`.

`bootstrap.mjs` removes only the exact Canasta branch for local installation,
leaves Golf intact, retains the original registration guard, and proves the
result matches the captured installed definition exactly. None of these
fixtures is a production migration. The historical capture and release
artifacts remain unchanged.

Docker Desktop started normally after the earlier shutdown completed. Existing
container `canasta-integration-proof-20261021` is retained with network `none`.
`beginner-proof.mjs` passes rollback-contained baseline and forward-candidate
financial, consent, recovery-lease, admission, terminal RLS, helper isolation,
frozen defaults, actual configure/ante and exact Run Back pacing checks.
Scheduler fixture INSERT/UPDATE grants roll back with the transaction. JWT
subject is cleared between independent synthetic financial proof units.

`concurrency.proof.mjs --beginner` passes two-connection competing and duplicate
settlement in both money modes, fresh-lock deadline expiry, injected failure
after chip transfer, and reclaim versus stale automatic play. It creates and
removes only its newly named disposable database; the original database is
preserved. Real-money fixture settlement does not open real-money admission.

Forward migration, combined-main CI, and hosted end-to-end qualification remain
pending. No production mutation or activation is evidence from these local tests.
