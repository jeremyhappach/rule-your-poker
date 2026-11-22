# Six-item gameplay polish — November 22, 2026

Approved scope: the supplied six-item implementation/deployment request. Based
on main `7b4691352`, isolated from the unrelated dirty Golf worktree.

| Item | Failure boundary | Correction and evidence |
|---|---|---|
| Light gameplay presentation | Blue Hour shell tokens inherited into dice, result badges and active HUD | Original light tokens are scoped to the existing shared HUD and artifact roots. Waiting chrome, shell reflections, felt, table, chips, selected/held colors, card-face admission and animation owners remain intact. Browser checks cover local/opponent/bot dice, held states, cards and the actual Holm shell. |
| Words panning | The shared pointer owner disallowed pan starts on committed `has-tile` cells even though they are passive content | All board content may initiate panning; staged tiles retain first priority for dragging. Native touch checks cover center, edges and four corners, pinch and Reset Zoom. |
| Potential score | Submit had no preview; the SQL reducer combined scoring and dictionary rejection | One extracted `private.ptown_words_evaluate` owns placement structure, premiums, crosswords, blanks, bingo and vocabulary lookup. The reducer and new authenticated read-only `ptown_words_preview` both call it. The client binds each answer to the exact identity/revision/draft and ignores stale responses. No preview enters the state/command pipeline. |
| Invalid words | SQL raised on the first invalid word; the UI hid its name behind a generic 1.5-second overlay | The evaluator gathers every invalid word after checking structure; rejected submission names them all. A readable inline message lasts until the draft changes. Rejection preserves staged tiles, turn and board. |
| Rack order | Rack targets admitted only tiles already on the board; targets had no insertion position | Existing pointer capture/drop handling now supplies a stable rack insertion slot. Neighbors shift during drag; release commits UUID-independent physical tile IDs as local display order. Duplicate letters/blanks remain distinct. |
| Async green cards | Midnight CSS overrode green turn styling; intermediate pending results were excluded by terminal-only review admission | The green border/background follows the existing actionable flag. The flag also includes authoritative opponent pending results before child completion, without widening review/turn admission. Invitations, playable turns, multiple obligations, opponent-only turns and clearing on realtime are covered. |

## Preserve and authority

No game rules, frozen versions, turn durations, dealing, randomness, admission,
chips, settlement, matchmaking, or canonical lifecycle owners change.
The preview evaluates only supplied visible board/rack data; it reads the
existing indexed ENABLE2K dictionary. Its output is advisory and cannot
authorize a move. Submission still uses the locked authoritative state.
The migration checks the installed reducer preimage before replacement.

Words currently has Multiplayer and Async adapters (plus saved result review),
not an Arcade adapter. These changes live in their shared view and do not add
a new Arcade game. Shared dice/card presentation also covers existing Arcade
consumers.

## Qualification

- `dev/six-item-polish/prepare-proof.mjs` composes the original core proof,
  full reducer differential checks and new placement proof inside rollback.
  Hosted candidate, installed and repeat-application proofs passed. Installed
  migration: `20261122151403_words_placement_preview_and_validation`.
  All four supported frozen versions, all
  premium squares, blank zero values, crosswords, 50-point bingo, invalid-word
  sets, structural errors, duplicate/unowned tiles, preview replay, pass,
  exchange, timeout, time banks, terminal deductions and ACLs are covered.
  No application or financial rows are created or altered by the proof.
- The local browser fixture uses the actual SQL evaluator and installed
  dictionary in a rollback-only local connection, with real React components.
  Ten layouts: Multiplayer and Async at 320×568, 390×844, 430×932, 844×390 and
  1280×900. Ninety native pan starts, pinch/reset, consecutive rack insertions,
  duplicate blanks, rerenders and board/rack roundtrips passed.
- Browser preview/feedback example: AX plus invalid ZA and QX crosswords earns
  potential 58; submission names both, retaining both staged tiles.
- Regression tests cover exact tile identity, error parsing, feedback lifetime,
  preview invalidation/late responses, committed-tile panning, rack persistence
  and intermediate Async results. Focused lint passes.
- Full build, installed proof and production verification are recorded in the
  current-release entry. Browser JSON, screenshots and build output are in
  ignored `qualification.local/six-item-polish/`.

Physical iPhone/PWA acceptance remains Jeremy's production smoke. Check the
bottom-left viewport plus all corners, repeated rack drags, invalid crosswords,
white dice/HUD and actionable cards after acting/reopening the lobby.
