# Chess / Words launch polish — local checkpoint, November 12, 2026

This is an incomplete implementation checkpoint, not a release. Jeremy explicitly
requested no deployment/publication and no background-management/admin screen.
No hosted schema, Storage objects, production data, admission or deployment changed.

## Source and scope reconciliation

The initial workspace was the older, dirty `codex/six-card-golf-v1` checkout.
It was preserved. Work is isolated in
`C:/Users/jerem/source/repos/ptown-chess-words-launch-polish`, branch
`codex/chess-words-launch-polish`, based on `codex/chess-preview` at `7fc8fc2c3`
(current main `698ab0e5d` plus the two existing preview commits).

Chess exists only under `dev/chess-preview/`: unauthenticated local SSE/file
persistence, standard promotion and a 36-hour preview deadline. It has no
production game catalog entry, authenticated live/Async authority, durable
recovery or canonical settlement. Read-only hosted inspection found no Chess
tables. Jeremy explicitly chose to include full production Chess integration
in this task, while keeping publication held. That work remains unfinished.

## Confirmed Chess rules

Jeremy supplied these decisions directly in the November 12 chat:

- A pawn reaching the last rank revives one of its owner's captured queens,
  rooks, bishops or knights. Captured pawns and kings are excluded (explicit
  follow-up confirmation). Consume the selected captured piece so it cannot
  be reused. If that owner has none eligible, offer ordinary Q/R/B/N promotion.
  Opponent-owned inventory is never shared.
- Five-minute turns, with two +3-minute banks following the existing Words
  per-player/per-game pattern. Live turns start immediately; Async gameplay
  timing starts when its player opens the turn, then runs continuously.
- Retain the existing Async availability window before opening (36 hours,
  Last Call at 24 hours). Gameplay expiry forfeits this Chess game.
- Use canonical two-player stakes. The winner receives the opponent's stake.
  Draws, including stalemate, cause no transfer and return both stakes.
- Stalemate is immediate draw when the player to move has no legal move and
  is not in check. The proposed three-minute clock is superseded.

## Implemented background phase

The supplied ZIP's `original-backgrounds` directory contains nine standalone
photos and four composited Words screenshots. The four timestamped images
ending `205653`, `205745`, `205905`, `210053` are excluded. All nine actual
photos are preserved byte-for-byte. `photos.json` records original filename,
SHA-256, stable content-versioned ID, Storage path and per-photo crop position.

Original bytes (3,655,916 total) are staged only in ignored
`qualification.local/game-backgrounds/assets/`, not `public`, `src` or `dist`.
`dev/game-backgrounds/prepare-assets.mjs` reconstructs the staged set from the
extracted handoff. Nothing has been uploaded. The client uses the existing
authenticated `arcade-artwork` Storage download pattern and a solid fallback.
Future authorized upload must retain these immutable object names and bytes;
retiring a background must not delete objects used by assigned games.

`GameBackground` is presentation-only. It resolves a persisted ID, fills the
existing game host with one original photo and a dark gradient, and hides the
prior image immediately on identity change. Both live and Async Words use the
same `PtownWordsView`. The shell and board viewport become transparent where
the existing side gutters expose the photo. Board/control geometry is unchanged.

The unapplied `supabase/game-backgrounds/candidate.sql` adds a private active
pool and a trigger on the existing live/Async Words state tables. It assigns
`state.backgroundId` once when playable state is created (Async acceptance),
and preserves it across reducers and pool retirement. No browser randomization
or client persistence is used. Existing projections already retain this field.

`backfill.sql`, intended in the same future migration transaction, assigns only
unassigned active Words games. Revisions increase once, preserving strict snapshot
guards. Async uses parent-before-child locks and its existing parent revision
publisher to notify both viewers. Competing/repeated backfills cannot reassign
or repeat the revision bump. Ended games and already assigned games are excluded.
These files are local candidates, not a registered or installed migration.

## Local evidence

- TypeScript app check and 49 focused component/Words/final-review tests passed.
- Production Vite build passed; no source photos entered the output bundle.
- Disposable local PostgreSQL proof passed candidate/backfill rollback,
  initial creation, both-viewer projection, unchanged gameplay state, concurrent
  and repeated backfills, immutable assignment through whole-state replacement,
  current active pool, retirement and denied browser selection. Both Async
  recipient revision rows advance once. The disposable database was dropped.
- Native Chrome rendered all nine photos in both modes at 393x852, 375x667
  and 320x568 (54 checks). Board, viewport, rack, toolbar and actions retain
  identical geometry with/without backgrounds. Screenshots were inspected.
- Evidence is ignored under `qualification.local/game-backgrounds/`.
  The browser harness uses actual SQL snapshots and local photo transport;
  hosted Storage delivery, physical iPhone/PWA and owner smoke are untested.

## Changed owners / next work

- `src/lib/gameBackgrounds/{catalog.ts,photos.json}`: stable asset manifest.
- `src/components/{GameBackground.tsx,gameBackground.css}`: shared photo layer.
- `src/components/ptownWords/{PtownWordsView.tsx,ptownWords.css}` and
  `src/lib/ptownWords/model.ts`: shared Words wiring and snapshot field.
- `supabase/game-backgrounds/{candidate.sql,backfill.sql}`: held persistence.
- `src/components/GameBackground.test.tsx`, `dev/game-backgrounds/*` and the
  additive SQL execution helpers in `dev/words-gameplay/database.mjs`: proof.

Remaining Chess work: shared versioned house-rule core; authenticated move,
bank and expiry authority; canonical financial and lifecycle integration;
live/Async catalog and route adapters; stable per-game background assignment;
sculpted opaque pieces; touch/mouse/tap board and invalid-drop return; captured
tray and promotion; per-viewer move/capture animation/audio dedupe; full
rollback/concurrency/recovery/financial qualification and portrait browser QA.
Do not treat the preview, this background proof or a successful build as Chess
production qualification. No push, migration installation, asset upload or
publication is authorized by this checkpoint.

The repository's mandatory execution-budget checkpoint ended this pass after
the independent background phase. The accepted-pattern shortcut is insufficient
for Chess: there is no existing authenticated Chess authority or financial
adapter to polish. All requested revival/clock/stake decisions are now recorded;
the next bounded implementation phase is that missing production foundation.
