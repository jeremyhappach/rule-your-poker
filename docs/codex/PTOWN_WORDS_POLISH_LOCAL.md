# Ptown Words owner-smoke polish — LOCAL review only — 2026-10-26

**Superseded October 27:** owner accepted the polish and explicitly approved
publication after correcting rack taps. See `PTOWN_WORDS_POLISH_RELEASE.md` for
the indefinite fake-money release and its qualification; below is historical.

Jeremy requested this polish through the owner-smoke thread. The specific hold
supersedes prior publication approval: no push, deployment, hosted migration or
activation until owner review. Work is isolated on `codex/ptown-words-polish-local`
from main `043541cff7f6d4beb90c4b28988b536529f3bf49`. Quintzee files/tasks are untouched.

## Review

### Combined owner-smoke pass — October 27

Local-only approval: all eight owner requests are included; publication remains
held. Overview says **tap an area to zoom in**; detail says **double tap for full
board**. Dictionary-only rejection shows **invalid word** for 1500ms, once per
failed attempt. Other errors retain their specific feedback. Draft, camera and
authoritative deadline survive rejection. The feedback timer never changes play.

Outlined score containers distinguish the presented/active player from waiting
players. The rack dims until the existing authoritative reveal handoff permits
action. Your turn has a gentle 2.4-second pulse (static with reduced motion), plus
a 44px refresh-icon shuffle control immediately beside it. Shuffle changes only
local tile-ID order; selected/staged IDs, recall, bag, score and clock are preserved.
Any staged tile replaces Exchange/Pass with Undo/Recall; a short endgame rack with
no staged tiles still shows Exchange/Pass, subject to the existing bag restriction.
The portal dialog uses explicit dark-theme colors with legible text, cream tiles,
mint selected tiles and distinguishable disabled actions. Cancel, X and Escape
restore keyboard focus to the opening control.

#### Casual bot policy (local candidate)

The player dictionary remains the full pinned ENABLE2K, including its obscure
legal words. Only the bot's search vocabulary changes: 2,599 SCOWL 2020.12.07 US
words from English/American levels 10 and 20, ASCII letters, length 2–5, intersected
with ENABLE2K. Every formed word, including cross-words, must be in that subset.
[SCOWL's official source and release](https://wordlist.aspell.net/other/) and
[source/license explanation](https://wordlist.aspell.net/scowl_v1-readme/) document
the common-word levels and permissive redistribution conditions. This is a
practical familiarity proxy, not a guarantee every player knows every word.

The archive hash, source-file hashes, generated hash, exact modifications and full
verbatim license notices are retained under `server/ptownWords/bots/scowl-20`.
`prepare-casual-bot.mjs` verifies the pinned archive and generates the subset/SQL.
Extract only `Copyright` and `final/{english,american}-words.{10,20}` from the
official archive into `qualification.local/ptown-words/scowl-source/` to rebuild;
no package installation is required. The private vocabulary table has a primary
key, RLS and no client grants. `bot-vocabulary.sql` is an unnumbered local candidate.

Search is capped at 3,000 nodes / 24 legal candidates (formerly 8,000 / 48).
Minimize `abs(points - 8) * 100 + mainWordLength * 3`, with a deterministic public
actor/turn/placement hash tie-break. It targets modest scores and shorter words;
there are no difficulty controls. If no familiar play is found, the existing
one-exchange-then-pass behavior remains. It may miss moves or pass more often on a
crowded board. Core scoring, draws, human validity, bot privacy, scheduling,
recovery and settlement owners remain unchanged.

Sixteen opening/midgame comparisons passed the shared reducer and repeatability/
hidden-information checks. Examples: QUIZ 44 → TIRE 8; STAINER 66 → SEAT 8;
CISTERNA 83 → CARES 8; ATAXY 31 → ALLY 8. Measured searches took 15–48ms in
this sample, not a load benchmark. The core and all twelve human financial cases
passed before local installation. Installed bot checks passed private-input and
real-money rejection, 2/3/4-player admission, pause, zero-client progression,
winner/tie canonical chip transfers, immutable final snapshots and terminal close.
Terminal fixture setup removes its previous reveal metadata to exercise scheduled
settlement immediately; actual presentation timing is checked separately in the
browser and retained prior timing proofs.

#### Owner-image provenance

Parent personally inspected PNGs `libfile_a181168f71bc8191a185ad40f3bc9aad`
(`image(20261027-161737).png`, floating scores) and
`libfile_b7aacfa827d481919a0945f4ee6d64f2`
(`image(20261027-162102).png`, unreadable white Exchange modal). This executor
has no direct Library download capability and used the parent's verified assessment
and explicit requirements. It inspects new locally rendered screenshots itself.

Evidence for this pass: `dev/ptown-words/evidence/casual-bot.json` and
`polish-pass-browser.json`; screenshots `qualification.local/ptown-words/polish/pass-*.png`.
The new browser harness covers real emulated touch start/move/end events and scroll
displacement without placement, in addition to taps and double taps. It checks
repeated invalid overlays with measured duration and unchanged database deadlines,
shuffle ID preservation, staged-action visibility, outlined scores/rack handoff,
reduced motion, accepted-word overview, bot reveal, modal flows/focus, and reconnect.
This is Edge touch emulation, not physical iPhone/Safari acceptance.

Twenty focused tests, TypeScript and the actual Game-route build pass. Browser
coverage includes 320×568, 390×760, 844×390 and 1024×760 layouts. Measured invalid
notices were 1501–1504ms in the first complete run, with zero deadline/revision
extension and zero page errors. Human-opponent reveal, prior-camera restoration,
terminal-word payout and Session Ended regression also pass. The preview URL
responds HTTP 200 and Start a fresh preview opens an actionable bot game.

Open <http://127.0.0.1:15307/dev/ptown-words/polish-preview.html> while the local
server is running. Start a fresh synthetic fake-money game against a bot.
The preview uses the actual Game route and local PostgreSQL authority, with
canonical configure/ante/recovery/settlement; it does not call production.

October 27 refinements: redundant board-size text and Zoom In button are removed;
tap the overview to inspect a section. The rules-only Session button is now a
question-mark icon with accessible Rules name and a 44px target. The shared shell
retains panel focus restoration; other games keep its default Session label.
An accepted own placement returns to the full board, driven by authoritative
move history. A pending/rejected command preserves the draft and camera. If own
acceptance and an opponent reveal arrive together, the reveal still plays and
then restores the full board. No new SQL or timing change is part of this refinement.

- In board detail, a double tap zooms out. A single pointer tap waits 300ms so
  the second tap can cancel both; neither tap changes a draft or submits it.
  Movement/scroll and turn changes cancel pending taps. Keyboard placement stays
  immediate; Escape also zooms out. Selection and drafts survive zoom navigation.
- With a draft, Undo and Recall share one 44px-minimum row; Exchange and Pass
  return only after every staged tile is removed.
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
- Four additional component tests cover tap-to-inspect, pending/rejected drafts,
  accepted-word overview, and coalesced acceptance/opponent camera restoration.
  `refinement-browser.mjs` checks the actual Rules panel/focus, rejected placement,
  accepted CAT, bot response and overview restoration on phone and desktop.
  All fourteen tests, the refreshed route bundle, TypeScript, and phone/desktop
  browser checks pass. The four-size gesture/HUD/reconnect proof also passes.
  Refinement evidence: `dev/ptown-words/evidence/refinement-browser.json`;
  screenshots: `qualification.local/ptown-words/polish/refinement-*.png`.
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
node dev/ptown-words/refinement-browser.mjs
# Combined October 27 pass:
node dev/ptown-words/prepare-casual-bot.mjs
node dev/ptown-words/casual-bot-proof.mjs
node dev/ptown-words/polish-pass-browser.mjs
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
