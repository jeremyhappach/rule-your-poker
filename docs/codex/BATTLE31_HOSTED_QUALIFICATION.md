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

## Completed hosted transport and recovery

Existing test-account access was supplied after the initial hold. Both local
.env files point outside the approved production project; no credentials were
sent there. The harness extracted public configuration from holm357.com and
required production project xvhmbuppghwmwpwrkzao before authenticating. No new
credentials or access grants were created; passwords/tokens stayed in memory.

Both authenticated PostgREST projections mask the opponent hand, and anonymous
and raw-private-state requests reject. Native authenticated Realtime delivered
both tested revisions to both peers in 282–283 ms, with UUID/revision fields only.
Duplicate concurrent commands advanced once; different concurrent requests
produced one accepted action and one stale rejection. Concurrent terminal calls
returned one result/batch identity and balances 95/105. Late replay after terminal
continuation retained the same settlement. A held round lock and live database
inspection confirmed two distinct PostgREST connections contending on that lock
(backend PIDs 2328595 and 2328662; holder 2333910).

A separate near-terminal fake-money fixture was admitted inside a controlled
transaction after all interactive clients closed. Its committed admission flags
stayed closed. The real one-second scheduler selected the legal strategic swap,
settled once, preserved two final snapshots, and completed Session Ended without
any client action or direct recovery invocation. The expected stake-five transfer
produced balances 105/95 and a balanced canonical batch. A full unattended
fixture also completed through the scheduler during the transport work.

Four exact fake-money fixture UUIDs were removed through the existing guarded
admin cleanup owner. Existing test identities/profiles and historical sessions
were preserved. At 20:40:24 UTC, all four Battle31 flags were false, no Battle31
matches or fixture games remained, other player balances were preserved, and
Race Poker's fake-only admission was unchanged. Real-money financial qualification
remains rollback-contained; no real-money persistent transport fixture was used.

Test-harness listener/signature, numeric-sort and SQL array-type mistakes were
corrected during this pass. Earlier lock probes did not establish overlap. None
required a product change or relaxation of a product assertion. The retained
successful evidence is hosted-transport.json, hosted-terminal-race.json,
hosted-late-replay.json and hosted-completion.json in dev/battle31/evidence/.

## Publication and smoke

Hosted release gates are complete against the unchanged installed package.
The matching client is qualified for main integration and publication under the
existing release authorization. All admission flags stay false until an explicit
initial access scope is approved. Owner multiplayer and physical-iPhone smoke
remain outstanding; do not label those passed or open admission to perform them.

Original candidate/installed rollback evidence is retained in
production-release.json. The repeatable rollback builder is
production-proof.mjs with production-cases.sql. No migration reapplication is
needed. This record supersedes the initial access-related publication hold.
