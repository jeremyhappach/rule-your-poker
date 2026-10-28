# Golf opponent cards and seat inspection — release checkpoint, 2026-10-23

Base: `7219f8340579908c029037d302b518fc20026a53`.
Branch: `codex/golf-cardback-seat-inspect`.
Initially qualified as a local candidate. Jeremy subsequently approved publication
of `21435e361ba6714ebdd836c17c1b3a09f30564fc` and its parent
`754bfd6f26a5d39f0e7c91f5cf15eb0f3abb7235`. This release excludes the separate
new Mega presentation pass and includes no database or admission changes.

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
rotation and card-replacement animation anchors. Publication is approved; physical
iPhone smoke remains pending Jeremy.

## Approved medium face tier follow-up — 2026-10-23

Starting from local candidate `754bfd6f26a5d39f0e7c91f5cf15eb0f3abb7235`,
Jeremy approved only using the viewer's canonical medium face tier for opponent
tableau fronts and displaced cards. `GolfTable.tsx` now selects `medium` for both
participants in its existing tableau renderer. Container dimensions, layout,
themed backs, privacy and the seat-indicator inspection callback are unchanged.

Two-player portrait is the owner's priority. Four-player target polish is deferred;
the previously recorded short-landscape limitations for 2–4 players remain unqualified.
No canonical layout redesign is included.

Validation: application TypeScript and 38 focused Golf/seat tests pass, including
medium-tier displaced cards with both exposed and concealed predecessors. The actual
390×680 Edge portrait proof passes with no browser errors, external requests or gameplay
actions. Opponent cards and slots remain exactly 43.0625×60.296875 CSS pixels, equal to
the prior checkpoint. Both players use the canonical medium rank/suit font-to-width
ratios (0.56/0.50). Painted-glyph bounds clear card edges, and all 13 rank/four suit ink
widths fit the unchanged containers. Themed backs, public-only dialog, visible seat-card
taps, unobstructed portrait touch target, Enter/Space and Escape checks pass.

Run `node dev/six-card-golf/cardback-seat-review.mjs --check --portrait` for this scoped
proof. Evidence: `evidence-portrait-medium.json`; actual rendered screenshot:
`Edge-2-390x680-medium.png`, under the same ignored qualification directory above.
The full matrix remains available without `--portrait` and retains its nonzero exit
for known short-landscape target failures. Physical iPhone Chrome remains pending;
no WebKit executable is installed.

Files changed in this follow-up: `src/components/golf/GolfTable.tsx`,
`src/components/golf/GolfTable.test.tsx`, `dev/six-card-golf/cardback-seat-review.mjs`,
`docs/codex/CURRENT_RELEASE.md`, and this checkpoint document.

The actual two-player table can also be reviewed in a fixed portrait-sized iframe at
`http://127.0.0.1:5221/__cardback-portrait`. This sizes only the review frame, not product
card containers or canonical layout.

## Publication qualification — 2026-10-23

Application TypeScript, all 2,857 source tests and 241 harness tests pass on the
approved product tree. Two default-concurrency full-build attempts stopped at
different timed UI assertions (Golf terminal admission, then Canasta help loading).
Golf passed its isolated rerun; the complete source suite passed with
`vitest run src --maxWorkers=2`, including both earlier failures. No application
code, test expectations or timeout thresholds were changed for these reruns.
The harness suite was then run separately through its normal package script.
Production Vite build also passes; existing Browserslist, mixed-import and chunk-size
warnings remain. Checkpoint tag: `six-card-golf-cardback-seat-release-20261023`.
Release evidence logs remain under the ignored `qualification.local/` directory.
