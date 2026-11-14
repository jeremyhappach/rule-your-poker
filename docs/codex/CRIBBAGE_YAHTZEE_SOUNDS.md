# Cribbage and Yahtzee sound polish — November 14, 2026

Requested directly by Jeremy: trace existing sounds, then implement the listed
Cribbage and Yahtzee sound corrections without changing rules or scores.
Baseline: main `c41674e72`. Isolated branch: `codex/cribbage-yahtzee-sounds`;
the original dirty Golf workspace is preserved.

## Assets and event paths

| Behavior | Existing sound | Updated presentation path |
| --- | --- | --- |
| Cut reveal | `flip-soft.wav` | `CribbageAnchoredCribCutMount` carries live uncut-hand admission into `CribbageCutCardReveal`. Its existing face midpoint emits once using the unrotated visible surface. The child normally mounts with the resolved card, so its previous saw-back guard and native transition callback could miss this event. |
| Play / discard | `deal-paper.wav` | `CribbagePlayCardAnimation` and `CribbageDiscardToCribAnimation` sound each native flight once. Self intents and opponent/bot snapshot detectors already share these components. The stable intent/card ID dedupes left/top/transform events. |
| Pegging / His Heels | `peg-wood.wav` | `CribbagePegBoard` sounds the displayed score increase, including 1-point moves whose clamped CSS position does not change. Initial/identity/recovery snapshots rebase silently. |
| Hand / crib combinations | Same wooden peg | `CribbageCountingPhase` replaces its highlight ding with the combination's exact points. Existing resumed-combination suppression remains; the pegboard yields during counting to prevent double playback and catch-up audio. Totals add no cue. |
| Zero hand / crib | Existing `run21FailureCueAt` two-note muted-brass womp | Each zero target's existing announcement boundary; identity includes round, hand, player UUID and target index, distinguishing dealer hand from crib. |
| Local Yahtzee roll | `cup-roll-c.wav` | Successful `handleRoll` receipt → local rolling state → `useYahtzeeRollSound` on the actual dice tray. Uses the same player/roll identity and starter as opponent `DiceRollAnimation`; ends with existing local roll animation or cleanup. |
| Yahtzee hold/release | Existing `quintzeeHoldCue` rising/falling 85 ms tones | Valid `handleToggleHold` optimistic die toggle uses `presentQuintzeeHold` once. Snapshot reconciliation does not replay tap audio. |

`src/lib/cribbage/sounds.ts` supplies presentation admission only. Wooden points
use identical sample buffers, scheduled 90 ms apart as one mixer voice so the
ordinary group cooldown/voice limit cannot discard individual points. A scoring
card's slide shares award priority and can coexist with its point sequence.
Global higher-priority outcomes, visibility, account speaker preference and native
context recovery remain unchanged. Mute stops every already-scheduled source.

These are the standard multiplayer Cribbage/Yahtzee paths, shared by human/bot
opponents and both money modes. Crib Lab and Quintzee remain separate game paths;
the reused assets/helpers are unchanged for their existing consumers.

## Validation and remaining acceptance

- Full production build: TypeScript, 4,203 application tests, 241 harness tests,
  46 release-tooling checks and the unchanged 90 MB static-size gate passed.
- Final focused suite: 52 tests pass, covering cut-face admission, 1/2/4/12/29 exact point
  sequences, self/opponent awards, zero hands/crib, silent recovered combinations,
  duplicate transitions, concurrent slide/score, mute cancellation, and local
  Yahtzee roll lifetime. All 18 native Edge/Web Audio checks pass with zero page errors, including
  cut/cold-cut, self/opponent flights and rolls, counting, hold/release and mute.
- Native browser fixture uses actual components and the AudioManager with isolated
  local preference state. Both absolute and relative platform-audio imports must
  resolve to this lab manager. No database/gameplay/preference writes are sent.
  Driver: `dev/sound-lab/verify-cribbage-yahtzee.mjs`; fixture:
  `dev/sound-lab/cribbage-yahtzee.html`. Raw evidence is ignored under
  `qualification.local/cribbage-yahtzee/`.
- No dependency, rule, server, financial or historical-data changes.

Jeremy's production acceptance: in Cribbage hear the cut, both players' plays and
all discards; compare Go=1, pair/15=2 and flush=4 clicks; confirm hand/crib totals
add no ding and zero targets womp. In Yahtzee roll/re-roll, hold and release dice,
then observe an opponent roll. Toggle the speaker off during a cue and back on:
old sounds must not replay. Repeat with a bot or second human as convenient.
