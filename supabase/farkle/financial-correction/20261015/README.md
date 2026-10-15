# Farkle financial correction candidate

Status: database proof passed; production creation contained; **release blocked**.
See `docs/codex/FARKLE_FINANCIAL_CORRECTION.md` for scope, complete matrix and
the current terminal HUD blocker. WSL/Docker/Supabase now work; the full-app
production-build test fails after correct settlement because both clients lose
the HUD/History/Back to Lobby controls. `candidate.sql` is not an applied migration.

All scripts reject any database except the task-created loopback proof database.
They reuse the installed `pg` dependency and the preceding audit's captured
deployed definitions/catalog in ignored `qualification.local/farkle-audit-20261015`.
No script connects to production. The captured source routine hashes were checked
against fresh production hashes; the new candidate changes exactly ten routines
and adds one private, ungranted eligibility helper.

Reproduction order after creating a fresh audit database:

1. Run the audit `create-empty.mjs`, then this directory's `restore-column-grants.mjs`.
2. Run `build-candidate.mjs`, `apply-local.mjs`, and `build-proof.mjs`.
3. Run `containment.mjs`, `auth-proof.mjs`, `profile-authority-proof.mjs`,
   `pending-deactivation.mjs`, `proof.mjs`, `supplement.mjs`, `immutability.mjs`.
4. Run `reproduce-baseline.mjs` (restores the candidate in finally), then
   `race.mjs --fixed`, `metadata-proof.mjs`, and `package-evidence.mjs`.
5. Drop only the exact freshly created database after retaining evidence.

Ordinary cases use transactions and rollback. Concurrency, actual-COMMIT and
worker-death cases necessarily commit synthetic rows in that disposable database;
dropping it removes those fixtures. No triggers or financial constraints are disabled.
The real-money mode is a synthetic local fixture, never a real-money production test.

PostgreSQL 17.10 Windows differs from production 17.6 Linux. Actual routine bodies,
indexes, triggers, policies and role grants are reproduced, including 31 column
grants omitted by the original audit builder. Trusted scheduler calls run as the
database owner with the existing service context. This direct PostgreSQL environment
does not supply GoTrue/PostgREST/Realtime; it cannot stand in for the separate full-app
two-browser qualification.

The resumed full-app stack is separately managed by `full-stack.mjs` under ignored
`qualification.local/farkle-full-stack`. `prepare-full-stack.mjs` restores captured
schema only, including full realtime replica identities; `prepare-browser.mjs`
checks all 453 routine hashes before applying the candidate locally and creating
two ordinary test users. `browser-server.mjs` builds with loopback environment
values and starts a production preview without a live-reload watcher.
`browser.config.ts` / `browser.spec.ts` retain the failing full-app acceptance case.
The stack is stopped with a backup of its synthetic failed fixture. Never run
`prepare-browser.mjs` against the already-prepared stack; its baseline hash check
intentionally rejects a second application. Reuse the stopped stack for diagnosis.

The post-WSL SQL rerun again passed 100 assertions; see `rerun-evidence.json`.
`cleanup-rerun.mjs` removed only its exact task-created proof database. The original
`cleanup.mjs`, original evidence and original installation failures are historical.
