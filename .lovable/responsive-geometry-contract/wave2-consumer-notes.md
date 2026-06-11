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

## Wave 2A polish landed (post-smoke)

1. **Card face fill (styling pass)** — `PlayingCard` accepts an optional
   `faceFillPx` prop. When set, the face renders with the legacy
   stacked layout (rank top, suit bottom, `justify-between`, ~zero
   padding) and inline font-size derived from `faceFillPx`
   (`rank ≈ 0.62w`, `suit ≈ 0.70w`). `PlayerHand` passes the resolver's
   `cardWidth` through for every 3-5-7 face-up card on the dynamic
   path. Non-357 / hidden / unused-card paths are byte-identical.
2. **Action-strip exclusion zone (contract-owned)** —
   `useCardRowLayout` gains an optional `availableHeight` input that
   clamps `cardHeight` to a vertical budget, and the contract now
   exports `ACTION_STRIP_RESERVE_PX = { compact: 44, comfortable: 68 }`
   as the single source of truth for the Drop / Stay / STAYED-badge
   strip height. `PlayerHand` accepts `availableHeightPx`; the 3-5-7
   call sites in `MobileGameTable` derive it as
   `handReserveNum / handScaleNum − 4px` (rotation slack) so the
   resolver never spends space that belongs to the action-strip
   sibling. No magic margins, no game-specific nudges.

## Wave 2B plan (held)

- Only after Wave 2A passes.
- Scope: Gin opponent strip render site only.
- No additional infra files beyond what the Gin render site requires.
- Separate smoke: Gin launch, draw, discard, knock, observer.

## Item 3 — 3-5-7 chipstack ownership (investigation only, no fix)

Question: why does the chipstack visual change between "Awaiting Ante
Decisions" and active 3-5-7 gameplay?

Attribution (`src/components/MobileGameTable.tsx`, around the
`players.map` block ~L6691–6779):

- **Canonical owner (pre-session + ante_decision)** —
  `CanonicalSeatCluster` rendered directly with `chipValue={chipText}`
  and `ownerLabel="Slot:MobileGameTable.preSessionPill"`. Gated by
  `isPreSessionPhase`, where `PRE_SESSION_STATUSES` explicitly
  includes `'ante_decision'`. Same primitive that
  `CanonicalShellWaitingSurface` uses, palette via
  `derivePlayerStatus`.
- **Legacy owner (active gameplay)** — outer
  `CanonicalSeatCluster` with `hideChipBubble` and
  `ownerLabel="Slot:MobileGameTable.gameplayChipWrapper"` wraps the
  bespoke `renderPlayerChip(player, slot)` element. The cluster
  contributes positioning / projection only; the visible chip glyph
  comes from `renderPlayerChip` (turn-pulse ring, dealer pip, leg
  pips, auto-roll, emoticons, `ValueChangeFlash`, exposed showdown
  cards all live there).

Why ownership switches: the JSX has two mutually exclusive branches
inside the same `players.map`, and the predicate is `isPreSessionPhase`
(membership in `PRE_SESSION_STATUSES`). The instant
`gameStatus` transitions out of `ante_decision` into
`in_progress` / `dealing` / etc., the pre-session branch returns and
the legacy `renderPlayerChip` branch takes over. The inline comment
above the gameplay branch (~L6685–6690) acknowledges this is
deliberate and temporary: *"chip visuals/decorators … remain owned by
`renderPlayerChip` until the follow-up styling-unification PR."*

Canonical owner = `CanonicalSeatCluster` (chip pill rendered through
the same primitive as the waiting surface).
Legacy owner = `renderPlayerChip` inside `MobileGameTable`, wrapped by
a `hideChipBubble` cluster.

**Status:** tracked separately from Wave 2A geometry. No code change
in this pass.
