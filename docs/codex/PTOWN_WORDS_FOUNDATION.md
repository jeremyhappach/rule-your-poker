# Ptown Words — local dictionary and visual foundation

2026-10-26. Based on main `03dbc92a1`, branch `codex/ptown-words-foundation`.

## Approved identity and vocabulary

Jeremy approved the name **Ptown Words**, full ENABLE2K vocabulary, and an original
navy/charcoal presentation with teal, cyan, amber and violet premiums and ivory
tiles. ENABLE2K differences from tournament dictionaries are explicitly accepted.
Do not supplement the vocabulary or present this as an officially branded product.

Acquired from [Bart Massey's wordlists repository](https://github.com/BartMassey/wordlists)
at commit `af52415c13af809bd8757a40f17f46e79d09583c`. The original compressed
archive and unmodified public-domain distribution notice are preserved in
`server/ptownWords/dictionaries/enable2k-1/`. The notice credits M. Cooper and
Alan Beale. See the notice itself for the complete distribution terms.

- Dictionary ID: `enable2k/1`.
- Entries: **173,528**, all unique, lengths 2–28. No board-length filtering.
- Canonical artifact: ASCII uppercase, code-unit sorted, UTF-8, LF, final LF.
- Canonical SHA-256: `d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925`.
- `manifest.json` records pinned source URLs and archive, source, notice and normalized hashes.
- Directory attributes preserve the original notice bytes and canonical LF across checkouts.
- Reproduce acquisition with `node dev/ptown-words/import-enable2k.mjs`. This is a development operation; gameplay must never fetch a dictionary.

## Implemented locally

`server/ptownWords/dictionary.ts` verifies the artifact before creating a private
in-memory lookup index. Resolution requires the exact ID and checksum and rejects
unknown versions. `dictionaryRefForNewMatch()` prepares a frozen reference for
future admission; **there is no match-creation integration yet**.

`placementWords.ts` extracts every maximal horizontal and vertical word touched
by newly placed tiles and validates all of them, including perpendicular words.
Assigned blanks retain their letters. This is lexical validation only: it does
not enforce turn ownership, rack ownership, linear/connected placement, premiums,
scores or settlement. It must not be used as a complete move-admission endpoint.

`dev/ptown-words/design.html` is an isolated synthetic interactive design with
full-board, zoomed placement, staged submission and opponent-turn scenes. It has
phone 390×760 and 320×568, landscape 844×390 and desktop 1024×760 layouts, plus
a four-player preview. Premium letters use round marks; word premiums use clipped
marks. The empty center has a PT/start mark. The standard grid is intact.

Overview taps navigate into the board; placement is enabled only in zoom view
after selecting a rack tile. Panning suppresses placement, and Inspect/Zoom Out
clear selection. The rack and actions remain visible. Staged tiles can be returned,
undone or recalled; blanks use a letter picker. The mock's illustrative ART
submission and clock are fixtures, not gameplay authority or a timer decision.

## Verification

- `node --test server/ptownWords/dictionary.test.ts`: 8 passing tests, covering
  exact full source preservation, all entries indexed, obscure words, invalid
  words, no supplementation, integrity/version failures, intersecting words,
  assigned blanks and multiple words from one placement.
- Strict TypeScript check of the three new server files passes using existing
  TypeScript with ES2022, ESNext, bundler resolution, Node types and import extensions.
- Existing app `tsc -p tsconfig.app.json --noEmit` passes. The preferred local
  native-preview executable was unavailable; no dependency was installed.
- `node dev/ptown-words/check-design.mjs`: 20 layout states, zero page errors,
  225 board squares, rack targets at least 44px, zoom squares at least 48px;
  placement, undo, blank selection and submission fixtures pass. Rendered phone
  and landscape captures inspected. Evidence is ignored under
  `qualification.local/ptown-words/`.

## Scope discrepancy and release hold

Inspection of current main found no existing Ptown Words gameplay, admission,
private state or settlement implementation. The earlier deliverable was design
only. The follow-up asks to retain that implementation, but it does not exist.
Jeremy was asked whether to build the complete multiplayer game or deliver this
foundation first. Full-game work remains pending that scope answer.

No catalog entry, production route, admission, migration, financial policy or
existing game has changed. No deployment or game activation has occurred.
The requested scoring/exchange/endgame and financial release gates cannot pass
until the runtime exists; the lexical and mock checks do not substitute for them.

The implementation phase must retain 15×15, seven tiles, conventional distribution,
premium scoring, bingo, blanks, exchange/pass and final rack deductions. It must
persist the dictionary ID/hash atomically at admission alongside the rule version,
preserve historical versions, and use one shared server rule/scoring engine.
Board/rack/bag state, draws and authoritative scores must remain server-owned;
only the player's own rack and public committed state may be projected. Bots
receive the same permitted information. Client drafts never reach opponents.

Reuse the existing fullscreen shell and canonical selection, consent, ante-up,
announcements, timers, recovery, result and Session Ended owners. Catalog proposal:
fullscreen; multiplayer only; 2–4 players; no Arcade mode; bot eligibility requires
an explicitly qualified visible-information bot. Game-specific timer/forfeit,
stalemate, tie payout and bot policy details remain decisions before runtime work.

Follow the established Boxdrop-style revision/identity checks, request UUID receipts,
payload binding, row locks and durable recovery. Submission retries must return the
original receipt, conflicting requests must fail, and final scores, canonical chip
transfers, ledger entries, snapshots and terminal disposition must commit once in
one authoritative transaction. Qualify actual financial triggers with contained
winner/tie/duplicate/replay/late-replay/authorization/continuation/terminal proofs
before any fake-money or real-money activation. Existing money-mode policies remain
unchanged. Deployment is held until the full release gate and approved scope are met.
