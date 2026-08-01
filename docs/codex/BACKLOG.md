# Backlog

Priority is ordered. Re-rank only for a current production blocker.

## P0 — release/correctness

### 1. Final iOS Session Ended long-list scroll

Status at handoff: accepted only after published iOS smoke.

Acceptance:

- felt-safe panel remains inside ellipse;
- one real WebKit-safe scroll owner;
- sticky Results title;
- Hap + 10 bots all reachable;
- short lists intrinsic;
- no page/HUD scroll.

### 2. Regression-proof Holm bot scheduler

Current fixes cover dropped wakes, missed realtime edges, remount, focus, visibility, and reconnect.

Codex follow-up:

- audit whether `makeBotDecisions` returns before its internal two-second delayed action commits;
- consider making promise lifecycle represent the actual authoritative attempt;
- preserve no-polling and DB exactly-once behavior;
- add a focused deterministic test only if existing test architecture supports it reliably.

### 3. Remaining terminal-authority migrations

Retained order:

1. Yahtzee — replayable per-mount financial settlement.
2. 3-5-7 normal terminal.
3. Gin.
4. Horses.
5. SCC.
6. 3-5-7 instant-win residual seam.

Requirements: database owns claim, payout, snapshots, disposition; idempotent settlement key; post-payout snapshot; disconnect-safe; client owns presentation only.

## P1 — canonical architecture integrity

### 4. Platform-wide bespoke-artifact audit

This is not Holm-only. Audit all seven games for unjustified game-specific implementations overlapping canonical owners:

- card faces and active-hand fans;
- tabled/revealed cards and dice;
- seat clusters/chip stacks/dealer markers;
- pot/transports/celebrations;
- announcements/HUD/tabs;
- active panes/action strips/spotlights;
- table/felt geometry;
- setup/configuration;
- terminal and Session Ended presentation.

Classify each as a necessary narrow exception built on canonical primitives, or unjustified duplication to migrate/delete.

Acceptance invariant: a shared visual/lifecycle change is made once and reaches every applicable game automatically.

Run read-only inventory/plan before implementation. This is also a reasonable Claude Code analysis task.

### 5. Holm active-hand canonicalization

Audit Holm `PlayerHand`/self-hand against shared `ActiveHandFan`.

Preserve four-card geometry, Fold/Stay interaction, highlights, tap behavior, responsive sizing, and tabled transitions. Migrate fully when possible; otherwise isolate only irreducible behavior while sharing canonical `PlayingCard` theme/face treatment.

### 6. Formalize or remove misleading host state

`games.current_host` was null across inspected games and was not Holm bot-controller ownership.

Prove remaining reads/writes, then remove or clearly debug-scope it. Do not conflate it with production ownership.

### 7. Retire legacy bot alias allocator

The standalone `allocate_bot_alias_number` path can burn ordinals outside transactional `create_session_bot`.

Prove no callers; revoke/remove or mark migration-only; preserve transactional creation.

## P1 — cross-game presentation

### 8. Canonical win celebration

3-5-7, Horses, and SCC historically completed pot-to-player transfer but missed canonical destination bounce/confetti. Apply the shared celebration owner without reopening settlement.

### 9. Dealer Configuration modal cleanup

Historical Lovable backlog path:

`.lovable/backlog/dealer-configuration-modal-cleanup.md`

Goals: viewport-safe layout, scrollable body, fixed footer, compact selectors, no game-specific modal fork.

### 10. Geometry Lab/polish

- felt aspect ratio and safe gutters;
- shared safe frame;
- active-player spacing;
- card rank/suit gap;
- opponent nameplate offsets;
- 3-5-7 round-3 group semantics;
- Gin score-rail collision;
- Holm long-tail visuals;
- Yahtzee held-dice reorder/scatter.

## P2 — known low-severity defects

### 11. 3-5-7 refresh transport

Refreshing during later rounds can suppress later-round deal transport for the rest of the hand. Authoritative play remains intact.

### 12. 3-5-7 timeout/sitting-out card scaling

After timeout/sitting-out transition, local active cards may grow/overlap after initially rendering correctly.

### 13. Post-match visual residue

Audit only with a current repro:

- duplicate chip stack;
- stale title/stakes;
- Horses transition delay.

## Documentation/bootstrap

### 14. Complete exact game-rule documentation

Run a read-only source audit to document legal actions, state machines, scoring, dealer/hand/session terminal rules, settlement owners, bot behavior, and source paths. No product changes during the documentation pass.

### 15. Complete repository map

Populate `REPO_MAP.md` from the final tagged source after cutover.
