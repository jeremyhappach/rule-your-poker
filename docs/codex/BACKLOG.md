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
3. Cribbage.
4. Gin.
5. Horses.
6. SCC.
7. 3-5-7 instant-win residual seam.

Requirements: database owns claim, payout, snapshots, disposition; idempotent settlement key; post-payout snapshot; disconnect-safe; client owns presentation only.

Source-proven ingestion findings:

- Cribbage claims the round as completed before separate loser debits, winner
  credit, result, snapshot, and disposition writes. A disconnect after the
  claim can strand payout while a later caller skips the financial sequence.
- Yahtzee terminal result/snapshot identity uses
  `yahtzee_state.currentRound` instead of the authoritative
  `rounds.hand_number`. After a tie rollover, the new round has hand 2 or
  greater while terminal writers still pass hand 1.
- Yahtzee setup/start comments describe an ante or score-difference payout, but
  no ante enters a pot and terminal settlement transfers a fixed configured
  amount from each loser.
- Normal 3-5-7 terminal settlement remains client-owned:
  `src/lib/gameLogic.ts:handleGameOver` claims terminal status before separate
  award, result, snapshot, reset, and disposition writes.

### 3A. Source-proven rule, ledger, and harness discrepancies

These findings are separate from the broader terminal-authority migrations
above. Preserve their exact game-specific semantics during later triage.

- Cribbage three-player setup deals five cards to each player and takes one
  discard each, producing a three-card crib. The source comment expects the
  dealer to supply the standard fourth crib card, but no current path does so.
- Gin dealer setup stores configurable `gin_bonus` and `undercut_bonus`,
  while scoring uses hardcoded 25-point constants.
- Gin per-hand `game_results.player_chip_changes` records plus/minus ante
  deltas even though
  `src/lib/ginRummyRoundLogic.ts:recordGinRummyHandResult` explicitly performs
  no chip transfer.
- Yahtzee's ascending-position turn order conflicts with canonical
  `src/lib/canonicalShell/seatRing.ts:nextClockwise`, which defines
  left/clockwise as the nearest lower occupied position.
- Holm partial-tie payout uses integer division. When the pot is not divisible
  by the number of tied winners, the remainder has no proven conservation
  owner.
- The 3-5-7 admin forced-card harness assigns forced cards without removing
  them from the randomized deck, creating a duplicate-card risk.

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
