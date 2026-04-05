
# 3-5-7 Read-Only Shadow Sync — Implementation Plan

## Context

3-5-7 is a **multi-round** card game: each hand has 3 rounds (Round 1 = 3 cards, Round 2 = 5 cards, Round 3 = 7 cards). Antes are charged only on Round 1. The `(dealer_game_id, hand_number, round_number)` triple-key uniquely identifies each round.

This is more complex than Holm (single round per hand) because the progress vector must be monotonic across **round boundaries within a hand** and across **hand boundaries**.

## Activation Gate

Active during `in_progress` and `game_over`. Returns `null` when no active round exists or game type isn't 3-5-7.

## Changes

### 1. New file: `src/lib/gameStateSync/threeFiveSevenProgress.ts`

**Snapshot shape** (`ThreeFiveSevenAuthoritativeSnapshot`):
- `roundId`, `handNumber`, `roundNumber`, `dealerGameId`
- `roundStatus` ('betting' | 'completed')
- `players[]` — `{ playerId, userId, position, decision, decisionLocked, autoFold, sittingOut }`
- `currentTurnPosition`, `decisionDeadline`
- `pot`, `lastRoundResult`
- `buckPosition`, `dealerPosition`
- `cardsDealt` (3, 5, or 7)

**Progress vector**: `[handNumber, roundNumber, phaseOrdinal, decidedCount]`

- `handNumber` — increments each new Round 1 (highest priority, ensures hand resets are forward)
- `roundNumber` — 1, 2, or 3 within a hand
- `phaseOrdinal` — betting=0, completed=1
- `decidedCount` — players with `decisionLocked === true`

This is monotonic across the full match lifecycle: hand transitions always advance dimension 0, round transitions advance dimension 1, and phase/decision progress advances dimensions 2-3.

### 2. New file: `src/lib/threeFiveSevenSyncDiagnostics.ts`

Invariant checks (mirroring Holm pattern):
- **INV-1: stale-round-render** — rendered roundNumber lags authoritative roundNumber
- **INV-2: stale-hand-render** — rendered handNumber lags authoritative handNumber  
- **INV-3: result-render-mismatch** — result overlay shows previous hand's winner while authoritative is on new hand
- **INV-4: decision-after-completed** — player decision locked while round is already completed

### 3. `src/lib/gameStateSync/index.ts` — Add exports

Export `getThreeFiveSevenProgress` and `ThreeFiveSevenAuthoritativeSnapshot`.

### 4. `Game.tsx` — Snapshot builder (pure function)

```typescript
function buildThreeFiveSevenSnapshot(
  gameData: GameData,
  playersData: Player[],
  currentRound: Round | null
): ThreeFiveSevenAuthoritativeSnapshot | null {
  if (!currentRound) return null;
  if (gameData.game_type !== '3-5-7' && gameData.game_type !== '357' && gameData.game_type !== '3-5-7-game') return null;
  if (gameData.status !== 'in_progress' && gameData.status !== 'game_over') return null;
  // ... build snapshot from fresh fetch payloads
}
```

### 5. `Game.tsx` — Hook instantiation

```typescript
const threeFiveSevenSyncLastRoundIdRef = useRef<string | null>(null);
const threeFiveSevenSync = useGameStateSync<ThreeFiveSevenAuthoritativeSnapshot | null>(null, {
  getProgress: (s) => s ? getThreeFiveSevenProgress(s) : [0, 0, 0, 0],
  debugLabel: '357',
  describeState: (s) => s ? {
    hand: s.handNumber,
    round: s.roundNumber,
    phase: s.roundStatus,
    decided: s.players.filter(p => p.decisionLocked).length,
  } : null,
});
```

### 6. `Game.tsx` — Feed point (end of `fetchGameData`)

After `setGame(gameData)`, feed the snapshot. Hard reset on `roundId` change (which happens both on new rounds within a hand and new hands).

### 7. `MobileGameTable.tsx` — Wire invariant checks

Add the same diagnostic pattern used for Holm/Horses — check rendered vs authoritative at render boundaries.

### 8. What Does NOT Change

- No render paths read from `threeFiveSevenSync.presentationState` (Phase 2 = read-only shadow)
- No action handlers modified
- No optimistic updates
- No freeze/unfreeze calls
- No other game types touched

## Round Lookup

3-5-7 uses `game.current_round` to identify the active round (unlike Holm which uses `pickActiveSingleRoundGameRound`). The active round is found by matching `(dealer_game_id, hand_number, round_number)` from the rounds array.

## Expected Log Output

**Accepted forward** (player locks decision in Round 2):
```
[GameStateSync:357] ✅ Accepted update
  current: [3, 2, 0, 1]  incoming: [3, 2, 0, 2]  relation: forward
```

**Hard reset** (new round within hand):
```
[GameStateSync:357] 🔄 Hard reset — roundId changed
  prev: abc-123  next: def-456
```

**Hard reset** (new hand / Round 1):
```
[GameStateSync:357] 🔄 Hard reset — roundId changed
  prev: def-456  next: ghi-789
```

## Follow-up Items (NOT in this pass)

- Horses rapid tap/untap dice trace issue (minor render polish, logged)
