# Ptown Words /1 — approved multiplayer release

Jeremy explicitly approved complete gameplay, canonical admission, recovery,
settlement, release qualification and deployment on 2026-10-26. This supersedes
the foundation-only hold. Base main is `03dbc92a1c7090b70f321f73b39deb064ac715dd`.

## Delivered contract

Two to four humans, multiplayer only, original fullscreen navy/ivory presentation.
The full 15×15 board has tap-to-zoom, scroll/pan inspection, an explicit Zoom Out,
48px placement squares when zoomed, a persistent private rack, tap-select/place,
blank selection, undo/recall, pass/exchange confirmation and editable rejected moves.
No suggested words, bot implementation, solo adapter or external dictionary API.

Full ENABLE2K /1 has 173,528 entries; normalized SHA-256 is
`d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925`.
The original source and public-domain notice remain under `server/ptownWords`.
Lossless prefix encoding is migration transport only; the installed full indexed
vocabulary is count/checksum verified. No other word list supplements it.

The shared SQL reducer owns placement, every newly formed cross-word, conventional
tile values/distribution, blank assignments, new-square premiums, seven-tile 50-point
bonus, exchange with seven in the bag, and final rack deductions/go-out bonus.
Three-minute turns expire to passes. Two consecutive all-player pass cycles end
the match; placement/exchange resets that count. Final ties compare pre-deduction
scores, then share the win. Rules and dictionary identity freeze at admission.
Each nonwinner pays one frozen match stake; canonical whole-chip splitting pays
winners. Existing session money-mode/consent policy is retained. Defaults select
fake money; qualification covers fake and real money. Bots remain ineligible.

## Ownership and privacy

`supabase/ptown-words/rules.sql` is the gameplay authority. `authority.sql` and
`commands.sql` reuse Boxdrop's established canonical multiplayer lifecycle and
financial owners. `registration.sql` makes guarded additions to the three exact
deployed shared owners, preserving every other game branch. Browser projections
contain only the viewer's rack, public board/scores and bag count. History has no
private racks or bag order. Narrow public revision notices trigger private RPC reads.

Commands lock round → session → match, check identity/turn/revision, and store an
immutable actor/payload/request-UUID receipt atomically with accepted transitions.
Retries return the original receipt; the client then loads current state. Pending
UUID/payload survives uncertain replies in sessionStorage. Stale/conflicting snapshots
are rejected. Drafts never leave the browser before Submit. Settlement, canonical
chip changes/ledger, game result and final player snapshots share one transaction.

The five-second database recovery job uses the same reducer/settlement and canonical
all-human auto-fold safeguard. Pause/resume shifts deadlines by actual paused time.
Connected clients retain the canonical shell through terminal presentation and
Session Ended. Fresh mounts of ended sessions go to the lobby.

## Qualification

- Hosted candidate rollback and installed rollback proofs passed. Migration
  `20261026224857_ptown_words_v1.sql` is installed closed; no synthetic matches persist.
- Core SQL proof: full dictionary/obscure entries, rejected non-ENABLE words,
  center premium, blanks, bingo, multiple crossing words, invalid crosses/gaps,
  seven-tile exchange threshold, rack-out and pass endings, four-player tile
  conservation and hidden-information boundaries.
- Twelve financial cases cover 2/3/4 players × fake/real money × winner/tie,
  actual chip balances and balanced transfer journal, final snapshots, authorization,
  frozen stakes, duplicate/conflicting/stale/late replay, injected write-failure
  rollback, continuation, pause/resume and zero-client terminal recovery.
- Independent local connections race duplicate and conflicting moves; full-route
  duplicate terminal commands yield exactly one result and transfer batch.
- Full `Game.tsx` browser route passes catalog selection, stake setup, Ante Up,
  live reconnect, terminal payout, Session Ended artifact cleanup, and fresh ended
  reload to lobby. The local auth/HTTP bridge uses synthetic users and real SQL/RLS.
- Eight rendered phone/landscape/desktop layouts pass at 320×568, 390×760,
  844×390 and 1024×760, overview/zoom; racks remain at least 44px, zoom cells 48px.
  Actual placement/invalid-draft editing, opponent privacy/realtime and reload pass.
- App TypeScript and production bundle pass. Initial full source run had 428/430
  files passing; the two failures were missing new capability mocks/catalog fixture
  expectations. Both were corrected and their 38 tests pass. All 241 harness tests
  pass. Added recovery tests pass lost-reply retry with identical UUID and snapshot
  identity/regression/conflict handling. Foundation dictionary tests remain eight passing.
- Security advisors show the deliberate no-policy private tables and authenticated
  security-definer RPC entry points; no public private-state read grants were added.
  Installed recovery cron reports success.

Commands/evidence live in `dev/ptown-words`; generated local output is under
`qualification.local/ptown-words`. Reproduction uses the existing PostgreSQL clone
and installed dependencies, not production synthetic sessions. The historical
local clone needs the captured canonical pause/context helpers; hosted proofs use
actual current deployed helpers.

## Publication and acceptance

Admission remains closed until the exact release SHA is verified READY on the
existing Ptown Vercel project and its public build manifest. Then execute the
guarded data-only `supabase/ptown-words/activate.sql`. No other game flag, defaults,
money policy or historical session is changed. Preserve dictionary/rules version 1
for in-progress and historical matches when adding future rule versions.

Jeremy's physical-device production smoke is acceptance: two humans select/ante,
zoom/pan without placement, stage/recall/blank/submit, exchange/pass, reconnect,
observe one terminal payout and Session Ended/lobby behavior. Bots and physical
device acceptance are not claimed by automated qualification.
