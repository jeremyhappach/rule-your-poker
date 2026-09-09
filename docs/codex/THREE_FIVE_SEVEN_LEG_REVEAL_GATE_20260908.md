# 3-5-7 leg-charge reveal gate — September 8, 2026

Status: Approved correction implemented. Production acceptance remains pending.
Release checkpoint tag: `357-leg-reveal-gate-20260908`.

## Incident and owner boundary

Jeremy reported that mcru81's -$2 leg-charge helper appeared before the
3-2-1-Drop animation finished in the September 8 real-money session. The exact
hand for this example is not independently identified. This is separate from
the terminal skip corrected in `7b925b886858c370716b9b2ef7b568e931615b87`.

The source boundary is confirmed: `MobileGameTable.tsx`'s 3-5-7 financial
admission handled tax/re-ante, showdown payments, sweep credit and pot flight,
but let `reason: 'leg'` fall through to `true`. The canonical ledger immediately
finishes a zero-flight leg batch, publishes its closing player balance and emits
the signed residual. The shell's sole `ChipPresentationDeltaRuntime` paints that
event. This is not the unused legacy chip indicator or a settlement defect.

## Correction and preserve list

`financialPresentation.ts` now admits leg charges only through a completed,
exact-identity reveal receipt. Its cursor upper bound comes from the accepted
atomic 3-5-7 view, not the incoming batch. The matching game, dealer game, round,
hand and round number must have a completed round and a server-adjusted reveal
clock past the entire DROP/hold window. Missing clocks fail closed.

`MobileGameTable.tsx` builds that receipt from its existing accepted-view props
and registers the gate with the existing canonical ledger admission owner.
Completed receipts retain their cursor through a successor round within the
same dealer game. They can release a late older charge but cannot admit a newer
cursor before that newer round's reveal. Game/dealer changes clear the receipt.
Admission changes wake the existing queue; no additional timer or polling is
introduced.

The ledger retains the displayed opening balance and emits the signed helper
only once when admitted. Its shared implementation and renderer are unchanged.
Final-leg charges may precede the terminal frame's latest cursor because sweep
credit and the pot award follow in the same settlement; those later batches
remain owned by their existing separate terminal-stage gates.

No database migration, historical mutation, balance repair, game-rule change,
dependency change, or production synthetic session is part of this correction.
Cold-entry history continues to reconcile without replaying old helpers.

## Validation and production acceptance

- 209 focused 3-5-7 / ledger / terminal checks passed.
- New boundary tests cover countdown, DROP, hold, exact expiration, missing
  clock/frame, mismatched identities, invalid cursors, newer/older cursors,
  identity resets and unaffected batch reasons.
- Mounted canonical ledger tests cover batch-first and frame-first delivery,
  held visible balance and absent delta events before expiry, one -$2 release,
  duplicates, cold historical entry, and final leg -> sweep credit -> pot flight.
- Full validation passed: typecheck, 1,529 application tests across 227 files,
  66 harness tests and the production build. One independent read-only review
  found no blockers. Existing build chunk-size/import warnings remain unchanged.

Jeremy's smoke remains acceptance truth: both players reload from the lobby,
play a Stay/Fold leg award, and verify neither the signed helper nor the displayed
balance changes before full 3-2-1-Drop finishes. Confirm the helper appears once
afterward. On a winning leg, also confirm final leg -> Sweep the Legs -> pot to
winner -> next-game setup, preserving the P0 correction.
