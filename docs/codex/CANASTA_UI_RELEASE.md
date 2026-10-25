# Canasta UI release — October 24, 2026

Jeremy authorized publication of the reviewed UI stack ending at
`c8059c2ff4eab5f72b5906397f621b19177555f3`. This release reconciles its three UI
commits onto verified main/production
`7c2f360f005bf4bab973ef32f6e9575a8159265f`, preserving newer Golf, Mega and
HOLM/357 releases. The touched runtime owners had no intervening main changes.
Earlier local-only review documents are historical checkpoint evidence.

## Scope

Stock draws directly; discard-pile pickup requires explicit confirmation and
shared-rule qualification. The visible sorted hand uses physical card IDs,
with Jokers before twos. Own meld targets distinguish drafts from committed cards;
red threes precede completed canastas and other ranks. Opponent count/rank summaries
open readable actual-card details. The existing Geometry Lab controls bounded
Canasta fans and felt placement through its existing draft/Apply/Cancel pipeline.

No rules, server authority, deadlines, database/schema, financial logic, admission,
shared card-face implementation or shared Golf authority changes. The only extra
integration correction removes an obsolete HandEditor rank-label entry from the
cross-game renderer inventory test; the guard itself remains intact. Browser
qualification scripts accept CANASTA_REVIEW_URL so an isolated candidate can be
checked without using another worktree's fixture server. No dependencies installed.

## Qualification

Actual Edge runs against this integrated worktree pass 16 hand-layout cases
(15/30/60/71 cards at 390×844, 430×932, 320×568 and 812×375), plus four summary/fan
layouts. Checks include physical duplicates, invalid drafts, multiple groups,
wild reassignment, cancellation, single stock commit, unchanged deadlines,
frozen pickup qualification, reconnect after pickup, meld extension and both
going-out routes. Summary checks cover two completed canastas, all 25 public
fixture cards, unobscured rank/suit/Joker text, 44px exposed hand targets,
Geometry Lab preview restoration and inspector closure at hand completion.

The first cold-server browser navigation exceeded its 10-second load limit;
the unchanged run passed after compilation. No browser page errors were reported.
The first aggregate run found only the obsolete renderer-inventory expectation.
After its correction, a clean `npm run build` passes application TypeScript,
all 2,903 source tests across 419 files, 241 harness tests and production Vite
build. Existing large-chunk and Browserslist warnings remain.

Raw integrated evidence: `CANASTA_PLAYABILITY_BROWSER.json` and
`CANASTA_SUMMARY_BROWSER.json`. Local rendered screenshots are under
`qualification.local/canasta/summary/`. These synthetic fixtures use the existing
shared reducer and canonical shell; they do not write production state.

## Publication and owner smoke

Checkpoint tag: `canasta-ui-release-20261024`. Exact remote SHA, Vercel READY
production deployment, public build manifest and persisted release_publication
must agree before declaring this live. Production admission remains unchanged:
read-only preflight confirms enabled=true, admission_enabled=true and the installed
canasta_configure rejects real money (definition MD5
`2ea5f9ecff01d7a0180256527c97062a`).

Refresh both clients and check stock/pile actions, your meld targets, opponent
inspection and duplicate selection on iPhone. Larger hands scroll; the narrowest
portrait and short landscape also scroll at 15 cards. Short landscape exposes one
summary row at a time. Physical iPhone acceptance remains Jeremy's smoke. No live
game was joined or changed for qualification; no production visual comparison is
claimed because its browser tab was unavailable to this chat.
