# Battle 31 hosted qualification — October 21, 2026

Release authorization supersedes the earlier local-only boundary. Candidate
`d30e886cb861fd226337b9a067c6dd32de3ef43f` reconciles approved gameplay candidate
`07e7131138ed097d704792c296e355ac041510f7` with released Race Poker and 11 Up main
`bb1ec308030065d1aa30fc79a18efd493315291e`. Gameplay and package source were not
changed during this hosted pass.

## Completed

Fresh production inspection matched the pinned shared definitions and current
main/deployment. The candidate rollback proof passed six winner/draw/abort cases
across fake and real money using actual canonical chips, transfer batches, final
snapshots and results. It exercised consent, membership, wrong actor, invalid
stake/card actions, private-hand masking, raw-state denial, duplicate and late
replay, continuation, and injected failure after financial writes. Assertions
verified preservation of existing balances, game defaults, Race/11 Up authority,
function ACLs and match rows. Candidate fixtures rolled back completely.

The exact package was then installed as hosted migration `20261021202045`,
`battle31_v1`. Local CLI registration is
`supabase/migrations/20261021202023_battle31_v1.sql`; both have the identical
SHA256 `2b8ec87378a03cb595dd7ebfc6963844b41eb73021231446077e761c3600de3e`.
The installed source marker is
`2e372abcde1a79a1fa9fd8ae4ea5e7f432d351989f265ee4956aace693f71489`.

The same rollback proof completed against installed authority, including the
package's guarded no-op replay path. Three consecutive actual one-second recovery
executions succeeded and canonical recovery was fresh with zero partial failures.
Realtime publication membership is present. These checks establish job execution
and publication configuration, not delivery to an authenticated Realtime client
or completion of a scheduler-driven match.

At 20:24:07 UTC all four Battle31 flags were false, there were zero Battle31
matches, zero installed-proof fixture users/players and no injected failure
trigger. Race Poker admission remained enabled and fake-qualified, with real
qualification false. No production historical session or balance was changed.

## Publication hold

Hosted authenticated PostgREST/Realtime, independent-connection concurrency and
an actual scheduler-driven zero-client match remain unproven. Local versions of
these checks passed previously, but are not labeled hosted evidence. The exposed
MCP SQL tool supports the completed rollback proofs; the existing hosted driver
requires `BATTLE31_QUALIFICATION_URL`, which is not configured here. The worktree
environment has public API configuration only, without a hosted test-user session.
No credentials are requested in chat or retained in evidence.

Client integration, push and deployment are held until the remaining release
qualification passes. The production client and remote main are still
`bb1ec308030065d1aa30fc79a18efd493315291e`, Vercel deployment
`dpl_56JqyEFCzFzCmbQHcbkLtSmvhzKu`, READY. Admission scope remains unestablished;
no flags were activated. Owner/physical-iPhone smoke is not yet ready for Battle31.

Evidence: `dev/battle31/evidence/production-release.json`. Repeatable SQL builder:
`dev/battle31/production-proof.mjs` and `production-cases.sql`. Fixture manifests
and generated SQL are retained under ignored `qualification.local/battle31/`.
Do not reapply the migration; continue qualification against installed authority.
