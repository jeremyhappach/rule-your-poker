# Canonical Persistent Table — Phase 0 + Phase 1 (APPROVED, IN PROGRESS)

## Status

- **Phase 0 (telemetry + invariants)** — landed.
- **Phase 1 (SeatAnchorLayer extraction)** — pure module + React provider + tests landed. NOT yet wired into `MobileGameTable.tsx`. That wiring is a follow-up patch (still Phase 1) gated on visual-regression review.

## Approved corrections folded in

- 2-player active gameplay face-to-face canonicalization is **part of the canonical contract from day one**, not gated/deferred. Observer mode remains literal absolute.
- NeutralInterstitial must never feel like a dead blank table — continuity of visual ownership is maintained through overlay sequencing (Celebration → Settlement → Neutral overlay → Config overlay), with the prior body unmounting only after its own resolution completes.

## Files added (Phase 0 + 1)

- `src/lib/canonicalShell/diagnostics.ts` — `recordShellEvent`, `checkSlotTransition`, `checkProjectionMode`. Persistence is lazy-loaded so the module is safe in pure Node test environments.
- `src/lib/canonicalShell/seatAnchors.ts` — pure resolver. Projection modes: `observer-absolute`, `active-canonical`. Slot vocabulary: `HOME=-1`, `FACE_TO_FACE=-2`, perimeter `0..5`. 2P canonicalization built into `resolveSeatAnchors`.
- `src/lib/canonicalShell/SeatAnchorLayer.tsx` — React provider + `useSeatAnchors` / `useSeatAnchorsOptional` hooks. Memoized on a stable seat-key string.
- `src/lib/canonicalShell/seatAnchors.test.ts` — 9 tests covering observer mapping, active rotation, clockwise distance, 2P canonicalization (positive + negative cases), hidden seats.

## Verified

- `bunx vitest run src/lib/canonicalShell/seatAnchors.test.ts` → 9/9 passing.
- No changes to `MobileGameTable.tsx`, `Game.tsx`, sync framework, server enforcement, or any game body. Zero visual regression risk.

## Next slice (Phase 1 wiring — pending approval)

Adopt `SeatAnchorLayer` inside `MobileGameTable.tsx` by replacing `getObserverSlotFromPosition` and the inline active-mode `getClockwiseDistance` calls with `useSeatAnchors()`. Initial wiring keeps existing per-seat rendering byte-identical except for 2P active-mode where the new FACE_TO_FACE slot will need a renderer anchor (top-center). That renderer anchor is a small, contained MobileGameTable edit.

After that, Phase 2 (ActivePlayerHUD + ChatBubbleOverlay extraction).
