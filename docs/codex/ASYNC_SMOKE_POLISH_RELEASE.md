# Async smoke polish publication — 2026-10-29

Owner authorized the full 14-item polish package and final score-hold refinements at 22:01 UTC. This supersedes the local-only holds in ASYNC_SMOKE_POLISH_LOCAL.md. The platform transition audit remains excluded. The parent inspected the original Library screenshots; this executor inspected candidate renders and used the parent's verified descriptions.

## Final behavior

- The reviewed fourteen-item package and saved two-player replay correction are included (bd7693771 and d25d67bed).
- Saved opponent boards retain their final scores for three additional seconds after the shared score animation has settled before Your turn. Reduced-motion review retains the same hold after its static final result.
- Own round presentation returns only after the shared score animation settles and a three-second hold. Quintzee reports the shared score-return timeline including any base/bonus animation delay, so it cannot be cut short by the game deadline. Words' existing score-completion callback starts the same three-second presentation hold. Ordinary handoff has no Continue button.
- Terminal child completion still precedes the separate parent finale. After the boxing image's seven-second visible hold and fade, the final per-game results persist indefinitely. Back to Lobby is an explicit local link. The existing idempotent finale ACK records viewing without navigating; an ACK failure preserves the list with a retry action.

## Preserved authority and migration

Installed migration 20261029184517_async_results_review was verified before editing and was not reapplied. No new migration, hosted mutation, customer repair, rule change, accounting change, available-balance gate or real-money activation belongs to this release. The deployed create function rejects real money; existing real-money async match count is zero. Admission and recovery remain enabled, the minute job is active, there are no overdue unheld round-game children and no active worker lease. Last worker success is demand-driven; the general recovery health tick is current.

Read-only deployed hashes match the previous qualified receipt:

| Function | Hash |
|---|---|
| record_session_results | eb408dcb7dca842776909bd603183a60 |
| finalize_gameplay_transfer_batch | 5d1c8703caee40ce7392d4eb6de1aaf9 |
| settle_gameplay_chip_transfers | 86c0feb55524f14ab9f58a06cdee2ef6 |
| private.delayed_finalize | 3c319dee938f4242d6174b27bc3ff260 |

Existing hosted financial/privacy/race qualification remains applicable to unchanged server owners. This presentation release does not claim a new hosted rollback proof.

## Validation and release tracking

Focused validation: 134 cases across 11 files pass. Harness: 241 cases across 12 files pass. All 3,260 source/server cases across 461 files and the application typecheck pass. Eight 320px/390px normal/reduced-motion phone flows pass: review, one acknowledgement, explicit Start where required, own score hold, terminal child/parent flow, reload and no overflow/browser errors. Normal-motion final-score-to-handoff observations range 3.01–3.37 seconds (including the shared score flight); reduced motion ranges 2.93–3.12 seconds with one 100ms presentation-clock tick allowed for DOM observation. The persistent final-results screenshot was inspected. The production build passes with its existing large-chunk/Browserslist warnings. Six archive/finale groups pass, including reload, another browser, explicit Back to Lobby, and win/loss/draw image holds measured at 7.01–7.02 seconds. The browser harness samples the ring before its fade and directly measures the image-load-to-fade interval. The first aggregate attempt had two unchanged five-second test timeouts while the build was running; focused and subsequent full reruns passed without relaxing assertions or timeouts. Evidence uses qualification.local/async-combined/holds-*.

The task owns the shared local publication lock. Initial remote main and clean main integration worktree are at 8ee54ae9200f95b22024267514df077f408e001b, already an ancestor of the task branch. GitHub reports no required branch-protection contexts. The existing automatic Vercel validation/build and Publish release signal workflow remain the publication gates. No prior denied rerun is retried and no release signal is written directly.

## Client publication PASS; publisher receipt pending at 22:35 UTC

Remote main is c26cf799da0e539d31e304fc38c457f5dd3ea0f6, tagged locally async-smoke-polish-20261029. The task branch push, conflict-free main fast-forward and unchanged main push helper succeeded. Vercel production dpl_9mrAyfC9vQvBJaqjS7YrdY6JQ32Y is READY, with holm357.com and ptown-poker.vercel.app assigned. GitHub's Vercel status is success. The public manifest matches this SHA and assets/index-DPlct3JO.js. Remote main was independently verified.

Publisher run 40965854739 attempt 1 is still in progress at its production-alias wait step as of 22:35:20 UTC. Its publish step has not run. The persisted release_publication remains the previous SHA 8ee54ae9200f95b22024267514df077f408e001b with receipt 40934076419-1. Client publication therefore passes, but the full publication receipt gate is NOT yet complete. No rerun, release-signal bypass or direct signal write was attempted.

Post-release health passes: admission/recovery enabled, minute health tick current, zero overdue unheld round-game children, zero worker leases/failures, zero real-money async matches, and review migration count remains exactly one. The worker's last success remains demand-driven, with no due work.

The repository execution circuit breaker ends this run at the 35-minute boundary. The only remaining delivery step is to recheck the existing publisher and matching persisted receipt; investigate its bounded failure if it terminates unsuccessfully. Do not repeat the migration, product tests or deployment. The task-owned shared publication lock remains in place while this publisher is unresolved; release it after the terminal receipt check, verifying its owner first. This receipt checkpoint is a local documentation commit, so it does not trigger a second deployment. Owner production smoke remains acceptance truth.


## Resumed publisher diagnosis — 22:38 UTC

Run 40965854739 attempt 1 failed at 22:36:32 UTC. Job 123770044949 logs show HTTP 403 for all 120 manifest fetches; the alias-wait step exited 1 and the publish-signal step was skipped. This was an access failure, not evidence of an old deployed SHA. The persisted receipt still references the prior release at 22:37:38 UTC.

A local curl request with the workflow's Cache-Control header returns HTTP 200 and c26cf799da0e539d31e304fc38c457f5dd3ea0f6. Vercel's project settings exclude custom domains from SSO protection; password and trusted-IP protection are disabled. The correctly team-scoped firewall configuration and attack-status reads return Seawall Config not found (404), so the specific rule/source behind the runner's 403 is unproven. No protection change, bypass, new deployment, direct receipt write or denied rerun retry was performed. A generic fetch rejected the job-log endpoint; the purpose-built decoded job-log tool succeeded.

Owner action requested: Re-run failed jobs on the existing run, then reply retried. The integration's prior Actions-write 403 has no new permission evidence. If the runner's manifest 403 recurs, stop and investigate that access boundary rather than repeat retries. The matching publisher receipt remains the only release gate; preserve the task-owned lock until that gate is resolved. No additional product tests or migration are needed. This documentation remains local and unpublished.
