> Phase 3B supersedes the database hold below. Production fake-money activation
> is applied; see [TRITOWERS_ACTIVATION.md](TRITOWERS_ACTIVATION.md).

# TriTowers qualification and inactive release

This release implements the game but does **not** activate it. `tri-towers` has
no production catalog row. Both selectors and Run Back hide it; the database
candidate has a private disabled release gate and rejects real-money creation,
actions and settlement. Existing catalog rows, game rules and Run21 are unchanged.

## Authority and integration

`supabase/tri-towers/authority.sql` is the unapplied additive schema candidate.
It contains private state/decks, request deduplication, redacted history,
authenticated configuration/snapshot/action/history/continuation RPCs, a scoped
pause trigger and a zero-client timeout worker. `services.sql` provides the
separate publication and worker installation. Neither file is automatically
applied by the application build. No existing RPC is replaced.

Actions lock round, session and match in canonical order, validate membership,
active player, exact identity and revision, and deduplicate request UUIDs.
Every stage uses an independently shuffled deck from pgcrypto rejection
sampling. Completed scores persist before the next human's deal. Only final
competition completion calls the deployed chip-transfer helper, clockwise
split helper, journal, game-result and session-snapshot infrastructure.
Continuation honors clockwise and make-it-take-it dealer policy.

`useTriTowers` consumes public revision notifications, coalesces authoritative
snapshot reads, rejects old/conflicting frames and resynchronizes on channel
reconnect, focus or network restoration. No gameplay polling or client score
authority exists. `TriTowersView` uses the existing `FullscreenGameShell` for
the same board in active and spectator roles. The deterministic TypeScript
reference engine is imported only by tests and offline previews.

## Evidence

- Final focused regression run: **345 tests in 42 files**, including Run21,
  shared shell, dealer setup, Run Back, real-money liveness contracts, TriTowers
  registration/engine/controller, hook recovery, all nine presentation
  classifications and terminal holds.
- Application TypeScript and Vite production build pass. Existing warnings are
  Browserslist age, mixed imports and bundle size. `bunx tsgo` is unavailable;
  the repository's installed `npm run typecheck` was used.
- SQL engine and adapter rollback proofs passed in temporary schemas on the
  deployed PostgreSQL, with an assertion of zero application-table writes.
  Final expanded proofs run on isolated local PostgreSQL 17.
- Local candidate DDL installation and real independent-connection tests cover
  role ACLs/RLS, hidden decks, spectator rejection, duplicate/concurrent/stale
  actions, full multiplayer play, immutable completed scores, pause/resume,
  timeout/terminal races, partial/all-player ties, journal balance, exactly-once
  settlement, final snapshots, history and canonical continuation.
- Two independent Edge contexts exercise the production hook/view and SQL RPCs:
  live spectator draw visibility, disabled spectator input, reconnect to the
  current board, next-human transition and terminal settlement on both clients.
  Local LISTEN/NOTIFY + SSE substitutes for Supabase Realtime in this proof.
- Offline responsive checks pass at 390×844, 844×390, 768×1024, 1024×768 and
  1440×900, including card/control bounds, taps, no page overflow, drawers,
  simulated safe areas and spectator controls. Portrait bottom-row targets are
  approximately 36×55 pixels; landscape approximately 63×82 pixels.

Evidence and screenshots are in ignored `qualification.local/tri-towers/`.
No synthetic real-money session or financial write was executed in production.

## Reproduce locally

Jeremy approved installation of isolated test tooling. Packages are confined to
`qualification.local/tri-towers/tools`, outside application dependencies:
`@embedded-postgres/windows-x64@17.10.0-beta.17` and `pg`.
Use `initdb` and `pg_ctl` from that package with data directory
`qualification.local/tri-towers/pgdata`, user `tri_test`, loopback `127.0.0.1`
and port `55439`. It is a disposable trust-authenticated loopback fixture.

Read-only metadata exports are in `dev/tri-towers/capture-{schema,finance}.sql`.
Save their object/array results to `qualification.local/tri-towers/{schema,finance}-source.json`.
The bootstrap copies relevant columns, checks, unique indexes and inspected
financial function definitions. It substitutes local Auth claims and includes
the transfer journal triggers; it is not a full clone of all Supabase triggers.

On a fresh isolated database, run:

```text
node dev/tri-towers/local-database.mjs
node dev/tri-towers/local-proofs.mjs
node dev/tri-towers/local-integration.mjs
node dev/tri-towers/live.preview.mjs
node dev/tri-towers/fullscreen.preview.mjs
```

The proof scripts hard-code loopback. Never repoint them to production. Stop
the task's PostgreSQL with `pg_ctl -D qualification.local/tri-towers/pgdata stop`.

## Database hold and manual acceptance

Production database installation remains unapplied. New foreign keys and the
scoped pause trigger acquire shared-table locks. The candidate limits lock
waits to 100 ms and statements to ten seconds, but that does not establish
acceptable impact during tonight's real-money session. Realtime publication,
pg_cron scheduling and interactions with all existing shared triggers still
need qualification against an isolated Supabase environment.

Before a separately approved activation:

1. Accept the explicit scoring/timing/wrapping assumptions in
   [TRITOWERS_RULES.md](TRITOWERS_RULES.md).
2. Create a proper migration with the established CLI in a safe release window;
   apply `authority.sql` and `services.sql` transactionally in a test environment
   first. Verify publication delivery, worker permissions and zero-client progress.
3. Enable only the test environment's private gate and add its catalog entry
   using authoritative key `tri-towers`, mode `fullscreen`. Test setup with
   two humans, then seven, preserving fake-money admission.
4. On two devices, play through both stages and an earned bonus stage. Verify
   spectator removals/exposure/stock, independent next-player deals, and fixed
   prior scores. Reconnect each role; pause/resume; let a ready/play deadline
   expire with all browsers closed. Confirm exactly one final settlement.
5. Check ties, final history, pending session end, stand/sit-out participation,
   make-it-take-it, Session Ended, fresh reconnect and local Back to Lobby.
   Then smoke Run21 and an ordinary table game unchanged.
6. Public selection and real-money admission require explicit owner approval
   after this evidence. They are separate from deploying inactive client code.
