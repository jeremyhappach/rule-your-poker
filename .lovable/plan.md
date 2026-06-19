# P0 — Close Shell Ownership Escape Hatches

Three deliverables. Boundary lands first, runtime invariant catches what the allow-list misses, then the five known violations move to a grouped `presentation` prop on the shell — no new subsystems, no growing list of top-level props.

## 1. ESLint compile-time boundary

Add `no-restricted-imports` to `eslint.config.js` with a second override block that re-permits the imports for an allow-list of files.

Forbidden modules:
- `@/lib/canonicalShell/CanonicalSeatCluster` (+ relative variants)
- `@/components/canonicalShell/CanonicalChipDisc`
- `@/components/canonicalShell/CanonicalChipstack`
- `@/components/ChipTransferAnimation`
- `@/components/CribbageChipTransferAnimation`

Allow-listed files:
- `src/components/MobileGameTable.tsx`
- `src/components/canonicalShell/CanonicalShellWaitingSurface.tsx`
- `src/lib/canonicalShell/NeutralInterstitial.tsx`
- `src/lib/canonicalShell/CanonicalSeatCluster.tsx` (self)
- `src/lib/canonicalShell/PreSessionSeatLayer.tsx`
- `src/lib/canonicalShell/CanonicalOpponentSeat.tsx`
- `src/lib/canonicalShell/ExtraDebugPills.tsx`
- `**/*.test.tsx`

Violation message: `Shell-owned primitive. Games emit state; the shell mounts artifacts.`
Severity: `error`.

## 2. Runtime invariant — duplicate-seat check

Promote the existing DOM scanner in `ExtraDebugPills.tsx` from pill-only to an always-on dev invariant.

- New module `src/lib/canonicalShell/seatClusterInvariant.ts` runs in `import.meta.env.DEV` regardless of debug pill visibility.
- Mounted from `App.tsx` as `<SeatClusterInvariantMonitor />`.
- When `mountedCount > 1` for any participantId, calls existing `checkInvariant('shell', 'one-cluster-per-participant', false, { participantId, mountedCount, mountedBy, duplicateParticipantIds })`. Emits the standard `[sync-invariant] ❌` console.error and persists via the existing pipeline.
- Signature-deduped so it only re-fires when the duplicate set actually changes.
- The pill in `ExtraDebugPills.tsx` keeps its own scanner unchanged.

## 3. Fix the 5 known violations — grouped declarative `presentation` prop

The rule everywhere: games emit state; shell mounts artifacts. Same shape as announcements, dealer indicator, waiting table.

### 3a. Gin Rummy opponentOverlay

`GinRummyGameTable.tsx:2505–2523` mounts `<CanonicalSeatCluster>` directly. The shell (`MobileGameTable.tsx`) already owns `projectedSeatOverlay` for Cribbage post-fix. Extend the same shell projection branch to `gameFamily === 'gin-rummy'`. Remove the direct `CanonicalSeatCluster` import from `GinRummyGameTable.tsx`.

### 3b. Yahtzee opponentOverlay

Same as 3a for `YahtzeeGameTable.tsx:2151–2163`. Extend the shell's projected seat overlay to cover Yahtzee opponents. Remove the import.

### 3c. Yahtzee chip primitives (`CanonicalChipstack` / `CanonicalChipDisc`)

`YahtzeeGameTable.tsx` composes its own per-seat `<CanonicalChipstack><CanonicalChipDisc/></CanonicalChipstack>`. The shell's `CanonicalSeatCluster` already renders the chip disc internally. Once 3b lands, this becomes a duplicate. Delete the Yahtzee-side composition and both imports.

### 3d + 3e. Chip transfer animations → grouped `presentation` prop

Introduce one new prop on `MobileGameTable.tsx`:

```text
presentation?: {
  chipTransfer?: {
    fromSeatId: string;
    toSeatId: string;
    amount: number;
    variant: 'default' | 'cribbage';
    key: string;
  };
}
```

Single grouping object designed to absorb future shell-owned render requests (`potTransfer`, `legsTransfer`, `sweep`, `ante`, `dealerButton`, …) without adding new top-level props or a separate subsystem. Initially only `chipTransfer` lives inside it.

Shape rules:
- One declarative field per shell-owned artifact.
- Identity / lifecycle is caller-owned via `key` — same pattern as announcements (`announcement?: { kind, key }`). No queue, no hook, no subscriber.
- Shell mounts the matching component based on field presence and `variant`:
  - `chipTransfer.variant === 'default'` → `<ChipTransferAnimation>`
  - `chipTransfer.variant === 'cribbage'` → `<CribbageChipTransferAnimation>`

Migration:
- `YahtzeeGameTable.tsx`: replace direct `<ChipTransferAnimation>` JSX with `presentation={{ chipTransfer: { ..., variant: 'default', key } }}`. Drop the import.
- `CribbageMobileGameTable.tsx` + `GinRummyGameTable.tsx`: replace direct `<CribbageChipTransferAnimation>` JSX with `presentation={{ chipTransfer: { ..., variant: 'cribbage', key } }}`. Drop the imports.

Type lives in `src/components/MobileGameTable.tsx` (or a sibling `types.ts` if MGT is too large) as `MobileGameTablePresentation`. Adding future fields (`potTransfer`, `legsTransfer`, etc.) is a one-line addition to that type — no new prop, no new subsystem.

## Sequencing

1. Land ESLint rule + runtime invariant. Add `eslint-disable-next-line` on the 5 known violations so build stays green during the migration.
2. 3a + 3b together (both extend the same shell projection branch).
3. 3c (drops out once 3b is in).
4. 3d/3e (add `presentation.chipTransfer` field + shell mount; migrate Yahtzee, then Cribbage, then Gin).
5. Remove all `eslint-disable` comments. Boundary enforced at compile time and at runtime.

## Risk

- 3d / 3e touch timing-sensitive chip animation paths. Identity is preserved via the caller-supplied `key`; verify with the seat-ownership pill and the new runtime invariant before moving on.
- Shell projection path in `MobileGameTable.tsx` is already proven for Cribbage; extending to Gin and Yahtzee is mechanical.

## Out of scope

- DealerIndicator typing, TurnSpotlight consolidation, PlayerChatBubbles cleanup — follow-ups, not P0.
- Barrel-re-export lint coverage — none of the listed primitives are re-exported.
- Any chip-transport hook / queue / subscription system — explicitly excluded.
- Migrating `PotToPlayer`, `LegsToPlayer`, `Sweeps`, `Ante`, `DealerButton` animations to `presentation` — those are convention-only today, follow-ups not P0. The `presentation` shape is designed to accept them later without a redesign.
