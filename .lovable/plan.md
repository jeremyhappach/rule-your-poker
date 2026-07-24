# Slice 2 — Minimal 3-5-7 Prelude Controller

## Charter (narrow, non-negotiable)

The controller owns ONLY what is unique to 3-5-7, then returns control to the
existing canonical terminal presentation. We are NOT building a second
settlement pipeline.

```text
3-5-7 prelude  (this controller)
      ↓
existing canonical terminal presentation  (unchanged, unowned)
```

### Controller owns

1. Consume the immutable `Terminal357Descriptor`.
2. Persistent announcement plate (text from descriptor; no TTL).
3. Source-specific prelude:
   - `normal-win`  → existing `LegEarnedAnimation(isWinningLeg=true)` unchanged.
   - `instant-357` → `ThreeFiveSevenProofCardsAnimation` from `descriptor.proofCards`.
4. Optional `SweepTheLegsAnimation` iff `descriptor.hadAuthoritativeLegs === true`.
5. Emit `preludeComplete(terminalGenerationId)` exactly once, then stop.

### Controller does NOT own

Pot transfer, confetti, settlement timing, completion callback, dealer-game
advancement, announcement dismissal, safety timers, retries. Any requirement
starting with "start pot here / wait for bounce / advance after X" belongs to
the canonical pipeline and MUST be reused, not restated.

## Existing prelude→canonical seam (attach here, do NOT invent a new one)

Located in `src/components/MobileGameTable.tsx` inside the
`LegEarnedAnimation.onComplete` callback (~L9943–L10044). For a
non-Holm 3-5-7 winning leg it currently performs exactly the canonical
handoff we need to reuse:

- If terminal result is a `357_SWEEP:*` sentinel:
  arm `sweepAwaitingCelebrationRef` (with full identity), set
  `threeFiveSevenPotHiddenUntilReset`, emit sweep-wait diagnostics, and let the
  existing celebration→pot→completion pipeline take over.
- Otherwise (final-leg win with legs to sweep visually):
  set `threeFiveSevenWinPhase = 'legs-to-player'`, stamp
  `legsToPlayerTriggerId`, and let the existing `LegsToPlayerAnimation` →
  `PotToPlayerAnimation` → `handlePotToPlayerComplete357` chain run unchanged.

**This is the seam.** Slice 2 extracts the body of that callback into a single
internal helper `enterCanonical357TerminalPresentation(descriptor)` on
`MobileGameTable` (no new prop shapes on canonical components; no new exported
API). Both the legacy `LegEarnedAnimation.onComplete` path AND the new
controller's `preludeComplete` call the SAME helper. Behavior of the helper is
byte-identical to today's inline callback.

If, during implementation, the extraction reveals hidden coupling to the
legacy `showLegEarned`/`isWinningLegAnimation` closure state that would force
semantic changes, STOP and report before proceeding.

## Exclusive prelude ownership (instant-357 only)

While a live descriptor has `source === 'instant-357'`, legacy instant-win
prelude code in `MobileGameTable` MUST NOT:

- mount its own announcement plate
- mount its own proof-card overlay
- mount its own `SweepTheLegsAnimation`
- arm prelude timers / prelude-only refs
- fire prelude-arming callbacks

Enforcement: a single guard `controllerOwnsInstant357Prelude(descriptor)`
gates the legacy instant-win prelude entry points. When true they return
early and emit `357.terminal.controller.legacy_prelude_suppressed` with the
caller anchor + `terminalGenerationId`.

Everything downstream of the prelude (pot / confetti / completion /
advancement) is untouched. Normal-win prelude is NOT migrated in this slice.

## Identity discipline

- All controller work keyed on `descriptor.terminalGenerationId`.
- Same-generation re-renders are no-ops.
- Generation change resets ONLY internal prelude state.
- Game.tsx retains descriptor lifetime ownership (Slice 1, unchanged).

## Instrumentation (prelude scope only)

- `357.terminal.controller.prelude_begin`
- `357.terminal.controller.prelude_step`
- `357.terminal.controller.prelude_complete`
- `357.terminal.controller.legacy_prelude_suppressed`

Tagged with `terminalGenerationId`, `source`, `hadAuthoritativeLegs`, winner
identity. NO instrumentation added downstream of `preludeComplete`.

## Files touched

- `src/components/ThreeFiveSevenTerminalController.tsx`
  Implement 3-step prelude state machine keyed on `terminalGenerationId`.
  Renders `LifecycleAnnouncement` + (LegEarned XOR ProofCards) + optional
  SweepTheLegs. Emits `onPreludeComplete` once per generation.
- `src/components/MobileGameTable.tsx`
  1. Extract `enterCanonical357TerminalPresentation(...)` helper from the
     existing `LegEarnedAnimation.onComplete` body. Both legacy path AND
     controller call it.
  2. Add `controllerOwnsInstant357Prelude(descriptor)` guard on the legacy
     instant-357 prelude entry points only.
  3. Wire `onPreludeComplete` from the mounted controller into the helper.

## Explicit non-goals (future slices)

- Physical deletion of the suppressed legacy instant-win prelude.
- Migrating normal-win prelude into the controller.
- Any change to canonical pot / confetti / completion / advancement.

## Deliverables

1. Controller implemented per charter.
2. Legacy instant-357 prelude suppressed; normal-win prelude untouched.
3. Existing canonical transition reused via helper extraction.
4. `bunx tsgo --noEmit` clean.
5. Stop for smoke. Do not begin cleanup or normal-win migration.

## Stopping here for approval

The seam is real and located above. Please confirm that extracting the
`LegEarnedAnimation.onComplete` body into
`enterCanonical357TerminalPresentation` — used by both the legacy normal-win
path and the new controller's `preludeComplete` — is the correct attachment,
and I'll implement the slice.
