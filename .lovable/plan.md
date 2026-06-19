# Seat Ownership Cutover — Cribbage / Gin / Yahtzee

Goal: `CanonicalSeatCluster` is **shell-owned during gameplay** for all three families. Game tables emit per-seat presentation data only — **never JSX**. Three ESLint suppressions deleted. Runtime invariant `participantId → mountedCount == 1` holds across every lifecycle phase. **Chip transfers are out of scope** — done after this lands.

## Rule (non-negotiable)

Games emit presentation state. Shell renders artifacts. No `ReactNode` / no `children` / no decorator function on the new prop. Every game-contributed input is a typed value the shell knows how to render.

## New shell prop (typed, no JSX escape hatch)

`MobileGameTable` already takes `presentation?: {...}`. Extend it with one field:

```text
presentation?: {
  chipTransfer?: ...;                        // (later, not now)
  opponentSeat?: {
    dealerPip?:     (player) => boolean;
    statusRing?:    (player) => SeatStatusRing | undefined;
    chipValue?:     (player) => string | undefined;
    hideChipBubble?:(player) => boolean;
    scoreLine?:     (player) => string | undefined;

    cardBacks?: (player) => {
      count: number;
      visible: boolean;
      variant: 'cribbage' | 'gin';
    } | null;
  };
}
```

Properties:
- Pure functions of `player` only. No subscriptions, no queues, no hooks, no JSX.
- All fields optional; shell provides defaults (no dealer pip, `statusRing='active'`, `chipValue=$<chips>`, no card-backs, no score line).
- Game tables memoize the `opponentSeat` object; identity is stable.

## Shell changes (`MobileGameTable.tsx`)

1. Extend `MobileGameTablePresentation` type with `opponentSeat` (above) and define `SeatStatusRing` reusing the existing `derivePlayerStatus` return.
2. Add a shell-internal `<ShellOpponentCardBacks count variant color darkColor />` component. It owns the card-back strip JSX for both `'cribbage'` and `'gin'` variants (today the markup is identical — a horizontal row of N face-down rectangles colored by `cardBackColors`). Lives next to other shell-owned seat chrome.
3. In the gameplay dispatcher (`MobileGameTable.tsx` ~L7493), add a generic `renderGenericOpponentCanonicalSeat(player, slot)` used when `gameType ∈ {cribbage, gin-rummy, yahtzee}`. Holm / 3-5-7 / Horses / SCC keep their existing bespoke renderers.
4. The generic renderer:
   - Skips the local viewer (cluster self-suppression already handles this).
   - Reads accessors from `presentation?.opponentSeat`; falls back to defaults.
   - Mounts a single `<CanonicalSeatCluster>` with `ownerLabel="Shell:MobileGameTable.opponentSeat[<gameFamily>]"` and `playerId={player.id}`.
   - If `cardBacks(player)?.visible && count > 0`, renders `<ShellOpponentCardBacks />` inside the cluster — owned by the shell, parameterized by the typed `variant` (no game-supplied JSX).
5. Pre-session path (L7457–7491) unchanged — `PreSessionSeatLayer` continues to own pre-session.

## Game-table changes

For each of `CribbageMobileGameTable.tsx`, `GinRummyGameTable.tsx`, `YahtzeeGameTable.tsx`:

1. Delete the local opponent-overlay JSX (the `<CanonicalSeatCluster>` map block).
2. Delete the `CanonicalSeatCluster` import and the `eslint-disable-next-line` above it.
3. Delete the local card-back JSX/components (`OpponentCardBackStrip` in Gin, the inline `<div className="flex -space-x-1.5...">` in Cribbage) — the shell owns these now.
4. Build a memoized `opponentSeat` object and pass via `<MobileGameTable presentation={{ opponentSeat }} />` (already the persistent shell host for each table).

Per-game accessor mapping (all data, no JSX):

- **Cribbage** (`CribbageMobileGameTable.tsx:6710–6738`)
  - `dealerPip(p)` = `!!viewState?.dealerPlayerId && viewState.dealerPlayerId === p.id`
  - `chipValue(p)` = `isLoserDuringChipAnim(p) ? '' : $<chips>`
  - `hideChipBubble(p)` = `isLoserDuringChipAnim(p)`
  - `cardBacks(p)` = `{ count: seatState.hand.length, visible: isGameplayMode && showSeatCardBacks && seatState.hand.length > 0, variant: 'cribbage' }`

- **Gin Rummy** (`GinRummyGameTable.tsx:2515–2533`)
  - `dealerPip(p)` = `isCribDealer(p.id)`
  - `statusRing(p)` = `p.sitting_out || p.auto_fold ? 'sitting_out' : 'active'`
  - `cardBacks(p)` = `{ count: seatState.hand.length, visible: isOpponentSeat && phase ∉ {knocking,laying_off,scoring} && !(complete && knockResult) && seatState.hand.length > 0, variant: 'gin' }`

- **Yahtzee** (`YahtzeeGameTable.tsx:2163–2175`)
  - `scoreLine(p)` = `'Score: ' + getTotalScore(playerStates[p.id].scorecard)`
  - `dealerPip` omitted (dice families have no dealer).
  - No card backs.

## Card-back colors

`cardBackColors` is currently game-table-local. The shell already has access to the viewer's deck color preference via the same hook (`useVisualPreferences` / equivalent) — `ShellOpponentCardBacks` reads it directly. No need to thread color values through the accessor (would re-introduce a styling pass-through; the shell already owns deck styling).

## Invariant coverage (acceptance gate)

`SeatClusterInvariantMonitor` stays at `mountedCount == 1 per participantId` across:

- waiting table / pre-session
- dealer selection
- ante decision
- gameplay (every turn, every phase)
- win sequence (Cribbage chip-anim window in particular)
- observer ↔ seated transitions
- timeout / sit-out
- back to waiting after match end

Smoke matrix: full Cribbage hand including chip-transfer animation; full Gin hand including knock + laying-off + scoring; full Yahtzee turn cycle.

## ESLint cleanup

After migration, remove `eslint-disable-next-line no-restricted-imports` and the `CanonicalSeatCluster` import from all three game files. No allow-list change required.

## Out of scope (explicitly deferred)

- `presentation.chipTransfer` — only after the seat boundary is genuinely closed.
- Yahtzee's `CanonicalChipDisc` / `CanonicalChipstack` composition — separate edit in a follow-up wave (now unblocked because Yahtzee no longer mounts its own cluster).
- Holm / 3-5-7 / Horses / SCC — already shell-owned via their bespoke renderers; untouched.

## Risk

- Cribbage chip-transfer window depends on `hideChipBubble`. Accessor preserves the exact predicate — behavior should be byte-equivalent.
- Gin laying-off / scoring hide card backs. Predicate moved verbatim into `cardBacks.visible`.
- Card-back rendering moves from per-game JSX into one shell component. Both variants currently render the same markup with different `cardBackColors` source — the `variant` field is a forward hook only; if future variants diverge, the shell adds the branch (still no game JSX).

## Sequencing

1. Add `opponentSeat` typed prop + `ShellOpponentCardBacks` + generic renderer in `MobileGameTable.tsx`. Shell dormant for cribbage/gin/yahtzee until they opt in.
2. Migrate Cribbage. Verify invariant + visuals through a full hand including chip-transfer. Delete import + suppression + local card-back JSX.
3. Migrate Gin. Verify through knock + laying-off + scoring. Delete import + suppression + `OpponentCardBackStrip`.
4. Migrate Yahtzee. Verify through full turn + win. Delete import + suppression.
5. `bunx vitest run src/lib/canonicalShell` clean; manual smoke shows no `[sync-invariant] ❌ shell::one-cluster-per-participant` firings.
