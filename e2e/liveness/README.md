# Two-client liveness gauntlet

This is the browser tier. It complements the fast Vitest contract suite; it
does not rename source-string assertions into end-to-end coverage.

Each scenario creates a fake-money table with two distinct authenticated human
test identities and drives the real UI through:

1. waiting table join and Start Game;
2. session dealer high-card draw while the mobile peer goes offline;
3. dealer configuration for one of all seven game types;
4. an ante RPC that commits on the server while its response is lost;
5. live-game entry, a second radio loss, and a full peer route remount;
6. DOM liveness checks for exactly one canonical shell/felt and at least one
   authoritative legal-action surface.

No bots, global rule harness, Real Money toggle, polling substitute, or product
debug API is used. HTTP and Realtime disorder is applied by Playwright to the
peer browser only.

Create an ignored `.env.e2e.local` (or use process environment variables):

```text
PTOWN_E2E_PLAYER1_EMAIL=...
PTOWN_E2E_PLAYER1_PASSWORD=...
PTOWN_E2E_PLAYER2_EMAIL=...
PTOWN_E2E_PLAYER2_PASSWORD=...
PTOWN_E2E_PLAYER1_CAN_BLAST=1
PTOWN_E2E_ALLOW_FAKE_MONEY_WRITES=1
```

Run against the local frontend (which uses its configured Supabase project):

```text
npm run test:liveness-browser
```

Player 1 must be an existing admin because every test uses the database-guarded,
fake-money-only **Blast This Game** action in `finally`; the suite fails if it
cannot remove the session. To test a deployed frontend, also set
`PTOWN_E2E_BASE_URL`. The command fails closed when credentials, the explicit
admin-cleanup acknowledgement, or the fake-money write acknowledgement are
absent. Browser artifacts are retained only on failure.
