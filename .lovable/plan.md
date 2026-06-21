# Wave 3 — 3-5-7 Canonical Staged Deal

Roll the existing shell `DealRuntime` + `CardTransport` onto 3-5-7, respecting the staged 3 → 5 → 7 deal model. No new transport, no new cardback, no buck rule.

## Invariants reused as-is

- ONE TABLE, ONE DEAL, ONE CARD TRANSPORT, ONE CARD BACK
- Cards terminate at canonical anchors:
  - `[data-card-anchor="opp-stack-${position}"]`
  - `[data-card-anchor="hand-${selfPlayerId}"]`
- All hidden flights render `CanonicalCardBack`
- All timing from `getDealTimingSnapshot()`; no inspect constants
- Dealer is the origin — no temporary deck node

## Corrections (must hold)

1. **All flying deal cards are hidden.** No `visibleFace` stamped on any self-recipient intent. Every intent flies as `face: 'hidden'` (`CanonicalCardBack`). The real card appears only when the destination claims ownership at settle.
2. **Origin is the dealer seat, not the self hand anchor.**
   - When dealer is an opponent: `from = { kind: 'seat', position: dealerPosition }`
   - When dealer is self: `from = { kind: 'seat', position: dealerPosition }` as well (dealer seat, NOT `hand-self`). The dealer seat is the canonical visual source even when the viewer happens to be the dealer.

## Per-wave DealRuntime keying

3-5-7 deals incrementally inside a single hand, so `handContextId` is **not** sufficient. Each round/stage gets its own deal-wave key:

```text
${dealerGameId}#h${handNumber}#r${roundNumber}   // r=1 → 3 cards, r=2 → +2, r=3 → +2
```

A `DealRuntimeMaybe` wrapper keyed by that string remounts a fresh `DealRuntime` (resetting `phase` + `settledCardIds`) every time the round advances. Hand boundary naturally falls out (handNumber++ → r=1 again, three-card wave).

## Files

### New: `src/components/ThreeFiveSevenDealOrchestrator.tsx`

Mirrors `GinRummyDealOrchestrator` but per-wave and HIDDEN-ONLY.

Props:

```ts
{
  waveContextId: string;        // ${dealerGameId}#h${hand}#r${round}
  dealerPosition: number;
  selfPlayerId: string;
  activeSeats: SeatEntry[];     // active, non-sitting-out, ordered by position
  cardsThisWave: number;        // 3 for r=1, 2 for r=2 & r=3
  selfTotalExpected: number;    // 3 for r=1, 5 for r=2, 7 for r=3
}
```

Sequence:

1. Compute `startIdx` = seat left-of-dealer within `activeSeats` ring.
2. For `pass` in `0..cardsThisWave-1`, for each active seat in ring order from `startIdx`, emit one intent.
3. **Every intent**:
   - `face: 'hidden'`
   - `visibleFace: undefined`
   - `from: { kind: 'seat', position: dealerPosition }` (always — even when dealer is self)
   - `to:` `{ kind: 'hand', playerId: selfPlayerId }` or `{ kind: 'oppStack', position }`
4. `expectedCount = cardsThisWave * activeSeats.length`
5. Dispatch gated on `useDealTimingHydrated()` and `activeSeats.length > 0`. No self-hand authoritative wait — faces are never stamped on the flight.
6. Mount canonical `[data-card-anchor="hand-${selfPlayerId}"]` 1×1 div as the destination terminus.

### Edit: `src/pages/Game.tsx`

Wrap the `MobileGameTable` mount with a `Wave3DealRuntimeMaybe` when `gameType === '3-5-7'/'3-5-7-game'/'357'` AND `currentRound >= 1`. Pass the computed `waveContextId` and active-seat roster down via new props.

### Edit: `src/components/MobileGameTable.tsx`

1. **Per-wave count baseline** — `prevWaveCount = round === 1 ? 0 : round === 2 ? 3 : 5`.
2. **Opp stack clipping** in `render357CanonicalSeat` (~line 5280):

```ts
const settled = deal?.getSettledCountForPlayer(player.id) ?? 0;
const visibleCount = deal?.phase === 'DEALING'
  ? Math.min(prevWaveCount + settled, expectedCardCount)
  : cardCountToShow;
```

3. **Self hand clipping** at active-player `<PlayerHand>` mount (~line 8235):

```ts
const settledSelf = deal?.getSettledCountForPlayer(currentPlayerId) ?? 0;
const allowed = deal?.phase === 'DEALING' ? prevWaveCount + settledSelf : cards.length;
const effectiveCards = deal?.phase === 'DEALING' ? cards.slice(0, allowed) : cards;
```

4. Mount `<ThreeFiveSevenDealOrchestrator ... />` once inside the 357 felt content, gated on `is357 && currentRound >= 1`. Active seats sourced from `players.filter(p => p.status === 'active' && !p.sitting_out)`.

When `deal === null` (no orchestrator): legacy behavior unchanged.

### Edit: `src/lib/canonicalShell/cardTransport/CardTransportDbgPanel.tsx`

Add a "357: …" block driven from existing `dealDbg` records filtered by `handContextId` ending in `#r${n}`:

```text
357: r${round}=PASS|FAIL              (settled === expected, this wave)
357: starts-left-of-dealer=PASS|FAIL  (first intent recipient pos === seatLeftOf(dealer))
357: self=PASS|FAIL                   (selfSettled === expected-self-this-wave)
357: opp=PASS|FAIL                    (sum opp settled === expected-opp-this-wave)
```

## Visibility contract

- During `DEALING` of wave-r:
  - self visible cards = `prevWaveCount + settled(selfPlayerId)`
  - opp visible cards = `prevWaveCount + settled(opp)`
- On `READY` / `GAMEPLAY`: full authoritative count (3 / 5 / 7).
- `deal === null` → legacy paths unchanged.

## Out of scope

- Community / showdown reveals
- Sweep the Legs overlay
- Settlement / pot logic
- Solo-vs-Chucky exposure paths

## Acceptance smoke

- Round 1: 3 cards/player dealt one-by-one starting left of dealer → `357: r1=PASS`
- Round 2: +2/player animate in, opp count 3 → 5 → `357: r2=PASS`
- Round 3: +2/player animate in, opp count 5 → 7 → `357: r3=PASS`
- Next hand: visible count resets to 3, fresh r=1 wave
- `starts-left-of-dealer=PASS` for every wave
- Every flying card is a `CanonicalCardBack` (no face-up flights)
- Origin DOM position matches dealer seat for every wave, even when viewer is the dealer
- Cardback preference change updates opp stacks + flying cards immediately

Done = 3-5-7 deal feels like Cribbage and Gin, but staged.
