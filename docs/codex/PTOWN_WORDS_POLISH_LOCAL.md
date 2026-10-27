# Ptown Words owner-smoke polish — LOCAL review only — 2026-10-26

Jeremy requested this polish through the owner-smoke thread. The specific hold
supersedes prior publication approval: no push, deployment, hosted migration or
activation until owner review. Work is isolated on `codex/ptown-words-polish-local`
from main `043541cff7f6d4beb90c4b28988b536529f3bf49`. Quintzee files/tasks are untouched.

## Review

Open <http://127.0.0.1:15307/dev/ptown-words/polish-preview.html> while the local
server is running. Start a fresh synthetic fake-money game against a bot.
The preview uses the actual Game route and local PostgreSQL authority, with
canonical configure/ante/recovery/settlement; it does not call production.

- In board detail, a double tap zooms out. A single pointer tap waits 300ms so
  the second tap can cancel both; neither tap changes a draft or submits it.
  Movement/scroll and turn changes cancel pending taps. Keyboard placement stays
  immediate; Escape also zooms out. Selection and drafts survive zoom navigation.
- With a draft, Undo, Recall, Exchange and Pass share one 44px-minimum row.
  Submit Word remains a separate full-width primary action. The rack and HUD stay
  at the bottom inside canonical safe-area geometry. Inspect and pan are retained.
- Opponent words automatically focus the public formed words on the board.
  Newly committed tiles flip one at a time, followed by the canonical notice
  `[Player] played [WORD] +[total points]`, then a brief hold. The old camera is
  restored afterward. Human and bot opponents use the same presentation.

Proposed timing: 200ms focus, 260ms per placed tile, 1600ms notice, 350ms hold.
Total is 2.41–3.97 seconds. Actions/navigation are held during that bounded reveal;
the next player then receives the full 180-second decision clock. Reduced-motion
preference uses a fade rather than a 3D flip, with the same server handoff.
Long words fit the available board rectangle; the canonical notice retains the
full word and score at normal text size. Ordinary placement zoom remains 48px.

## Authority and preservation

`supabase/ptown-words/presentation.sql` is a LOCAL candidate, not an applied or
numbered production migration. Configuration freezes presentation version 1
separately from unchanged `ptown-words/1` rules and ENABLE2K. Old configured or
in-progress matches without presentation configuration retain their old handoff.

One game-owned trigger stamps public placed-cell indices and fixed server times
once per committed placement, before bot scheduling and revision/history publish.
Both human commands and bot simulation use the shared reducer's early-action
guard. Repeated snapshots, receipts and reconnects cannot restart that interval.
Authorized pause/resume shifts it once with the existing deadline shift. Bots
are scheduled after the reveal window. No client acknowledgment advances play.

The move's authoritative total includes cross-words and bingo; no client scoring
or hidden opponent tiles are used. Settlement remains immediate and atomic under
the existing owner. A terminal word's three-second winner hold begins after its
word reveal; canonical transfer presentation waits for that reveal. No second
announcement, financial, settlement, or terminal owner was added. The Words notice
emitter now uses the canonical renderer's `title` field; its former `text` field
produced an empty rail. Expired/queued Words notices are retired at handoff.

## Local evidence

- TypeScript and actual Game-route bundle pass; React component review completed.
- Ten focused tests: pointer double-tap disambiguation, blank picker protection,
  staged-tile preservation, scope cancellation, one-row actions, immutable/retried
  commands, authoritative totals and fixed/pause-aware presentation progress.
- Core SQL and twelve canonical financial cases pass in rollback containment.
  Additional local proof races the same placement from independent connections,
  rejects early input, checks full 180000ms after reveal, one-time pause shift,
  bot scheduling, immutable receipts and exactly-once terminal payout/hold.
- Browser proof at 320×568, 390×760, 844×390 and 1024×760 checks the single action
  row, 44px targets, separate Submit Word and unclipped footer. Real touch events
  prove double-tap cancellation. Sequential transforms, automatic camera framing,
  correct notice text/total, input hold and reload during announcement pass.
- Human-opponent proofs at phone and desktop sizes verify identical narration,
  exact camera restoration, terminal-word reveal, one payout and Session Ended.
  Zero page errors in those proofs.

Evidence: `dev/ptown-words/evidence/polish-*.json`. Local screenshots are under
`qualification.local/ptown-words/polish/`, including `hud-390.png`,
`opponent-announcement.png` and `human-announcement-desktop.png`.

Reproduce with the existing installed dependencies/local PostgreSQL clone:

```powershell
node dev/ptown-words/build-route.mjs
$env:PTOWN_WORDS_BOTS='1'
$env:PTOWN_WORDS_POLISH='1'
node dev/ptown-words/route-server.mjs
# In a second terminal:
node dev/ptown-words/polish-proof.mjs
node dev/ptown-words/polish-browser.mjs
node dev/ptown-words/polish-human-browser.mjs
```

## Provenance / remaining review

The parent inspected the actual supplied screenshot; this executor did not have
Library access and used that verified assessment with the owner's written request.
The parent reports byte-identical PNGs, 945×2048:
`libfile_c290fa0b84dc819195c85916c136e0e6` (`IMG_4254.png`) and
`libfile_a517efb0ff288191b4b5f3f898e6120d` (`IMG_4254(1).png`). This executor inspected
the new locally rendered screenshots directly.

Physical iPhone/Safari smoke and owner acceptance remain pending. Browser proof
uses installed Edge with touch emulation; no new browser tools were installed.
The local harness services recovery every second; production retains its existing
five-second worker cadence, so bot wake-up latency can differ from this preview.
After owner review, any separately authorized publication must package the SQL
against current deployed preimages and run hosted rollback/release gates. This
local checkpoint is not permission to publish or change production timing.
