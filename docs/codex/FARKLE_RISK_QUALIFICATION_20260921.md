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
