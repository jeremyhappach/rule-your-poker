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

The **observer** is test instrumentation. Its `host` and `peer` contexts are
actively seated human test players, not session spectators.

Evidence version 2 requires gameplay progress on both clients for each tracked
authoritative action. Missing progress fails after the campaign's existing
15-second freeze ceiling; ending observation earlier is **incomplete**, never
a pass. A campaign sets `PTOWN_E2E_MAX_ACTION_TO_PEER_MS` for its stricter
healthy/long-haul budget. Announcements, transports and button-disable churn
cannot satisfy progress, and another session or a later actor action cannot
rescue an earlier action. Actual dice values/holds, card projections and phase
changes still count. These DOM receipts complement explicit database/result
assertions; they do not themselves establish that an RPC committed correctly.

Before a tracked local-only/private/rejected action, the driver may set
`window.__PTOWN_CHAOS_PROGRESS_CONTRACT_ONCE__` with `progressExpectation:
'none'` (neither client) or `'actor'` (actor only) and a nonempty
`progressExemptionReason`. The next tracked click consumes that declaration;
every exemption is retained in evidence. It is not a global bypass. Drivers
must declare the semantic expectation before a known legitimate no-change
action, never add an exemption after a failed run to make it green.

The same one-shot contract accepts `expectedIdentity: { gameId, dealerGameId?,
roundId? }` when a scenario knows its exact target. A deliberate response-loss
or offline schedule may also declare positive `expectedPeerDelayMs` together
with the existing `__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__` reason. A reason
alone allows the finite 15-second recovery ceiling, not unlimited waiting.

Missing required instrumentation, absent client baselines and truncated event
capture fail qualification. `requireActionableControl` uses Playwright's
trial click to test an expected control for visibility, enablement and
obstruction without submitting it. The 357 transition driver applies this
to both seated players' decision controls.

Validate the manifest, target lock, evidence reducer, negative controls and
latency correlation without creating a table via:

```text
npm run test:human-chaos-contract
```

The browser controls fulfill all requests locally and deliberately reproduce
a stuck peer, cosmetic-only updates, wrong-session updates, an obstructed legal
control, response-loss retry and legitimate local-only interaction. The detector
must reject broken cases and accept valid cases. Reducer/finalization tests also
run in the normal build gate. Passing these controls verifies the detector; it
does not certify the full 79-requirement campaign or every game transition.

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
