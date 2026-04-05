
## 3-5-7 Presentation Cutover Plan

### Current State
- Shadow sync is confirmed structurally sound (monotonic vector, zero real invariants)
- `threeFiveSevenSync.presentationState` exists but is unused by the render path
- 3-5-7 renders from raw `game.*` / `currentRound.*` (lines ~7711-7850)
- Holm already demonstrates the pattern: `holmView` gates pot, dealerPosition, roundStatus, etc.

### What Changes

**Step 1: Create `threeFiveSevenView` (alias for presentation state)**
- Add `const threeFiveSevenView = threeFiveSevenSync.presentationState;` alongside `holmView`
- Gate it: only active when `game_type` matches 3-5-7

**Step 2: Gate 5 render fields through presentation state**
In the fallback MobileGameTable render (~line 7711), mirror the existing Holm pattern:

| Prop | Current source | New source (when 3-5-7) |
|------|---------------|------------------------|
| `pot` | `potForDisplay` | `threeFiveSevenView.pot` |
| `currentRound` | `game.current_round` | `threeFiveSevenView.roundNumber` |
| `roundStatus` | `currentRound?.status` | `threeFiveSevenView.roundStatus` |
| `allDecisionsIn` | `game.all_decisions_in` | derived: all players `decisionLocked` |
| `currentTurnPosition` | `currentRound?.current_turn_position` | `threeFiveSevenView.currentTurnPosition` |

**Step 3: Create `threeFiveSevenPlayers` (decision overlay)**
Mirror the existing `holmPlayers` pattern: overlay `current_decision` and `decision_locked` from presentation state onto raw players. This ensures decision badges read from the gated state.

**Step 4: Wire invariant checks to compare presentation vs authoritative**
Now that we have a real "rendered" state, update the stale-round and stale-hand invariants to compare `threeFiveSevenView` values against the authoritative snapshot.

### What Does NOT Change
- Action handlers (handleStay, handleFold) continue reading raw DB state for mutation correctness
- Card dealing, community cards, chucky cards — remain on raw state (not in the snapshot yet)
- Animation triggers — remain on raw state
- Hard resets at roundId boundaries — preserved as-is
- All instrumentation stays active

### Why This Is Safe
- Follows the exact same pattern already proven stable for Holm
- Presentation state equals authoritative state when not frozen (no freeze windows configured yet)
- Shadow sync confirmed the progress vector is monotonic — presentation will track correctly
- Invariants will immediately catch any drift

### Risk Mitigation
- If any invariant fires post-cutover, we can revert to raw state for that field without code churn
- No freeze windows in this step — presentation = authoritative passthrough
