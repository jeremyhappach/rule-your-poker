# Focused pause/resume qualification — 2026-11-02

Local candidate on `codex/focused-pause-resume`, continuing `fc3b9aa4b`.
Base: local and fetched `origin/main` `6411bb674a592d49cc6ed87fc0ae49a56a2f5361`.
No push, merge, deployment, production migration, live financial change or other worktree modification.
Effective session policy remained `danger-full-access`, network enabled, approval `never`; no escalation.

## Product scope and financial mapping

Only four product files differ from main. This qualification adds tests/evidence, not further product changes.

| Changed owner | Affected behavior | Financial boundary and coverage |
|---|---|---|
| `DealerGameSetup.tsx` | Host Pause/Resume inside the blocking modal; paused countdown/timeout and obsolete focus-read rejection. | Same route pause RPC and atomic configuration RPC. Setup handoff/session-intent proofs cover authorization, stale/repeated configuration and continuation; seven-game pause proof covers CAS, deadlines and financial write rejection. No new ante/payout writer. |
| `GinRummyGameTable.tsx` | Canonical pause gates card/stock/discard/knock/layoff controls and captured callbacks before optimistic action. | Actual authority/postgame proofs: legal hands, private/public projections, paused recovery, resume, terminal recovery, canonical chips/ledger/snapshots, actor/peer retry and late identity replay. |
| `CribbageMobileGameTable.tsx` | Pause gates discard/play/Go; existing automatic Go re-arms on resume without another snapshot. | Actual authority/postgame proofs: legal actions, pending counting presentation, paused recovery, resume, zero-client fallback, canonical chips/ledger/snapshots and actor/peer retries. |
| `Game.tsx` | Two setup mounts and Gin/Cribbage mounts receive authoritative pause state; setup uses the existing host callback. | No change to host election, action/settlement identity, receipt retry, RPC payload or financial owner. |

Shared setup reaches all 21 multiplayer games: 3-5-7, Holm, Horses, SCC, Cribbage, Gin, Yahtzee, Run21, TriTowers, 11 Up, Royal Flash, Take 2, Canasta, Six Card Golf, Race Poker, Battle 31, Quintzee, Ptown Words, Boxdrop, Trip Flip and Farkle. Outside Gin/Cribbage input gates, their gameplay and settlement implementations are unchanged. Arcade is unaffected.

The setup scrim remains modal. Browser evidence reproduces the old header's blocked pointer hit despite keyboard access, then proves the in-modal control is reachable. Rules, shell geometry, private cards, animation ownership, financial authority and terminal flow retain their existing owners.

## Automated results

- Focused pause audit: **182/182**, 34 files, one complete final run. Actor/observer recovery, paused actions, timers, stale callbacks, terminal presentation and automatic Go. Nine adapter tests use actual hooks with synthetic transport/snapshots; these are not full legal-play proofs.
- Harness unit suite: **241/241**, all 12 files from `test:harness:unit`.
- Full source suite: **3,617/3,617**, all 499 files, completed in 509.46 seconds. No new regression or reproduced pre-existing failure remains. The earlier interrupted run is superseded.
- App typecheck: **passed**, `tsc -p tsconfig.app.json --noEmit`.
- Production bundle passed for `fc3b9aa4b`; no subsequent product/build changes.
- Browser: **12/12**, actual setup components/CSS in installed Edge, four forms across portrait, landscape and desktop; host/non-host, pointer hit-testing, keyboard and emulated taps. Non-loopback requests blocked. **Not physical-device passes.**
- SQL: **10/10 proofs plus one negative control**, all local with rollback and deferred triggers checked. [SQL evidence](evidence/focused-sql.json), [browser evidence](evidence/focused-browser.json).

SQL covers seven-game pause, Yahtzee authority, both Horses/SCC proofs, Gin authority/postgame, Cribbage authority/postgame, setup handoff and session intent/setup. Extended card proofs stop actual recovery while paused, reject stale resume, resume the same round and require exactly one new balanced transfer batch. Actual chip deltas must equal terminal result deltas; post-payout snapshots must equal chips. Actor and peer retry the settled identity: balances, result rows, batches and snapshots remain unchanged. This simulates reconnect/lost replies at the RPC boundary; component/hook tests separately cover transport recovery and rendering.

### Fixture corrections and authority limits

Horses/SCC's connected proof used a random UUID for a later dealer game. The current deferred session/dealer FK rejects that nonexistent identity. It now creates the actual successor row and additionally asserts that late replay preserves its exact identity. Initial insertion order was valid under the deferred FK and needed no change.

The partial-turn proof seeded `random()`, while the current owner uses `private.secure_random_int`. A rollback-only spy at that boundary requires exactly one six-sided draw, unchanged held dice and the expected final face. A non-wild/non-target face prevents early exit from hiding extra rolls; the exact original function is restored before later cases. A negative control reinstating three rolls is rejected. Settlement/action authority is never replaced. The earlier failed legacy receipt is retained as historical evidence, superseded by this run.

The runner clones only synthetic template `transition_assurance_current_1793324266197` on `127.0.0.1:55439` and drops its copy. The capture omitted Gin's replay sequence and harness-setting row: it restores existing migration sequence DDL and inserts the setting disabled before proofs opt in. Its local `auth.uid` stub accepts claims-only subjects. These repairs and authority/SQL hashes are recorded. Neither the template nor any hosted database is changed.

This is repository-compatible captured local authority, not a fresh inspection of deployed definitions. Sequential retries and existing identity guards are qualified; no new multi-connection contention campaign is claimed.

```text
node e2e/pauseAudit/scripts/run-validation.mjs test run src --configLoader runner --cache=false --maxWorkers=2
node e2e/pauseAudit/scripts/run-validation.mjs test run --config e2e/pauseAudit/vitest.config.ts --configLoader runner --cache=false
node e2e/pauseAudit/scripts/focused-local-sql.mjs --legacy --cards
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
```

Harness validation used the exact `package.json` `test:harness:unit` file list, two workers and shared-dependency caching disabled. Installed tools only.

## Coordinated release

**Ready for coordinated release authorization, followed by owner production-device smoke. No unresolved local qualification blocker.** This is not production acceptance. [Compact test receipt](evidence/release-qualification.json).

- Main has not advanced from the candidate base; no reconciliation merge is needed. [Read-only branch/hunk comparison](evidence/release-branch-overlap.json).
- Host succession `48ac2026b` shares `Game.tsx` and release notes. Product hunks do not overlap, but its strict server-owned `isCreator` determines who sees the new setup control. Retain both during integration and check host/vacant/non-host visibility. Release-note headers need reconciliation.
- Activity-aware recovery `4dd3df126` overlaps only release notes. Its scheduler needs its own qualification. If released together, rerun the narrow card pause/recovery proofs against the integrated scheduler; this candidate does not qualify that unmerged backend.
- Async sound regressions `5037d7fdf` and Sound Pass 2 `6411bb674` are ancestors; no pending code overlap in those refs. Physical foreground audio remains owner smoke, not new sound implementation.

Full settlement campaigns for the other 19 games, host succession, recovery scheduling, wallets/cashout, new money modes and sound implementation are unrelated and deferred. This patch changes none of those authorities; it does not create an exhaustive platform-audit release requirement.

## Owner-only physical-phone smoke

Jeremy must perform these on actual iPhone Safari and Android Chrome after an authorized coordinated release, using approved test sessions. Automation cannot certify OS suspension, native touch delivery or physical audio.

1. Tap Pause/Resume in selection, card, simple and Farkle setup, portrait and short landscape. Timer holds/resumes once, form/scroll work, non-host has no pause control.
2. With two devices, pause active Gin/Cribbage turns. Visible actions do nothing while paused. Resume restores actor controls and observer agreement; automatic Go fires once when appropriate, without an invented human countdown.
3. Background/lock the actor through pause/resume on the other device; foreground and reconnect after a brief network interruption. Repeat as observer. Check identity, timers, cards and in-flight motion converge without duplicates.
4. Complete both card games through counting/terminal presentation and continuation; background near completion. Verify one visible payout, matching balances/results, functional HUD and correct Session Ended/rejoin behavior.

No physical-device or production smoke pass is claimed. No all-game phone campaign is required by this candidate.
