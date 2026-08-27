# Two-client liveness gauntlet

This is the browser tier. It complements the fast Vitest contract suite; it
does not rename source-string assertions into end-to-end coverage.

Each scenario creates a fake-money table with two distinct authenticated human
test identities and drives the real UI through:

1. waiting table join and Start Game;
2. session dealer high-card draw while the mobile peer goes offline;
3. dealer configuration for one of all seven game types;
4. the non-dealer's ante RPC committing on the server while its response is
   lost (dealer configuration already commits the dealer's ante);
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

Run the ordinary liveness browser suite against the local frontend (which uses
its configured Supabase project):

```text
npm run test:liveness-browser
```

The human-chaos scripts (`test:human-chaos-*`) are different: they always use
the deployed HTTPS production frontend and fail before a table is created if
the observed Supabase project is not `xvhmbuppghwmwpwrkzao`. They never fall
back to local Vite, because the retired source project is intentionally
write-locked.

Every human-chaos browser context also installs a continuous observer before
login. The observer survives full peer-page remounts and retains state changes
instead of checking only the final stable DOM. A scenario fails closed if it
observes a visible masked card face, a duplicate or persistently missing
canonical shell/felt, a timed legal-action surface without a visible timer, a
Dealer Setup or Sweep overlay below the tab rail, or a browser page error or
crash. Each run attaches `human-chaos-continuous-observer.json` with both
clients' dealer-game/round transitions, Supabase REST durations, and action to
actor/peer observed-progress receipts.

Latency is measured by default but is not assigned an arbitrary pass/fail
budget. A campaign may set `PTOWN_E2E_MAX_ACTION_TO_PEER_MS` to a positive
millisecond value to make peer-observation overruns fail closed. Validate the
manifest, target lock, evidence reducer, and latency correlation without
creating a table via:

```text
npm run test:human-chaos-contract
```

Player 1 must be an existing admin because every test uses the database-guarded,
fake-money-only **Blast This Game** action in `finally`; the suite fails if it
cannot remove the session. Ordinary browser suites may set
`PTOWN_E2E_BASE_URL` to test a deployed frontend. All commands fail closed when
credentials, the explicit admin-cleanup acknowledgement, or the fake-money
write acknowledgement are absent. Browser artifacts are retained only on
failure.

## Parallel campaign workers

Concurrent workers must not reuse an authenticated pair or the same Playwright
artifact directory. Set all of the following for each worker:

```text
PTOWN_E2E_REQUIRE_ISOLATION=1
PTOWN_E2E_IDENTITY_SLOT=cribbage_a
PTOWN_E2E_RUN_NAMESPACE=cribbage-a-20260825
PTOWN_E2E_CRIBBAGE_A_PLAYER1_EMAIL=...
PTOWN_E2E_CRIBBAGE_A_PLAYER1_PASSWORD=...
PTOWN_E2E_CRIBBAGE_A_PLAYER2_EMAIL=...
PTOWN_E2E_CRIBBAGE_A_PLAYER2_PASSWORD=...
PTOWN_E2E_CRIBBAGE_A_PLAYER1_CAN_BLAST=1
```

The slot name is normalized to uppercase for environment-variable lookup. Each
run writes to `test-results/<namespace>` (and an isolated CI HTML report). A
local fail-closed lease hashes the selected email pair, so a second worker using
the same two people stops before it can create a game. Test output records only
the namespace, slot, generated game UUID, and cleanup receipt—never emails or
passwords.
