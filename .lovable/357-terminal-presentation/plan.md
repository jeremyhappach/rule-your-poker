# 3-5-7 Terminal Presentation Normalization

Status: **DRAFT — awaiting approval before code changes.**

## 1. Contract (from user)

One normalized terminal-presentation owner in `Game.tsx`. Distinct source-specific preludes hand off to a **shared terminal path** — never a bespoke instant-win pipeline.

### Normal-win prelude
- Persistent announcement: `<Winner> won with <target> legs!`
- Announcement + existing dramatic final-leg animation start simultaneously.
- Prelude completes when the final-leg animation settles.

### Instant 3-5-7 prelude
- Persistent announcement: `<Winner> sweeps the pot and legs with 3-5-7!`
- **No** winning-leg award animation. **No** positive leg delta.
- The winner's three cards animate from their hand to a tabled/proof position on the felt: lift + enlarge → settle face-up → visible to all players.
- Prelude completes when the three proof cards finish settling.
- Proof cards remain tabled and geometrically stable until the shared sequence ends.

### Shared terminal path (entered after prelude completes)
- Announcement stays visible for the entire sequence.
- If any player has authoritative legs at terminal detection → play existing `SweepTheLegsAnimation`.
- Otherwise skip straight to transfer.
- On Sweep-the-Legs complete (or immediately if skipped): start normal pot-to-player transfer + winner confetti simultaneously.
- Uses the existing normal-win destination, bounce, completion, and dealer-game advancement owners.
- Announcement is removed only when the shared win sequence completes or the old dealer-game surface unmounts.

### Prohibited
- Do not rewrite the instant result as a traditional three-leg win.
- Do not change DB-visible settlement strings (`357_SWEEP:...` stays).
- Do not use the raw `357_SWEEP:` detection effect as the direct pot trigger.
- Do not retain a separate instant-win pot, confetti, geometry, or progression owner.

## 2. Owners to retire (bespoke instant-win path)

| Owner | Location | Retire action |
|---|---|---|
| `SweepsPotAnimation` component mount | `MobileGameTable.tsx` render + `SweepsPotAnimation.tsx` | Remove mount. File kept in tree, no consumers. |
| `showSweepsPot` state | `MobileGameTable.tsx` | Remove state + all setters. |
| `sweepAwaitingCelebrationRef` + release effect | `MobileGameTable.tsx` (~7280–7300, ~7657–7712) | Delete arm sites + release effect. Shared path advances directly. |
| `sweep-wait-armed` / `cross_dealer_game_cancelled` boundary watch | `MobileGameTable.tsx` | Delete — no bespoke ref to cancel. |
| `LegEarnedAnimation` sweep branch (primary + fallback) | `MobileGameTable.tsx` ~9948, ~7228 | Source-gate LegEarnedAnimation OFF for `lastRoundResult.startsWith('357_SWEEP:')`. Fallback trigger's `!legAnimationActiveRef.current` force-set is gated off for sweeps. |
| `hadLegsBeforeSweepRef` | `MobileGameTable.tsx` | Replaced by `anyAuthoritativeLegsAtTerminal` derived at the shared-path decision point. |
| `sweepCelebrationCompleted` state | `MobileGameTable.tsx` | Remove. |

## 3. New owner: `ThreeFiveSevenTerminalController` (in `Game.tsx`)

Single component that owns the terminal presentation descriptor:

```ts
type TerminalDescriptor = {
  source: 'normal-win' | 'instant-357';
  winnerId: string;
  winnerName: string;
  targetLegs: number;              // normal-win only
  proofCards: PlayingCard[] | null;// instant-357 only (3-5-7 ranks)
  hadAuthoritativeLegs: boolean;   // computed at detection, immutable
  dealerGameId: string;
  handContextId: string;
  terminalResultIdentity: string;  // lastRoundResult
};
```

State machine:

```
detected
  → prelude-running   (normal: final-leg animation | instant: proof-cards animation)
  → sweep-legs        (if hadAuthoritativeLegs) OR skip
  → pot-to-player     (existing owner + confetti simultaneously)
  → advancement       (existing handGameOverComplete)
  → unmount
```

The announcement plate is rendered by this controller — persistent for the entire lifecycle, torn down on transition to `unmount`.

## 4. New animation: `ThreeFiveSevenProofCardsAnimation`

Fresh component (new file). Not a chip transport → not blocked by the P8.1 freeze.

- Reads three source card DOM anchors (winner's hand, `[data-card-anchor="hand-<winnerId>"]` fan positions of the 3, 5, 7 ranks).
- Reads three destination anchors on the felt center (new: `[data-357-proof-slot="0|1|2"]` rendered by the controller on the felt when descriptor.source === 'instant-357').
- Two-stage keyframes: lift + scale up (~1.4x) with slight rotation → settle to destination at scale 1.05, face-up.
- Duration: 900ms lift, 700ms settle. Fires `onComplete` at end.
- Cards remain rendered at destination slots for the remainder of the terminal sequence (portaled at felt-surface z-layer, static after settle).

## 5. Detection normalization (Game.tsx)

Single detection effect keyed on `lastRoundResult` transitions:

- `startsWith('357_SWEEP:')` → build `TerminalDescriptor` with `source: 'instant-357'`. `hadAuthoritativeLegs` snapshotted from live `players[].legs` at detection tick.
- Else if game-over-with-final-leg-winner → `source: 'normal-win'`.

Descriptor is immutable for its lifetime. Identity-scoped to (dealerGameId, handContextId, terminalResultIdentity) so cross-dealer-game and cross-hand re-detection is a no-op.

## 6. Mutual-exclusion predicates (returned per contract)

At source-gate sites in `MobileGameTable.tsx`:

- `LegEarnedAnimation` render: `show = showLegEarned && !(lastRoundResult?.startsWith('357_SWEEP:'))`
- Fallback force-trigger (line 7179): gate on `!lastRoundResult?.startsWith('357_SWEEP:')`
- 3-5-7 sweep-detection effect (line 6136): entire body deleted — replaced by the new descriptor path in Game.tsx.

At Game.tsx controller:
- `descriptor.source === 'normal-win'` renders final-leg prelude, never proof-cards.
- `descriptor.source === 'instant-357'` renders proof-cards prelude, never final-leg.
- Both descriptors converge on the same `sweep-legs` / `pot-to-player` / `advancement` owners — one call per descriptor lifetime, guarded by state-machine transition (not re-fireable).

## 7. Wartime instrumentation

- Retire source-sites: `presentation.lifecycle` for `sweeps_pot`, `sweep_awaiting_celebration_arm`, sweep-wait-release.
- Add source-sites: `terminal.descriptor.built`, `terminal.prelude.started`, `terminal.prelude.completed`, `terminal.shared_path.entered`, `terminal.proof_cards.settled`.
- Update coverage manifest so `targeted_357_root_cause` still resolves.

## 8. Files changed (planned)

| File | Change |
|---|---|
| `src/pages/Game.tsx` | + `ThreeFiveSevenTerminalController` mount + detection effect + descriptor state. |
| `src/components/ThreeFiveSevenTerminalController.tsx` | NEW — state machine + announcement + prelude routing + shared-path entry. |
| `src/components/ThreeFiveSevenProofCardsAnimation.tsx` | NEW — proof-cards lift/settle animation. |
| `src/components/MobileGameTable.tsx` | Retire `SweepsPotAnimation` mount, `showSweepsPot`, `sweepAwaitingCelebrationRef`, sweep-branches in win-fallback + LegEarnedAnimation-onComplete, sweep-detection effect at 6136, `hadLegsBeforeSweepRef`, `sweepCelebrationCompleted`. Source-gate LegEarnedAnimation OFF for sweep results. Expose proof-slot DOM anchors on felt center. |
| `src/lib/threeFiveSeven/wartime/sourceSites.ts` | Retire 4 bespoke sites, add 5 terminal-descriptor sites. |
| `src/lib/threeFiveSeven/wartime/coverage.ts` | Update targeted profile expectations. |
| `src/components/SweepsPotAnimation.tsx` | Untouched (consumer removed; file remains for git-history / P8.1 policy). |
| `src/lib/threeFiveSeven/instantWinLifecycle.ts` | Untouched (backend terminal diagnostics survive). |

## 9. Execution slices (each independently reviewable)

1. **Slice 1 — Controller scaffold.** New `ThreeFiveSevenTerminalController` + descriptor detection in `Game.tsx`. Mount adjacent to existing win-trigger owner. No behavior yet — only descriptor built + logged. Instant-win still runs through old path. Typecheck.
2. **Slice 2 — Proof-cards animation component.** New file, tested in isolation via storybook-style route (no wiring yet). Typecheck.
3. **Slice 3 — Instant-win prelude wired.** Controller renders announcement + proof-cards for `source: 'instant-357'`. Old sweep-detection effect in MobileGameTable becomes a no-op guard when the new controller is present. Old `SweepsPotAnimation` still renders as belt-and-braces. Typecheck.
4. **Slice 4 — Shared terminal path wired.** Controller drives sweep-legs → pot-to-player → advancement for both descriptor sources via existing owners. Announcement lifecycle unified. Typecheck.
5. **Slice 5 — Normal-win prelude wired.** Move normal-win detection into the controller too. Typecheck.
6. **Slice 6 — Retirement.** Delete `SweepsPotAnimation` mount, `sweepAwaitingCelebrationRef`, `hadLegsBeforeSweepRef`, sweep branches in LegEarnedAnimation-onComplete + fallback, and the 6136 sweep-detection effect. Source-gate LegEarnedAnimation off for sweep results. Update wartime source-sites + coverage. Typecheck.

## 10. Open questions before Slice 1

- **Proof-card destination geometry:** three slots on felt center, or one slot per rank overlapping the community-card row? Assume: three horizontal slots centered at 50%/50% with 8% horizontal spacing, positioned above the pot chip stack. Confirm.
- **Announcement plate owner:** reuse `LifecycleAnnouncement` (existing shared plate) portaled at shell overlay slot, or bespoke in-controller? Assume `LifecycleAnnouncement` with `overlay=false` mounted inside the felt content area. Confirm.
- **Normal-win prelude — is the existing final-leg animation the `LegEarnedAnimation` with `isWinningLeg=true`?** If so, prelude-completion is its `onComplete`. Confirm.
