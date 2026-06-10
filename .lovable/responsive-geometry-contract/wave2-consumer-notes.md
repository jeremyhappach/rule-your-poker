# Wave 2 — Consumer Notes

## Status

- Wave 2A: **LANDED** — `useCardRowLayout` resolver + 3-5-7 hand row consumer in `PlayerHand.tsx` (gated by `is357Game`).
- Wave 2B: **PENDING** — Gin opponent strip consumer. Do not start until Wave 2A passes its smoke test.

## Wave 2A — what changed

Files:

1. `src/lib/canonicalShell/useCardRowLayout.ts` — pure resolver hook (no DOM, no Wave 1 coupling). Inputs: `availableWidth`, `count`, optional `aspect` / `minCardWidth` / `maxCardWidth` / `maxOverlapRatio`. Returns `{ cardWidth, cardHeight, overlapPx, totalWidth } | null`.
2. `src/lib/canonicalShell/__tests__/useCardRowLayout.test.ts` — pure-math unit tests covering null inputs, single-card clamp, ideal fit, overlap-capped fit, min-clamp saturation, aspect math, and the rank/suit-corner invariant.
3. `src/components/PlayerHand.tsx` — **3-5-7 paths only** (gated by `is357Game === true`). Non-357 paths (Holm, Cribbage, generic poker) are byte-identical to pre-Wave-2A.

## Wiring contract for 3-5-7 consumer

- `availableWidth` is derived from `usePlayGeometry().width * SEAT_SHARE` where `SEAT_SHARE = 0.24` (rough per-seat horizontal allocation around the felt).
- If `usePlayGeometry` is not yet measured (`measured === false`), the resolver receives `availableWidth = 0` and returns `null`. PlayerHand then falls back to its pre-existing Tailwind className ladder — **zero visual change before geometry is ready**.
- Card pixel size + overlap is applied via inline `style` only; existing classNames remain so non-357 paths are untouched.

## Out of scope for Wave 2A (do not touch)

- Game.tsx
- PlayfieldSlotController
- ShellHudGrid
- realtime callbacks / subscriptions / status transitions / lifecycle / routing
- controllers / sync framework / progress vectors
- `usePlayGeometry` and `usePaneGeometry` (Wave 1 primitives stay frozen)
- Gin opponent strip (Wave 2B)
- index.css tokens, Tailwind config, device hooks

## Wave 2A smoke test (manual)

1. Dealer selection completes normally.
2. Game selection completes normally.
3. 3-5-7 launches.
4. Round 1 (3 cards): no clipping, rank/suit legible.
5. Round 2 (5 cards): no clipping, rank/suit legible.
6. Round 3 (7 cards): no clipping, rank/suit legible.
7. Observer can join.

Success: no gameplay lifecycle regressions, no freezes, no overlap/clipping, cards remain maximally sized while preserving readability.

## Wave 2B plan (held)

- Only after Wave 2A passes.
- Scope: Gin opponent strip render site only.
- No additional infra files beyond what the Gin render site requires.
- Separate smoke: Gin launch, draw, discard, knock, observer.
