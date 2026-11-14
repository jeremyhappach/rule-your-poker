# Words score and turn polish — November 13, 2026 — production release approved

Branch: `codex/words-score-turn-polish`, based on main `318299eb0`.
Worktree: `C:/Users/jerem/source/repos/ptown-words-score-turn-polish`.
Jeremy requested implementation of score/non-word polish, a read-only scrolling
audit, and no deployment. He separately approved preparing an unapplied local
timeout-provenance migration. He subsequently requested production publication.
The migration is installed and its post-install rollback proof passed. Publication
will use the unchanged main push helper after the complete release build.

## Scrolling audit (no correction implemented)

Inspected the actual Words host, fullscreen shell, async wrapper, board viewport,
all four grid corners, center occupied cells, empty cells, rack, score pills,
navigation/reset controls, status/actions, gesture handler and overlays. Computed
styles/hit targets were sampled at 320×568, 390×844, 844×390 and 1440×900.
Chrome touch events also exercised nine exposed areas at fit scale, then an
occupied cell and an empty cell at 1.25× zoom.

- The gameplay surface is fitted, not a scroll container. The async wrapper has
  fixed shell height and `overflow:hidden`; the board uses `overflow:clip`.
- The entire board viewport, every cell, rack and rack buttons use
  `touch-action:none`; Reset Zoom does too. This includes board edges, corners,
  occupied tiles and unused viewport space, not only the center.
- `useWordsBoardGestures` captures pointers. Single-finger movement drags an
  editable tile, pans an empty board area only above fit scale, or becomes a
  blocked gesture. Committed occupied cells cannot initiate board panning.
- Header/scores/status use `auto`; normal action buttons use `manipulation`.
  They permit native gestures, but there is no gameplay page overflow to scroll.
- The canonical interaction overlay, countdown and tile ghost are pointer
  transparent. Pause/invalid covers and open modal dialogs have intentional
  presentation/input behavior. No unexpected invisible board-wide hit target
  was found. The wheel handler cancels only Ctrl-wheel zoom; there is no blanket
  touchmove preventDefault repair in the Words handler.
- Browser touch evidence: zero page scrolling from every tested area at fit;
  zoomed committed CAT stayed fixed, while zoomed empty square 96 panned.

Conclusion: single-finger page scrolling is not supported consistently across
the exposed surface. Zoomed-board panning also differs by starting target.
If universal page scrolling is desired, define a Words scroll owner and allow
native vertical panning on non-draggable surfaces, with explicit arbitration
for tile drag/pinch. If the intended behavior is board panning, permit pan from
committed cells as well as empty cells. Either is a separate gesture change;
neither was implemented. Physical iPhone Safari/PWA behavior remains owner smoke.

## Implemented presentation

The score badge holds over the rendered primary word, then travels to the actual
scorer's pill center. DOM measurements include board transforms, clipping and
responsive layout; edge origins are kept readable within the board. The badge
stays 2rem and fully opaque throughout flight. It is a pointer-transparent portal
with no scroll lock or gameplay callback. Reduced-motion users retain a stationary
badge. Existing authoritative totals, score timing/receipts, handoff, placement
reveal, turn admission, gestures and settlement are preserved.

Last-turn labels now use each player's latest recorded move, including PASS,
TIMED OUT and EXCHANGED n. Live announcements, live/async history and saved-result
headers share those labels. No classification is inferred from empty words.
An unseen opponent non-word turn opens a username/action dialog before the normal
async Your Turn handoff. Dismissal persists per viewer/game/turn. Passive inspection,
held games, own actions and already-started timed turns do not consume/show it.
Saved/final non-word reviews show the actual action modal under the existing
review/acknowledgement schedule; stale earlier placements cannot animate instead.

## Timeout provenance and database proof

The deployed shared reducer converts tick expiry to `action:pass` and previously
discarded its cause. Async timed expiry invokes that same reducer. The candidate
retains `action:pass` and appends `reason:timeout` only to newly recorded expiry
moves. It changes no grants, tables, indexes, rules or accounting, and performs
no historical backfill. Existing ambiguous passes remain PASS.

Migration `20261114013907_words_timeout_provenance.sql` is installed. The local
filename was aligned with the version assigned by the migration service.
Its declaration/move substitutions are guarded and idempotent. The proof compiled
temporary baseline/candidate copies of the installed reducer inside BEGIN/ROLLBACK;
the installed function and customer data were never changed. V1/V2 cases prove
voluntary-pass distinction, old-history preservation, exact remaining JSON parity,
winner/tie and terminal/continuation behavior, early/duplicate expiry and replay.
This is metadata qualification, not a new production financial-release claim.
Production release authorization was given after local review.

## Verification

- 191 focused tests in 13 files pass, covering existing Words input/reveal/score,
  real async route inspection/handoff, saved/final review, non-word identities,
  refresh/dismissal, clock-start ordering and shared review schedules.
- Application TypeScript check and production Vite build pass. Existing bundle
  size/Browserslist notices remain; no dependencies were installed or changed.
- 33 browser cases pass with zero page errors: local/opponent/async/saved score
  geometry at four sizes, readable constant-size flight and exact landing,
  pass/timeout/exchange dialogs and reload receipts, plus the scrolling audit.
- React review checked effect cleanup, UUID-scoped receipts, modal names/focus,
  pointer transparency, reduced motion and unchanged shared-game branches.
- Evidence: `qualification.local/words-score-polish/report.json`, screenshots in
  the same directory, and `qualification-words-{tests,typecheck,build,browser}.log`.
  Browser fixtures are local presentation evidence, not a production game smoke.

Owner acceptance after an authorized release: score one local word and watch an
opponent/replayed word in portrait and landscape; confirm origin/landing, unchanged
tile input, one dialog for pass/exchange/expiry before Your Turn, correct exchange
counts and Last/History labels, and normal word animation without an action modal.

## Changed files

- Presentation: `src/components/ptownWords/PtownWordsView.tsx`,
  `WordsScoreFlight.tsx`, `PtownWordsTable.tsx`, `ptownWords.css`;
  `src/lib/ptownWords/scorePresentation.ts`, `turnPresentation.ts`,
  `useNonWordTurn.ts`, `model.ts`.
- Async summaries/replay: `src/components/delayed/WordsTurn.tsx`,
  `ResultReview.tsx`; `src/lib/delayed/wordsFinalReview.ts`,
  `reviewPresentation.ts` (Words branch only).
- Tests: `src/components/ptownWords/PtownWordsView.test.tsx`,
  `src/lib/ptownWords/turnPresentation.test.ts`, `useNonWordTurn.test.tsx`,
  `src/components/delayed/WordsFinalReview.test.tsx`,
  `src/lib/delayed/reviewPresentation.test.ts`.
- Browser fixture: `dev/words-score-polish/index.html`, `preview.tsx`, `browser.mjs`.
- Database candidate: `supabase/migrations/20261114011536_words_timeout_provenance.sql`;
  proof: `supabase/ptown-words/timeout-provenance-proof.sql`.
- Documentation: this record, `CURRENT_RELEASE.md`, `REPO_MAP.md`.
