# Wave 2 final risk-based qualification

The user approved one focused retry for browser timing/observation failures with
healthy authority, and reuse of passing browser coverage after proof-only changes.
Authority, settlement, idempotency and recovery requirements remain unchanged.

The deferred-reclaim retry passed. The TEST ONLY fixture gives the bot 30 seconds
between actions and verifies the original player is still the active actor, under
bot control, with more than ten seconds remaining immediately before Rejoin.
The actual RPC returns `deferred=true`; the UI shows the pending reclaim; control
returns only after exactly one completed turn. The prior five-second-fixture
failure is accepted as a timing flake: its screenshots showed the bot had already
completed that turn, making immediate reclaim legitimate. No product change or
weakened reclaim assertion was needed.

The same focused run also passed immediate out-of-turn reclaim and real-money
timeout pause/resume, including refresh continuity and unchanged strategic state.
All three fixtures were deleted. Authoritative receipts are recorded under
`supabase/farkle/wave2-qualification/20260921-risk-final/`.

Together with the ten passing Farkle cases at `852c22349`, this completes the
13-case matrix under the approved reuse policy. Application and migration source
remain identical; the only new executable file is the synchronized timeout proof.
The complete seven-game campaign starts fresh at the resulting candidate commit.
One final deterministic run and all SQL/metadata/cleanup gates remain required.

Production creation remains disabled, admin-only enabled, scoring defaults
unapproved and unseeded. This evidence does not authorize main integration.

## Candidate results and stop

Candidate: `51ce9ffab7d2521f342f58f244237a22ae031611`. The single final
`npm run build` completed successfully: typecheck, 1,659 application tests in
248 files, 241 harness tests in 12 files, and production build (33.54 seconds).
All 158 SQL assertions passed, including seven-game regressions and restoration
metadata assertions. Both commit-boundary metadata checks passed. No migration
or product source changed; tree identities are recorded in `source-integrity.json`.

The fresh seven-game campaign passed 15 cases in its 21.3-minute run: all seven
lifecycle/reconnect cases, all seven pause/resume cases, and Holm terminal.
3-5-7 terminal failed at `e2e/terminal/allGames.terminal.spec.ts:80` because the
connected host never rendered `[data-session-ended-panel]` within 120 seconds.
The one focused retry ran the same test without changing assertions and
reproduced that failure (239 seconds total). It is not accepted as a flake.

Both attempts observed a terminal settlement. Their host snapshots report
`gameStatus=session_ended` and `roundStatus=completed`, with cards still visible;
their fresh peers reached `/`. The concurrent database proof reported no failure.
Both observer summaries and cleanup receipts are preserved. This narrows the
remaining investigation to the connected-host terminal presentation boundary;
it does not establish a Wave 2 product regression or justify changing 3-5-7.
Root cause remains unresolved. No deeper debugging followed the reproduced retry.

Unrun terminal cases: Cribbage, Gin, Horses, SCC, Yahtzee. No additional campaign
or implementation work occurred under the qualification-only budget extension.
The current result is **unqualified; main integration remains held**.

Read-only production verification matched all 384 function fingerprints, owners,
security attributes and grants. Creation is false, admin-only true, defaults
approval false, and Farkle defaults/games/terminal handoffs are all zero.

Final cleanup verified zero synthetic users/profiles and no fixture tables beyond
the three expected private control rows and seven existing-game defaults. Two Gin
replay streams survived canonical game deletion because replay is append-only.
Their opening frames were verified against the exact two local test accounts,
fake-money mode, run times and session identities. Only those two streams/four
steps were removed in the isolated Docker database in one locked transaction;
the two immutable triggers were re-enabled and asserted before commit. All 384
local function fingerprints/security metadata match afterward. The task's local
frontend and scheduler were stopped. Production was queried read-only throughout.

Evidence-only recording after the candidate does not alter its implementation
or require repeating deterministic suites. Raw traces remain local because they
contain authentication traffic. Preserved generated snapshot/cache files remain
unstaged and uncommitted.
