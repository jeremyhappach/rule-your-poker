# Cribbage scoring sequence — November 14, 2026

Jeremy reported delayed scoring callouts and a final six-point trip-7 burst
after the old hand disappeared and the successor began dealing. The approved
correction is presentation-only; no RPC, rule, score, settlement, migration or
historical-state change is included.

## Failure boundaries

- Counting highlighted each combo for 2,000 ms, but separately queued its rail
  notice for 2,500 ms. Clearing the highlight did not retire that notice.
- Forward round identity reset the counting snapshot immediately, independently
  of the local scoring sequence. The later release of retained score overrides
  could then sound an old score difference under the successor's identity.
- The isolated pegboard reproduction produced six audible points under hand 2
  after carrying hand 1's score override into that identity and clearing it.
  This establishes the code failure path, not a database reconstruction of the
  exact production hand. The actual six-click recording lasts 570 ms.

## Correction and preserved ownership

Each scoring beat replaces only its hand's canonical rail notice. Combo and
zero notices remain until their highlight/beat retires; the Total retains its
existing canonical hold. A winning combo retains its callout with its cards.
The beat duration includes the full selected sound tail, including when muted.

An already mounted count may finish behind a forward hand within the same
session/dealer game. It retains its original cards, score, announcement identity
and clock. The successor's deal stays unmounted until that count completes.
Authority continues accepting newer state. Old `CountingTime.current()` stays
false, so retained presentation cannot persist progress or complete the new hand.
Finishing an already released hand retires local presentation without an RPC.
Pause, interruption, reconnect, equal-hand replacement and dealer-game changes
retain the prior recovery/invalidation rules; no historical sound is replayed.
Pegboard audio silently rebases when its counting/audio suppression ends.

No shared announcement priority, audio mixer, waveform, cadence, geometry,
settlement, zero-client recovery or server release policy changes.

## Validation

- 44 focused checks cover counting/rejoin, exact award audio, mute, pause,
  clock invalidation, silent score reconciliation, actual canonical rail timing,
  actual table retention and absence of a stale completion RPC.
- Native Edge/Web Audio presents three consecutive fifteens and final trip 7s
  using the real counting component, canonical rail and pegboard. The successor
  frame arrives before the final combo. All four notices match the highlights
  at cue start; all twelve clicks finish before the old hand exits, and handoff
  adds no sound. This uses isolated authoritative-shaped frames, not production
  gameplay/database mutations.
- Reproduction: `node dev/sound-lab/verify-scoring-sequence.mjs`, with the sound
  lab Vite config served on loopback port 4345. Ignored evidence and screenshot:
  `qualification.local/cribbage-scoring-sequence/`.
- `npm run build` passes typecheck, 580 application test files / 4,243 tests,
  241 harness tests, 46 release-tooling tests, Vite and the static-size gate
  (89,964,147 bytes, below 90 MB).

Owner acceptance remains a fresh production/PWA count, especially a final
multi-point crib combination: callout and highlight appear together, all clicks
finish over the same hand, then Total/exit/next deal follow. Also check an ordinary
pegging score, winning combination, muted count and reconnect during counting.
Checkpoint: `cribbage-scoring-sequence-20261114`.
