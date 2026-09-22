# Run21 reconciled checkpoint

The new `codex/run21-app-test-reconciled` worktree starts at qualified head `fce43e29a4419f06908f7694d81782ae67d7d2b1`. The old `codex/run21-app-test` remains unchanged at `3225330dd47d37b5f861fadb8fab7bbba40a054b`.

The exact original merge base is `512ce60825c06d355f6854062a20195cc3c2965e`. Only Run21 source, tests and its reusable offline preview were transplanted from that base-to-checkpoint delta: 42 added files and reviewed Run21 hunks in 10 shared application/build files. Those shared files were byte-identical between the original merge base and qualified head before applying the Run21 hunks. Existing Cards/Dice behavior was preserved. Farkle's qualified SQL/proofs remain untouched; its UI was not registered in that baseline and this transplant does not change that fact. Old generated evidence, screenshots, reports, bootstrap scripts and historical baseline files were excluded.

Supabase CLI 2.115.0 `migration new`, discovered via `--help`, created `20260921211828_run21_reconciled_app_test_release_gate.sql`. It contains the original gate SQL without the old historical filename. It introduces no gameplay or settlement authority. Creation defaults disabled/unqualified; capabilities require an authenticated admin, a qualified enabled test gate and an eligible fake-money session. Known production targets are forbidden. The reconciled branch also participates in the existing frontend production-target guard.

## Focused reconciliation results — September 21, 2026

- One brand-new disposable Supabase project, `run21-reconciled`, replayed **392/392** migrations from zero. History exactly equals the ordered filenames; head is `20260921211828`.
- All **391 qualified migration files** retain their exact SHA-256 values. All **500 existing function catalog fingerprints** match the qualified state, including Gin, Cribbage and Farkle. Historical repair, dealer correction, shared proof corrections and `.gitattributes` were not altered.
- Protected Farkle SHA-256 remains `c6a971f55b79765ef7659d7803e0408925df86b9d9b7d2a2cd8379863c5771d7`.
- The actual-catalog gate proof passes disabled defaults, private-table RLS/no client grants, RPC grants, rejected unqualified enablement, both forbidden production targets, non-admin denial, admitted local-admin identity and unknown-session denial. Its fixture transaction rolls back; zero auth fixtures and the original closed gate remain afterward.
- Focused Run21 engine/presentation/setup/gate/selection checks pass. The new routing test initially lacked a browser dependency mock; correcting that test-only setup passed its focused rerun.
- The single full application run passed **252 files / 1,760 tests**; the single harness run passed **11 files / 226 tests**. Typecheck and production build passed. The existing bundle-size warning remains.
- Database lint and advisors exited zero with **zero errors**. The known baseline warnings remain; no baseline-warning repair was attempted.
- `git diff --check`, protected-byte and baseline-file preservation checks pass.

Detailed local receipts are under ignored `qualification.local/`: `transplant.json`, `reconciliation-results.json`, `final-fingerprints.json`, `focused-tests.log`, `focused-retry.log`, `build.log` and `build-result.json`. The earlier accepted two-replay baseline campaign was not repeated; the 67 historical SQL proofs were not rerun.

This checkpoint completes mechanical reconciliation only. The authorized next phase is a local, admin-only playable Run21 slice using the existing engine and canonical shell. Creation remains disabled at this checkpoint. Production, main, Farkle branches, isolated Run21, the archived app-test branch, pushes and deployments remain unchanged.
