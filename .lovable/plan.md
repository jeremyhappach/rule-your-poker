# Phase 7 — Neutral interstitial + null slot between dealer games

Phase 6 shipped the slot identity contract (`PlayfieldSlotIdentity`, `useSlotIdentityTracker`, `NeutralInterstitial`) in observe-only mode. The tracker logs an INV-shell-3 warning today on every dealer-game rollover because the current flow swaps `identity → identity` directly. Phase 7 is the first phase that *acts* on slot identity: it makes the rollover explicitly pass through `null`, and it mounts `NeutralInterstitial` as the canonical "between games" surface owned by the shell.

This is the first visibly behavioral shell phase, so it ships behind a runtime flag and preserves a one-line revert.

## 1. Architectural objective

- Persistent `PersistentTableShell` continues to own DOM identity across dealer-game boundaries (INV-shell-1 unchanged).
- The **gameplay slot** *inside* the shell becomes a first-class controlled mount point that explicitly enters identity `null` between two non-null identities.
- `NeutralInterstitial` is the canonical render of the null slot. It is owned by the shell (not by `Game.tsx` lifecycle branches, not by any overlay, not by `MobileGameTable`).
- The two existing non-null states (active gameplay surface vs. neutral) are mutually exclusive. The shell decides which is mounted from a single source — the `PlayfieldSlotController` (new, internal to shell).
- INV-shell-3 stops firing as a warning and becomes an enforced contract in dev (still observe-only in prod).

The point of Phase 7: make "between games" a real, owned, single-source UI state instead of a coincidental gap between lifecycle branches.

## 2. Files / ownership boundaries

**New files (additive):**

1. `src/lib/canonicalShell/PlayfieldSlotController.tsx`
   - React component owned by `PersistentTableShell`.
   - Props: `{ desiredIdentity: PlayfieldSlotIdentity, interstitialDwellMs: number, children: ReactNode }` where `children` is the active gameplay slot (`<MobileGameTable …/>` tree as composed by `Game.tsx`).
   - Internal state machine with four states: `active(identity)`, `tearing-down`, `neutral`, `mounting(nextIdentity)`. Drives:
     - On `desiredIdentity` change to a different non-null identity: unmount `children` immediately, enter `neutral` and mount `<NeutralInterstitial reason="dealer-game-rollover" />`, hold for `interstitialDwellMs`, then mount the new `children` (whose key is bound to the new identity by the caller).
     - On `desiredIdentity → null` (session end, pre-start, reload-in-flight): enter `neutral` indefinitely.
     - On `null → identity`: mount `children` directly (no neutral needed on cold entry; that case is already null at start).
   - Uses `useSlotIdentityTracker` internally so all telemetry continues to come from one source.

2. `src/lib/canonicalShell/slotChoreography.ts`
   - Pure timing constants + helper. Single export:
     ```ts
     export const SLOT_CHOREOGRAPHY = {
       interstitialDwellMs: 450,    // visible neutral hold
       teardownGraceMs: 0,          // synchronous unmount in Phase 7 — see §4 precondition
       mountStaggerMs: 0,           // synchronous mount in Phase 7
     } as const;
     ```
   - Centralizes the numbers so Phase 8 (transition choreography) can tune without touching the controller.

3. Tests:
   - `PlayfieldSlotController.test.tsx` — verifies identity→identity rolls through neutral with correct dwell; null→identity is direct; identity→null holds neutral; children key change is honored; INV-shell-3 no longer fires.
   - `slotChoreography.test.ts` — sanity guard that constants are exported and within sane bounds (>0, <2000 ms).

**Modified files (two, narrow):**

4. `src/lib/canonicalShell/PersistentTableShell.tsx`
   - Add optional `slotIdentity?: PlayfieldSlotIdentity` prop.
   - When provided **and** the Phase 7 runtime flag is on, wrap `children` in `<PlayfieldSlotController desiredIdentity={slotIdentity} interstitialDwellMs={SLOT_CHOREOGRAPHY.interstitialDwellMs}>{children}</PlayfieldSlotController>`.
   - When not provided or flag off: render `children` exactly as today (Phase 6 behavior). No telemetry change in that branch.

5. `src/pages/Game.tsx`
   - **Single new prop** at the existing Phase 5 outer-shell mount: `slotIdentity={game?.game_type && game?.current_game_uuid ? { gameType: game.game_type, dealerGameId: game.current_game_uuid } : null}`.
   - **No restructuring** of lifecycle branches. `MobileGameTable` continues to mount inside the same children expression, so the controller's `children` is the gameplay slot.
   - The existing `useSlotIdentityTracker` call from Phase 6 stays, but its `enabled` flag flips to **false when Phase 7 is on**, because the controller now owns identity tracking. (Single source of telemetry.)

That is the full surface change.

## 3. Runtime flag

New flag: `VITE_CANONICAL_SLOT_NEUTRAL` (`'on' | 'off'`, default `'off'` in Phase 7 ship; flipped to `'on'` after live verification).

- `'off'` → controller is not introduced; `PersistentTableShell` renders children directly (current Phase 6 behavior, INV-shell-3 still logs as warning).
- `'on'` → controller drives slot mount/unmount; INV-shell-3 stops firing because transitions pass through `null`.

The Phase 5 `VITE_CANONICAL_SHELL_LIFT='off'` escape hatch still short-circuits everything above (including Phase 7), giving two-layer revert.

## 4. Transition choreography (Phase 7 contract)

```text
desiredIdentity:    A           A           B           B
                    │           │           │           │
                    ▼           ▼           ▼           ▼
controller state: active(A) → tearing-down → neutral(dwell 450ms) → mounting(B) → active(B)
slot DOM:         <Game A/>     (unmounted)   <NeutralInterstitial/>   (unmounted)   <Game B/>
shell DOM:        ─── stable across the entire sequence ───────────────────────────────
overlays:         ─── Celebration / Settlement / Config remain mounted independently ──
```

- **Prior game teardown timing:** synchronous unmount of `<Game A>` at the moment `desiredIdentity` changes. No fade.
- **Interstitial dwell:** fixed 450 ms (`SLOT_CHOREOGRAPHY.interstitialDwellMs`). Long enough to be visually intentional, short enough to feel like a transition, not a loading state. Adjustable in Phase 8.
- **Next game mount timing:** synchronous after dwell. The new game subtree mounts with a `key` derived from the new identity, guaranteeing fresh lifecycle.
- **Cold start (null → identity):** no dwell, no neutral mount. The first identity arrival is a direct mount. Rationale: shell is already "neutral" visually before any game exists.
- **Session end (identity → null):** controller stays in `neutral` indefinitely; existing session-end overlays continue to render above the shell as today (no overlay restructure in this phase).

### Teardown timing precondition (no snap-cut of end-of-game closure)

By construction, `desiredIdentity` is derived from `game.current_game_uuid`, which only flips when a new `dealer_games` row is created by `DealerGameSetup`. That creation only runs **after** the prior dealer game has reached `game_over` and the session has progressed through dealer selection / config — i.e. after all end-of-game closure on the prior game (Holm payouts, 3-5-7 leg collection, SCC settlement, winner reveal) has completed.

End-of-game closure surfaces (Celebration, Settlement, payout animations) are **overlays**, not contents of the gameplay slot. Phase 7 does not move them. They survive the slot transition independently and are not affected by the synchronous teardown.

Therefore the synchronous slot teardown in Phase 7 is, by upstream invariant, never a snap-cut of an in-progress closure animation.

**Future-phase rule:** if any later phase moves a closure animation **into** the gameplay slot, that phase must also raise `SLOT_CHOREOGRAPHY.teardownGraceMs` above 0 and gate the controller's `active → tearing-down` transition on completion of that animation. Phase 7 leaves the constant at 0 because nothing in the slot today needs grace.

## 5. Overlay ownership boundaries (unchanged in Phase 7)

Overlays remain owned where they are today (Celebration, Settlement, Config, Ante, DealerSelection, sit-out, etc.). Phase 7 makes only the **gameplay slot** owned by the shell. Overlay consolidation is explicitly deferred to a later phase.

INV-shell-4 (overlay ordering) is unchanged — no overlay z-index or lifecycle wiring is touched.

## 6. Device responsiveness

- `NeutralInterstitial` already uses a semantic `bg-background` token and fills its parent. It inherits the shell's responsive geometry — no new tokens, no breakpoints, no media queries added.
- Dwell timing is fixed across viewports for Phase 7. If reduced-motion users surface a complaint, Phase 8 can read `prefers-reduced-motion` and drop dwell to 0 ms. Out of scope here.
- Manual regression on phone (475×673), tablet, and desktop viewports must show identical structural behavior; only the mount swap timing should be observably different.

## 7. Observer behavior during interstitial

- Observers see `NeutralInterstitial` mount for the same dwell as seated players. The shell is unchanged, so seat anchor layers and chat overlay continue rendering above the slot (slot is just a mount point inside the shell, not the whole shell).
- The observer's own viewState gating already filters them out of gameplay actions, so there is no eligibility change.
- INV-no-observer-acknowledgment is preserved: progression does not wait on the observer to "finish" the interstitial; dwell is local-only timing, not a sync barrier.

## 8. Join/rejoin affordance interaction rules

- The (out-of-scope) observer mid-game rejoin affordance, when it ships, will live in the seat anchor layer (a shell-owned surface that is **outside** the gameplay slot). Therefore:
  - During the neutral window, the seat map is still mounted, so a future + affordance would remain clickable.
  - Phase 7 must not put any opaque full-bleed surface over the seat anchor layer. `NeutralInterstitial` already renders inside the gameplay-slot region, not as a viewport-wide overlay, so this requirement is met by construction. The test plan verifies this with a DOM containment assertion.

No code is added in Phase 7 for the rejoin affordance itself.

## 9. Telemetry & invariants

- Single source of `slot-identity-changed`: `PlayfieldSlotController` (it owns the `useSlotIdentityTracker` invocation when the flag is on). The `Game.tsx`-level tracker is disabled in that mode to avoid duplicate events.
- `slot-entered-neutral` / `slot-left-neutral` now fire from production code for the first time. Payload `reason` distinguishes:
  - `"dealer-game-rollover"`
  - `"session-end"`
  - `"pre-session"` (only if we end up holding neutral before the first identity; in Phase 7 we expect this not to fire because cold start is a direct mount)
- INV-shell-3: must stop reporting warnings during normal rollovers when the flag is on. Test asserts zero `checkInvariant(..., 'slot-transition-without-neutral', false, …)` calls across a simulated A→B rollover.
- No new event names beyond those already in `ShellLifecycleEvent`. No new persisted columns.

## 10. Acceptance criteria

- All Phase 6 tests still pass.
- New Phase 7 tests pass: controller drives correct mount sequence, dwell respected, key-on-identity works, INV-shell-3 quiet under flag-on.
- Build clean, no new TypeScript errors.
- Live regression on phone + tablet, poker-variant session:
  - Flag **off**: identical to Phase 6 — INV-shell-3 warning still appears on rollover (as it does today).
  - Flag **on**: visible brief neutral interstitial between dealer games; no INV-shell-3 warning; chip/score state of the *new* game is correct on mount; reconnect mid-rollover lands cleanly in either neutral or the new game (not the old one); no snap-cut of end-of-game payout/settlement animations.
- Non-poker-variant session (Cribbage / Gin Rummy) routed through the same shell path: behaves identically to Phase 6 with flag on or off — Phase 7 does not change those families because the controller is only invoked when `slotIdentity` is provided, and we gate that prop on the existing `isPokerVariantFamily` check (same gate as Phase 5/6).
- Zero new console errors.

## 11. Regression plan

Manual, phone viewport first:

1. Cold load → lobby → start game. Confirm direct mount (no neutral flash).
2. Play one hand, roll into hand 2 of the same dealer game. Confirm **no** neutral interstitial (this is a hand boundary, not a dealer-game boundary; identity unchanged).
3. Trigger next dealer game in session. Confirm end-of-game closure (winner / payout / settlement) plays to completion **before** the neutral interstitial appears; then neutral appears for ~450 ms; then new game mounts with fresh state.
4. Reload during step 3's neutral window. Confirm app lands in the new game (or back into neutral if rollover not yet committed server-side), never in the old game.
5. End session. Confirm neutral remains until session-end overlays take over.
6. Toggle `VITE_CANONICAL_SLOT_NEUTRAL='off'`, repeat steps 1–5: must match current Phase 6 behavior including the INV-shell-3 warning at step 3.
7. Toggle `VITE_CANONICAL_SHELL_LIFT='off'`: full bypass, behavior identical to pre-Phase-5.
8. Repeat steps 1–3 on Cribbage and Gin Rummy: no neutral interstitial, no behavior change.

Automated:
- `bunx vitest run src/lib/canonicalShell/` — all green.
- Existing sync-framework, eligibility, and bulk-write-scoping tests untouched and green.

## 12. Test strategy

- **Unit:** `PlayfieldSlotController.test.tsx` — fake timers, drive identity prop changes, assert mount/unmount sequence and telemetry order. Assert children remount with new key on identity B.
- **Invariant:** assert `checkSlotTransition` returns `true` for every transition the controller produces (no warning leaks).
- **Containment:** mount `<PersistentTableShell>` with a fake seat anchor layer + slot identity, assert `NeutralInterstitial` DOM node does **not** contain the seat anchor nodes (i.e. the seat map remains a sibling, not a descendant, so future rejoin affordances stay clickable).
- **Cold-start guard:** assert null→identity does not mount `NeutralInterstitial` (no false "between games" event before the first game starts).
- **Flag-off regression:** assert with flag off, the controller is not introduced and identity tracking still works via the existing `useSlotIdentityTracker` call.

## 13. Out of scope (explicit, per request)

- Observer rejoin affordance implementation
- Chip transport redesign
- Celebration / Settlement redesign
- Gameplay visual restyling
- Participant eligibility authority refactor (highest-priority post-shell item, still backlog)
- Overlay consolidation / lift
- Hand-boundary (intra-dealer-game) transitions
- Variable dwell, fade choreography, motion preferences (deferred to Phase 8)

## 14. Rollback strategy

Three independent layers:

1. `VITE_CANONICAL_SLOT_NEUTRAL='off'` — disables Phase 7 only.
2. `VITE_CANONICAL_SHELL_LIFT='off'` — disables Phase 5/6/7 together.
3. Code revert: remove the one new prop in `Game.tsx` and the controller wrap in `PersistentTableShell.tsx`. The two new modules become dead code, harmless.

No DB migrations, no edge-function changes, no schema changes.

## 15. Risk assessment

**Moderate** — first phase where the shell mutates what the user sees, not just where it sits in the tree. Primary risks:

- **Premature unmount:** if `desiredIdentity` thrashes (briefly null between two valid identities), we could enter neutral spuriously. Mitigation: the controller treats a transient null between two valid identities (within one render tick) as a continuation of the active state; only a sustained null or a different non-null identity triggers the transition. Encoded as a controller test.
- **Reconnect during neutral window:** mid-rollover reload could put a user in neutral with no game to mount. Mitigation: `desiredIdentity` is derived directly from server state, so reconnect re-derives correctly; the controller has no persisted local state.
- **Pre-existing INV-shell-3 noise pre-flag is real, not synthetic.** Flipping the flag silences the warning by *fixing* the underlying flow, not by suppressing the check.
