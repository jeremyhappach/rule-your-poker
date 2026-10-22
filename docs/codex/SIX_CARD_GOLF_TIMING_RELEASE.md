# Golf scoring and motion release — October 22, 2026

Approved candidate: `714166fb5b2a7ea2b831cdb23bec484f70b2e9ce`.
Integration starts from deployed Canasta commit
`5188ba145a7b3f28267bfdf2da69805514ade316`, a descendant of main
`cb11f17d292ffbda8b067b2ee5bba5713a6ea8ce`. Both release-note entries
are retained; there was no application-code integration conflict.

## Database and preservation

Only the forward presentation migration was installed. Local source:
`20261022171413_six_card_golf_presentation_timing.sql`; Supabase registered
version: `20261022171731`. SHA-256 of the source is
`c02780e22b6ad0b77878fdda45f9e98d27f0a2ee88f93dd97bf33b0fd8ccdf5e`.
The migration verifies nine deployed function fingerprints before replacement.
Old installed Golf and Canasta migrations were not reapplied.

Seventeen hosted candidate rollback units and seventeen installed units pass.
Installed function fingerprints match the candidate exactly. Evidence is in
`dev/six-card-golf/evidence/forward-{candidate,installed}-20261022.json`.
Coverage includes core/privacy, opening-discard redaction, frozen defaults,
pre-reveal masks, exact Results timing, pause/recovery, 2/3/4-human nine-hole
matches in both money contracts, every shared-tie count, actual canonical
chips/ledger/results/snapshots, injected financial rollback, replay and
authorization, settled pause immutability, and terminal continuation.
Synthetic hosted financial proof records rolled back. No live real-money
gameplay was performed.

The five pre-existing unfinished Golf matches retain their exact revisions,
pause timestamps and state hashes. Golf remains enabled with admission enabled;
Canasta remains enabled with admission closed. No admission or qualification
grant was changed. Existing admitted Golf configurations keep legacy timing.

## Local and browser evidence

Both independent-connection matrices pass duplicate/lost responses, competing
actions, successor contention, timeout/action contention, final-action and
settlement races, zero-client continuation and late receipts. They ran in fresh
loopback databases with the new patch and actual persisted terminal deadlines.
The fresh isolated nine-hole browser run passed connected Session Ended,
artifact retirement, cold reconnect and shared audio.

TypeScript and production build pass. Fifty focused integrated checks pass.
The full application suite passed 2,732 tests with one Farkle test timing out
under concurrent load; its complete five-test file passed on isolated rerun.
The hosted rollback-wrapper test passes under the Node test runner.

The full Game-route qualification uses the two existing approved test accounts
in a fresh fake-money session `13d2ea4a-4de4-44d6-860a-4bd7a65e5857`, match
`efdb4e92-3917-4076-a146-af90c0e6a945`. The local integrated client uses the
production public configuration; the checked-in `.env` still points to the
historical project and was not changed. Earlier harness setup failures were
contained to this fixture and paused it; normal reclaim/resume RPCs restored
the fixture before the complete run. The actual integrated Game route completed
all nine holes with 160 accepted action submissions, 172 Realtime updates per
client, no page errors, settlement before presentation end, connected Session
Ended for both clients, and cold reconnect to the lobby. Evidence is retained in
`dev/six-card-golf/evidence/forward-browser-20261022.json`. Publication identity
is recorded in the final delivery report.

Security advisors report the expected private Golf tables without browser RLS
policies and intentionally authenticated, authorization-checked definer RPCs.
No new Golf security finding was introduced. The existing shared
`gameplay_transfer_pending_changes` RLS finding is outside this migration and
was not changed; see the [Supabase advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled).

## Owner smoke

Start a new fake-money match to receive the frozen 1200 ms Scoring Delay and
5000 ms Hole Results Duration. Confirm selected draws enlarge, occupied targets
offset, exposed outgoing cards remain face up, and concealed outgoing cards flip
only after reaching discard. Confirm FINAL TURN stays visible, Bot1-style aliases
are stable, remaining backs flip before counting, a vertical pair adds zero,
the per-player hole subtotal updates, and Results has no close control. On hole
nine, scoring and Results precede the winner hold and Session Ended.
