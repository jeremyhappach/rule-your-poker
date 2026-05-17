# Phase 6 — PlayfieldSlot identity & NeutralInterstitial scaffolding

Phase 5 established the **outer** `PersistentTableShell` as a stable ownership boundary above `Game.tsx`'s lifecycle branches for poker-variant families. Phase 6 introduces the **slot identity contract** that runs *inside* that shell, without yet rewriting any lifecycle branches.

This is intentionally narrow: one architectural concern, one ownership boundary, one new component, and a passive identity-tracking hook. No lifecycle refactor, no overlay consolidation, no chip transport, no sync changes.

## 1. Architectural objective

Establish the formal **PlayfieldSlot identity contract** that future phases will use to swap game surfaces inside the persistent shell:

- A slot has identity `(gameType, dealerGameId)` or `null` (neutral).
- Identity transitions must be observable, validated by `checkSlotTransition` (already exists in `diagnostics.ts`, INV-shell-2 / INV-shell-3), and must pass through `null` between two non-null identities.
- A `NeutralInterstitial` component exists as the canonical "between hands / between dealer games" placeholder. In Phase 6 it is **mounted nowhere by default** — it ships as a tested module ready for Phase 7 wiring.

The point: make slot identity a first-class, observable thing **before** any code tries to swap slots in place.

## 2. Exact files / ownership boundaries being changed

**New files (additive only):**

1. `src/lib/canonicalShell/PlayfieldSlot.ts`
   - Pure types: `PlayfieldSlotIdentity = { gameType: string; dealerGameId: string } | null`.
   - Pure helper: `slotIdentityEquals(a, b)`.
   - Pure helper: `describeSlotIdentity(id)` for telemetry/debug strings.
   - No React, no DOM.

2. `src/lib/canonicalShell/useSlotIdentityTracker.ts`
   - React hook. Inputs: `{ gameId, gameType, dealerGameId }` (any may be null).
   - Tracks previous identity via `useRef`, fires `recordShellEvent('slot-identity-changed', …)` on change, and runs `checkSlotTransition(prev, next, gameId)` to enforce INV-shell-2 / INV-shell-3.
   - **Passive**: returns the current identity; does not gate, suspend, or alter rendering.
   - Safe to mount in observer mode (no-ops cleanly when dealerGameId is null).

3. `src/lib/canonicalShell/NeutralInterstitial.tsx`
   - Minimal presentational component. Renders a transparent placeholder div with `data-canonical-shell-neutral=""`.
   - No styling beyond a single neutral background token from `index.css` (no new tokens introduced).
   - Fires `recordShellEvent('slot-entered-neutral')` on mount and `'slot-left-neutral'` on unmount.
   - **Not mounted by Game.tsx in this phase.** Shipped as a ready, tested module for Phase 7.

4. Tests:
   - `src/lib/canonicalShell/PlayfieldSlot.test.ts` — identity equality + describe.
   - `src/lib/canonicalShell/useSlotIdentityTracker.test.tsx` — verifies telemetry fires once per real transition; verifies illegal in-place identity swap triggers `checkSlotTransition` invariant; verifies null↔identity transitions are clean.
   - `src/lib/canonicalShell/NeutralInterstitial.test.tsx` — DOM attribute + mount/unmount telemetry.

**Modified files (one, minimal):**

5. `src/pages/Game.tsx`
   - Inside the same `enableOuterShell` branch added in Phase 5 (and only there), call `useSlotIdentityTracker({ gameId, gameType: game?.game_type, dealerGameId: game?.dealer_game_id ?? null })` at the same level as the existing outer shell mount.
   - **Single hook call.** No JSX changes. No branch restructuring. No new conditionals. No neutral mount.
   - Guarded by the same `VITE_CANONICAL_SHELL_LIFT !== 'off'` escape hatch as Phase 5 — when disabled, the hook is not called at all.

That is the full surface change in production code: **one hook invocation inside the already-approved Phase 5 boundary.**

## 3. Explicitly UNTOUCHED

- `Game.tsx` lifecycle branch structure (status routing, render trees, prop wiring).
- `MobileGameTable.tsx` (no edits at all).
- Any overlay (Celebration, Settlement, Config, Ante, DealerSelection).
- Sync framework (`useGameStateSync`, progress vectors, identity wiring).
- Chip transport, transition choreography, dealer config flow.
- `PersistentTableShell.tsx` internals (no edits — already authoritative from Phase 5).
- All non-poker-variant families (Cribbage, Gin Rummy, Yahtzee) — `useSlotIdentityTracker` is only invoked behind the same `isPokerVariantFamily` + escape hatch gate as Phase 5.
- Visual design, styling, tokens.
- `NeutralInterstitial` is **not rendered anywhere** by production code in this phase.

## 4. Lifecycle invariants preserved

- **INV-shell-1** (shell never unmounts within a session): unchanged — no edits to shell mount tree.
- **INV-shell-2 / INV-shell-3** (slot identity monotonicity & neutral-passthrough): newly *enforced* by the tracker hook; existing `checkSlotTransition` becomes a live runtime guard for the first time, but in observe-only mode (it logs; it does not mutate state).
- **INV-shell-4** (overlay ordering): untouched (no overlay code changes).
- **INV-shell-5** (projection mode stability): untouched.

The tracker is **passive**: an invariant violation produces a telemetry/console signal but does not throw, gate rendering, or alter game flow. This is deliberate — Phase 6 is about *observing* identity behavior in production before any phase tries to act on it.

## 5. Rollback strategy

Three independent layers of revert:

1. **Runtime escape hatch:** the existing `VITE_CANONICAL_SHELL_LIFT='off'` flag from Phase 5 already short-circuits the entire branch where the new hook is called. Setting it disables Phase 6 entirely with no code change.
2. **Single-call removal:** if the hook itself misbehaves, deleting one line in `Game.tsx` (the `useSlotIdentityTracker(...)` invocation) fully removes Phase 6 from the runtime. The new modules become dead code, harmless.
3. **Module deletion:** the four new files are additive and isolated under `src/lib/canonicalShell/`. Removing them has zero impact on anything outside that directory once the hook call is removed.

No DB migrations, no schema changes, no edge function changes — nothing to roll back server-side.

## 6. Acceptance criteria

- All existing canonical-shell tests pass; new Phase 6 tests pass.
- Build clean, no new TypeScript errors.
- Live regression on phone + tablet:
  - Poker-variant session: lobby → start → dealer selection → active hand → next hand → end. **No visible difference** vs. Phase 5.
  - Non-poker-variant session (Cribbage or Gin Rummy): unchanged behavior, hook never invoked.
- Telemetry in dev sync debug stream:
  - Exactly one `slot-identity-changed` event when the first `dealerGameId` is assigned.
  - One `slot-identity-changed` event per dealer-game rollover, with `prev` and `next` payloads showing a `null` step between non-null identities (when the underlying flow already passes through null) — or, if the current flow does *not* pass through null, an invariant warning surfaces (this is **expected diagnostic value**, not a regression).
- Zero new console errors or runtime exceptions.

## 7. Targeted regression plan

Manual live, in this exact order, on phone viewport (475×673) first then tablet:

1. Cold load → lobby → add bot → **Start Game** (the exact Phase 5 regression repro). Must work identically to Phase 5 post-fix.
2. Play one full hand to completion. Confirm chips, scoring, turn handoff visually identical.
3. Roll into a second hand. Confirm `slot-identity-changed` fires with the new `dealerGameId`.
4. Trigger a dealer-game change (next game in session). Confirm telemetry shows the identity transition; confirm UI continuity (shell DOM node stable per Phase 5 contract).
5. Reload mid-hand. Confirm reconnect path unchanged.
6. Repeat (1)–(2) for one non-poker-variant game (e.g. Cribbage) to confirm the hook is *not* invoked there and behavior is bit-identical.
7. Set `VITE_CANONICAL_SHELL_LIFT='off'` and re-run (1)–(2) on a poker-variant. Confirm Phase 5 + Phase 6 both fully bypassed.

Automated:
- Vitest run of all `src/lib/canonicalShell/**` tests.
- Existing sync-framework tests must remain green (nothing in this phase touches them, but we verify).

## 8. Telemetry additions

All events go through the existing `recordShellEvent` funnel (already persisted to `debug_sync_events` and console in dev). No new event names beyond those already declared in `ShellLifecycleEvent`:

- `slot-identity-changed` — payload: `{ prev: PlayfieldSlotIdentity, next: PlayfieldSlotIdentity, gameId, gameType, dealerGameId }`.
- `slot-entered-neutral` / `slot-left-neutral` — only emitted if Phase 7 mounts `NeutralInterstitial`; in Phase 6, never emitted by production code (only by tests).

Invariant violations from `checkSlotTransition` already flow through `checkInvariant` → existing debug stream. No new infrastructure.

## 9. Expected user-visible behavior changes

**None.**

Phase 6 is observe-only. The hook does not render, does not gate, does not delay, does not animate. If a user notices any visible difference between Phase 5 and Phase 6, that is a bug.

---

## Risk assessment

**Low-to-moderate.** The production surface area is one hook call inside an already-validated branch. The largest realistic risk is that `checkSlotTransition` surfaces a pre-existing latent invariant violation in the current dealer-game-rollover flow — which is *diagnostically valuable* but could be noisy. Mitigation: the check logs/warns but does not throw, and the escape hatch fully disables the hook.

Awaiting approval before implementation.
