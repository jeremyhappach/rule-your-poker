# Canonical Settlement Phase — Wave 1 (approved + tweaks)

## Architecture

```text
PRELUDE (optional, game-typed)
        ↓
SETTLEMENT
   ECONOMY  ∥  CELEBRATION
        ↓
SETTLEMENT_COMPLETE  (barrier: economySettled AND celebrationComplete)
        ↓
NEXT_GAME
```

## Ownership rules (per user tweaks)

1. **State, not events.** `SettlementProvider` owns `phase`, `activeIntent`, `economySettled`, `celebrationComplete`. No `onComplete(cb)`. Consumers (e.g. `PlayfieldSlotController` in W2+) observe `phase === SETTLEMENT_COMPLETE`.
2. **Destination reaction belongs to Economy.** `TransferIntent.destinationReaction = { bounce?, pulse?, scale? }`. Celebration owns announcement / confetti / spotlight / minDuration only.

## API

```ts
type Endpoint =
  | { kind: 'seat'; position: number }
  | { kind: 'pot' };

type TransferIntent = {
  id: string;
  from: Endpoint;
  to: Endpoint;
  amount: number;
  variant?: 'default' | 'sweep' | 'skunk';
  destinationReaction?: { bounce?: boolean; pulse?: boolean; scale?: number };
  reason: string;
};

type PreludeIntent = { type: 'sweep_legs' | 'skunk' | 'double_skunk' };

type CelebrationIntent = {
  winners: string[];
  announcement: string;
  confetti?: boolean;
  spotlight?: boolean;
  minDurationMs?: number;
};

type SettlementIntent = {
  gameId: string;
  handNumber: number;
  prelude?: PreludeIntent;
  transfers: TransferIntent[];
  celebration: CelebrationIntent;
};

type SettlementPhase =
  | 'IDLE'
  | 'PRELUDE'
  | 'SETTLEMENT'
  | 'SETTLEMENT_COMPLETE';
```

## Wave 1 scope (this commit)

- **Scaffold (live):** types, `SettlementProvider`, `SettlementRuntime`, `settlementDbg`, `SettlementDbgPanel`, pill registration.
- **Mounted in `PersistentTableShell`** inside the existing `ChipTransportProvider` / `CanonicalAnnouncementProvider` shell column. Runtime is dormant until an intent is submitted.
- **Cribbage emits its intent in shadow mode** via `recordSettlementIntent({ caller, intent })` from `triggerWinSequence`. The existing chip-transfer + announcement code paths continue unchanged. SETTLEMENT DBG pill shows the would-submit intent shape and runtime state. No risk to current visuals.
- **PlayfieldSlotController is NOT gated** in W1 (would block every other game that doesn't submit intents yet). The barrier exists in state and is observable.

## Wave 2+ (not in this commit)

- W2: Cribbage flips from `recordSettlementIntent` to real `submit()`. Runtime drives the canonical announcement + dispatches `ChipTransport` for `loser→winner`. Cribbage's bespoke chip-transfer + match_win emission deleted. `PlayfieldSlotController` consumes settlement phase as readiness AND-term.
- W3: 357 (`sweep_legs` prelude, `pot→seat`) + Holm (`pot→seat`).
- W4: Gin, Yahtzee.
- W5: Horses / SCC.
- W6: Delete all per-game settlement scaffolding.

## Files

**New**
- `src/lib/canonicalShell/settlement/types.ts`
- `src/lib/canonicalShell/settlement/SettlementProvider.tsx`
- `src/lib/canonicalShell/settlement/SettlementRuntime.tsx`
- `src/lib/canonicalShell/settlement/settlementDbg.ts`
- `src/lib/canonicalShell/settlement/SettlementDbgPanel.tsx`

**Edited**
- `src/lib/canonicalShell/PersistentTableShell.tsx` (mount provider + runtime)
- `src/lib/debugTray/debugPillsStore.ts` (register `settlementDbg`)
- `src/App.tsx` (mount panel)
- `src/components/CribbageMobileGameTable.tsx` (shadow-record intent in `triggerWinSequence`)
