# Golf opponent cards and seat inspection — local review, 2026-10-23

Base: `7219f8340579908c029037d302b518fc20026a53`.
Branch: `codex/golf-cardback-seat-inspect`.
Local implementation only. No merge, push, deployment, database changes or admission changes.

## Scope and evidence

Jeremy's iPhone Chrome screenshot shows squat opponent faces and concealed positions
reduced to gray bars. On iOS 18.7.8 the existing public-tableau dialog renders correctly.
The opponent felt slots relied on implicit grid stretching followed by percentage-height
TableauCard, PlayingCard and CanonicalCardBack wrappers. Removing stretching in a local
DOM experiment reproduced 4px backs (the two 2px borders). Definite slot heights restored
the 5:7 shape. This is a demonstrated dependency, not a reproduced WebKit engine bug.

Golf now gives opponent felt slots definite width/height from the existing `--public-w`
budget. Canonical themed backs, faces, transport anchors and privacy admission are reused.
The felt tableau is a noninteractive grid. Golf opts into the seat layer's inspection
callback; tapping the card-back indicator opens the exact existing public-tableau dialog
by participant UUID. Its transparent native button supports keyboard activation, a focus
outline and an enlarged touch target, without moving visible cards or transport anchors.
Existing other-game callers do not opt in and retain their previous rendering.

No scoring, timeout/rejoin, pile-flash, Blast, financial, rule or other-game changes.
The pencil-written scorecard is unchanged.

Changed files:
- `src/components/golf/golf.css` — definite opponent card slots.
- `src/components/golf/GolfTable.tsx` — move the existing inspection callback.
- `src/lib/canonicalShell/GameplayOpponentSeatLayer.tsx` — optional seat-indicator button.
- `src/components/golf/GolfTable.test.tsx` — entry-point and redaction regression.
- `src/lib/canonicalShell/GameplayOpponentSeatLayer.run21.test.tsx` — UUID and opt-in regressions.
- `dev/six-card-golf/cardback-seat-review.mjs` — isolated preview and browser proof.
- `docs/codex/CURRENT_RELEASE.md` — local-only checkpoint notice.
- `docs/codex/SIX_CARD_GOLF_CARDBACK_LOCAL.md` — this evidence and limitations.

## Validation and limitation

- Application TypeScript passed using the installed `tsc`; `tsgo` is not installed.
- 88 focused Golf/seat tests passed; the final two directly affected suites passed 36 tests.
- Production Vite build passed, with existing Browserslist/chunk warnings.
- Actual browser components: 2/3/4 participants at 390×680, 844×390 and 1024×768.
- All nine cases preserved 5:7 opponent cards, Bears backs, redaction, participant selection,
  fully exposed seat indicators, native Enter/Space activation and Escape dismissal after
  dialog entrance animation. Visible seat-card taps opened the correct existing view;
  felt-card taps did not. No gameplay RPC or external request occurred.
- Six portrait/tablet cases provide an unobstructed 44×44 target. The three 844×390 cases
  do not fully qualify: existing bottom-seat/HUD overlap clips the target, and four adjacent
  occupied seats also crowd neighboring targets. Visible-card taps still select correctly.
  The browser runner deliberately exits nonzero and records these failures. Do not describe
  this checkpoint as fully qualified or ready to publish.
- The installed browser is Edge/Blink. The expected Playwright WebKit executable is absent;
  no browser/tool was installed. Physical iPhone Chrome acceptance remains required.

The short-landscape limitation needs a separate canonical seat/interaction placement
decision before complete touch-target qualification. Speculative seat repositioning and
adaptive hit-area experiments were removed from the candidate to preserve approved scope.

## Review

From this worktree, run `node dev/six-card-golf/cardback-seat-review.mjs` and open
`http://127.0.0.1:5221/__cardback-review?players=2` (also `players=3` or `4`).
This loopback preview uses synthetic public snapshots and rejects gameplay actions;
it does not connect to a database. It reuses the actual Golf table and canonical shell.
The preview fixture selects Bears through the existing profile preference reader.

Run the same command with `--check` for the browser evidence under
`qualification.local/six-card-golf/cardback-seat-review/`.
`evidence.json` records geometry, participant/redaction checks, target failures and browser
availability. Screenshots include portrait/tablet cases and each obstructed target case.

Physical acceptance: verify the original iPhone's mixed exposed/concealed felt hand,
seat-indicator opening for each participant, unchanged public-view concealment, reconnect,
rotation and card-replacement animation anchors. Publication remains unapproved.
