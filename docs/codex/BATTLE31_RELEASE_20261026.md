# Battle31 owner-smoke release — October 26, 2026

Jeremy accepted preview 306a177311d17fd65fdf8ea2cb55fd19ce929244 and explicitly
approved release. This supersedes the prior Battle31-only publication hold.
Other games remain read-only; their audited placement corrections are not part
of this release.

## Integration and preserve list

Release branch codex/battle31-smoke-release starts from current production/main
f651a34b683a0ed55d8cb89359a9369d011a3e68, preserving the newer Mega and Quintzee
releases along with Race Poker and 11 Up. The approved product delta from
33b641bb6 through 306a17731 is carried forward. All 24 affected source files
other than GameDefaultsConfig match the reviewed candidate; GameDefaultsConfig
retains current main's Quintzee editor and adds the exact approved Battle31
timer block. Shared 357 life placement is an equivalent constants extraction;
no other game's behavior or audited nameplate/seat placement is corrected.

Includes automatic selected-card exchange; canonical timer editor and contextual
rules; progress/announcement cleanup; per-card arrival handoff; larger exchange
cards; persisted life loss hold/dissolve; stake title; canonical nameplate; compact
opponent lives; and lower card rows. Existing rules version, financial owners,
server/RPC implementation, admission, recovery and continuation are preserved.

## Database configuration

Production inspection found a 10-second Battle31 default and the existing
configure RPC freezes that default into each new dealer-game configuration.
The hosted rollback proof updates it to 30, asserts unchanged complete existing
match rows, frozen dealer-game configurations, unrelated default fields and
admission, then rolls back to 10. It passed. The guarded, idempotent data-only
installation is supabase/battle31/smoke-release-defaults.sql; it rejects an
unexpected intervening timer change. No schema/RPC migration or historical
match rewrite is needed. Fake-money admission remains enabled; real money stays
unqualified. The installed check and publication evidence are recorded at the
release checkpoint below.

## Validation and smoke

Reviewed local qualification is retained in BATTLE31_SMOKE_LOCAL.md. The combined
current-main route build and actual-showdown check pass both seats across nine
sizes (18 cases), with minimum label clearance 8.49px and no card/progress
overlap, chip movement from row placement, life occlusion or page errors.

Owner accepted the local visual package. Shared long-name edge clipping remains
a separately queued canonical issue and is not masked with a Battle31 offset.
Production acceptance checks: automatic one-card exchange in either selection
order, all-three exchange, 30-second new-match timer, max-rounds label clearance,
opponent reveal/highlights, life hold/dissolve, next deal and normal continuation.
Existing matches should retain their frozen timer. Physical production smoke is
Jeremy's acceptance step.

## Release checkpoint

Full integrated validation passed: TypeScript, all 2,955 source tests (430 files),
241 harness tests (12 files), and the production bundle (13.65 seconds). Existing
bundle-size/Browserslist and test act warnings remain non-failing. The guarded
defaults installation passed with installed value 30, unchanged existing match
and configuration digests, and preserved admission enabled / fake qualified /
real unqualified. No schema or authority function changed.

Release commit/tag and main fast-forward follow. Publication requires the exact pushed SHA,
READY Vercel deployment, public build-manifest.json and persisted
release_publication record to agree. Local command logs and exact publication
evidence are retained under qualification.local/battle31/release-*.
