

# Phase 2: Holm Read-Only Shadow Sync — Implementation Plan

## Activation Gate

**`in_progress` and `game_over` are sufficient.** During `waiting`, `dealer_selection`, `game_selection`, `configuring`, and `ante_decision`, there is no round to track. The sync framework only needs to observe once a `currentRound` exists with meaningful state. Returning `null` from the snapshot builder when `currentRound` is null naturally gates this.

## Changes

### 1. Game.tsx — Imports (~line 1-50)

Add imports for `useGameStateSync`, `getHolmProgress`, and `HolmAuthoritativeSnapshot`.

### 2. Game.tsx — Snapshot Builder (new pure function, ~line 280)

```typescript
function buildHolmSnapshot(
  gameData: GameData,
  playersData: Player[],
  currentRound: Round | null
): HolmAuthoritativeSnapshot | null {
  if (!currentRound) return null;
  if (gameData.game_type !== 'holm-game') return null;
  if (gameData.status !== 'in_progress' && gameData.status !== 'game_over') return null;

  return {
    roundId: currentRound.id,
    handNumber: currentRound.hand_number ?? 1,
    dealerGameId: gameData.current_game_uuid ?? '',
    roundStatus: (currentRound.status as any) ?? 'betting',
    players: playersData.map(p => ({
      playerId: p.id,
      userId: p.user_id,
      position: p.position,
      decision: p.current_decision,
      decisionLocked: p.decision_locked ?? false,
      autoFold: p.auto_fold,
      sittingOut: p.sitting_out,
    })),
    currentTurnPosition: currentRound.current_turn_position ?? null,
    decisionDeadline: currentRound.decision_deadline,
    communityCards: currentRound.community_cards ?? [],
    communityCardsRevealed: currentRound.community_cards_revealed ?? 0,
    chuckyCards: currentRound.chucky_cards ?? [],
    chuckyActive: currentRound.chucky_active ?? false,
    pot: gameData.pot ?? 0,
    lastRoundResult: gameData.last_round_result ?? null,
    buckPosition: gameData.buck_position ?? 0,
    dealerPosition: gameData.dealer_position ?? 0,
  };
}
```

Key point: built from **fresh fetch payloads** (`gameData`, `playersData`), not from React state. The `currentRound` is derived from `gameData.rounds` using `pickActiveSingleRoundGameRound` inside `fetchGameData`, the same way the existing timer logic does.

### 3. Game.tsx — Hook Instantiation (~line 350, near other state declarations)

```typescript
const holmSyncLastRoundIdRef = useRef<string | null>(null);
const holmSync = useGameStateSync<HolmAuthoritativeSnapshot | null>(null, {
  getProgress: (s) => s ? getHolmProgress(s) : [0, 0, 0, 0],
  debugLabel: 'Holm',
  describeState: (s) => s ? {
    hand: s.handNumber,
    phase: s.roundStatus,
    decided: s.players.filter(p => p.decisionLocked).length,
    revealed: s.communityCardsRevealed,
  } : null,
});
```

The hook is always called (React rules), but returns null progress when state is null, making it inert for non-Holm games.

### 4. Game.tsx — Feed Point (end of `fetchGameData`, ~line 4392, after `setGame(gameData)`)

After `setGame(gameData)` and before the final `setLoading(false)`:

```typescript
// ── Holm shadow sync (Phase 2: read-only) ──
if (gameData.game_type === 'holm-game') {
  const holmRound = pickActiveSingleRoundGameRound(gameData.rounds as Round[], {
    dealerGameId: gameData.current_game_uuid,
    currentRoundNumber: gameData.current_round,
    currentHandNumber: gameData.total_hands,
  });
  const snapshot = buildHolmSnapshot(gameData, (playersData || []), holmRound);
  if (snapshot) {
    // Hard reset on roundId change
    if (holmSyncLastRoundIdRef.current && holmSyncLastRoundIdRef.current !== snapshot.roundId) {
      console.log('[GameStateSync:Holm] 🔄 Hard reset — roundId changed', {
        prev: holmSyncLastRoundIdRef.current,
        next: snapshot.roundId,
      });
      holmSync.reset(snapshot);
    } else {
      holmSync.receiveAuthoritativeUpdate(snapshot);
    }
    holmSyncLastRoundIdRef.current = snapshot.roundId;
  }
}
```

### 5. What Does NOT Change

- No render paths read from `holmSync.presentationState`
- No action handlers modified
- No optimistic updates
- No freeze/unfreeze calls
- No showdown/animation timing changes
- No 3-5-7, cribbage, gin, horses, or yahtzee code touched

### Example Log Output

**Accepted forward** (player locks decision):
```
[GameStateSync:Holm] ✅ Accepted update
  current: [3, 0, 1, 0]  incoming: [3, 0, 2, 0]  relation: forward
  currentState: {hand:3, phase:'betting', decided:1, revealed:0}
  incomingState: {hand:3, phase:'betting', decided:2, revealed:0}
```

**Rejected regressive** (stale poll arrives after newer realtime):
```
[GameStateSync:Holm] ❌ Rejected regressive update
  current: [3, 1, 3, 0]  incoming: [3, 0, 2, 0]
  currentState: {hand:3, phase:'processing', decided:3, revealed:0}
  incomingState: {hand:3, phase:'betting', decided:2, revealed:0}
```

**Hard reset** (new hand):
```
[GameStateSync:Holm] 🔄 Hard reset — roundId changed
  prev: abc-123  next: def-456
```

