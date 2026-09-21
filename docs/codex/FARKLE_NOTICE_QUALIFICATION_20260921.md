# Farkle notice correction qualification — stopped at seven-game admission

Implementation SHA: `6493c590cd7aa50c4a37709988c6cfc4bfb87f77`, published on
`codex/farkle-playable`. This evidence record does not qualify Wave 2 or authorize
main integration. No migration, shared renderer, existing-game behavior or
production configuration changed in this correction.

## Passing gates at that SHA

- Eight existing Farkle browser cases: setup/ante/actions, committed hold reconnect,
  Roll N, notices on actor/peer with the canonical 1600 ms lifetime, full peer
  animation, frozen help/history/replay, Immediate, Equal Turns and One Last Turn.
  Equal Turns naturally exercised tied-leader continuation and refresh.
- Three actual-client timeout cases: fake deferred reclaim, fake immediate
  out-of-turn reclaim, and real-money pause/refresh/resume without strategic action.
- Terminal settlement → continuation → next setup → configuration timeout →
  canonical waiting state; one settlement and preserved terminal state.
- Admin Defaults remain unsaved and disabled for submission; all four Farkle
  Geometry Lab preview phases render without modifying geometry or defaults.
- 1,659 application tests / 248 files, 226 harness tests / 11 files, typecheck,
  and Vite production build (56.94 seconds). Browser tests did not run concurrently
  with this final application suite.
- 158 SQL authority/recovery assertions, relevant seven-game SQL proofs, both
  restoration checks and commit-boundary metadata assertions.
- Fresh production comparison: all 384 function definitions/owners/security
  attributes/grants match the recorded applied state. Migration history includes
  `20260920155333`, `20260921155336`, and `20260921172016`; none was changed.
- Production: creation disabled, admin-only enabled, defaults approval false,
  zero Farkle default rows, zero Farkle games and zero pending terminal handoffs.

## Stopped gate

The complete seven-game browser campaign began at 2026-09-21 19:57:10 UTC with
one worker, zero retries and stop-on-first-failure. Its first Holm liveness case
failed after 30.6 seconds at
`e2e/liveness/support/crossCountryNetwork.ts:128`:
`No Supabase runtime request was observed`.

The failure occurred at the harness runtime-discovery precondition in
`createTwoClientSession`, before gameplay qualification. This does not establish
a product defect. Root cause remains uninvestigated: the permitted budget
extension covered qualification, metadata, cleanup and evidence, not debugging.
No harness or product patch and no campaign restart followed this failure.

Final campaign result: **0 passed, 1 failed, 20 unrun**. Every failed/unrun case
remains mandatory. Next work must establish the isolated environment's runtime
discovery failure and then rerun the full campaign. Do not merge or mark qualified.

## Proof corrections and cleanup

Before entering the budget extension, new proof-only checks were corrected:
the real-money pause proof must preserve strategic state while allowing the
existing renewed decision deadline; cleanup must use canonical resume and restore
the synthetic fake-money mode before deletion. Initial cleanup errors did not
demonstrate a gameplay defect. Two admin UI selectors were corrected for the game
selector and the Geometry Lab tab's icon. The SQL proof initially lacked its
non-admin fixture identities; its complete rerun with those identities passed.
Failed and interrupted attempts remain in local test-results directories and were
not counted as passing qualification.

All games, users, profiles, results and synthetic history were removed. One
`sitting_out_debug_log` row from the successful setup-timeout fixture lacked a
game-delete cascade; it was verified against the exact owned player/user and
deleted by exact row/game/user identity. Final table sweep found only the three
expected private control rows and seven existing-game defaults. Local creation was
disabled, all 384 local functions matched the applied capture, and the task's
frontend/scheduler processes were stopped. Unrelated snapshot/cache files remain
untouched and uncommitted.

Sanitized JSON evidence, proof source snapshots, file hashes, final SQL results,
production capture, cleanup result and stopped campaign details are in
[`20260921-notice-followup`](../../supabase/farkle/wave2-qualification/20260921-notice-followup/manifest.json).
Raw Playwright trace/video archives and local credential files are not published.
