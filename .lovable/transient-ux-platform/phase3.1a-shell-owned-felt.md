# Phase 3.1a — Shell-owned persistent felt (skeleton)

**Status:** SKELETON LANDED. No runtime behavior change. Awaiting 3.1b cutover review.

## Objective

Establish the shell-owned persistent felt architecture as the new
end-state for Bucket 3, without cutting over any live gameplay
surface. 3.1a is pure plumbing + design.

## Hard invariant (target)

> At any instant during a session route, there is exactly one DOM node
> with `data-canonical-felt-surface=""`. It mounts once on session
> entry and never unmounts for the rest of the session.

## What 3.1a ships

1. **Feature flag** — `isShellOwnedFeltEnabled()` in `src/lib/debugFlags.ts`.
   Default OFF. Enable via `?shell_owned_felt=1` or
   `localStorage.ptp_shell_owned_felt = "1"`. With the flag OFF the
   platform behaves exactly as today.

2. **Skeleton host** — `src/lib/canonicalShell/ShellOwnedFeltHost.tsx`.
   - `ShellOwnedFeltHost` — single `CanonicalFeltSurface` mount point.
   - `ShellFeltContextProvider` — context that lets gameplay surfaces
     publish felt geometry/subtitle data and read `shellOwnsFelt`.
   - `useShellFeltContext()` — hook surfaces will use to (a) suppress
     their local felt render and (b) publish the active felt context.
   - Exported but **not mounted** by `PersistentTableShell`.

3. **Design doc** — this file.

## End-state architecture (3.1b cutover target)

```text
PersistentTableShell
├── ShellFeltContextProvider
│   ├── ShellOwnedFeltHost              ← ONE CanonicalFeltSurface, z=0
│   ├── shell-owned chrome (header, announcement rail, overlays, …)
│   └── gameplay column                  ← z=1, transparent backgrounds
│       └── PlayfieldSlotController
│           ├── neutral  → no felt; publishes waiting context
│           └── active   → game surface; publishes family + ante context
│       └── waiting overlay (3.1b)       ← seat-select / share / bot-add
└── overlay root, pot anchor, celebration layer (z=80)
```

## How gameplay surfaces become felt-content children (3.1b)

Each canonical surface (`CribbageMobileGameTable`, `GinRummyGameTable`,
`YahtzeeGameTable`, then Holm/3-5-7/Horses/SCC during 3.2) will:

```tsx
const felt = useShellFeltContext();

// Publish the felt context this surface wants the shell to render.
useEffect(() => {
  felt.publish({
    gameKind: 'cribbage',
    anteAmount: gameConfig.anteAmount,
    pointsToWin: gameConfig.pointsToWin,
    cribbageSkunk: { ... },
    publisherLabel: 'CribbageMobileGameTable',
    isWaitingPhase: false,
  });
  return () => felt.publish(null);
}, [/* deps */]);

// Suppress local felt render when the shell owns it.
{!felt.shellOwnsFelt && (
  <CanonicalFeltSurface gameKind="cribbage" {...feltProps} />
)}
```

This pattern is fully backwards compatible: with the flag OFF,
`shellOwnsFelt === false` and surfaces render their local felt
exactly as today.

## Waiting / seat-selection overlay anchoring (3.1b)

- The shell felt occupies `absolute inset-0` behind the gameplay
  column. Seat anchor geometry is owned by `SeatAnchorLayer` (already
  shell-mounted), which is positioned relative to the same shell root.
- The new `CanonicalWaitingSlot` (3.1b) mounts seat-clickable hotspots
  via `useRequiredSeatAnchors` against the seat-anchor layer, not
  against `MobileGameTable`. This decouples the waiting overlay from
  the legacy `MobileGameTable` felt path.
- During waiting the slot publishes `{ gameKind: <family>, isWaitingPhase: true }`
  so the shell felt renders without a game-name plate.

## Seat-hotspot preservation

`useRequiredSeatAnchors` already returns canonical seat positions
keyed off `SeatAnchorLayer`. All canonical-shell families are
registered consumers (see `canonical-shell-onboarding-checklist.md`).
The waiting overlay reuses the same anchor source — no parallel
geometry implementation.

Non-canonical families (Holm / 3-5-7 / Horses / SCC) currently rely
on `MobileGameTable` for seat hotspots. Their waiting parity is
deferred to **Phase 3.2** (per-family slot migration); 3.1b cuts over
canonical-shell families first.

## Observer parity

Observers receive the same shell-owned felt as seated players (the
shell mounts above per-viewer routing). Observer-specific affordances
(seat-select prompts in waiting; observer chrome in-progress) layer
above the shell felt without affecting its lifetime.

## Single-felt invariant enforcement

3.1b adds a DEV-only `useShellFeltInvariant()` hook that, when
`shellOwnsFelt === true`, queries the document for
`[data-canonical-felt-surface]` at every animation frame during a
session route. Violations log a loud warning identifying the
duplicate via `data-canonical-felt-game` and (where the surface
opted in) `data-canonical-felt-owner`. The invariant is observe-only
in production; it does not gate render.

## Rollback strategy

- **Flag off** (default): runtime is identical to today. No risk.
- **Flag on, regression detected**: flip flag off; route remount
  restores legacy felt ownership. No DB or sync changes are involved.
- **Per-surface escape hatch**: surfaces opt into shell ownership by
  threading the `useShellFeltContext()` check. A surface that omits
  the check continues to render its own local felt even with the
  flag on (the invariant warning is the signal to migrate it).
- **Bisectable cutover**: 3.1b migrates surfaces one at a time
  (Cribbage → Gin → Yahtzee), each gated by the same flag. Reverting
  a single surface's check restores its local-felt render.

## Sequencing (revised end-to-end)

```text
3.1a  shell-owned felt skeleton (this delivery)         ← DONE
      → STOP for design review

3.1b  mount ShellOwnedFeltHost in PersistentTableShell behind flag
      cut over Cribbage → STOP, validate
      cut over Gin Rummy → STOP, validate
      cut over Yahtzee  → STOP, validate
      cut over waiting surface (canonical families only) → STOP, validate
      remove dead WaitingForPlayersTable usages for canonical families

3.3   DealerGameSetup overlay migration (unchanged)
      → STOP for validation

3.2   poker/dice family persistent slot migration (per-family)
      Holm → STOP → 3-5-7 → STOP → Horses → STOP → SCC → STOP
      → each family cutover ALSO migrates the surface off its local felt

3.4   cleanup (retire WaitingForPlayersTable, MobileGameTable dead
      siblings, remove `isShellOwnedFeltEnabled` flag if invariant
      green for two full validation cycles)

3.5   invariant default-on + full smoke validation
```

## Open questions for 3.1b kickoff

1. Should `ShellFeltContextProvider` be reactive (re-render on every
   `publish()`)? 3.1a is ref-backed; reactive is needed if surfaces
   want the shell felt to re-render on ante config changes mid-session.
2. Should the shell felt have a per-route "initial context" so the
   first frame paints with the correct family identity even before the
   surface mounts (avoiding a one-frame "generic holm-game" fallback)?
   Likely yes — derive from `game.game_type` in Game.tsx and pass via
   `<ShellOwnedFeltHost initialGameKind=... />`.
3. Should the `useShellFeltInvariant()` hook ever throw, or only warn?
   Project memory says "Prioritize user-visible correctness over
   internal invariant noise" — warn-only is the safe default.

## Files touched in 3.1a

- `src/lib/debugFlags.ts` — added `isShellOwnedFeltEnabled()`.
- `src/lib/canonicalShell/ShellOwnedFeltHost.tsx` — new skeleton.
- `.lovable/transient-ux-platform/phase3.1a-shell-owned-felt.md` —
  this design doc.

No gameplay code, no `PersistentTableShell` mount changes, no
`Game.tsx` edits. Runtime is byte-identical to before 3.1a.
