---
name: Canonical harness host rule
description: All near-X debug harnesses must direct the advantaged player to the canonical session host (games.current_host → earliest non-bot fallback), never to the local viewer or init-race winner
type: constraint
---
All scripted-winner / near-X debug harnesses (Cribbage near-double-skunk, Gin near-gin, Yahtzee near-win, and any future ones) MUST select the advantaged player via `resolveSessionHostPlayerId` in `src/lib/debugHarness/resolveHarnessHost.ts`.

Canonical rule (deterministic, identical on every client):
1. `games.current_host` (user_id) → non-bot player with matching user_id
2. Fallback: earliest non-bot player by `players.created_at`
3. Final fallback: earliest player by `created_at`

**Forbidden** sources for harness target:
- `currentUserId` / local viewer
- `auth.uid()`
- localStorage / URL params
- init race / first-writer-wins
- arbitrary seat index (seat 0/1)
- "dealer" (ambiguous: session host vs dealer-game chooser vs crib dealer vs current turn)

**Why:** seat/dealer rules are fragile (players may not sit in seat 0/1; "dealer" has 4 meanings in this app). The local-viewer rule made the winner non-deterministic across clients and dependent on who reached the init write first.

Tie/no-winner harnesses (Horses force_tie, SCC force_no_qualify) do not need a host target.
