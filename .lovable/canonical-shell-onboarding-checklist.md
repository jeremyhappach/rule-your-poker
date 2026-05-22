# Canonical Shell Onboarding Checklist

Recurring bug class this exists to prevent
-----------------------------------------

A game starts consuming canonical shell primitives (SeatAnchorLayer,
CanonicalSeatCluster, chip-transport endpoints, etc.) **before** being
wired into the upstream routing/provider contract. The provider never
mounts, the optional anchor hook returns null, every slot resolves to
null, and downstream chrome (chip stacks, dealer pip, chip-transport
animation endpoints, observer geometry, turn spotlight) silently
disappears.

We hit this exact failure during the Gin Rummy migration. We hit it
again during the Cribbage migration. Each time the visible symptoms
were exotic (observer chip stack missing, spotlight stuck at -45°,
chip animation landing on wrong DOM node) and the actual root cause
was the same: missing top-level wiring.

This checklist + the registry invariant in `shellRouting.ts` + the
strict `useRequiredSeatAnchors(gameType)` hook are the three layers
that must catch recurrence before it ships.

When to use
-----------

Run this checklist whenever a game body starts consuming **any** of:

- `<SeatAnchorLayer>` / `useSeatAnchors*`
- `<CanonicalSeatCluster>`
- `<ChipTransportProvider>` / `data-chip-center` markers as endpoints
- `<CanonicalFeltSurface>` or any other shell-owned overlay
- `PersistentTableShell` slot ownership

Checklist
---------

1. **Add the game_type to `CANONICAL_SHELL_FAMILY`**
   File: `src/lib/canonicalShell/shellRouting.ts`
   This is what gates the `<SeatAnchorLayer>` mount in `Game.tsx`.
   Without this, every canonical seat consumer renders empty.

2. **Add the game_type to `CANONICAL_SEAT_CONSUMERS`** (only if the
   game actually consumes per-seat anchors — Cribbage / Gin do;
   Yahtzee does not today).
   This wires the registry-invariant test (`shellRouting.test.ts`)
   AND the dev-mode loud-failure path in `useRequiredSeatAnchors`.
   The module-load assertion in `shellRouting.ts` will refuse to even
   evaluate if you add to this set without also adding to
   `CANONICAL_SHELL_FAMILY`.

3. **Use the strict hook in the consumer**
   ```ts
   import { useRequiredSeatAnchors } from '@/lib/canonicalShell/SeatAnchorLayer';
   const shellAnchors = useRequiredSeatAnchors('<game-type>');
   ```
   NOT `useSeatAnchorsOptional()`. The optional variant is reserved
   for genuine dual-mount components (legacy fallback during a phased
   migration). Canonical consumers must opt into loud failure.

4. **Verify the provider actually mounts for your game_type**
   In `src/pages/Game.tsx`, confirm:
   - `shellCanonicalFamily = isCanonicalShellFamily(game.game_type)`
     resolves to `true` for your game_type
   - `shellEligibleSeats` is non-undefined for your game_type
   - `shellProjectionMode` flips between `'active-canonical'` and
     `'observer-absolute'` based on viewer seating

5. **Test with all three viewer roles**
   Cold-start each of:
   - active player (seated, viewer is in `playerStates`)
   - observer (not seated, no `currentPlayerId`)
   - reconnect mid-hand
   Confirm chip stacks render, dealer pip lands on the right seat,
   chip-transport endpoints resolve to a real DOM node
   (`document.querySelector('[data-chip-center="N"]')`), and observer
   geometry matches the active 2P face-to-face projection (for
   inherently-2P games).

6. **Add the game_type to `seatAnchors.ts` 2P canonicalization** only
   if it is an inherently-2P game. The two registries
   (`INHERENTLY_TWO_PLAYER_GAME_TYPES` and `CANONICAL_SEAT_CONSUMERS`)
   are independent — a multi-seat poker variant can be a seat
   consumer without being inherently 2P.

7. **Run the shell test suite**
   `bunx vitest run src/lib/canonicalShell` must pass. The registry
   invariant test will fail if step 1 and step 2 diverge.

Anti-patterns (do not do)
-------------------------

- Silently fall back to legacy positioning when `useSeatAnchorsOptional()`
  returns null. The whole point of the canonical shell is single-truth
  geometry; falling back forks the source of truth and re-introduces
  the per-game projection math the shell was supposed to retire.
- Wrap your consumer in its own `<SeatAnchorLayer>`. The shell owns
  the layer; double-mounting it produces stale anchors on the inner
  layer and chip-transport endpoints that resolve to the wrong DOM
  nodes.
- Add a new canonical primitive without a registry. If a new primitive
  needs onboarding the same way seat anchors do, mirror this pattern:
  consumer registry + module-load invariant + strict hook + checklist
  entry.
